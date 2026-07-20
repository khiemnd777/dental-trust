import 'server-only';

import type {
  AdminCaseView,
  AdminClinicView,
  AdminDentistView,
  AdminGovernanceView,
  AdminPaymentView,
  AdminRoleView,
  IncidentView,
  PrivacyRequestView,
  ReviewAbuseReportView,
  SupportElevationView,
} from '@dental-trust/contracts';

import {
  OperationsApiError,
  operationsApiPageForSession,
  type OperationsPageMetadata,
} from './operations-api';
import type { OperationsSession } from './require-session';

export interface OperationsRoleSection<T> {
  readonly records: readonly T[];
  readonly page: OperationsPageMetadata;
  readonly error: string | null;
}

export interface GovernanceRecord {
  readonly id?: string;
  readonly code?: string;
  readonly key?: string;
  readonly slug?: string;
  readonly kind?: string;
  readonly title?: string;
  readonly locale?: string;
  readonly summary?: string | null;
  readonly category?: string;
  readonly channel?: string;
  readonly valueType?: string;
  readonly names?: { readonly 'vi-VN'?: string; readonly 'en-US'?: string };
  readonly descriptions?: { readonly 'vi-VN'?: string; readonly 'en-US'?: string };
  readonly parentId?: string | null;
  readonly serviceCategoryId?: string;
  readonly countryId?: string;
  readonly currency?: string;
  readonly callingCode?: string;
  readonly timezone?: string;
  readonly isDefault?: boolean;
  readonly active?: boolean;
  readonly version?: number;
  readonly publicationStatus?: string;
  readonly description?: string;
  readonly updatedAt?: string;
  readonly createdAt?: string;
  readonly latestVersion?: {
    readonly version?: number;
    readonly enabled?: boolean;
    readonly environment?: string;
    readonly audiences?: readonly string[];
    readonly publicationStatus?: string;
    readonly subject?: string;
    readonly value?: string;
    readonly createdAt?: string;
  } | null;
}

export interface RoleOperationsData {
  readonly clinics: OperationsRoleSection<AdminClinicView>;
  readonly dentists: OperationsRoleSection<AdminDentistView>;
  readonly cases: OperationsRoleSection<AdminCaseView>;
  readonly payments: OperationsRoleSection<AdminPaymentView>;
  readonly roles: OperationsRoleSection<AdminRoleView>;
  readonly governance: Readonly<
    Record<AdminGovernanceView, OperationsRoleSection<GovernanceRecord>>
  >;
  readonly incidents: OperationsRoleSection<IncidentView>;
  readonly reviewReports: OperationsRoleSection<ReviewAbuseReportView>;
  readonly privacy: OperationsRoleSection<PrivacyRequestView>;
  readonly elevations: OperationsRoleSection<SupportElevationView>;
}

const emptyPage: OperationsPageMetadata = { count: 0, nextCursor: null };

export async function getRoleOperationsData(
  session: OperationsSession,
  pagination?: { readonly section?: string; readonly cursor?: string },
): Promise<RoleOperationsData> {
  const isAdministrator = hasAnyRole(session, 'PLATFORM_ADMIN', 'SUPER_ADMIN');
  const canReadPayments = isAdministrator || hasAnyRole(session, 'FINANCE_ADMIN');
  const canReadContent = isAdministrator || hasAnyRole(session, 'CONTENT_ADMIN');
  const canReadIncidents = isAdministrator || hasAnyRole(session, 'SUPPORT_AGENT');
  const canModerateReviews = isAdministrator || hasAnyRole(session, 'CONTENT_ADMIN');
  const canManagePrivacy = isAdministrator;
  const canReadElevations = isAdministrator || hasAnyRole(session, 'SUPPORT_AGENT');
  const privilegedSessionReady = session.mfaVerified;
  const gated = privilegedSessionReady ? null : 'mfa_required';

  const [clinics, dentists, cases, payments, roles, incidents, reviewReports, privacy, elevations] =
    await Promise.all([
      loadIf<AdminClinicView>(
        session,
        isAdministrator,
        pagePath('admin/directory/clinics?limit=50', 'clinics', pagination),
        gated,
      ),
      loadIf<AdminDentistView>(
        session,
        isAdministrator,
        pagePath('admin/directory/dentists?limit=50', 'dentists', pagination),
        gated,
      ),
      loadIf<AdminCaseView>(
        session,
        isAdministrator,
        pagePath('admin/directory/cases?limit=50', 'cases', pagination),
        gated,
      ),
      loadIf<AdminPaymentView>(
        session,
        canReadPayments,
        pagePath('admin/directory/payments?limit=50', 'payments', pagination),
        gated,
      ),
      loadIf<AdminRoleView>(session, isAdministrator, 'admin/directory/roles', gated),
      loadIf<IncidentView>(
        session,
        canReadIncidents,
        pagePath('trust/incidents?limit=50', 'incidents', pagination),
        gated,
      ),
      loadIf<ReviewAbuseReportView>(
        session,
        canModerateReviews,
        pagePath('trust/review-reports?limit=50', 'reports', pagination),
        gated,
      ),
      loadIf<PrivacyRequestView>(
        session,
        canManagePrivacy,
        pagePath('trust/privacy/requests?queue=true&limit=50', 'privacy', pagination),
        gated,
      ),
      loadIf<SupportElevationView>(
        session,
        canReadElevations,
        pagePath('trust/support/elevations?limit=50', 'elevations', pagination),
        gated,
      ),
    ]);

  const governanceViews: readonly AdminGovernanceView[] = [
    'content',
    'taxonomy',
    'templates',
    'feature-flags',
    'configuration',
    'locations',
  ];
  const governanceResults = await Promise.all(
    governanceViews.map((view) =>
      loadIf<GovernanceRecord>(
        session,
        canReadContent && (isAdministrator || ['content', 'taxonomy', 'templates'].includes(view)),
        pagePath(`admin/governance/${view}?limit=50`, view, pagination),
        gated,
      ),
    ),
  );
  const governance = Object.fromEntries(
    governanceViews.map((view, index) => [view, governanceResults[index]]),
  ) as unknown as RoleOperationsData['governance'];

  return {
    clinics,
    dentists,
    cases,
    payments,
    roles,
    governance,
    incidents,
    reviewReports,
    privacy,
    elevations,
  };
}

async function loadIf<T>(
  session: OperationsSession,
  allowed: boolean,
  path: string,
  gated: string | null,
): Promise<OperationsRoleSection<T>> {
  if (!allowed) return unavailable('forbidden');
  if (gated) return unavailable(gated);
  try {
    const page = await operationsApiPageForSession<T>(session, path);
    return { records: page.data, page: page.page, error: null };
  } catch (error) {
    return unavailable(error instanceof OperationsApiError ? error.code : 'service_unavailable');
  }
}

function unavailable<T>(error: string): OperationsRoleSection<T> {
  return { records: [], page: emptyPage, error };
}

function hasAnyRole(session: OperationsSession, ...roles: readonly string[]): boolean {
  return session.roles.some((role) => roles.includes(role));
}

function pagePath(
  path: string,
  section: string,
  pagination?: { readonly section?: string; readonly cursor?: string },
): string {
  return pagination?.section === section && pagination.cursor
    ? `${path}&cursor=${pagination.cursor}`
    : path;
}
