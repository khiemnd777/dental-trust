import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./require-session', () => ({ requireOperationsSession: vi.fn() }));

import { operationsApiForSession, operationsApiPageForSession } from './operations-api';
import type { OperationsApiError } from './operations-api';
import type { OperationsSession } from './require-session';

const session: OperationsSession = {
  token: 'session-token',
  userId: 'user-1',
  roles: ['CONCIERGE_AGENT'],
  availableMemberships: [{ organizationId: 'organization-1', role: 'CONCIERGE_AGENT' }],
  mfaVerified: true,
  mfaRequired: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('operations API boundary', () => {
  it('preserves page metadata and organization scope for paginated requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ id: 'case-1' }],
        page: { count: 1, nextCursor: 'case-1' },
        requestId: 'request-12345678',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example.test/api/v1/');

    await expect(
      operationsApiPageForSession<{ readonly id: string }>(
        session,
        'concierge/queue?assignment=MINE&limit=1',
      ),
    ).resolves.toEqual({
      data: [{ id: 'case-1' }],
      page: { count: 1, nextCursor: 'case-1' },
      requestId: 'request-12345678',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example.test/api/v1/concierge/queue?assignment=MINE&limit=1',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
          'x-organization-id': 'organization-1',
        }),
      }),
    );
  });

  it('uses the structured API error code instead of collapsing the error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'AUTHORIZATION_DENIED',
              message: 'Forbidden',
              requestId: 'request-12345678',
              retryable: false,
            },
          },
          { status: 403 },
        ),
      ),
    );

    const request = operationsApiForSession(session, 'admin/operations/summary');
    await expect(request).rejects.toMatchObject({
      name: 'OperationsApiError',
      status: 403,
      code: 'AUTHORIZATION_DENIED',
      retryable: false,
    });
  });

  it('normalizes network failures as retryable dependency outages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection refused')));

    const request = operationsApiForSession(session, 'admin/operations/summary');
    await expect(request).rejects.toEqual(
      expect.objectContaining<Partial<OperationsApiError>>({
        status: 503,
        code: 'operations_api_unavailable',
        retryable: true,
      }),
    );
  });
});
