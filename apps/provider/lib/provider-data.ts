import {
  aftercarePlanViewSchema,
  appointmentViewSchema,
  caseDocumentViewSchema,
  clinicAnalyticsViewSchema,
  clinicAvailabilityViewSchema,
  clinicBillingViewSchema,
  clinicDentistViewSchema,
  clinicOnboardingViewSchema,
  clinicOpportunityViewSchema,
  clinicOverviewViewSchema,
  clinicServicesWorkspaceViewSchema,
  clinicTeamViewSchema,
  dentalCaseViewSchema,
  journeySummaryViewSchema,
  internalNoteViewSchema,
  incidentUpdateViewSchema,
  incidentViewSchema,
  implantRecordInputSchema,
  journeyMilestoneViewSchema,
  messageThreadViewSchema,
  messageViewSchema,
  materialRecordInputSchema,
  planChangeViewSchema,
  prescriptionRecordInputSchema,
  treatmentInstructionViewSchema,
  treatmentPlanVersionViewSchema,
  type AftercarePlanView,
  type AppointmentView,
  type CaseDocumentView,
  type ClinicAnalyticsView,
  type ClinicAvailabilityView,
  type ClinicBillingView,
  type ClinicDentistView,
  type ClinicOnboardingView,
  type ClinicOpportunityView,
  type ClinicOverviewView,
  type ClinicServicesWorkspaceView,
  type ClinicTeamView,
  type DentalCaseView,
  type JourneySummaryView,
  type InternalNoteView,
  type MessageThreadView,
  type MessageView,
  type TreatmentPlanVersionView,
} from '@dental-trust/contracts';
import { z } from 'zod';

import {
  ProviderApiError,
  providerApi,
  providerApiPage,
  type ProviderApiPage,
} from './provider-api';
import { isAttachableCaseDocument } from './messaging';

export const providerClinicalJourneySchema = z.object({
  id: z.uuid(),
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  version: z.number().int().positive(),
  milestones: journeyMilestoneViewSchema.array(),
  instructions: treatmentInstructionViewSchema.array(),
  planChanges: planChangeViewSchema.array(),
});

export const providerPassportVersionSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  caseNumber: z.string().min(1),
  version: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'REVOKED']),
  clinic: z.object({ id: z.uuid(), name: z.string().min(1) }),
  treatingDentist: z.object({ id: z.uuid(), fullName: z.string().min(1) }),
  treatmentCompletedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  treatmentSummary: z.string(),
  dischargeInstructions: z.string(),
  followUpInstructions: z.string(),
  implants: implantRecordInputSchema.array(),
  materials: materialRecordInputSchema.array(),
  prescriptions: prescriptionRecordInputSchema.array(),
  integrity: z.object({
    algorithm: z.string().min(1),
    contentChecksum: z.string().regex(/^[a-f0-9]{64}$/u),
    previousVersionChecksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    verified: z.boolean(),
  }),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  downloadable: z.boolean(),
});

export const providerIncidentViewSchema = incidentViewSchema.extend({
  internalNotes: incidentUpdateViewSchema.array().default([]),
});

export type ProviderClinicalJourney = z.infer<typeof providerClinicalJourneySchema>;
export type ProviderPassportVersion = z.infer<typeof providerPassportVersionSchema>;
export type ProviderIncidentView = z.infer<typeof providerIncidentViewSchema>;

export interface ProviderDashboardData {
  readonly overview: ClinicOverviewView | null;
  readonly today: readonly JourneySummaryView[];
  readonly analytics: ClinicAnalyticsView | null;
  readonly availability: ClinicAvailabilityView | null;
  readonly unavailable: readonly string[];
}

export interface ProviderCaseIndexData {
  readonly cases: readonly DentalCaseView[];
  readonly opportunities: readonly ClinicOpportunityView[];
  readonly dentists: readonly ClinicDentistView[];
}

export interface ProviderCaseWorkspaceData {
  readonly dentalCase: DentalCaseView;
  readonly journey: JourneySummaryView;
  readonly plans: readonly TreatmentPlanVersionView[] | null;
  readonly appointments: readonly AppointmentView[] | null;
  readonly documents: readonly CaseDocumentView[] | null;
  readonly threads: readonly MessageThreadView[] | null;
  readonly messages: Readonly<Record<string, readonly MessageView[]>>;
  readonly aftercare: readonly AftercarePlanView[] | null;
  readonly incidents: readonly ProviderIncidentView[] | null;
  readonly team: ClinicTeamView | null;
  readonly clinicalJourney: ProviderClinicalJourney | null;
  readonly passport: ProviderPassportVersion | null;
  readonly passportUnavailable: boolean;
  readonly opportunity: ClinicOpportunityView | null;
  readonly dentists: readonly ClinicDentistView[];
  readonly onboarding: ClinicOnboardingView;
}

export interface ProviderScheduleData {
  readonly availability: ClinicAvailabilityView;
  readonly appointments: readonly AppointmentView[];
  readonly cases: readonly DentalCaseView[];
  readonly dentists: readonly ClinicDentistView[];
  readonly onboarding: ClinicOnboardingView;
}

export interface ProviderMessageThread extends MessageThreadView {
  readonly caseNumber: string;
  readonly caseTitle: string;
  readonly messages: readonly MessageView[];
  readonly internalNotes: readonly InternalNoteView[] | null;
  readonly attachableDocuments: readonly CaseDocumentView[];
}

export interface ProviderClinicData {
  readonly overview: ClinicOverviewView;
  readonly onboarding: ClinicOnboardingView;
  readonly team: ClinicTeamView;
  readonly dentists: readonly ClinicDentistView[];
  readonly availability: ClinicAvailabilityView | null;
  readonly services: ClinicServicesWorkspaceView;
  readonly analytics: ClinicAnalyticsView | null;
  readonly billing: ClinicBillingView | null;
}

export async function getProviderDashboard(): Promise<ProviderDashboardData> {
  const [overview, today, analytics, availability] = await Promise.all([
    settled('overview', () => getClinicOverview()),
    settled('today', () => getTodayCases()),
    settled('analytics', () => getClinicAnalytics()),
    settled('availability', () => getClinicAvailability()),
  ]);
  return {
    overview: overview.data,
    today: today.data ?? [],
    analytics: analytics.data,
    availability: availability.data,
    unavailable: [overview, today, analytics, availability]
      .filter((result) => result.data === null)
      .map((result) => result.key),
  };
}

export async function getProviderCaseIndex(): Promise<ProviderCaseIndexData> {
  const [cases, opportunities, dentists] = await Promise.all([
    getCases(),
    getClinicOpportunities(),
    getClinicDentists(),
  ]);
  return { cases, opportunities, dentists };
}

export async function getProviderCaseWorkspace(caseId: string): Promise<ProviderCaseWorkspaceData> {
  const [
    dentalCase,
    journey,
    plans,
    appointments,
    documents,
    threadsResult,
    aftercare,
    incidents,
    team,
    clinicalJourney,
    passportResult,
    opportunities,
    dentists,
    onboarding,
  ] = await Promise.all([
    providerApi<unknown>(`cases/${caseId}`).then((value) => dentalCaseViewSchema.parse(value)),
    providerApi<unknown>(`cases/${caseId}/journey-summary`).then((value) =>
      journeySummaryViewSchema.parse(value),
    ),
    optional(() =>
      providerApi<{ plans?: unknown }>(`cases/${caseId}/treatment-plans`).then((value) =>
        treatmentPlanVersionViewSchema.array().parse(value.plans),
      ),
    ),
    optional(() =>
      providerApi<{ appointments?: unknown }>(`cases/${caseId}/appointments`).then((value) =>
        appointmentViewSchema.array().parse(value.appointments),
      ),
    ),
    optional(() =>
      providerApi<{ files?: unknown }>(`cases/${caseId}/documents`).then((value) =>
        caseDocumentViewSchema.array().parse(value.files),
      ),
    ),
    optional(() =>
      providerApi<{ threads?: unknown }>(`cases/${caseId}/threads`).then((value) =>
        messageThreadViewSchema.array().parse(value.threads),
      ),
    ),
    optional(() =>
      providerApi<{ aftercarePlans?: unknown }>(`cases/${caseId}/aftercare`).then((value) =>
        aftercarePlanViewSchema.array().parse(value.aftercarePlans),
      ),
    ),
    optional(() =>
      providerApi<unknown>(`trust/incidents?caseId=${caseId}&limit=50`).then((value) =>
        providerIncidentViewSchema.array().parse(value),
      ),
    ),
    optional(() =>
      providerApi<unknown>('clinic-operations/team').then((value) =>
        clinicTeamViewSchema.parse(value),
      ),
    ),
    optional(() =>
      providerApi<unknown>(`cases/${caseId}/journey`).then((value) =>
        providerClinicalJourneySchema.parse(value),
      ),
    ),
    optionalNotFound(() =>
      providerApi<unknown>(`cases/${caseId}/passport`).then((value) =>
        providerPassportVersionSchema.parse(value),
      ),
    ),
    optional(() => getClinicOpportunities()),
    getClinicDentists(),
    getClinicOnboarding(),
  ]);
  const messages: Record<string, readonly MessageView[]> = {};
  await Promise.all(
    (threadsResult ?? []).map(async (thread) => {
      const value = await optional(() =>
        providerApi<{ messages?: unknown }>(`cases/${caseId}/threads/${thread.id}/messages`).then(
          (envelope) => messageViewSchema.array().parse(envelope.messages),
        ),
      );
      messages[thread.id] = value ?? [];
    }),
  );
  return {
    dentalCase,
    journey,
    plans,
    appointments,
    documents,
    threads: threadsResult,
    messages,
    aftercare,
    incidents,
    team,
    clinicalJourney,
    passport: passportResult.data,
    passportUnavailable: passportResult.unavailable,
    opportunity: opportunities?.find((item) => item.caseId === caseId) ?? null,
    dentists,
    onboarding,
  };
}

export async function getProviderSchedule(): Promise<ProviderScheduleData> {
  const [availability, cases, dentists, onboarding] = await Promise.all([
    getClinicAvailability(),
    getCases(),
    getClinicDentists(),
    getClinicOnboarding(),
  ]);
  const appointments = (
    await Promise.all(
      cases.map((dentalCase) =>
        optional(() =>
          providerApi<{ appointments?: unknown }>(`cases/${dentalCase.id}/appointments`).then(
            (value) => appointmentViewSchema.array().parse(value.appointments),
          ),
        ),
      ),
    )
  )
    .flatMap((value) => value ?? [])
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  return { availability, appointments, cases, dentists, onboarding };
}

export async function getProviderMessages(): Promise<readonly ProviderMessageThread[]> {
  const cases = await getCases();
  const groups = await Promise.all(
    cases.map(async (dentalCase) => {
      const [threads, documents] = await Promise.all([
        optional(() =>
          providerApi<{ threads?: unknown }>(`cases/${dentalCase.id}/threads`).then((value) =>
            messageThreadViewSchema.array().parse(value.threads),
          ),
        ),
        optional(() =>
          providerApi<{ files?: unknown }>(`cases/${dentalCase.id}/documents`).then((value) =>
            caseDocumentViewSchema.array().parse(value.files),
          ),
        ),
      ]);
      const attachableDocuments = (documents ?? []).filter(isAttachableCaseDocument);
      return Promise.all(
        (threads ?? []).map(async (thread) => {
          const [messages, internalNotes] = await Promise.all([
            optional(() =>
              providerApi<{ messages?: unknown }>(
                `cases/${dentalCase.id}/threads/${thread.id}/messages`,
              ).then((value) => messageViewSchema.array().parse(value.messages)),
            ),
            optional(() =>
              providerApi<{ internalNotes?: unknown }>(
                `cases/${dentalCase.id}/threads/${thread.id}/internal-notes`,
              ).then((value) => internalNoteViewSchema.array().parse(value.internalNotes)),
            ),
          ]);
          return {
            ...thread,
            caseNumber: dentalCase.caseNumber,
            caseTitle: dentalCase.title,
            messages: messages ?? [],
            internalNotes,
            attachableDocuments,
          };
        }),
      );
    }),
  );
  return groups
    .flat()
    .sort((left, right) =>
      (right.lastMessageAt ?? right.updatedAt).localeCompare(left.lastMessageAt ?? left.updatedAt),
    );
}

export async function getProviderClinic(): Promise<ProviderClinicData> {
  const [overview, onboarding, team, dentists, availability, services, analytics, billing] =
    await Promise.all([
      getClinicOverview(),
      getClinicOnboarding(),
      providerApi<unknown>('clinic-operations/team').then((value) =>
        clinicTeamViewSchema.parse(value),
      ),
      getClinicDentists(),
      optional(() => getClinicAvailability()),
      providerApi<unknown>('clinic-operations/services').then((value) =>
        clinicServicesWorkspaceViewSchema.parse(value),
      ),
      optional(() => getClinicAnalytics()),
      optional(() =>
        providerApi<unknown>('clinic-operations/billing').then((value) =>
          clinicBillingViewSchema.parse(value),
        ),
      ),
    ]);
  return { overview, onboarding, team, dentists, availability, services, analytics, billing };
}

export async function getCases(): Promise<readonly DentalCaseView[]> {
  return pagedList('cases', dentalCaseViewSchema);
}

export async function getTodayCases(): Promise<readonly JourneySummaryView[]> {
  return providerApi<unknown>('cases/today?limit=50').then((value) =>
    journeySummaryViewSchema.array().parse(value),
  );
}

export async function getClinicOverview(): Promise<ClinicOverviewView> {
  return providerApi<unknown>('clinic-operations/overview').then((value) =>
    clinicOverviewViewSchema.parse(value),
  );
}

export async function getClinicOpportunities(): Promise<readonly ClinicOpportunityView[]> {
  return pagedList('clinic-operations/cases', clinicOpportunityViewSchema);
}

export async function getClinicDentists(): Promise<readonly ClinicDentistView[]> {
  return providerApi<unknown>('clinic-operations/dentists').then((value) =>
    clinicDentistViewSchema.array().parse(value),
  );
}

export async function getClinicAvailability(): Promise<ClinicAvailabilityView> {
  return providerApi<unknown>('clinic-operations/availability').then((value) =>
    clinicAvailabilityViewSchema.parse(value),
  );
}

export async function getClinicOnboarding(): Promise<ClinicOnboardingView> {
  return providerApi<unknown>('clinic-operations/onboarding').then((value) =>
    clinicOnboardingViewSchema.parse(value),
  );
}

export async function getClinicAnalytics(): Promise<ClinicAnalyticsView> {
  return providerApi<unknown>('clinic-operations/analytics').then((value) =>
    clinicAnalyticsViewSchema.parse(value),
  );
}

async function optional<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch {
    return null;
  }
}

async function pagedList<T>(path: string, schema: z.ZodType<T>): Promise<readonly T[]> {
  const records: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 1_000; pageNumber += 1) {
    const page: ProviderApiPage<unknown> = await providerApiPage<unknown>(
      `${path}?limit=100${cursor ? `&cursor=${cursor}` : ''}`,
    );
    records.push(...schema.array().parse(page.data));
    if (!page.nextCursor) return records;
    if (!/^[a-z0-9_-]+$/iu.test(page.nextCursor) || seenCursors.has(page.nextCursor)) {
      throw new ProviderApiError(502, 'invalid_api_pagination');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new ProviderApiError(502, 'api_pagination_limit_exceeded');
}

async function optionalNotFound<T>(
  operation: () => Promise<T>,
): Promise<{ readonly data: T | null; readonly unavailable: boolean }> {
  try {
    return { data: await operation(), unavailable: false };
  } catch (error) {
    if (error instanceof ProviderApiError && error.status === 404) {
      return { data: null, unavailable: false };
    }
    return { data: null, unavailable: true };
  }
}

async function settled<T>(key: string, operation: () => Promise<T>) {
  return { key, data: await optional(operation) } as const;
}
