import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('operations readiness', () => {
  it('is degraded when the API dependency is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: 'degraded',
      service: 'operations',
      checks: { apiUrlConfigured: false, api: 'unavailable' },
    });
  });

  it('probes API readiness instead of reporting a static healthy state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example.test/api/v1/');

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example.test/api/v1/health/ready',
      expect.objectContaining({ cache: 'no-store' }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: 'ready',
      checks: { apiUrlConfigured: true, api: 'available' },
    });
  });
});
