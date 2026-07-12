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

import { GET, POST } from '@/app/api/portal/admin-directory/route';

const userId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const cursor = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const idempotencyKey = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99';
const developmentSession = { source: 'development', roles: ['PLATFORM_ADMIN'] };

function getRequest(query: Record<string, string>) {
  return new Request(
    `http://localhost:3000/api/portal/admin-directory?${new URLSearchParams(query)}`,
  );
}

function postRequest(body: unknown, raw = false) {
  return new Request('http://localhost:3000/api/portal/admin-directory', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

function statusCommand() {
  return {
    view: 'users',
    kind: 'status',
    userId,
    idempotencyKey,
    command: {
      toStatus: 'SUSPENDED',
      expectedStatus: 'ACTIVE',
      reason: 'Confirmed account compromise investigation.',
      confirmation: 'CHANGE ACCOUNT STATUS',
    },
  };
}

function roleCommand() {
  return {
    view: 'users',
    kind: 'role',
    userId,
    idempotencyKey,
    command: {
      role: 'SUPPORT_AGENT',
      action: 'GRANT',
      expectedRolePresent: false,
      reason: 'Approved support operations assignment.',
      confirmation: 'CHANGE USER ROLE',
    },
  };
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

describe('admin directory BFF reads', () => {
  it('validates view, cursor, search, authentication, and page authorization', async () => {
    expect((await GET(getRequest({ view: 'audit' }))).status).toBe(400);
    expect((await GET(getRequest({ view: 'users', cursor: 'not-a-cursor' }))).status).toBe(400);
    expect((await GET(getRequest({ view: 'users', search: 'x' }))).status).toBe(400);
    expect((await GET(getRequest({ view: 'users', search: 'x'.repeat(121) }))).status).toBe(400);
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest({ view: 'users' }))).status).toBe(401);
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await GET(getRequest({ view: 'payments' }))).status).toBe(403);
  });

  it('returns bounded development records for every directory without secrets', async () => {
    for (const view of [
      'users',
      'organizations',
      'clinics',
      'dentists',
      'cases',
      'payments',
      'roles',
    ]) {
      const response = await GET(getRequest({ view }));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: unknown[]; page: { nextCursor: null } };
      expect(body.data).toHaveLength(1);
      expect(body.page.nextCursor).toBeNull();
      expect(JSON.stringify(body)).not.toMatch(/password|tokenHash|encrypted/iu);
    }
  });

  it('proxies production filters with the authenticated session', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['PLATFORM_ADMIN'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [], page: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      getRequest({ view: 'clinics', cursor, search: 'Minh An', status: 'VERIFIED' }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/admin/directory/clinics?limit=50&cursor=${cursor}&search=Minh+An&status=VERIFIED`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
    expect(mocks.sessionApiHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'api' }),
      'session-token',
    );
  });

  it('fails closed when the upstream cannot be reached or authenticated', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['PLATFORM_ADMIN'] });
    mocks.token = '';
    expect((await GET(getRequest({ view: 'users' }))).status).toBe(503);
    mocks.token = 'session-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await GET(getRequest({ view: 'users' }))).status).toBe(503);
  });
});

describe('admin directory BFF commands', () => {
  it('rejects invalid origins, authentication, JSON, envelope, and confirmation evidence', async () => {
    mocks.origin = 'https://attacker.example';
    expect((await POST(postRequest({}))).status).toBe(403);
    mocks.origin = 'not a URL';
    expect((await POST(postRequest({}))).status).toBe(403);
    mocks.origin = 'http://localhost:3000';
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(postRequest({}))).status).toBe(401);
    expect((await POST(postRequest('{', true))).status).toBe(400);
    expect((await POST(postRequest({ ...statusCommand(), userId: 'invalid' }))).status).toBe(400);
    expect(
      (
        await POST(
          postRequest({
            ...statusCommand(),
            command: { ...statusCommand().command, confirmation: 'CONFIRM' },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('enforces route authorization before accepting a user command', async () => {
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await POST(postRequest(statusCommand()))).status).toBe(403);
  });

  it('accepts confirmed development status and role changes', async () => {
    const status = await POST(postRequest(statusCommand()));
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({ data: { outcome: 'UPDATED' } });
    const role = await POST(postRequest(roleCommand()));
    expect(role.status).toBe(200);
    await expect(role.json()).resolves.toMatchObject({ adapter: 'development' });
  });

  it('proxies production mutations with idempotency evidence and the right path', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['SUPER_ADMIN'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { outcome: 'UPDATED' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(postRequest(roleCommand()))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/admin/directory/users/${userId}/roles`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-idempotency-key': idempotencyKey }),
        body: JSON.stringify(roleCommand().command),
      }),
    );
  });
});
