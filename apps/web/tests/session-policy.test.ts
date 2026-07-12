import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: 'api-token' }) })),
}));

import {
  authorizePortalRoute,
  canAccessPortalRoute,
  demoSessionFor,
  type WebSession,
} from '@/lib/session';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('portal least-privilege policy', () => {
  it('keeps a patient out of administrative surfaces', () => {
    const patient = demoSessionFor('patient');
    expect(canAccessPortalRoute(patient, 'patient', 'dashboard')).toBe(true);
    expect(canAccessPortalRoute(patient, 'admin', 'users')).toBe(false);
  });

  it('limits caregiver access to explicitly shared cases and non-financial routes', () => {
    const caregiver = {
      ...demoSessionFor('patient'),
      roles: ['CAREGIVER' as const],
      caseIds: ['018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01'],
    };
    expect(
      canAccessPortalRoute(caregiver, 'patient', 'case', '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01'),
    ).toBe(true);
    expect(
      canAccessPortalRoute(caregiver, 'patient', 'case', '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99'),
    ).toBe(false);
    expect(canAccessPortalRoute(caregiver, 'patient', 'case')).toBe(false);
    expect(canAccessPortalRoute(caregiver, 'patient', 'payments')).toBe(false);
  });

  it('revalidates API caregiver access so a revoked grant takes effect immediately', async () => {
    const base = demoSessionFor('patient');
    const caregiver: WebSession = {
      id: base.id,
      name: base.name,
      email: base.email,
      roles: ['CAREGIVER'],
      expiresAt: base.expiresAt,
      source: 'api',
    };
    const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 403 }));
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubGlobal('fetch', fetchMock);

    await expect(authorizePortalRoute(caregiver, 'patient', 'records', caseId)).resolves.toBe(true);
    await expect(authorizePortalRoute(caregiver, 'patient', 'records', caseId)).resolves.toBe(
      false,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://api.test/cases/${caseId}`,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('separates financial and content administration', () => {
    const base = demoSessionFor('admin');
    const finance = { ...base, roles: ['FINANCE_ADMIN' as const] };
    const content = { ...base, roles: ['CONTENT_ADMIN' as const] };
    expect(canAccessPortalRoute(finance, 'admin', 'payments')).toBe(true);
    expect(canAccessPortalRoute(finance, 'admin', 'content')).toBe(false);
    expect(canAccessPortalRoute(content, 'admin', 'content')).toBe(true);
    expect(canAccessPortalRoute(content, 'admin', 'payments')).toBe(false);
  });

  it('limits dentist access to clinical work rather than organization administration', () => {
    const dentist = { ...demoSessionFor('clinic'), roles: ['DENTIST' as const] };
    expect(canAccessPortalRoute(dentist, 'clinic', 'planBuilder')).toBe(true);
    expect(canAccessPortalRoute(dentist, 'clinic', 'team')).toBe(false);
    expect(canAccessPortalRoute(dentist, 'clinic', 'billing')).toBe(false);
  });
});
