import { describe, expect, it } from 'vitest';

import {
  createBffClientContext,
  trustedClientIdentityFromHeaders,
  verifyBffClientContext,
} from './bff-client-context.js';

describe('BFF client context', () => {
  const secret = 'a-bff-client-context-secret-with-entropy';

  it('round-trips a pseudonymous, short-lived identity', () => {
    const context = createBffClientContext(secret, '203.0.113.8', 1_700_000_000);

    expect(context).not.toContain('203.0.113.8');
    expect(verifyBffClientContext(secret, context, 1_700_000_030)).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it('rejects tampering, expiry, future assertions, and a different secret', () => {
    const context = createBffClientContext(secret, '2001:db8::10', 1_700_000_000);

    expect(verifyBffClientContext(secret, `${context}x`, 1_700_000_001)).toBeNull();
    expect(verifyBffClientContext(secret, context, 1_700_000_061)).toBeNull();
    expect(verifyBffClientContext(secret, context, 1_699_999_994)).toBeNull();
    expect(
      verifyBffClientContext('another-bff-client-context-secret-value', context, 1_700_000_001),
    ).toBeNull();
  });

  it('accepts a single edge-overwritten IP and rejects forwarding chains', () => {
    expect(
      trustedClientIdentityFromHeaders(new Headers({ 'x-real-ip': '203.0.113.8' }), 'x-real-ip'),
    ).toBe('203.0.113.8');
    expect(
      trustedClientIdentityFromHeaders(
        new Headers({ 'x-forwarded-for': '198.51.100.2, 10.0.0.3' }),
        'x-forwarded-for',
      ),
    ).toBeNull();
    expect(
      trustedClientIdentityFromHeaders(new Headers({ 'x-real-ip': 'attacker' }), 'x-real-ip'),
    ).toBeNull();
  });
});
