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

import { GET, POST } from '@/app/api/portal/admin-governance/route';

const cursor = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const idempotencyKey = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99';
const developmentSession = { source: 'development', roles: ['SUPER_ADMIN'] };

function getRequest(view: string, next?: string) {
  const query = new URLSearchParams({ view, ...(next ? { cursor: next } : {}) });
  return new Request(`http://localhost:3000/api/portal/admin-governance?${query}`);
}

function postRequest(body: unknown, raw = false) {
  return new Request('http://localhost:3000/api/portal/admin-governance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

function contentEnvelope() {
  return {
    view: 'content',
    idempotencyKey,
    command: {
      slug: 'patient-safety',
      locale: 'en-US',
      expectedVersion: 0,
      title: 'Patient safety commitments',
      summary: 'How Dental Trust protects patients.',
      body: 'This durable page explains patient safety controls throughout the care journey.',
      publicationStatus: 'DRAFT',
      reason: 'Initial approved patient-safety content.',
      confirmation: 'SAVE CONTENT VERSION',
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

describe('admin governance BFF reads', () => {
  it('validates view, cursor, authentication, and route authorization', async () => {
    expect((await GET(getRequest('payments'))).status).toBe(400);
    expect((await GET(getRequest('content', 'bad-cursor'))).status).toBe(400);
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest('content'))).status).toBe(401);
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await GET(getRequest('feature-flags'))).status).toBe(403);
  });

  it('returns deterministic non-secret development records for every view', async () => {
    for (const view of [
      'content',
      'taxonomy',
      'templates',
      'feature-flags',
      'configuration',
      'locations',
    ]) {
      const response = await GET(getRequest(view));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: unknown[] };
      expect(body.data).toHaveLength(1);
      expect(JSON.stringify(body)).not.toMatch(/password|secretKey|tokenHash/iu);
    }
  });

  it('maps governance views to their authorized portal pages and production endpoints', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['SUPER_ADMIN'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [], page: {} }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(getRequest('configuration', cursor))).status).toBe(200);
    expect(mocks.authorizePortalRoute).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'api' }),
      'admin',
      'flags',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/admin/governance/configuration?limit=50&cursor=${cursor}`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });
});

describe('admin governance BFF commands', () => {
  it('rejects cross-origin, unauthenticated, malformed, and unconfirmed commands', async () => {
    mocks.origin = 'https://attacker.example';
    expect((await POST(postRequest({}))).status).toBe(403);
    mocks.origin = 'not a URL';
    expect((await POST(postRequest({}))).status).toBe(403);
    mocks.origin = 'http://localhost:3000';
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(postRequest({}))).status).toBe(401);
    expect((await POST(postRequest('{', true))).status).toBe(400);
    expect(
      (
        await POST(
          postRequest({
            ...contentEnvelope(),
            command: { ...contentEnvelope().command, confirmation: 'SAVE' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(postRequest({ ...contentEnvelope(), idempotencyKey: 'bad-key' }))).status,
    ).toBe(400);
  });

  it('enforces page authorization and accepts a confirmed development command', async () => {
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await POST(postRequest(contentEnvelope()))).status).toBe(403);
    const response = await POST(postRequest(contentEnvelope()));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { version: 1 } });
  });

  it('proxies production evidence and fails closed without an API session', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['SUPER_ADMIN'] });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { resourceId: cursor, version: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(postRequest(contentEnvelope()))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/api/v1/admin/governance',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-idempotency-key': idempotencyKey }),
      }),
    );
    mocks.token = '';
    expect((await POST(postRequest(contentEnvelope()))).status).toBe(503);
  });
});
