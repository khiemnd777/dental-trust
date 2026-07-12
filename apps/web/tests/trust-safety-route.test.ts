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

import { GET, POST } from '@/app/api/portal/trust-safety/route';

const incidentId = '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const ownerId = '718f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const idempotencyKey = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99';

function getRequest(area: string, view: string, extra?: Record<string, string>) {
  const query = new URLSearchParams({ area, view, ...extra });
  return new Request(`http://localhost:3000/api/portal/trust-safety?${query}`);
}

function postRequest(body: unknown, raw = false) {
  return new Request('http://localhost:3000/api/portal/trust-safety', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ source: 'development', roles: ['SUPER_ADMIN'] });
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

describe('trust and safety BFF reads', () => {
  it('rejects invalid scopes and identifiers before reaching the API', async () => {
    expect((await GET(getRequest('verification', 'incidents'))).status).toBe(400);
    expect((await GET(getRequest('patient', 'reviews'))).status).toBe(400);
    expect((await GET(getRequest('admin', 'incidents', { cursor: 'not-a-uuid' }))).status).toBe(
      400,
    );
    expect(
      (await GET(getRequest('admin', 'reviews', { moderationStatus: 'REMOVED' }))).status,
    ).toBe(400);
  });

  it('fails closed for missing sessions and route permissions', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest('patient', 'incidents'))).status).toBe(401);
    mocks.authorizePortalRoute.mockResolvedValueOnce(false);
    expect((await GET(getRequest('admin', 'reviews'))).status).toBe(403);
  });

  it('returns deterministic development records for each bounded view', async () => {
    const incidents = await GET(getRequest('patient', 'incidents'));
    const reviews = await GET(getRequest('clinic', 'reviews'));
    const reports = await GET(getRequest('admin', 'review-reports'));
    await expect(incidents.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ id: incidentId, status: 'IN_PROGRESS' })],
    });
    await expect(reviews.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ verified: true, moderationStatus: 'PUBLISHED' })],
    });
    await expect(reports.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ reasonCode: 'PERSONAL_DATA', status: 'OPEN' })],
    });
    expect(mocks.authorizePortalRoute).toHaveBeenLastCalledWith(
      expect.anything(),
      'admin',
      'reviews',
    );
  });

  it('proxies a validated production filter without forwarding the portal scope', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['CONTENT_ADMIN'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [], page: {} }));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (
        await GET(
          getRequest('admin', 'reviews', {
            cursor: incidentId,
            moderationStatus: 'PENDING',
          }),
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/trust/reviews?cursor=${incidentId}&limit=50&moderationStatus=PENDING`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });
});

describe('trust and safety BFF mutations', () => {
  it('rejects cross-origin, malformed, unauthorized-area, and invalid commands', async () => {
    mocks.origin = 'https://attacker.example';
    expect((await POST(postRequest({}))).status).toBe(403);
    mocks.origin = 'http://localhost:3000';
    expect((await POST(postRequest('{', true))).status).toBe(400);
    expect(
      (
        await POST(
          postRequest({
            area: 'clinic',
            command: 'triage_incident',
            entityId: incidentId,
            idempotencyKey,
            input: {
              severity: 'HIGH',
              ownerUserId: ownerId,
              toStatus: 'IN_PROGRESS',
              expectedVersion: 2,
              patientMessage: 'A coordinator is reviewing the report.',
            },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          postRequest({
            area: 'patient',
            command: 'create_incident',
            idempotencyKey,
            input: { caseId, type: 'OTHER', summary: 'too short' },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('accepts a patient incident and an audited administrator transition in development', async () => {
    const created = await POST(
      postRequest({
        area: 'patient',
        command: 'create_incident',
        idempotencyKey,
        input: {
          caseId,
          type: 'CLINICAL_CONCERN',
          reportedSeverity: 'HIGH',
          summary: 'Persistent discomfort after treatment',
          details: 'I have had persistent discomfort since the treatment appointment.',
          attachmentFileAssetIds: [],
        },
      }),
    );
    expect(created.status).toBe(200);
    const triaged = await POST(
      postRequest({
        area: 'admin',
        command: 'triage_incident',
        entityId: incidentId,
        idempotencyKey,
        input: {
          severity: 'CRITICAL',
          ownerUserId: ownerId,
          toStatus: 'TRIAGED',
          expectedVersion: 2,
          patientMessage: 'A coordinator has completed the initial safety triage.',
        },
      }),
    );
    await expect(triaged.json()).resolves.toMatchObject({
      data: { id: incidentId, status: 'TRIAGED', severity: 'CRITICAL', version: 3 },
    });
  });

  it('proxies a reasoned moderation command and fails closed without the session token', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['CONTENT_ADMIN'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: incidentId } }));
    vi.stubGlobal('fetch', fetchMock);
    const body = {
      area: 'admin',
      command: 'moderate_review',
      entityId: incidentId,
      idempotencyKey,
      input: {
        target: 'REVIEW',
        status: 'HIDDEN',
        reason: 'Personal contact information requires moderator review.',
      },
    };
    expect((await POST(postRequest(body))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.local/api/v1/trust/reviews/${incidentId}/moderation`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-idempotency-key': idempotencyKey }),
      }),
    );
    mocks.token = '';
    expect((await POST(postRequest(body))).status).toBe(503);
  });
});
