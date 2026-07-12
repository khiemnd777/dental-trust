import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Locale } from '@dental-trust/i18n';
import type { PortalArea } from './routing';

export type SystemRole =
  | 'PATIENT'
  | 'CAREGIVER'
  | 'DENTIST'
  | 'CLINIC_STAFF'
  | 'CLINIC_ADMIN'
  | 'CONCIERGE_AGENT'
  | 'VERIFICATION_OFFICER'
  | 'SUPPORT_AGENT'
  | 'FINANCE_ADMIN'
  | 'CONTENT_ADMIN'
  | 'PLATFORM_ADMIN'
  | 'SUPER_ADMIN';

export type OrganizationRole = Extract<
  SystemRole,
  'DENTIST' | 'CLINIC_STAFF' | 'CLINIC_ADMIN' | 'CONCIERGE_AGENT'
>;

export interface OrganizationMembership {
  organizationId: string;
  role: OrganizationRole;
}

export interface WebSession {
  id: string;
  name: string;
  email: string;
  roles: SystemRole[];
  organizationId?: string;
  availableMemberships?: OrganizationMembership[];
  caseIds?: string[];
  expiresAt: string;
  mfaVerified?: boolean;
  mfaRequired?: boolean;
  source: 'development' | 'api';
}

const sessionCookie = 'dt_session';
const organizationCookie = 'dt_organization';
const maxAge = 60 * 60 * 8;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const systemRoles = new Set<SystemRole>([
  'PATIENT',
  'CAREGIVER',
  'DENTIST',
  'CLINIC_STAFF',
  'CLINIC_ADMIN',
  'CONCIERGE_AGENT',
  'VERIFICATION_OFFICER',
  'SUPPORT_AGENT',
  'FINANCE_ADMIN',
  'CONTENT_ADMIN',
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
]);
const organizationRoles = new Set<OrganizationRole>([
  'DENTIST',
  'CLINIC_STAFF',
  'CLINIC_ADMIN',
  'CONCIERGE_AGENT',
]);

export function useDevelopmentAuthAdapter(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.WEB_AUTH_ADAPTER === 'development';
}

const areaRoles: Record<PortalArea, readonly SystemRole[]> = {
  patient: ['PATIENT', 'CAREGIVER'],
  clinic: ['DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN'],
  concierge: ['CONCIERGE_AGENT', 'SUPPORT_AGENT'],
  verification: ['VERIFICATION_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  admin: ['SUPPORT_AGENT', 'FINANCE_ADMIN', 'CONTENT_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
};

function configuredSecret() {
  const value = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32)) return null;
  return value ?? 'development-only-change-me-32-bytes-minimum';
}

function secretKey() {
  const value = configuredSecret();
  return value ? new TextEncoder().encode(value) : null;
}

export async function createDevelopmentToken(session: WebSession) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Development sessions are disabled in production');
  const key = secretKey();
  if (!key) throw new Error('AUTH_SECRET must contain at least 32 characters');
  const expiresAt = Math.floor(Date.parse(session.expiresAt) / 1_000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1_000))
    throw new Error('Development session expiry must be a valid future timestamp');
  return new SignJWT({
    name: session.name,
    email: session.email,
    roles: session.roles,
    ...(session.organizationId ? { organizationId: session.organizationId } : {}),
    ...(session.caseIds ? { caseIds: session.caseIds } : {}),
    source: 'development',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(session.id)
    .setIssuedAt()
    .setIssuer('dental-trust-web-development')
    .setAudience('dental-trust-web')
    .setExpirationTime(expiresAt)
    .sign(key);
}

async function readDevelopmentToken(token: string): Promise<WebSession | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: 'dental-trust-web-development',
      audience: 'dental-trust-web',
    });
    if (
      payload.source !== 'development' ||
      !payload.sub ||
      typeof payload.name !== 'string' ||
      typeof payload.email !== 'string' ||
      !Array.isArray(payload.roles) ||
      typeof payload.exp !== 'number'
    )
      return null;
    const roles = payload.roles.filter(
      (value): value is SystemRole => typeof value === 'string',
    ) as SystemRole[];
    if (roles.length === 0) return null;
    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      roles,
      ...(typeof payload.organizationId === 'string'
        ? { organizationId: payload.organizationId }
        : {}),
      ...(Array.isArray(payload.caseIds)
        ? { caseIds: payload.caseIds.filter((value): value is string => typeof value === 'string') }
        : {}),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      source: 'development',
    };
  } catch {
    return null;
  }
}

function isSystemRole(value: unknown): value is SystemRole {
  return typeof value === 'string' && systemRoles.has(value as SystemRole);
}

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return typeof value === 'string' && organizationRoles.has(value as OrganizationRole);
}

function membershipsFrom(value: unknown): OrganizationMembership[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((membership) => {
    if (
      !membership ||
      typeof membership !== 'object' ||
      !('organizationId' in membership) ||
      !('role' in membership) ||
      typeof membership.organizationId !== 'string' ||
      !uuidPattern.test(membership.organizationId) ||
      !isOrganizationRole(membership.role)
    )
      return [];
    return [{ organizationId: membership.organizationId, role: membership.role }];
  });
}

async function fetchApiSession(
  token: string,
  requestedOrganizationId?: string,
): Promise<WebSession | null> {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return null;
  try {
    const load = (organizationId?: string) =>
      fetch(`${api}/auth/me`, {
        headers: {
          authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      });
    let response = await load(requestedOrganizationId);
    // A membership can be revoked between requests. Fall back to the unscoped
    // bootstrap so the user can select another active membership.
    if (!response.ok && requestedOrganizationId) response = await load();
    if (!response.ok) return null;
    const envelope = (await response.json()) as {
      data?: {
        id?: string;
        roles?: unknown[];
        memberships?: unknown[];
        availableMemberships?: unknown[];
        selectedOrganizationId?: string | null;
        mfaVerified?: boolean;
        mfaRequired?: boolean;
      };
    };
    const user = envelope.data;
    if (!user?.id || !Array.isArray(user.roles)) return null;
    const globalRoles = user.roles.filter(isSystemRole);
    const selectedMemberships = membershipsFrom(user.memberships);
    const availableMemberships = membershipsFrom(user.availableMemberships);
    const selectedOrganizationId =
      typeof user.selectedOrganizationId === 'string' &&
      selectedMemberships.some(
        (membership) => membership.organizationId === user.selectedOrganizationId,
      ) &&
      availableMemberships.some(
        (membership) => membership.organizationId === user.selectedOrganizationId,
      )
        ? user.selectedOrganizationId
        : undefined;
    return {
      id: user.id,
      name: 'Dental Trust',
      email: '',
      roles: [
        ...new Set([...globalRoles, ...selectedMemberships.map((membership) => membership.role)]),
      ],
      availableMemberships,
      ...(selectedOrganizationId ? { organizationId: selectedOrganizationId } : {}),
      expiresAt: new Date(Date.now() + maxAge * 1000).toISOString(),
      source: 'api',
      mfaVerified: user.mfaVerified === true,
      mfaRequired: user.mfaRequired === true,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<WebSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (!token) return null;
  if (useDevelopmentAuthAdapter()) {
    if (!configuredSecret()) return null;
    return readDevelopmentToken(token);
  }
  const requestedOrganizationId = cookieStore.get(organizationCookie)?.value;
  return fetchApiSession(
    token,
    requestedOrganizationId && uuidPattern.test(requestedOrganizationId)
      ? requestedOrganizationId
      : undefined,
  );
}

export async function setSessionToken(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, token, {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  cookieStore.delete(organizationCookie);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookie);
  cookieStore.delete(organizationCookie);
}

export async function selectActiveOrganization(
  organizationId: string,
): Promise<OrganizationMembership | null> {
  if (!uuidPattern.test(organizationId)) return null;
  const api = process.env.NEXT_PUBLIC_API_URL;
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (!api || !token) return null;
  try {
    const response = await fetch(`${api}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const envelope = (await response.json()) as {
      data?: { availableMemberships?: unknown[] };
    };
    const selected = membershipsFrom(envelope.data?.availableMemberships).find(
      (membership) => membership.organizationId === organizationId,
    );
    if (!selected) return null;
    cookieStore.set(organizationCookie, organizationId, {
      httpOnly: true,
      maxAge,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return selected;
  } catch {
    return null;
  }
}

export function sessionApiHeaders(session: WebSession, token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    ...(session.organizationId ? { 'x-organization-id': session.organizationId } : {}),
  };
}

function hasAreaRole(session: WebSession, area: PortalArea) {
  return session.roles.some((role) => areaRoles[area].includes(role));
}

export async function requireAreaSession(area: PortalArea, locale: Locale) {
  const session = await getSession();
  if (!session)
    redirect(
      `/${locale}/auth/login?returnTo=/${locale}/${area === 'patient' ? 'app' : area === 'verification' ? 'verification-admin' : area}`,
    );
  if (session.mfaRequired && !session.mfaVerified) {
    const destination = `/${locale}/${area === 'patient' ? 'app' : area === 'verification' ? 'verification-admin' : area}`;
    redirect(`/${locale}/auth/mfa?returnTo=${encodeURIComponent(destination)}`);
  }
  if (!hasAreaRole(session, area)) {
    const selectable = session.availableMemberships?.some((membership) =>
      areaRoles[area].includes(membership.role),
    );
    if (selectable) {
      const destination = `/${locale}/${area === 'patient' ? 'app' : area === 'verification' ? 'verification-admin' : area}`;
      redirect(`/${locale}/auth/organization?returnTo=${encodeURIComponent(destination)}`);
    }
    redirect(`/${locale}/auth/login?error=permission`);
  }
  return session;
}

const adminRouteRoles: Record<string, readonly SystemRole[]> = {
  dashboard: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  users: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  organizations: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  roles: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  clinics: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  dentists: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  cases: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  payments: ['FINANCE_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  incidents: ['SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  reviews: ['CONTENT_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  content: ['CONTENT_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  taxonomy: ['CONTENT_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  notifications: ['CONTENT_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  privacy: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  audit: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  jobs: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  webhooks: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  flags: ['SUPER_ADMIN'],
  health: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
};

export function canAccessPortalRoute(
  session: WebSession,
  area: PortalArea,
  routeKey: string,
  resourceId?: string,
) {
  if (!hasAreaRole(session, area)) return false;
  if (area === 'admin')
    return session.roles.some((role) => adminRouteRoles[routeKey]?.includes(role) ?? false);
  if (
    area === 'concierge' &&
    session.roles.includes('SUPPORT_AGENT') &&
    !session.roles.includes('CONCIERGE_AGENT')
  )
    return ['queue', 'cases', 'incidents', 'tasks'].includes(routeKey);
  if (
    area === 'patient' &&
    session.roles.includes('CAREGIVER') &&
    !session.roles.includes('PATIENT')
  ) {
    if (
      [
        'onboarding',
        'intake',
        'newCase',
        'checkout',
        'payments',
        'incidents',
        'reviews',
        'caregivers',
        'privacy',
      ].includes(routeKey)
    )
      return false;
    if (
      [
        'case',
        'records',
        'shortlist',
        'plans',
        'planDetail',
        'consultations',
        'aftercare',
        'messages',
      ].includes(routeKey) &&
      !resourceId
    )
      return false;
    if (session.source === 'development' && resourceId && !session.caseIds?.includes(resourceId))
      return false;
  }
  if (
    area === 'clinic' &&
    session.roles.includes('DENTIST') &&
    !session.roles.includes('CLINIC_ADMIN')
  )
    return [
      'dashboard',
      'cases',
      'caseDetail',
      'planBuilder',
      'scheduling',
      'availability',
      'messages',
      'progress',
      'passport',
      'aftercare',
      'incidents',
      'reviews',
      'settings',
    ].includes(routeKey);
  if (
    area === 'clinic' &&
    session.roles.includes('CLINIC_STAFF') &&
    !session.roles.includes('CLINIC_ADMIN')
  )
    return [
      'dashboard',
      'cases',
      'caseDetail',
      'scheduling',
      'availability',
      'messages',
      'progress',
      'aftercare',
      'incidents',
      'reviews',
      'settings',
    ].includes(routeKey);
  return true;
}

export async function authorizePortalRoute(
  session: WebSession,
  area: PortalArea,
  routeKey: string,
  resourceId?: string,
) {
  if (!canAccessPortalRoute(session, area, routeKey, resourceId)) return false;
  if (session.source !== 'api' || !resourceId) return true;
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!api || !token) return false;
  try {
    const resourcePath =
      area === 'verification'
        ? routeKey === 'audit'
          ? `verification/site-audits/${resourceId}`
          : routeKey === 'corrective'
            ? `verification/corrective-actions/${resourceId}`
            : `verification/cases/${resourceId}`
        : `cases/${resourceId}`;
    const response = await fetch(`${api}/${resourcePath}`, {
      headers: sessionApiHeaders(session, token),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function loadAuthorizedCaseIds(session: WebSession) {
  if (session.source === 'development') return session.caseIds ?? [];
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!api || !token) return [];
  try {
    const response = await fetch(`${api}/cases?limit=25`, {
      headers: sessionApiHeaders(session, token),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return [];
    const envelope = (await response.json()) as { data?: { id?: string }[] };
    return (envelope.data ?? [])
      .map((item) => item.id)
      .filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

export async function requirePortalRouteSession(
  area: PortalArea,
  routeKey: string,
  locale: Locale,
  resourceId?: string,
) {
  const session = await requireAreaSession(area, locale);
  if (!(await authorizePortalRoute(session, area, routeKey, resourceId)))
    redirect(`/${locale}/auth/login?error=permission`);
  return session;
}

export function demoSessionFor(area: PortalArea): WebSession {
  const identities: Record<
    PortalArea,
    Pick<WebSession, 'name' | 'email' | 'roles'> & { organizationId?: string; caseIds?: string[] }
  > = {
    patient: {
      name: 'Linh Nguyen',
      email: 'patient@dentaltrust.local',
      roles: ['PATIENT'],
      caseIds: ['018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01'],
    },
    clinic: {
      name: 'Dr. Minh Tam',
      email: 'clinic@dentaltrust.local',
      roles: ['CLINIC_ADMIN'],
      organizationId: 'clinic-minh-an',
    },
    concierge: {
      name: 'Mai Tran',
      email: 'concierge@dentaltrust.local',
      roles: ['CONCIERGE_AGENT'],
      organizationId: 'dental-trust',
    },
    verification: {
      name: 'An Le',
      email: 'verification@dentaltrust.local',
      roles: ['VERIFICATION_OFFICER'],
      organizationId: 'dental-trust',
    },
    admin: {
      name: 'Platform Admin',
      email: 'admin@dentaltrust.local',
      roles: ['PLATFORM_ADMIN'],
      organizationId: 'dental-trust',
    },
  };
  return {
    id: `demo-${area}`,
    ...identities[area],
    expiresAt: new Date(Date.now() + maxAge * 1000).toISOString(),
    source: 'development',
  };
}
