'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Locale } from '@dental-trust/i18n';
import type { PortalArea } from '@/lib/routing';
import {
  clearSession,
  createDevelopmentToken,
  demoSessionFor,
  getSession,
  selectActiveOrganization,
  sessionApiHeaders,
  setSessionToken,
  type SystemRole,
  useDevelopmentAuthAdapter,
} from '@/lib/session';

const demoPassword = 'DentalTrust!2026';
const termsVersion = '2026-07-12';
const privacyVersion = '2026-07-12';
const destinations: Record<PortalArea, string> = {
  patient: 'app',
  clinic: 'clinic',
  concierge: 'concierge',
  verification: 'verification-admin',
  admin: 'admin',
};

function safeReturnTo(locale: Locale, value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== 'string' || !value.startsWith(`/${locale}/`) || value.includes('//'))
    return fallback;
  return value;
}

function areaFromEmail(email: string): PortalArea | null {
  const prefix = email.toLowerCase().split('@')[0];
  if (prefix === 'patient') return 'patient';
  if (prefix === 'clinic') return 'clinic';
  if (prefix === 'concierge') return 'concierge';
  if (prefix === 'verification') return 'verification';
  if (prefix === 'admin') return 'admin';
  return null;
}

function areaFromRoles(roles: readonly SystemRole[]): PortalArea | null {
  if (roles.some((role) => role === 'PATIENT' || role === 'CAREGIVER')) return 'patient';
  if (
    roles.some((role) => role === 'DENTIST' || role === 'CLINIC_STAFF' || role === 'CLINIC_ADMIN')
  )
    return 'clinic';
  if (roles.some((role) => role === 'CONCIERGE_AGENT' || role === 'SUPPORT_AGENT'))
    return 'concierge';
  if (roles.includes('VERIFICATION_OFFICER')) return 'verification';
  if (
    roles.some((role) =>
      ['FINANCE_ADMIN', 'CONTENT_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(role),
    )
  )
    return 'admin';
  return null;
}

async function productionLogin(email: string, password: string) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return null;
  try {
    const response = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const envelope = (await response.json()) as {
      data?: { accessToken?: string; user?: { roles?: SystemRole[] } };
    };
    const body = envelope.data;
    return body?.accessToken && Array.isArray(body.user?.roles) ? body : null;
  } catch {
    return null;
  }
}

export async function loginAction(locale: Locale, formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const requestedArea = String(formData.get('demoArea') ?? '') as PortalArea;
  let area: PortalArea;
  if (useDevelopmentAuthAdapter()) {
    const resolvedArea = requestedArea in destinations ? requestedArea : areaFromEmail(email);
    if (!resolvedArea || password !== demoPassword) redirect(`/${locale}/auth/login?error=invalid`);
    area = resolvedArea;
    await setSessionToken(await createDevelopmentToken(demoSessionFor(resolvedArea)));
  } else {
    const result = await productionLogin(email, password);
    if (!result?.accessToken) redirect(`/${locale}/auth/login?error=unavailable`);
    await setSessionToken(result.accessToken);
    const session = await getSession();
    if (!session) redirect(`/${locale}/auth/login?error=unavailable`);
    if (session.mfaRequired && !session.mfaVerified) {
      const requested = safeReturnTo(locale, formData.get('returnTo'), `/${locale}/app`);
      redirect(`/${locale}/auth/mfa?returnTo=${encodeURIComponent(requested)}`);
    }
    const resolvedArea = areaFromRoles(session.roles);
    if (!resolvedArea) {
      if (session.availableMemberships?.length) {
        const requested = safeReturnTo(locale, formData.get('returnTo'), '');
        redirect(
          `/${locale}/auth/organization${requested ? `?returnTo=${encodeURIComponent(requested)}` : ''}`,
        );
      }
      redirect(`/${locale}/auth/login?error=permission`);
    }
    area = resolvedArea;
  }
  const destination = `/${locale}/${destinations[area]}`;
  redirect(safeReturnTo(locale, formData.get('returnTo'), destination));
}

export async function selectOrganizationAction(locale: Locale, formData: FormData) {
  const organizationId = String(formData.get('organizationId') ?? '');
  const membership = await selectActiveOrganization(organizationId);
  if (!membership) {
    const requested = safeReturnTo(locale, formData.get('returnTo'), '');
    redirect(
      `/${locale}/auth/organization?error=invalid${requested ? `&returnTo=${encodeURIComponent(requested)}` : ''}`,
    );
  }
  const fallback = `/${locale}/${
    membership.role === 'CONCIERGE_AGENT' ? destinations.concierge : destinations.clinic
  }`;
  redirect(safeReturnTo(locale, formData.get('returnTo'), fallback));
}

export async function createClinicOrganizationAction(locale: Locale, formData: FormData) {
  if (useDevelopmentAuthAdapter()) redirect(`/${locale}/auth/organization?error=unavailable`);
  const session = await getSession();
  if (!session || !session.mfaVerified || session.organizationId)
    redirect(`/${locale}/auth/organization?error=permission`);
  const name = String(formData.get('name') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim();
  const legalEntityName = String(formData.get('legalEntityName') ?? '').trim();
  const registrationNumber = String(formData.get('registrationNumber') ?? '').trim();
  const registrationCountry = String(formData.get('registrationCountry') ?? '')
    .trim()
    .toUpperCase();
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '');
  if (
    !name ||
    !legalEntityName ||
    !registrationNumber ||
    registrationCountry.length !== 2 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      idempotencyKey,
    )
  )
    redirect(`/${locale}/auth/organization?error=invalid`);
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  if (!api || !token) redirect(`/${locale}/auth/organization?error=unavailable`);
  let organizationId: string | undefined;
  try {
    const response = await fetch(`${api}/clinic-operations/organizations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        name,
        slug,
        legalEntityName,
        registrationNumber,
        registrationCountry,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok) {
      const envelope = (await response.json()) as { data?: { id?: unknown } };
      if (typeof envelope.data?.id === 'string') organizationId = envelope.data.id;
    }
  } catch {
    organizationId = undefined;
  }
  if (!organizationId) redirect(`/${locale}/auth/organization?error=unavailable`);
  const membership = await selectActiveOrganization(organizationId);
  if (!membership) redirect(`/${locale}/auth/organization?error=unavailable`);
  redirect(`/${locale}/clinic/onboarding`);
}

export async function registerAction(locale: Locale, formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmPassword') ?? '');
  if (
    !email.includes('@') ||
    password.length < 12 ||
    password !== confirmation ||
    formData.get('accept') !== 'on'
  )
    redirect(`/${locale}/auth/register?error=invalid`);
  if (!useDevelopmentAuthAdapter()) {
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) redirect(`/${locale}/auth/register?error=unavailable`);
    let response: Response;
    try {
      response = await fetch(`${api}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          preferredLocale: locale === 'vi' ? 'vi-VN' : 'en-US',
          termsVersion,
          privacyVersion,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      redirect(`/${locale}/auth/register?error=unavailable`);
    }
    if (!response.ok) redirect(`/${locale}/auth/register?error=invalid`);
  }
  (await cookies()).set('dt_pending_email', email, {
    httpOnly: true,
    maxAge: 15 * 60,
    path: `/${locale}/auth`,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  redirect(`/${locale}/auth/verify-email`);
}

export async function verifyEmailAction(locale: Locale, formData: FormData) {
  const token = String(formData.get('token') ?? formData.get('code') ?? '').trim();
  const pending = (await cookies()).get('dt_pending_email')?.value;
  if (useDevelopmentAuthAdapter() && (!pending || token !== '246810'))
    redirect(`/${locale}/auth/verify-email?error=invalid`);
  if (!useDevelopmentAuthAdapter()) {
    if (token.length < 32) redirect(`/${locale}/auth/verify-email?error=invalid`);
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) redirect(`/${locale}/auth/verify-email?error=unavailable`);
    let response: Response;
    try {
      response = await fetch(`${api}/auth/email-verification/consume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      redirect(`/${locale}/auth/verify-email?error=unavailable`);
    }
    if (!response.ok) redirect(`/${locale}/auth/verify-email?error=invalid`);
    (await cookies()).delete('dt_pending_email');
    redirect(`/${locale}/auth/login?verified=1`);
  } else {
    if (!pending) redirect(`/${locale}/auth/verify-email?error=invalid`);
    await setSessionToken(
      await createDevelopmentToken({ ...demoSessionFor('patient'), email: pending }),
    );
  }
  (await cookies()).delete('dt_pending_email');
  redirect(`/${locale}/app`);
}

export async function logoutAction(locale: Locale) {
  let remoteRevoked = useDevelopmentAuthAdapter();
  if (!useDevelopmentAuthAdapter()) {
    const api = process.env.NEXT_PUBLIC_API_URL;
    const token = (await cookies()).get('dt_session')?.value;
    if (api && token) {
      try {
        const session = await getSession();
        const response = await fetch(`${api}/auth/logout`, {
          method: 'POST',
          headers: session
            ? sessionApiHeaders(session, token)
            : { authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(5_000),
        });
        remoteRevoked = response.ok;
      } catch {
        remoteRevoked = false;
      }
    }
  }
  await clearSession();
  redirect(`/${locale}/auth/login${remoteRevoked ? '' : '?notice=session-revocation-unavailable'}`);
}
