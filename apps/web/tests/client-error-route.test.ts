import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/telemetry/client-error/route';

function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/telemetry/client-error', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  });
}

describe('client error telemetry route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('accepts a minimal event and logs no browser error content', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(
      request({ code: 'route_render_failure', digest: 'digest_123', routeFamily: '/en/app' }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[0])).toContain('client_route_error');
  });

  it('forwards only the bounded error digest and route family to the server-side adapter', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('ERROR_TRACKING_DSN', 'https://errors.example/events');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (
        await POST(
          request({ code: 'route_render_failure', digest: 'digest_123', routeFamily: '/en/app' }),
        )
      ).status,
    ).toBe(202);
    const payload = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(payload).toContain('digest_123');
    expect(payload).toContain('/en/app');
    expect(payload).not.toContain('password');
    expect(payload).not.toContain('document');
  });

  it('rejects cross-origin and malformed events', async () => {
    expect(
      (
        await POST(
          request(
            { code: 'route_render_failure', digest: 'digest_123', routeFamily: '/en/app' },
            'https://attacker.example',
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request({
            code: 'route_render_failure',
            digest: 'digest_123',
            routeFamily: '/en/app/private-resource-id',
          }),
        )
      ).status,
    ).toBe(400);
  });
});
