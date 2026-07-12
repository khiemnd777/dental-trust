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

import { POST } from '@/app/api/portal/commands/route';
import { GET } from '@/app/api/portal/data/route';

const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const acceptanceId = '028f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ source: 'development', roles: ['PATIENT'] });
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

describe('booking and billing BFF', () => {
  it('returns a server-priced accepted-plan checkout preview in development', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/portal/data?area=patient&pageKey=checkout'),
    );
    const envelope = (await response.json()) as { data: Record<string, unknown>[] };
    expect(response.status).toBe(200);
    expect(envelope.data[0]).toMatchObject({
      treatmentPlanAcceptanceId: acceptanceId,
      depositMinor: '25600000',
      depositBasisPoints: 2000,
      cancellationPolicy: { policyVersion: 1, source: 'CLINIC_POLICY' },
    });
  });

  it('proxies scoped booking history instead of the clinic aggregate billing endpoint', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['CLINIC_ADMIN'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      new Request('http://localhost:3000/api/portal/data?area=clinic&pageKey=billing'),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/api/v1/bookings?limit=50',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('forwards immutable preview evidence to checkout with the idempotency key', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['PATIENT'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { booking: {} } }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      new Request('http://localhost:3000/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          area: 'patient',
          pageKey: 'checkout',
          command: 'booking_checkout',
          entityId: caseId,
          idempotencyKey: crypto.randomUUID(),
          payload: {
            treatmentPlanAcceptanceId: acceptanceId,
            expectedDepositBasisPoints: 2000,
            expectedCancellationPolicyVersion: 1,
          },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/api/v1/bookings/checkout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-idempotency-key': expect.any(String) }),
        body: JSON.stringify({
          treatmentPlanAcceptanceId: acceptanceId,
          expectedDepositBasisPoints: 2000,
          expectedCancellationPolicyVersion: 1,
        }),
      }),
    );
  });

  it('rejects malformed checkout terms and caregivers', async () => {
    const malformed = await POST(commandRequest({ expectedDepositBasisPoints: '20' }));
    expect(malformed.status).toBe(400);
    mocks.getSession.mockResolvedValue({ source: 'development', roles: ['CAREGIVER'] });
    const caregiver = await POST(commandRequest({ expectedDepositBasisPoints: 2000 }));
    expect(caregiver.status).toBe(403);
  });

  it('maps failed-payment recovery back to the existing payment aggregate', async () => {
    mocks.getSession.mockResolvedValue({ source: 'api', roles: ['PATIENT'] });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { clientSecret: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const bookingId = '058f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
    const response = await POST(
      new Request('http://localhost:3000/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          area: 'patient',
          pageKey: 'payments',
          command: 'payment_recover',
          entityId: caseId,
          idempotencyKey: crypto.randomUUID(),
          payload: { bookingId, expectedPaymentVersion: 4 },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/api/v1/payments/deposit-intents/recover',
      expect.objectContaining({
        body: JSON.stringify({ bookingId, expectedPaymentVersion: 4 }),
      }),
    );
  });
});

function commandRequest(override: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/portal/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      area: 'patient',
      pageKey: 'checkout',
      command: 'booking_checkout',
      entityId: caseId,
      idempotencyKey: crypto.randomUUID(),
      payload: {
        treatmentPlanAcceptanceId: acceptanceId,
        expectedCancellationPolicyVersion: 1,
        ...override,
      },
    }),
  });
}
