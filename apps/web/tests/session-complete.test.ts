// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieState = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn(),
  delete: vi.fn(),
}));

const redirect = vi.hoisted(() =>
  vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
);

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieState.values.get(name);
      return value ? { value } : undefined;
    },
    set: cookieState.set,
    delete: cookieState.delete,
  })),
}));

vi.mock('next/navigation', () => ({ redirect }));

import {
  authorizePortalRoute,
  canAccessPortalRoute,
  clearSession,
  createDevelopmentToken,
  demoSessionFor,
  getSession,
  loadAuthorizedCaseIds,
  requireAreaSession,
  requirePortalRouteSession,
  selectActiveOrganization,
  sessionApiHeaders,
  setSessionToken,
  useDevelopmentAuthAdapter,
  type WebSession,
} from '@/lib/session';

const organizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const otherOrganizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';

beforeEach(() => {
  cookieState.values.clear();
  cookieState.set.mockReset();
  cookieState.delete.mockReset();
  redirect.mockClear();
  vi.stubEnv('AUTH_SECRET', 'test-only-auth-secret-that-is-long-enough');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('web session lifecycle', () => {
  it('round-trips a signed development session only through the explicit adapter', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('WEB_AUTH_ADAPTER', 'development');
    expect(useDevelopmentAuthAdapter()).toBe(true);
    const source: WebSession = {
      id: 'demo-patient',
      name: 'Patient',
      email: 'patient@example.test',
      roles: ['PATIENT'],
      caseIds: [caseId],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      source: 'development',
    };
    cookieState.values.set('dt_session', await createDevelopmentToken(source));

    await expect(getSession()).resolves.toMatchObject({
      id: source.id,
      roles: ['PATIENT'],
      caseIds: [caseId],
      source: 'development',
    });

    cookieState.values.set('dt_session', 'not-a-token');
    await expect(getSession()).resolves.toBeNull();
    vi.stubEnv('NODE_ENV', 'production');
    expect(useDevelopmentAuthAdapter()).toBe(false);
    await expect(createDevelopmentToken(source)).rejects.toThrow(
      'Development sessions are disabled in production',
    );
  });

  it('fails closed with no cookie or with unsafe production secret configuration', async () => {
    vi.stubEnv('WEB_AUTH_ADAPTER', 'development');
    await expect(getSession()).resolves.toBeNull();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', 'short');
    cookieState.values.set('dt_session', 'invalid');
    await expect(getSession()).resolves.toBeNull();
  });

  it('bootstraps an API session, retries a revoked selected tenant, and validates memberships', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    cookieState.values.set('dt_session', 'opaque-session');
    cookieState.values.set('dt_organization', organizationId);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 403 }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            id: 'user-1',
            roles: ['PATIENT', 'NOT_A_ROLE'],
            memberships: [{ organizationId, role: 'CLINIC_ADMIN' }],
            availableMemberships: [
              { organizationId, role: 'CLINIC_ADMIN' },
              { organizationId: 'bad-id', role: 'DENTIST' },
            ],
            selectedOrganizationId: organizationId,
            mfaVerified: true,
            mfaRequired: true,
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSession()).resolves.toMatchObject({
      id: 'user-1',
      roles: ['PATIENT', 'CLINIC_ADMIN'],
      organizationId,
      availableMemberships: [{ organizationId, role: 'CLINIC_ADMIN' }],
      mfaVerified: true,
      mfaRequired: true,
      source: 'api',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-organization-id': organizationId }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.test/auth/me',
      expect.objectContaining({ headers: { authorization: 'Bearer opaque-session' } }),
    );
  });

  it('rejects malformed, failed, and unreachable API session responses', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    cookieState.values.set('dt_session', 'opaque-session');
    for (const result of [
      new Response('{}', { status: 401 }),
      Response.json({ data: { id: 'user', roles: 'not-an-array' } }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result));
      await expect(getSession()).resolves.toBeNull();
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getSession()).resolves.toBeNull();
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    await expect(getSession()).resolves.toBeNull();
  });

  it('writes and clears hardened session cookies', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await setSessionToken('opaque');
    expect(cookieState.set).toHaveBeenCalledWith(
      'dt_session',
      'opaque',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: true }),
    );
    expect(cookieState.delete).toHaveBeenCalledWith('dt_organization');

    cookieState.delete.mockClear();
    await clearSession();
    expect(cookieState.delete).toHaveBeenCalledWith('dt_session');
    expect(cookieState.delete).toHaveBeenCalledWith('dt_organization');
  });

  it('selects only an active membership and stores it in an HTTP-only cookie', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    cookieState.values.set('dt_session', 'opaque-session');
    expect(await selectActiveOrganization('not-a-uuid')).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          Response.json({
            data: {
              availableMemberships: [
                { organizationId, role: 'DENTIST' },
                { organizationId: otherOrganizationId, role: 'INVALID' },
              ],
            },
          }),
        ),
      ),
    );
    await expect(selectActiveOrganization(otherOrganizationId)).resolves.toBeNull();
    await expect(selectActiveOrganization(organizationId)).resolves.toEqual({
      organizationId,
      role: 'DENTIST',
    });
    expect(cookieState.set).toHaveBeenCalledWith(
      'dt_organization',
      organizationId,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
  });

  it('handles membership lookup failures without changing tenant context', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    cookieState.values.set('dt_session', 'opaque-session');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(selectActiveOrganization(organizationId)).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(selectActiveOrganization(organizationId)).resolves.toBeNull();
    cookieState.values.clear();
    await expect(selectActiveOrganization(organizationId)).resolves.toBeNull();
  });
});

describe('portal authorization helpers', () => {
  it('constructs scoped API headers only when a tenant is selected', () => {
    const patient = demoSessionFor('patient');
    expect(sessionApiHeaders(patient, 'token')).toEqual({ authorization: 'Bearer token' });
    expect(sessionApiHeaders({ ...patient, organizationId }, 'token')).toEqual({
      authorization: 'Bearer token',
      'x-organization-id': organizationId,
    });
  });

  it('enforces every role-specific portal boundary', () => {
    const base = demoSessionFor('admin');
    expect(canAccessPortalRoute({ ...base, roles: ['FINANCE_ADMIN'] }, 'admin', 'payments')).toBe(
      true,
    );
    expect(canAccessPortalRoute({ ...base, roles: ['FINANCE_ADMIN'] }, 'admin', 'users')).toBe(
      false,
    );
    expect(canAccessPortalRoute({ ...base, roles: ['SUPER_ADMIN'] }, 'admin', 'flags')).toBe(true);
    expect(
      canAccessPortalRoute({ ...base, roles: ['SUPPORT_AGENT'] }, 'concierge', 'matching'),
    ).toBe(false);
    expect(
      canAccessPortalRoute({ ...base, roles: ['SUPPORT_AGENT'] }, 'concierge', 'incidents'),
    ).toBe(true);
    expect(canAccessPortalRoute({ ...base, roles: ['DENTIST'] }, 'clinic', 'planBuilder')).toBe(
      true,
    );
    expect(canAccessPortalRoute({ ...base, roles: ['DENTIST'] }, 'clinic', 'team')).toBe(false);
    expect(canAccessPortalRoute({ ...base, roles: ['CLINIC_STAFF'] }, 'clinic', 'scheduling')).toBe(
      true,
    );
    expect(canAccessPortalRoute({ ...base, roles: ['CLINIC_STAFF'] }, 'clinic', 'billing')).toBe(
      false,
    );
    expect(canAccessPortalRoute({ ...base, roles: ['PATIENT'] }, 'clinic', 'dashboard')).toBe(
      false,
    );
  });

  it('authorizes development resources locally and API resources by fresh server read', async () => {
    const patient = demoSessionFor('patient');
    await expect(authorizePortalRoute(patient, 'patient', 'case', caseId)).resolves.toBe(true);
    const apiSession: WebSession = { ...patient, source: 'api' };
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    cookieState.values.set('dt_session', 'opaque-session');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(authorizePortalRoute(apiSession, 'patient', 'case', caseId)).resolves.toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    await expect(authorizePortalRoute(apiSession, 'patient', 'case', caseId)).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(authorizePortalRoute(apiSession, 'patient', 'case', caseId)).resolves.toBe(false);
    await expect(authorizePortalRoute(apiSession, 'admin', 'flags')).resolves.toBe(false);
  });

  it('loads only valid case identifiers from the authorized API list', async () => {
    const development = { ...demoSessionFor('patient'), caseIds: [caseId] };
    await expect(loadAuthorizedCaseIds(development)).resolves.toEqual([caseId]);
    const apiSession: WebSession = { ...development, source: 'api' };
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    cookieState.values.set('dt_session', 'opaque-session');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [{ id: caseId }, { id: 42 }, {}] })),
    );
    await expect(loadAuthorizedCaseIds(apiSession)).resolves.toEqual([caseId]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(loadAuthorizedCaseIds(apiSession)).resolves.toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(loadAuthorizedCaseIds(apiSession)).resolves.toEqual([]);
  });

  it('redirects unauthenticated, MFA-pending, unselected-tenant, and forbidden sessions', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    await expect(requireAreaSession('patient', 'en')).rejects.toThrow(
      'REDIRECT:/en/auth/login?returnTo=/en/app',
    );

    cookieState.values.set('dt_session', 'opaque-session');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: { id: 'user', roles: ['PATIENT'], mfaRequired: true, mfaVerified: false },
        }),
      ),
    );
    await expect(requireAreaSession('patient', 'en')).rejects.toThrow(
      'REDIRECT:/en/auth/mfa?returnTo=%2Fen%2Fapp',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            id: 'user',
            roles: ['PATIENT'],
            availableMemberships: [{ organizationId, role: 'CLINIC_ADMIN' }],
          },
        }),
      ),
    );
    await expect(requireAreaSession('clinic', 'vi')).rejects.toThrow(
      'REDIRECT:/vi/auth/organization?returnTo=%2Fvi%2Fclinic',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { id: 'user', roles: ['PATIENT'] } })),
    );
    await expect(requireAreaSession('admin', 'en')).rejects.toThrow(
      'REDIRECT:/en/auth/login?error=permission',
    );
  });

  it('returns authorized area sessions and protects resource-specific routes', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    cookieState.values.set('dt_session', 'opaque-session');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ data: { id: 'user', roles: ['PATIENT'] } }))
        .mockResolvedValueOnce(new Response('{}', { status: 403 })),
    );
    await expect(requirePortalRouteSession('patient', 'case', 'en', caseId)).rejects.toThrow(
      'REDIRECT:/en/auth/login?error=permission',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { id: 'user', roles: ['PATIENT'] } })),
    );
    await expect(requireAreaSession('patient', 'vi')).resolves.toMatchObject({ id: 'user' });
  });
});

describe('development identities', () => {
  it('defines a safe identity for every portal area', () => {
    for (const area of ['patient', 'clinic', 'concierge', 'verification', 'admin'] as const) {
      const session = demoSessionFor(area);
      expect(session.id).toBe(`demo-${area}`);
      expect(session.source).toBe('development');
      expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
    }
  });
});
