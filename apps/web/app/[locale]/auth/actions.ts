'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiErrorSchema, registerRequestSchema } from '@dental-trust/contracts';
import type { Locale } from '@dental-trust/i18n';
import type { PortalArea } from '@/lib/routing';
import { bffClientContextHeaders, bffSessionContextHeaders } from '@/lib/bff-client-context';
import {
  authContinuationFromForm,
  authUrl,
  careContinuationPath,
  safeReturnTo,
  type AuthContinuation,
  type ProductTarget,
} from '@/lib/auth-continuation';
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

function productDestination(
  product: ProductTarget | undefined,
  area: PortalArea,
  continuation: AuthContinuation = {},
): string | null {
  if (product === 'care' && area === 'patient')
    return `${process.env.CARE_APP_URL ?? 'http://localhost:3000'}${careContinuationPath(continuation)}`;
  if (product === 'provider' && area === 'clinic')
    return process.env.PROVIDER_APP_URL ?? 'http://localhost:3001';
  if (
    product === 'operations' &&
    (area === 'concierge' || area === 'verification' || area === 'admin')
  )
    return process.env.OPERATIONS_APP_URL ?? 'http://localhost:3002';
  return null;
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

type ProductionLoginResult =
  | { readonly status: 'success'; readonly accessToken: string; readonly roles: SystemRole[] }
  | { readonly status: 'invalid' | 'unavailable' };

async function productionLogin(email: string, password: string): Promise<ProductionLoginResult> {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return { status: 'unavailable' };
  try {
    const clientContext = await bffClientContextHeaders();
    const response = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { ...clientContext, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 400 || response.status === 401) return { status: 'invalid' };
    if (!response.ok) return { status: 'unavailable' };
    const envelope = (await response.json()) as {
      data?: { accessToken?: string; user?: { roles?: SystemRole[] } };
    };
    const body = envelope.data;
    return body?.accessToken && Array.isArray(body.user?.roles)
      ? { status: 'success', accessToken: body.accessToken, roles: body.user.roles }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function loginAction(locale: Locale, formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const requestedArea = String(formData.get('demoArea') ?? '') as PortalArea;
  const continuation = authContinuationFromForm(locale, formData);
  const product = continuation.product;
  let area: PortalArea;
  if (useDevelopmentAuthAdapter()) {
    const resolvedArea = requestedArea in destinations ? requestedArea : areaFromEmail(email);
    if (!resolvedArea || password !== demoPassword)
      redirect(authUrl(`/${locale}/auth/login`, continuation, { error: 'invalid' }));
    area = resolvedArea;
    await setSessionToken(await createDevelopmentToken(demoSessionFor(resolvedArea)));
  } else {
    const result = await productionLogin(email, password);
    if (result.status === 'invalid')
      redirect(authUrl(`/${locale}/auth/login`, continuation, { error: 'invalid' }));
    if (result.status !== 'success')
      redirect(authUrl(`/${locale}/auth/login`, continuation, { error: 'unavailable' }));
    await setSessionToken(result.accessToken);
    const session = await getSession();
    if (!session)
      redirect(authUrl(`/${locale}/auth/login`, continuation, { error: 'unavailable' }));
    if (session.mfaRequired && !session.mfaVerified) {
      const requested = continuation.returnTo ?? `/${locale}/app`;
      redirect(authUrl(`/${locale}/auth/mfa`, { ...continuation, returnTo: requested }));
    }
    const resolvedArea = areaFromRoles(session.roles);
    if (!resolvedArea) {
      if (session.availableMemberships?.length) {
        const requested = continuation.returnTo ?? '';
        const organizationQuery = new URLSearchParams({
          ...(requested ? { returnTo: requested } : {}),
          ...(product ? { product } : {}),
        });
        redirect(`/${locale}/auth/organization?${organizationQuery.toString()}`);
      }
      redirect(authUrl(`/${locale}/auth/login`, continuation, { error: 'permission' }));
    }
    area = resolvedArea;
  }
  const productUrl = productDestination(product, area, continuation);
  if (product && !productUrl)
    redirect(authUrl(`/${locale}/auth/login`, continuation, { error: 'permission' }));
  if (productUrl) redirect(productUrl);
  const destination = `/${locale}/${destinations[area]}`;
  redirect(safeReturnTo(locale, continuation.returnTo, destination));
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
  const product = authContinuationFromForm(locale, formData).product;
  const area: PortalArea = membership.role === 'CONCIERGE_AGENT' ? 'concierge' : 'clinic';
  const productUrl = productDestination(product, area);
  if (productUrl) redirect(productUrl);
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
    const clientContext = bffSessionContextHeaders(session.id);
    const response = await fetch(`${api}/clinic-operations/organizations`, {
      method: 'POST',
      headers: {
        ...clientContext,
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
  const continuation = authContinuationFromForm(locale, formData);
  const registration = registerRequestSchema.safeParse({
    email,
    password,
    preferredLocale: locale === 'vi' ? 'vi-VN' : 'en-US',
    termsVersion,
    privacyVersion,
  });
  const registrationCookies = await cookies();
  const fail = (error: string): never => {
    registrationCookies.set('dt_registration_email', email, {
      httpOnly: true,
      maxAge: 15 * 60,
      path: `/${locale}/auth`,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    redirect(authUrl(`/${locale}/auth/register`, continuation, { error }));
  };
  if (!registration.success) {
    const field = registration.error.issues[0]?.path[0];
    fail(field === 'email' ? 'email' : 'password');
  }
  if (password !== confirmation) fail('confirmation');
  if (formData.get('accept') !== 'on') fail('accept');
  if (!useDevelopmentAuthAdapter()) {
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) fail('unavailable');
    const clientContext = await bffClientContextHeaders();
    const response = await fetch(`${api}/auth/register`, {
      method: 'POST',
      headers: { ...clientContext, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...registration.data,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => fail('unavailable'));
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const apiError = apiErrorSchema.safeParse(payload);
      if (response.status === 409 || (apiError.success && apiError.data.error.code === 'CONFLICT'))
        fail('email-in-use');
      if (apiError.success && apiError.data.error.fieldErrors?.email) fail('email');
      if (apiError.success && apiError.data.error.fieldErrors?.password) fail('password');
      fail(response.status >= 500 ? 'unavailable' : 'invalid');
    }
  }
  registrationCookies.delete('dt_registration_email');
  registrationCookies.set('dt_pending_email', email, {
    httpOnly: true,
    maxAge: 15 * 60,
    path: `/${locale}/auth`,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  redirect(authUrl(`/${locale}/auth/verify-email`, continuation));
}

export async function verifyEmailAction(locale: Locale, formData: FormData) {
  const token = String(formData.get('token') ?? formData.get('code') ?? '').trim();
  const continuation = authContinuationFromForm(locale, formData);
  const pending = (await cookies()).get('dt_pending_email')?.value;
  if (useDevelopmentAuthAdapter() && (!pending || token !== '246810'))
    redirect(authUrl(`/${locale}/auth/verify-email`, continuation, { error: 'invalid' }));
  if (!useDevelopmentAuthAdapter()) {
    if (token.length < 32)
      redirect(authUrl(`/${locale}/auth/verify-email`, continuation, { error: 'invalid' }));
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api)
      redirect(authUrl(`/${locale}/auth/verify-email`, continuation, { error: 'unavailable' }));
    let response: Response;
    try {
      const clientContext = await bffClientContextHeaders();
      response = await fetch(`${api}/auth/email-verification/consume`, {
        method: 'POST',
        headers: { ...clientContext, 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      redirect(authUrl(`/${locale}/auth/verify-email`, continuation, { error: 'unavailable' }));
    }
    if (!response.ok)
      redirect(authUrl(`/${locale}/auth/verify-email`, continuation, { error: 'invalid' }));
    (await cookies()).delete('dt_pending_email');
    redirect(authUrl(`/${locale}/auth/login`, continuation, { verified: '1' }));
  } else {
    if (!pending) redirect(`/${locale}/auth/verify-email?error=invalid`);
    await setSessionToken(
      await createDevelopmentToken({ ...demoSessionFor('patient'), email: pending }),
    );
  }
  (await cookies()).delete('dt_pending_email');
  const productUrl = productDestination(continuation.product, 'patient', continuation);
  redirect(productUrl ?? continuation.returnTo ?? `/${locale}/app`);
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
