import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const bffClientContextHeader = 'x-dental-trust-client-context';

const contextVersion = 'v1';
const defaultMaximumAgeSeconds = 60;
const maximumFutureSkewSeconds = 5;
const base64UrlSha256Pattern = /^[A-Za-z0-9_-]{43}$/u;

/**
 * Creates a short-lived, pseudonymous identity assertion for a trusted BFF.
 * The raw network address is never sent to the API or stored in rate-limit keys.
 */
export function createBffClientContext(
  secret: string,
  clientIdentity: string,
  issuedAtSeconds = Math.floor(Date.now() / 1_000),
): string {
  assertSecret(secret);
  const normalizedIdentity = normalizeTrustedClientIdentity(clientIdentity);
  if (!normalizedIdentity) throw new Error('A valid trusted client IP address is required');
  return createBffSubjectContext(secret, 'network', normalizedIdentity, issuedAtSeconds);
}

/** Creates an assertion for an identity that the BFF has already authenticated. */
export function createBffSubjectContext(
  secret: string,
  namespace: 'network' | 'session',
  identity: string,
  issuedAtSeconds = Math.floor(Date.now() / 1_000),
): string {
  assertSecret(secret);
  if (!identity || identity.length > 256 || hasControlCharacters(identity)) {
    throw new Error('The BFF client subject is invalid');
  }
  if (!Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds <= 0) {
    throw new Error('The BFF client context timestamp is invalid');
  }
  const subject = hmac(secret, `bff-client-subject:${namespace}:${identity}`);
  const signature = hmac(secret, signingInput(issuedAtSeconds, subject));
  return `${contextVersion}.${issuedAtSeconds}.${subject}.${signature}`;
}

/**
 * Verifies a BFF assertion and returns only its pseudonymous subject. Invalid,
 * expired, malformed, or attacker-supplied unsigned headers fail closed.
 */
export function verifyBffClientContext(
  secret: string,
  context: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1_000),
  maximumAgeSeconds = defaultMaximumAgeSeconds,
): string | null {
  if (!context || secret.length < 32 || context.length > 180) return null;
  const parts = context.split('.');
  if (parts.length !== 4 || parts[0] !== contextVersion) return null;
  const [, rawIssuedAt, subject, providedSignature] = parts;
  if (!/^\d{10}$/u.test(rawIssuedAt ?? '') || !base64UrlSha256Pattern.test(subject ?? '')) {
    return null;
  }
  if (!base64UrlSha256Pattern.test(providedSignature ?? '')) return null;
  const issuedAt = Number(rawIssuedAt);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(nowSeconds) ||
    !Number.isSafeInteger(maximumAgeSeconds) ||
    maximumAgeSeconds <= 0 ||
    issuedAt > nowSeconds + maximumFutureSkewSeconds ||
    nowSeconds - issuedAt > maximumAgeSeconds
  ) {
    return null;
  }
  const expectedSignature = hmac(secret, signingInput(issuedAt, subject ?? ''));
  return safeEqualBase64Url(providedSignature ?? '', expectedSignature) ? (subject ?? null) : null;
}

/**
 * Reads exactly one IP value from an edge-overwritten header. Comma-separated
 * forwarding chains are rejected so an untrusted left-most value is never used.
 */
export function trustedClientIdentityFromHeaders(
  requestHeaders: Pick<Headers, 'get'>,
  headerName: string,
): string | null {
  if (!/^[a-z0-9-]{1,64}$/u.test(headerName)) return null;
  return normalizeTrustedClientIdentity(requestHeaders.get(headerName) ?? '');
}

function normalizeTrustedClientIdentity(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes(',') || isIP(normalized) === 0) return null;
  return normalized;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function signingInput(issuedAt: number, subject: string): string {
  return `bff-client-context:${contextVersion}:${issuedAt}:${subject}`;
}

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqualBase64Url(left: string, right: string): boolean {
  if (!base64UrlSha256Pattern.test(left) || !base64UrlSha256Pattern.test(right)) return false;
  const leftBuffer = Buffer.from(left, 'base64url');
  const rightBuffer = Buffer.from(right, 'base64url');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function assertSecret(secret: string): void {
  if (secret.length < 32) throw new Error('BFF_CLIENT_CONTEXT_SECRET must contain 32 characters');
}
