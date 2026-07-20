import 'server-only';

import type {
  AdminAuditLogView,
  AdminNotificationJobView,
  AdminOperationsSummary,
  AdminOrganizationView,
  AdminOutboxJobView,
  AdminUserView,
  AdminWebhookView,
  VerificationCaseDetail,
  VerificationCaseSummary,
} from '@dental-trust/contracts';

import {
  OperationsApiError,
  operationsApi,
  operationsApiPage,
  type OperationsPage,
  type OperationsPageMetadata,
} from './operations-api';

export type OperationsAvailability = 'available' | 'partial' | 'unavailable';

export type OperationsResource =
  | 'summary'
  | 'coordination-dashboard'
  | 'coordination-queue'
  | 'verification-cases'
  | 'users'
  | 'organizations'
  | 'outbox'
  | 'notifications'
  | 'webhooks'
  | 'audit';

export interface OperationsDataIssue {
  readonly resource: OperationsResource;
  readonly kind: 'authentication' | 'authorization' | 'unavailable' | 'invalid-response' | 'failed';
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
}

export interface CoordinationDashboard {
  readonly total: number;
  readonly overdue: number;
  readonly unassigned: number;
  readonly urgent: number;
  readonly workload: readonly { readonly userId: string; readonly count: number }[];
}

export interface CoordinationQueueItem {
  readonly id: string;
  readonly caseId: string;
  readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  readonly status:
    | 'UNASSIGNED'
    | 'ASSIGNED'
    | 'IN_PROGRESS'
    | 'WAITING_PATIENT'
    | 'WAITING_CLINIC'
    | 'SUPERVISOR_REVIEW'
    | 'HANDED_OFF'
    | 'RESOLVED';
  readonly slaDueAt: string;
  readonly version: number;
  readonly assignedAgentUserId: string | null;
  readonly supervisorUserId: string | null;
  readonly missingDocumentCategories: readonly string[];
  readonly lastActivityAt: string;
  readonly case: {
    readonly caseNumber: string;
    readonly title: string;
    readonly status: string;
    readonly updatedAt: string;
  };
}

export interface CoordinationDetail extends CoordinationQueueItem {
  readonly patientSummary: string | null;
  readonly patient: { readonly fullName?: string; readonly preferredLocale?: string } | null;
  readonly case: CoordinationQueueItem['case'] & {
    readonly id: string;
    readonly desiredProcedureCode: string;
    readonly preferredLocation: string | null;
    readonly expectedArrivalDate: string | null;
    readonly expectedDepartureDate: string | null;
  };
  readonly assignedAgent: { readonly id?: string; readonly email?: string } | null;
  readonly supervisor: { readonly id?: string; readonly email?: string } | null;
  readonly documents: readonly unknown[];
  readonly matchingResults: readonly unknown[];
  readonly shortlist: readonly unknown[];
  readonly appointments: readonly unknown[];
  readonly aftercarePlans: readonly unknown[];
  readonly incidents: readonly unknown[];
  readonly internalNotes: readonly {
    readonly id: string;
    readonly authorUserId: string;
    readonly body: string;
    readonly createdAt: string;
  }[];
  readonly travelNotes: readonly unknown[];
  readonly communications: readonly unknown[];
  readonly tasks: readonly {
    readonly id: string;
    readonly kind: string;
    readonly title: string;
    readonly details: string | null;
    readonly status: string;
    readonly dueAt: string;
    readonly version: number;
  }[];
  readonly handoffs: readonly unknown[];
  readonly supervisorReviews: readonly unknown[];
}

export interface OperationsOverviewData {
  readonly summary: AdminOperationsSummary | null;
  readonly coordination: CoordinationDashboard | null;
  readonly coordinationQueue: readonly CoordinationQueueItem[];
  readonly verifications: readonly VerificationCaseSummary[];
  readonly audit: readonly AdminAuditLogView[];
  readonly pages: {
    readonly coordinationQueue: OperationsPageMetadata | null;
    readonly verifications: OperationsPageMetadata | null;
    readonly audit: OperationsPageMetadata | null;
  };
  readonly availability: OperationsAvailability;
  readonly issues: readonly OperationsDataIssue[];
}

export interface CoordinationData {
  readonly dashboard: CoordinationDashboard | null;
  readonly queue: readonly CoordinationQueueItem[];
  readonly page: OperationsPageMetadata | null;
  readonly availability: OperationsAvailability;
  readonly issues: readonly OperationsDataIssue[];
  readonly available: boolean;
}

export interface VerificationData {
  readonly cases: readonly VerificationCaseSummary[];
  readonly page: OperationsPageMetadata | null;
  readonly availability: OperationsAvailability;
  readonly issues: readonly OperationsDataIssue[];
  readonly available: boolean;
}

export interface AdministrationData {
  readonly summary: AdminOperationsSummary | null;
  readonly users: readonly AdminUserView[];
  readonly organizations: readonly AdminOrganizationView[];
  readonly outbox: readonly AdminOutboxJobView[];
  readonly notifications: readonly AdminNotificationJobView[];
  readonly webhooks: readonly AdminWebhookView[];
  readonly audit: readonly AdminAuditLogView[];
  readonly pages: {
    readonly users: OperationsPageMetadata | null;
    readonly organizations: OperationsPageMetadata | null;
    readonly outbox: OperationsPageMetadata | null;
    readonly notifications: OperationsPageMetadata | null;
    readonly webhooks: OperationsPageMetadata | null;
    readonly audit: OperationsPageMetadata | null;
  };
  readonly availability: OperationsAvailability;
  readonly issues: readonly OperationsDataIssue[];
  readonly available: boolean;
}

export async function getOperationsOverview(): Promise<OperationsOverviewData> {
  const [summary, coordination, coordinationQueue, verifications, audit] = await Promise.all([
    loadResource('summary', () =>
      operationsApi<AdminOperationsSummary>('admin/operations/summary'),
    ),
    loadResource('coordination-dashboard', () =>
      operationsApi<CoordinationDashboard>('concierge/dashboard'),
    ),
    loadResource('coordination-queue', () => coordinationQueuePage(12)),
    loadResource('verification-cases', () =>
      operationsApiPage<VerificationCaseSummary>('verification/cases?limit=12'),
    ),
    loadResource('audit', () =>
      operationsApiPage<AdminAuditLogView>('admin/operations/audit-logs?limit=50'),
    ),
  ]);
  const results = [summary, coordination, coordinationQueue, verifications, audit] as const;
  return {
    summary: dataOr(summary, null),
    coordination: dataOr(coordination, null),
    coordinationQueue: dataOr(coordinationQueue, emptyPage<CoordinationQueueItem>()).data,
    verifications: dataOr(verifications, emptyPage<VerificationCaseSummary>()).data,
    audit: dataOr(audit, emptyPage<AdminAuditLogView>()).data,
    pages: {
      coordinationQueue: pageOrNull(coordinationQueue),
      verifications: pageOrNull(verifications),
      audit: pageOrNull(audit),
    },
    availability: availabilityFor(results),
    issues: issuesFor(results),
  };
}

export async function getCoordinationData(cursor?: string): Promise<CoordinationData> {
  const [dashboard, queue] = await Promise.all([
    loadResource('coordination-dashboard', () =>
      operationsApi<CoordinationDashboard>('concierge/dashboard'),
    ),
    loadResource('coordination-queue', () => coordinationQueuePage(50, cursor)),
  ]);
  const results = [dashboard, queue] as const;
  return {
    dashboard: dataOr(dashboard, null),
    queue: dataOr(queue, emptyPage<CoordinationQueueItem>()).data,
    page: pageOrNull(queue),
    availability: availabilityFor(results),
    issues: issuesFor(results),
    available: dashboard.issue === null && queue.issue === null,
  };
}

export async function getVerificationData(cursor?: string): Promise<VerificationData> {
  const cases = await loadResource('verification-cases', () =>
    operationsApiPage<VerificationCaseSummary>(
      `verification/cases?limit=50${cursor ? `&cursor=${cursor}` : ''}`,
    ),
  );
  return {
    cases: dataOr(cases, emptyPage<VerificationCaseSummary>()).data,
    page: pageOrNull(cases),
    availability: availabilityFor([cases]),
    issues: issuesFor([cases]),
    available: cases.issue === null,
  };
}

export async function getAdministrationData(pagination?: {
  readonly section?: string;
  readonly cursor?: string;
}): Promise<AdministrationData> {
  const [summary, users, organizations, outbox, notifications, webhooks, audit] = await Promise.all(
    [
      loadResource('summary', () =>
        operationsApi<AdminOperationsSummary>('admin/operations/summary'),
      ),
      loadResource('users', () =>
        operationsApiPage<AdminUserView>(
          pagePath('admin/directory/users?limit=50', 'users', pagination),
        ),
      ),
      loadResource('organizations', () =>
        operationsApiPage<AdminOrganizationView>(
          pagePath('admin/directory/organizations?limit=50', 'organizations', pagination),
        ),
      ),
      loadResource('outbox', () =>
        operationsApiPage<AdminOutboxJobView>(
          pagePath('admin/operations/jobs/outbox?limit=25', 'outbox', pagination),
        ),
      ),
      loadResource('notifications', () =>
        operationsApiPage<AdminNotificationJobView>(
          pagePath('admin/operations/jobs/notifications?limit=25', 'notifications', pagination),
        ),
      ),
      loadResource('webhooks', () =>
        operationsApiPage<AdminWebhookView>(
          pagePath('admin/operations/webhooks?limit=25', 'webhooks', pagination),
        ),
      ),
      loadResource('audit', () =>
        operationsApiPage<AdminAuditLogView>(
          pagePath('admin/operations/audit-logs?limit=25', 'audit', pagination),
        ),
      ),
    ],
  );
  const results = [summary, users, organizations, outbox, notifications, webhooks, audit] as const;
  return {
    summary: dataOr(summary, null),
    users: dataOr(users, emptyPage<AdminUserView>()).data,
    organizations: dataOr(organizations, emptyPage<AdminOrganizationView>()).data,
    outbox: dataOr(outbox, emptyPage<AdminOutboxJobView>()).data,
    notifications: dataOr(notifications, emptyPage<AdminNotificationJobView>()).data,
    webhooks: dataOr(webhooks, emptyPage<AdminWebhookView>()).data,
    audit: dataOr(audit, emptyPage<AdminAuditLogView>()).data,
    pages: {
      users: pageOrNull(users),
      organizations: pageOrNull(organizations),
      outbox: pageOrNull(outbox),
      notifications: pageOrNull(notifications),
      webhooks: pageOrNull(webhooks),
      audit: pageOrNull(audit),
    },
    availability: availabilityFor(results),
    issues: issuesFor(results),
    available: summary.issue === null,
  };
}

export function getCoordinationDetail(caseId: string): Promise<CoordinationDetail> {
  return operationsApi<CoordinationDetail>(`concierge/cases/${caseId}`);
}

export function getVerificationDetail(caseId: string): Promise<VerificationCaseDetail> {
  return operationsApi<VerificationCaseDetail>(`verification/cases/${caseId}`);
}

type ResourceResult<T> =
  | { readonly data: T; readonly issue: null }
  | { readonly data: null; readonly issue: OperationsDataIssue };

async function loadResource<T>(
  resource: OperationsResource,
  operation: () => Promise<T>,
): Promise<ResourceResult<T>> {
  try {
    return { data: await operation(), issue: null };
  } catch (error) {
    return { data: null, issue: issueFor(resource, error) };
  }
}

async function coordinationQueuePage(
  limit: number,
  cursor?: string,
): Promise<OperationsPage<CoordinationQueueItem>> {
  const pagination = `${cursor ? `&cursor=${cursor}` : ''}`;
  try {
    return await operationsApiPage<CoordinationQueueItem>(
      `concierge/queue?assignment=ALL&limit=${limit}${pagination}`,
    );
  } catch (error) {
    if (!(error instanceof OperationsApiError) || error.status !== 403) throw error;
    return operationsApiPage<CoordinationQueueItem>(
      `concierge/queue?assignment=MINE&limit=${limit}${pagination}`,
    );
  }
}

function dataOr<T>(result: ResourceResult<T>, fallback: T): T {
  return result.issue === null ? result.data : fallback;
}

function pageOrNull<T>(result: ResourceResult<OperationsPage<T>>): OperationsPageMetadata | null {
  return result.issue === null ? result.data.page : null;
}

function emptyPage<T>(): OperationsPage<T> {
  return { data: [], page: { count: 0, nextCursor: null }, requestId: null };
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

function availabilityFor(results: readonly ResourceResult<unknown>[]): OperationsAvailability {
  const availableCount = results.filter(({ issue }) => issue === null).length;
  if (availableCount === results.length) return 'available';
  return availableCount === 0 ? 'unavailable' : 'partial';
}

function issuesFor(results: readonly ResourceResult<unknown>[]): readonly OperationsDataIssue[] {
  return results.flatMap(({ issue }) => (issue ? [issue] : []));
}

function issueFor(resource: OperationsResource, error: unknown): OperationsDataIssue {
  if (!(error instanceof OperationsApiError)) {
    return {
      resource,
      kind: 'failed',
      status: 500,
      code: 'unexpected_operations_data_error',
      retryable: false,
    };
  }
  const kind: OperationsDataIssue['kind'] =
    error.status === 401
      ? 'authentication'
      : error.status === 403
        ? 'authorization'
        : error.code.startsWith('invalid_api_')
          ? 'invalid-response'
          : error.status >= 500 || error.status === 429
            ? 'unavailable'
            : 'failed';
  return {
    resource,
    kind,
    status: error.status,
    code: error.code,
    retryable: error.retryable,
  };
}
