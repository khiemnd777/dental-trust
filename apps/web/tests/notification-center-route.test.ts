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

import { GET, POST } from '@/app/api/portal/notification-center/route';

const idempotencyKey = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f99';
const notificationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f01';
const developmentSession = { source: 'development', roles: ['PATIENT'] };

function getRequest(view: string) {
  return new Request(`http://localhost:3000/api/portal/notification-center?view=${view}`);
}

function postRequest(body: unknown, raw = false) {
  return new Request('http://localhost:3000/api/portal/notification-center', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue(developmentSession);
  mocks.authorizePortalRoute.mockReset().mockResolvedValue(true);
  mocks.sessionApiHeaders.mockClear();
  mocks.origin = 'http://localhost:3000';
  mocks.token = 'session-token';
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.local/api/v1');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('notification center BFF reads', () => {
  it('validates the view, authentication, and route authorization', async () => {
    expect((await GET(getRequest('unknown'))).status).toBe(400);
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest('notifications'))).status).toBe(401);
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await GET(getRequest('preferences'))).status).toBe(403);
  });

  it('returns deterministic development notifications and preferences', async () => {
    const notifications = await GET(getRequest('notifications'));
    const notificationBody = (await notifications.json()) as { data: unknown[] };
    expect(notifications.status).toBe(200);
    expect(notificationBody.data).toHaveLength(2);
    expect(mocks.authorizePortalRoute).toHaveBeenCalledWith(
      developmentSession,
      'patient',
      'notifications',
    );

    const preferences = await GET(getRequest('preferences'));
    const preferenceBody = (await preferences.json()) as { data: unknown[] };
    expect(preferenceBody.data.length).toBeGreaterThan(40);
    expect(preferenceBody.data).toContainEqual(
      expect.objectContaining({ category: 'ACCOUNT_SECURITY', locked: true }),
    );
  });

  it('proxies production reads with the authenticated session', async () => {
    const apiSession = { source: 'api', roles: ['PATIENT'] };
    mocks.getSession.mockResolvedValue(apiSession);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ id: notificationId }] }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(getRequest('notifications'));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/api/v1/notifications?limit=50',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });
});

describe('notification center BFF commands', () => {
  it('rejects cross-origin, malformed, and unsupported commands', async () => {
    mocks.origin = 'https://attacker.example';
    expect((await POST(postRequest({}))).status).toBe(403);
    mocks.origin = 'http://localhost:3000';
    expect((await POST(postRequest('{', true))).status).toBe(400);
    expect((await POST(postRequest({ command: 'mark_read' }))).status).toBe(400);
    expect(
      (
        await POST(
          postRequest({
            command: 'mark_read',
            idempotencyKey,
            notificationId: 'not-a-uuid',
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(postRequest({ command: 'unsupported', idempotencyKey, notificationId }))).status,
    ).toBe(400);
  });

  it('enforces authorization and immutable security preferences', async () => {
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect(
      (await POST(postRequest({ command: 'mark_read', idempotencyKey, notificationId }))).status,
    ).toBe(403);
    expect(
      (
        await POST(
          postRequest({
            command: 'update_preference',
            idempotencyKey,
            preference: { category: 'ACCOUNT_SECURITY', channel: 'EMAIL', enabled: false },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('accepts development read and preference commands', async () => {
    expect(
      (await POST(postRequest({ command: 'mark_read', idempotencyKey, notificationId }))).status,
    ).toBe(202);
    const response = await POST(
      postRequest({
        command: 'update_preference',
        idempotencyKey,
        preference: { category: 'AFTERCARE', channel: 'EMAIL', enabled: false },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { category: 'AFTERCARE', channel: 'EMAIL', enabled: false },
      adapter: 'development',
    });
  });

  it('proxies production mutations and fails closed when dependencies are unavailable', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['PATIENT'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: notificationId } }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      postRequest({ command: 'mark_read', idempotencyKey, notificationId }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/notifications/${notificationId}/read`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-idempotency-key': idempotencyKey }),
      }),
    );

    mocks.token = '';
    expect(
      (
        await POST(
          postRequest({
            command: 'update_preference',
            idempotencyKey,
            preference: { category: 'AFTERCARE', channel: 'EMAIL', enabled: true },
          }),
        )
      ).status,
    ).toBe(503);
  });
});
