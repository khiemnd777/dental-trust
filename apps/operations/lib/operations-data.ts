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

import { operationsApi } from './operations-api';

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
}

export interface CoordinationData {
  readonly dashboard: CoordinationDashboard | null;
  readonly queue: readonly CoordinationQueueItem[];
  readonly available: boolean;
}

export interface VerificationData {
  readonly cases: readonly VerificationCaseSummary[];
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
  readonly available: boolean;
}

export async function getOperationsOverview(): Promise<OperationsOverviewData> {
  const [summary, coordination, coordinationQueue, verifications, audit] = await Promise.all([
    optional(() => operationsApi<AdminOperationsSummary>('admin/operations/summary'), null),
    optional(() => operationsApi<CoordinationDashboard>('concierge/dashboard'), null),
    coordinationQueueWithFallback(12),
    optional(
      () => operationsApi<readonly VerificationCaseSummary[]>('verification/cases?limit=12'),
      [],
    ),
    optional(
      () => operationsApi<readonly AdminAuditLogView[]>('admin/operations/audit-logs?limit=50'),
      [],
    ),
  ]);
  return { summary, coordination, coordinationQueue, verifications, audit };
}

export async function getCoordinationData(): Promise<CoordinationData> {
  const [dashboard, queue] = await Promise.all([
    optional(() => operationsApi<CoordinationDashboard>('concierge/dashboard'), null),
    coordinationQueueWithFallback(50),
  ]);
  return { dashboard, queue, available: dashboard !== null };
}

export async function getVerificationData(): Promise<VerificationData> {
  const cases = await optional(
    () => operationsApi<readonly VerificationCaseSummary[]>('verification/cases?limit=50'),
    [],
  );
  return { cases, available: cases.length > 0 };
}

export async function getAdministrationData(): Promise<AdministrationData> {
  const [summary, users, organizations, outbox, notifications, webhooks, audit] = await Promise.all(
    [
      optional(() => operationsApi<AdminOperationsSummary>('admin/operations/summary'), null),
      optional(() => operationsApi<readonly AdminUserView[]>('admin/directory/users?limit=50'), []),
      optional(
        () =>
          operationsApi<readonly AdminOrganizationView[]>('admin/directory/organizations?limit=50'),
        [],
      ),
      optional(
        () => operationsApi<readonly AdminOutboxJobView[]>('admin/operations/jobs/outbox?limit=25'),
        [],
      ),
      optional(
        () =>
          operationsApi<readonly AdminNotificationJobView[]>(
            'admin/operations/jobs/notifications?limit=25',
          ),
        [],
      ),
      optional(
        () => operationsApi<readonly AdminWebhookView[]>('admin/operations/webhooks?limit=25'),
        [],
      ),
      optional(
        () => operationsApi<readonly AdminAuditLogView[]>('admin/operations/audit-logs?limit=25'),
        [],
      ),
    ],
  );
  return {
    summary,
    users,
    organizations,
    outbox,
    notifications,
    webhooks,
    audit,
    available: summary !== null,
  };
}

export function getCoordinationDetail(caseId: string): Promise<CoordinationDetail> {
  return operationsApi<CoordinationDetail>(`concierge/cases/${caseId}`);
}

export function getVerificationDetail(caseId: string): Promise<VerificationCaseDetail> {
  return operationsApi<VerificationCaseDetail>(`verification/cases/${caseId}`);
}

async function optional<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch {
    return fallback;
  }
}

async function coordinationQueueWithFallback(
  limit: number,
): Promise<readonly CoordinationQueueItem[]> {
  try {
    return await operationsApi<readonly CoordinationQueueItem[]>(
      `concierge/queue?assignment=ALL&limit=${limit}`,
    );
  } catch {
    return optional(
      () =>
        operationsApi<readonly CoordinationQueueItem[]>(
          `concierge/queue?assignment=MINE&limit=${limit}`,
        ),
      [],
    );
  }
}
