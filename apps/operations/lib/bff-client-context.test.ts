import { afterEach, describe, expect, it, vi } from 'vitest';

import { bffClientContextHeader, verifyBffClientContext } from '@dental-trust/security';

import { bffClientContextHeaders } from './bff-client-context';

describe('Operations BFF client context', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('signs an edge-overwritten client address for API auth calls', async () => {
    const secret = 'operations-bff-context-secret-with-entropy';
    vi.stubEnv('BFF_CLIENT_CONTEXT_SECRET', secret);

    const result = await bffClientContextHeaders(new Headers({ 'x-real-ip': '198.51.100.20' }));

    expect(verifyBffClientContext(secret, result[bffClientContextHeader])).not.toBeNull();
    expect(result[bffClientContextHeader]).not.toContain('198.51.100.20');
  });
});
