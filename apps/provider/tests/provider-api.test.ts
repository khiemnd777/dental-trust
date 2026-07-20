import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apiBaseUrl,
  ProviderApiError,
  providerApiForSession,
  providerApiPageForSession,
} from '@/lib/provider-api';
import type { ProviderSession } from '@/lib/require-session';

const session: ProviderSession = {
  token: 'provider-session-token',
  organizationId: '00000000-0000-4000-8000-000000000010',
  userId: '00000000-0000-4000-8000-000000000020',
  roles: ['DENTIST'],
  mfaVerified: true,
  mfaRequired: false,
};

describe('providerApiForSession', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/api/v1/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards the scoped session, payload, and idempotency key to the API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { id: 'result-id' } }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      providerApiForSession<{ id: string }>(session, 'cases/case-id/appointments', {
        method: 'POST',
        body: { startsAt: '2026-08-01T02:00:00.000Z' },
        idempotencyKey: '00000000-0000-4000-8000-000000000030',
        timeoutMs: 2_500,
      }),
    ).resolves.toEqual({ id: 'result-id' });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/cases/case-id/appointments',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer provider-session-token',
          'content-type': 'application/json',
          'x-idempotency-key': '00000000-0000-4000-8000-000000000030',
          'x-organization-id': '00000000-0000-4000-8000-000000000010',
        },
        body: JSON.stringify({ startsAt: '2026-08-01T02:00:00.000Z' }),
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    'https://attacker.example/api/v1/cases',
    '../admin/users',
    'cases/../admin',
    '/cases',
    'cases/%2e%2e/admin',
  ])('rejects an unsafe API path before issuing a request: %s', async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(providerApiForSession(session, path)).rejects.toEqual(
      new ProviderApiError(400, 'invalid_provider_api_path'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves API status and error code for a failed envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'forbidden' }, { status: 403 })),
    );

    await expect(providerApiForSession(session, 'clinic-operations/team')).rejects.toMatchObject({
      name: 'ProviderApiError',
      status: 403,
      code: 'forbidden',
    });
  });

  it('extracts the canonical structured API error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'conflict', message: 'Version conflict.' } },
            { status: 409 },
          ),
        ),
    );

    await expect(providerApiForSession(session, 'cases')).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
    });
  });

  it('preserves the next cursor for paginated list consumers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: [{ id: 'first' }],
          page: { count: 1, nextCursor: '00000000-0000-4000-8000-000000000099' },
        }),
      ),
    );

    await expect(providerApiPageForSession(session, 'cases?limit=100')).resolves.toEqual({
      data: [{ id: 'first' }],
      nextCursor: '00000000-0000-4000-8000-000000000099',
    });
  });

  it('rejects malformed and data-less success responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not-json', { status: 502 }))
      .mockResolvedValueOnce(Response.json({ requestId: 'request-id' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(providerApiForSession(session, 'cases')).rejects.toMatchObject({
      status: 502,
      code: 'invalid_api_response',
    });
    await expect(providerApiForSession(session, 'cases')).rejects.toMatchObject({
      status: 200,
      code: 'provider_api_request_failed',
    });
  });
});

describe('apiBaseUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('removes a trailing slash from the configured API URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/api/v1/');
    expect(apiBaseUrl()).toBe('https://api.example.test/api/v1');
  });

  it('uses the local API default when no URL is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    expect(apiBaseUrl()).toBe('http://localhost:4000/api/v1');
  });
});
