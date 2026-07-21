import { afterEach, describe, expect, it, vi } from 'vitest';

import { bffClientContextHeader, verifyBffClientContext } from '@dental-trust/security';

import { bffClientContextHeaders } from '@/lib/bff-client-context';

describe('web BFF client context', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('signs only a single edge-overwritten client IP', async () => {
    const secret = 'web-bff-context-secret-with-enough-entropy';
    vi.stubEnv('BFF_CLIENT_CONTEXT_SECRET', secret);
    const result = await bffClientContextHeaders(new Headers({ 'x-real-ip': '203.0.113.4' }));

    expect(verifyBffClientContext(secret, result[bffClientContextHeader])).not.toBeNull();
    expect(result[bffClientContextHeader]).not.toContain('203.0.113.4');
    await expect(
      bffClientContextHeaders(new Headers({ 'x-real-ip': '203.0.113.4, attacker-controlled' })),
    ).resolves.toEqual({});
  });

  it('rejects the development secret in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BFF_CLIENT_CONTEXT_SECRET', 'development-only-bff-context-secret-change-me');

    await expect(
      bffClientContextHeaders(new Headers({ 'x-real-ip': '203.0.113.4' })),
    ).rejects.toThrow('unique production secret');
  });
});
