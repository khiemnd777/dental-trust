// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
);

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(async () => new Headers({ 'x-real-ip': '203.0.113.8' })),
}));

vi.mock('next/navigation', () => ({ redirect }));

vi.mock('@/lib/bff-client-context', () => ({
  bffClientContextHeaders: vi.fn(async () => ({
    'x-dental-trust-client-context': 'signed-context',
  })),
  bffSessionContextHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/session', () => ({
  clearSession: vi.fn(),
  createDevelopmentToken: vi.fn(),
  demoSessionFor: vi.fn(),
  getSession: vi.fn(),
  selectActiveOrganization: vi.fn(),
  sessionApiHeaders: vi.fn(),
  setSessionToken: vi.fn(),
  useDevelopmentAuthAdapter: vi.fn(() => false),
}));

import { loginAction } from '@/app/[locale]/auth/actions';

function loginForm(): FormData {
  const form = new FormData();
  form.set('email', 'clinic.admin@saigon-smiles.local');
  form.set('password', 'wrong-password-value');
  form.set('product', 'provider');
  return form;
}

beforeEach(() => {
  redirect.mockClear();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/api/v1');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('login action failure classification', () => {
  it('shows invalid credentials when the API rejects authentication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

    await expect(loginAction('vi', loginForm())).rejects.toThrow(
      'REDIRECT:/vi/auth/login?product=provider&error=invalid',
    );
  });

  it('shows service unavailable only for an upstream failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(loginAction('vi', loginForm())).rejects.toThrow(
      'REDIRECT:/vi/auth/login?product=provider&error=unavailable',
    );
  });
});
