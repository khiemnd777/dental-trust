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

import { GET, POST } from '@/app/api/portal/admin-operations/route';

const entityId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f11';
const idempotencyKey = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f99';
const developmentSession = { source: 'development', roles: ['PLATFORM_ADMIN'] };

function getRequest(view: string, cursor?: string) {
  const query = new URLSearchParams({ view, ...(cursor ? { cursor } : {}) });
  return new Request(`http://localhost:3000/api/portal/admin-operations?${query}`);
}

function postRequest(body: unknown, raw = false) {
  return new Request('http://localhost:3000/api/portal/admin-operations', {
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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('admin operations BFF reads', () => {
  it('validates view, cursor, authentication, and route authorization', async () => {
    expect((await GET(getRequest('users'))).status).toBe(400);
    expect((await GET(getRequest('audit', 'bad-cursor'))).status).toBe(400);
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest('dashboard'))).status).toBe(401);
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await GET(getRequest('jobs'))).status).toBe(403);
  });

  it('returns deterministic development operations without sensitive payloads', async () => {
    for (const view of ['dashboard', 'audit', 'jobs', 'notifications', 'webhooks', 'health']) {
      const response = await GET(getRequest(view));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: unknown };
      expect(body.data).toBeDefined();
      expect(JSON.stringify(body)).not.toContain('password');
      expect(JSON.stringify(body)).not.toContain('payload');
    }
  });

  it('proxies bounded production pages with session headers and cursor continuation', async () => {
    const apiSession = { source: 'api', roles: ['PLATFORM_ADMIN'] };
    mocks.getSession.mockResolvedValue(apiSession);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [], page: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(getRequest('audit', entityId));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/admin/operations/audit-logs?limit=50&cursor=${entityId}`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });
});

describe('admin operations BFF retries', () => {
  it('rejects cross-origin, unauthenticated, malformed, and invalid commands', async () => {
    mocks.origin = 'https://attacker.example';
    expect((await POST(postRequest({}))).status).toBe(403);
    mocks.origin = 'http://localhost:3000';
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(postRequest({}))).status).toBe(401);
    expect((await POST(postRequest('{', true))).status).toBe(400);
    expect(
      (await POST(postRequest({ view: 'jobs', entityId: 'invalid', idempotencyKey }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          postRequest({
            view: 'jobs',
            entityId,
            idempotencyKey,
            reason: 'Too short',
            confirmation: 'YES',
            expectedAttemptCount: 8,
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('enforces page authorization before accepting a retry', async () => {
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect(
      (
        await POST(
          postRequest({
            view: 'notifications',
            entityId,
            idempotencyKey,
            reason: 'Provider connectivity is restored.',
            confirmation: 'RETRY FAILED DELIVERY',
          }),
        )
      ).status,
    ).toBe(403);
  });

  it('accepts confirmed development retries for both durable queues', async () => {
    const outbox = await POST(
      postRequest({
        view: 'jobs',
        entityId,
        idempotencyKey,
        reason: 'Redis connectivity has been restored.',
        confirmation: 'RETRY FAILED DELIVERY',
        expectedAttemptCount: 8,
      }),
    );
    expect(outbox.status).toBe(200);
    const notification = await POST(
      postRequest({
        view: 'notifications',
        entityId,
        idempotencyKey,
        reason: 'SMTP connectivity has been restored.',
        confirmation: 'RETRY FAILED DELIVERY',
      }),
    );
    expect(notification.status).toBe(200);
  });

  it('proxies production retry evidence and fails closed without an API session token', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['PLATFORM_ADMIN'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { status: 'PENDING' } }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      postRequest({
        view: 'jobs',
        entityId,
        idempotencyKey,
        reason: 'Redis connectivity has been restored.',
        confirmation: 'RETRY FAILED DELIVERY',
        expectedAttemptCount: 8,
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/admin/operations/jobs/outbox/${entityId}/retry`,
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
            view: 'notifications',
            entityId,
            idempotencyKey,
            reason: 'SMTP connectivity has been restored.',
            confirmation: 'RETRY FAILED DELIVERY',
          }),
        )
      ).status,
    ).toBe(503);
  });
});
