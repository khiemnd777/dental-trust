import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nextMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({ cookies: nextMocks.cookies, headers: nextMocks.headers }));
vi.mock('next/navigation', () => ({ redirect: nextMocks.redirect }));
vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}));

import { readProviderSession, requireProviderSession } from '@/lib/require-session';

const organizationId = '00000000-0000-4000-8000-000000000010';

function cookies(values: Readonly<Record<string, string>>) {
  nextMocks.cookies.mockResolvedValue({
    get: (name: string) => (values[name] ? { value: values[name] } : undefined),
  });
}

describe('Provider session policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/api/v1');
    vi.stubEnv('PUBLIC_APP_URL', 'https://app.example.test');
    vi.stubEnv('BFF_CLIENT_CONTEXT_SECRET', 'test-bff-context-secret-that-is-long-enough');
    nextMocks.headers.mockResolvedValue(new Headers({ 'x-real-ip': '203.0.113.10' }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not call the API without both required cookies', async () => {
    cookies({ dt_session: 'token' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(readProviderSession()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a tenant-scoped provider session from the selected membership', async () => {
    cookies({ dt_session: 'token', dt_organization: organizationId });
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          id: '00000000-0000-4000-8000-000000000020',
          roles: [],
          memberships: [
            { organizationId, role: 'DENTIST' },
            { organizationId, role: 'DENTIST' },
          ],
          selectedOrganizationId: organizationId,
          mfaVerified: true,
          mfaRequired: false,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(readProviderSession()).resolves.toEqual({
      token: 'token',
      organizationId,
      userId: '00000000-0000-4000-8000-000000000020',
      roles: ['DENTIST'],
      mfaVerified: true,
      mfaRequired: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer token',
          'x-organization-id': organizationId,
          'x-dental-trust-client-context': expect.stringMatching(/^v1\./u),
        }),
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    {
      label: 'a mismatched selected organization',
      data: {
        id: '00000000-0000-4000-8000-000000000020',
        roles: [],
        memberships: [{ organizationId, role: 'DENTIST' }],
        selectedOrganizationId: '00000000-0000-4000-8000-000000000099',
      },
    },
    {
      label: 'a patient-only identity',
      data: {
        id: '00000000-0000-4000-8000-000000000020',
        roles: ['PATIENT'],
        memberships: [],
        selectedOrganizationId: organizationId,
      },
    },
    {
      label: 'a provider membership belonging only to another organization',
      data: {
        id: '00000000-0000-4000-8000-000000000020',
        roles: ['DENTIST'],
        memberships: [{ organizationId: '00000000-0000-4000-8000-000000000099', role: 'DENTIST' }],
        selectedOrganizationId: organizationId,
      },
    },
    {
      label: 'an invalid user identifier',
      data: {
        id: null,
        roles: ['CLINIC_ADMIN'],
        memberships: [],
        selectedOrganizationId: organizationId,
      },
    },
  ])('rejects $label', async ({ data }) => {
    cookies({ dt_session: 'token', dt_organization: organizationId });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data })));

    await expect(readProviderSession()).resolves.toBeNull();
  });

  it('treats API denial and transport failures as unauthenticated', async () => {
    cookies({ dt_session: 'token', dt_organization: organizationId });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'forbidden' }, { status: 403 }))
      .mockRejectedValueOnce(new Error('network unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(readProviderSession()).resolves.toBeNull();
    await expect(readProviderSession()).resolves.toBeNull();
  });

  it('redirects an unauthenticated request to the Provider login continuation', async () => {
    cookies({});
    vi.stubGlobal('fetch', vi.fn());

    await expect(requireProviderSession()).rejects.toThrow(
      'NEXT_REDIRECT:https://app.example.test/vi/auth/login?product=provider',
    );
    expect(nextMocks.redirect).toHaveBeenCalledWith(
      'https://app.example.test/vi/auth/login?product=provider',
    );
  });
});
