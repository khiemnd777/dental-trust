import {
  aftercarePlanViewSchema,
  appointmentViewSchema,
  caseDocumentViewSchema,
  clinicAnalyticsViewSchema,
  clinicAvailabilityViewSchema,
  clinicDentistViewSchema,
  clinicOnboardingViewSchema,
  clinicOpportunityViewSchema,
  clinicOverviewViewSchema,
  clinicServicesWorkspaceViewSchema,
  clinicTeamViewSchema,
  dentalCaseViewSchema,
  journeySummaryViewSchema,
  messageThreadViewSchema,
  messageViewSchema,
  treatmentPlanVersionViewSchema,
  type AftercarePlanView,
  type AppointmentView,
  type CaseDocumentView,
  type ClinicAnalyticsView,
  type ClinicAvailabilityView,
  type ClinicDentistView,
  type ClinicOnboardingView,
  type ClinicOpportunityView,
  type ClinicOverviewView,
  type ClinicServicesWorkspaceView,
  type ClinicTeamView,
  type DentalCaseView,
  type JourneySummaryView,
  type MessageThreadView,
  type MessageView,
  type TreatmentPlanVersionView,
} from '@dental-trust/contracts';

import { providerApi } from './provider-api';

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
}

export interface ProviderClinicData {
  readonly overview: ClinicOverviewView;
  readonly onboarding: ClinicOnboardingView;
  readonly team: ClinicTeamView;
  readonly dentists: readonly ClinicDentistView[];
  readonly availability: ClinicAvailabilityView;
  readonly services: ClinicServicesWorkspaceView;
  readonly analytics: ClinicAnalyticsView;
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
    index,
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
    getProviderCaseIndex(),
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
    opportunity: index.opportunities.find((item) => item.caseId === caseId) ?? null,
    dentists: index.dentists,
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
      const threads = await optional(() =>
        providerApi<{ threads?: unknown }>(`cases/${dentalCase.id}/threads`).then((value) =>
          messageThreadViewSchema.array().parse(value.threads),
        ),
      );
      return Promise.all(
        (threads ?? []).map(async (thread) => {
          const messages = await optional(() =>
            providerApi<{ messages?: unknown }>(
              `cases/${dentalCase.id}/threads/${thread.id}/messages`,
            ).then((value) => messageViewSchema.array().parse(value.messages)),
          );
          return {
            ...thread,
            caseNumber: dentalCase.caseNumber,
            caseTitle: dentalCase.title,
            messages: messages ?? [],
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
  const [overview, onboarding, team, dentists, availability, services, analytics] =
    await Promise.all([
      getClinicOverview(),
      getClinicOnboarding(),
      providerApi<unknown>('clinic-operations/team').then((value) =>
        clinicTeamViewSchema.parse(value),
      ),
      getClinicDentists(),
      getClinicAvailability(),
      providerApi<unknown>('clinic-operations/services').then((value) =>
        clinicServicesWorkspaceViewSchema.parse(value),
      ),
      getClinicAnalytics(),
    ]);
  return { overview, onboarding, team, dentists, availability, services, analytics };
}

export async function getCases(): Promise<readonly DentalCaseView[]> {
  return providerApi<unknown>('cases?limit=100').then((value) =>
    dentalCaseViewSchema.array().parse(value),
  );
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
  return providerApi<unknown>('clinic-operations/cases?limit=100').then((value) =>
    clinicOpportunityViewSchema.array().parse(value),
  );
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

async function settled<T>(key: string, operation: () => Promise<T>) {
  return { key, data: await optional(operation) } as const;
}
