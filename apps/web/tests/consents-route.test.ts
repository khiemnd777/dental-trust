import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  authorizePortalRoute: vi.fn(),
  sessionApiHeaders: vi.fn(() => ({ authorization: 'Bearer session' })),
  origin: 'http://localhost:3000',
  token: 'session-token',
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === 'origin' ? mocks.origin : null),
  })),
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'dt_session' && mocks.token ? { value: mocks.token } : undefined,
  })),
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  authorizePortalRoute: mocks.authorizePortalRoute,
  sessionApiHeaders: mocks.sessionApiHeaders,
}));

import { GET, POST } from '@/app/api/portal/consents/route';

const consentRecordId = '818f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const termsRecordId = '818f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const idempotencyKey = '918f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99';

function getRequest(query: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/portal/consents?${new URLSearchParams(query)}`);
}

function postRequest(consentId = consentRecordId) {
  return new Request('http://localhost:3000/api/portal/consents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      consentRecordId: consentId,
      idempotencyKey,
      input: {
        expectedGrantedAt: '2026-07-12T08:00:00.000Z',
        reason: 'I no longer authorize this ongoing use of my information.',
        confirmation: 'WITHDRAW CONSENT',
      },
    }),
  });
}

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ source: 'development', roles: ['PATIENT'] });
  mocks.authorizePortalRoute.mockReset().mockResolvedValue(true);
  mocks.origin = 'http://localhost:3000';
  mocks.token = 'session-token';
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.local/api/v1');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('consent ledger BFF', () => {
  it('validates list filters and fails closed on authentication and authorization', async () => {
    expect((await GET(getRequest({ cursor: 'invalid' }))).status).toBe(400);
    expect((await GET(getRequest({ status: 'EXPIRED' }))).status).toBe(400);
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest())).status).toBe(401);
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await GET(getRequest())).status).toBe(403);
  });

  it('returns the bounded development ledger and protects non-withdrawable records', async () => {
    const response = await GET(getRequest());
    await expect(response.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({ id: consentRecordId, withdrawable: true }),
        expect.objectContaining({ id: termsRecordId, withdrawable: false }),
      ],
    });
    expect((await POST(postRequest(termsRecordId))).status).toBe(409);
  });

  it('records a development withdrawal with route authorization', async () => {
    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: consentRecordId, withdrawnAt: '2026-07-12T10:00:00.000Z' },
    });
    expect(mocks.authorizePortalRoute).toHaveBeenCalledWith(
      expect.anything(),
      'patient',
      'settings',
    );
  });

  it('proxies only validated withdrawal evidence and fails closed without a token', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['PATIENT'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: consentRecordId } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(postRequest())).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/patient/consents/${consentRecordId}/withdrawals`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-idempotency-key': idempotencyKey }),
      }),
    );
    mocks.token = '';
    expect((await POST(postRequest())).status).toBe(503);
  });
});
