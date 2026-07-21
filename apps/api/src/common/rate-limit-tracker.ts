import { createHmac } from 'node:crypto';

import type { Request } from 'express';

import { bffClientContextHeader, sha256, verifyBffClientContext } from '@dental-trust/security';

/**
 * Prefers a cryptographically authenticated BFF assertion for per-client
 * fairness. Public/auth routes never accept session-looking attacker input;
 * protected legacy callers remain constrained by the global network ceiling.
 */
export function createRateLimitTracker(secret: string): (request: Request) => string {
  return (request) => {
    const value = request.headers[bffClientContextHeader];
    const context = Array.isArray(value) ? undefined : value;
    const subject = verifyBffClientContext(secret, context);
    if (subject) return `client:${subject}`;
    if (requiresNetworkIdentity(request.path)) return networkRateLimitTracker(request);

    // Compatibility for protected Provider/Operations BFF calls while signed
    // context is rolled out there. A forged token can rotate this fairness key,
    // but can no longer bypass the global per-ingress network ceiling.
    const sessionToken = bearerToken(request) ?? cookieToken(request);
    if (sessionToken && isSessionToken(sessionToken)) {
      return `session:${createHmac('sha256', secret).update(sessionToken).digest('hex')}`;
    }
    return networkRateLimitTracker(request);
  };
}

function requiresNetworkIdentity(requestPath: string): boolean {
  const path = requestPath.replace(/^\/api\/v1(?=\/|$)/u, '');
  return [
    /^\/auth(?:\/|$)/u,
    /^\/public(?:\/|$)/u,
    /^\/contact(?:\/|$)/u,
    /^\/health(?:\/|$)/u,
    /^\/passport-shares(?:\/|$)/u,
    /^\/payments\/webhooks(?:\/|$)/u,
  ].some((pattern) => pattern.test(path));
}

function isSessionToken(token: string): boolean {
  return /^dts_[A-Za-z0-9_-]{64}$/u.test(token);
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

function cookieToken(request: Request): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name !== 'dt_session') continue;
    try {
      return decodeURIComponent(valueParts.join('=')) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function networkRateLimitTracker(request: Request): string {
  return `ip:${request.ip || request.socket.remoteAddress || 'unknown'}`;
}

export function globalNetworkRateLimitKey(suffix: string, name: string): string {
  return sha256(`${name}:${suffix}`);
}
