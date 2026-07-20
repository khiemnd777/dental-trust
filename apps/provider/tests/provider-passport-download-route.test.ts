import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  providerApiForSession: vi.fn(),
  readProviderSession: vi.fn(),
}));

vi.mock('@/lib/require-session', () => ({
  readProviderSession: routeMocks.readProviderSession,
}));
vi.mock('@/lib/provider-api', () => ({
  ProviderApiError: class ProviderApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
    ) {
      super(code);
    }
  },
  providerApiForSession: routeMocks.providerApiForSession,
}));

import { GET } from '@/app/api/provider/passport-download/route';
import { ProviderApiError } from '@/lib/provider-api';

const caseId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const session = {
  token: 'provider-session-token',
  organizationId: '00000000-0000-4000-8000-000000000003',
  userId: '00000000-0000-4000-8000-000000000004',
  roles: ['DENTIST'],
  mfaVerified: true,
  mfaRequired: true,
};

function downloadRequest(query = `?caseId=${caseId}&versionId=${versionId}`) {
  return new Request(`https://provider.example.test/api/provider/passport-download${query}`);
}

describe('Provider Passport download BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.readProviderSession.mockResolvedValue(session);
    routeMocks.providerApiForSession.mockResolvedValue({
      url: 'https://objects.example.test/private/passport.pdf?signature=signed',
      expiresAt: '2026-07-20T06:00:00.000Z',
    });
  });

  it('requires a session before request validation', async () => {
    routeMocks.readProviderSession.mockResolvedValue(null);

    const response = await GET(downloadRequest('?caseId=invalid'));

    expect(response.status).toBe(401);
    expect(routeMocks.providerApiForSession).not.toHaveBeenCalled();
  });

  it.each([
    '',
    `?caseId=${caseId}`,
    `?caseId=invalid&versionId=${versionId}`,
    `?caseId=${caseId}&caseId=${caseId}&versionId=${versionId}`,
  ])('rejects invalid or ambiguous identifiers: %s', async (query) => {
    const response = await GET(downloadRequest(query));

    expect(response.status).toBe(400);
    expect(routeMocks.providerApiForSession).not.toHaveBeenCalled();
  });

  it('uses the tenant-scoped Passport endpoint and safely redirects', async () => {
    const response = await GET(downloadRequest());

    expect(routeMocks.providerApiForSession).toHaveBeenCalledWith(
      session,
      `cases/${caseId}/passport/versions/${versionId}/download`,
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://objects.example.test/private/passport.pdf?signature=signed',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('rejects malformed and unsafe upstream responses', async () => {
    routeMocks.providerApiForSession
      .mockResolvedValueOnce({ url: 'not-a-url', expiresAt: 'not-a-date' })
      .mockResolvedValueOnce({
        url: 'http://attacker.example.test/private/passport.pdf',
        expiresAt: '2026-07-20T06:00:00.000Z',
      });

    expect((await GET(downloadRequest())).status).toBe(502);
    expect((await GET(downloadRequest())).status).toBe(502);
  });

  it('preserves upstream errors and masks unexpected failures', async () => {
    routeMocks.providerApiForSession
      .mockRejectedValueOnce(new ProviderApiError(404, 'not_found'))
      .mockRejectedValueOnce(new Error('unexpected'));

    const notFound = await GET(downloadRequest());
    const unavailable = await GET(downloadRequest());

    expect(notFound.status).toBe(404);
    expect(unavailable.status).toBe(503);
  });
});
