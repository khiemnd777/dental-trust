import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/health/ready/route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('web readiness', () => {
  it('checks local configuration without probing downstream readiness', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/api/v1');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      status: 'ready',
      service: 'web',
      checks: { appUrlConfigured: true, apiUrlConfigured: true },
    });
  });
});
