import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateTotpSecret(bytes = 20): string {
  return encodeBase32(randomBytes(bytes));
}

export function generateTotpCode(
  secret: string,
  timestampMilliseconds = Date.now(),
  digits = 6,
  periodSeconds = 30,
): string {
  const counter = Math.floor(timestampMilliseconds / 1_000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function verifyTotpCode(
  secret: string,
  candidate: string,
  timestampMilliseconds = Date.now(),
  window = 1,
): boolean {
  if (!/^\d{6}$/u.test(candidate)) return false;
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotpCode(secret, timestampMilliseconds + offset * 30_000);
    if (safeEqualText(expected, candidate)) return true;
  }
  return false;
}

export function buildTotpUri(input: {
  readonly secret: string;
  readonly issuer: string;
  readonly accountName: string;
}): string {
  const label = `${input.issuer}:${input.accountName}`;
  const parameters = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`;
}

export function generateRecoveryCodes(count = 10): readonly string[] {
  return Array.from({ length: count }, () => `${randomRecoveryPart()}-${randomRecoveryPart()}`);
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase();
}

function randomRecoveryPart(): string {
  return Array.from({ length: 4 }, () =>
    RECOVERY_ALPHABET.charAt(randomInt(RECOVERY_ALPHABET.length)),
  ).join('');
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let accumulator = 0;
  let encoded = '';
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32_ALPHABET.charAt((accumulator >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) encoded += BASE32_ALPHABET.charAt((accumulator << (5 - bits)) & 31);
  return encoded;
}

function decodeBase32(value: string): Buffer {
  const normalized = value.replaceAll('=', '').replaceAll(' ', '').toUpperCase();
  let bits = 0;
  let accumulator = 0;
  const decoded: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('TOTP secret is not valid Base32.');
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      decoded.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(decoded);
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
