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

import { GET, POST } from '@/app/api/portal/privacy-requests/route';

const requestId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const cursor = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const idempotencyKey = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99';

function getRequest(view: string, next?: string) {
  const query = new URLSearchParams({ view, ...(next ? { cursor: next } : {}) });
  return new Request(`http://localhost:3000/api/portal/privacy-requests?${query}`);
}

function postRequest(body: unknown, raw = false) {
  return new Request('http://localhost:3000/api/portal/privacy-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

function createCommand() {
  return {
    command: 'create',
    idempotencyKey,
    input: { type: 'EXPORT', reason: 'I need a portable copy of my dental records.' },
  };
}

function transitionCommand() {
  return {
    command: 'transition',
    privacyRequestId: requestId,
    idempotencyKey,
    input: {
      toStatus: 'APPROVED',
      expectedVersion: 2,
      reason: 'Identity verification completed under ticket DT-PRIV-9.',
      patientMessage: 'Your request was approved and is ready for secure processing.',
      confirmation: 'PROCESS PRIVACY REQUEST',
      verification: {
        method: 'ACCOUNT_MFA',
        reference: 'session-mfa-verification-DT-PRIV-9',
        verifiedAt: '2026-07-12T08:00:00.000Z',
      },
    },
  };
}

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ source: 'development', roles: ['SUPER_ADMIN'] });
  mocks.authorizePortalRoute.mockReset().mockResolvedValue(true);
  mocks.sessionApiHeaders.mockClear();
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

describe('privacy request BFF reads', () => {
  it('validates view, cursor, authentication, and route authorization', async () => {
    expect((await GET(getRequest('all'))).status).toBe(400);
    expect((await GET(getRequest('patient', 'bad-cursor'))).status).toBe(400);
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest('patient'))).status).toBe(401);
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await GET(getRequest('queue'))).status).toBe(403);
  });

  it('separates deterministic patient and administrative development queues', async () => {
    const patient = (await (await GET(getRequest('patient'))).json()) as { data: unknown[] };
    const queue = (await (await GET(getRequest('queue'))).json()) as { data: unknown[] };
    expect(patient.data).toEqual([
      expect.objectContaining({ type: 'EXPORT', status: 'SUBMITTED' }),
    ]);
    expect(queue.data).toEqual([expect.objectContaining({ type: 'DELETE', status: 'IN_REVIEW' })]);
    expect(mocks.authorizePortalRoute).toHaveBeenCalledWith(expect.anything(), 'admin', 'privacy');
  });

  it('proxies only the selected production scope', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['PATIENT'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [], page: {} }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(getRequest('patient', cursor))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/trust/privacy/requests?limit=50&queue=false&cursor=${cursor}`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });
});

describe('privacy request BFF mutations', () => {
  it('rejects cross-origin, unauthenticated, malformed, and unconfirmed commands', async () => {
    mocks.origin = 'https://attacker.example';
    expect((await POST(postRequest({}))).status).toBe(403);
    mocks.origin = 'http://localhost:3000';
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(postRequest({}))).status).toBe(401);
    expect((await POST(postRequest('{', true))).status).toBe(400);
    expect((await POST(postRequest({ ...createCommand(), idempotencyKey: 'bad' }))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          postRequest({
            ...transitionCommand(),
            input: { ...transitionCommand().input, confirmation: 'YES' },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('authorizes and accepts both development command types', async () => {
    expect((await POST(postRequest(createCommand()))).status).toBe(200);
    const transition = await POST(postRequest(transitionCommand()));
    expect(transition.status).toBe(200);
    await expect(transition.json()).resolves.toMatchObject({
      data: { status: 'APPROVED', version: 3 },
    });
  });

  it('proxies production mutation evidence and fails closed without a session token', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['SUPER_ADMIN'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: requestId } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(postRequest(transitionCommand()))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/trust/privacy/requests/${requestId}/transitions`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-idempotency-key': idempotencyKey }),
      }),
    );
    mocks.token = '';
    expect((await POST(postRequest(transitionCommand()))).status).toBe(503);
  });
});
