import 'server-only';

import { cookies } from 'next/headers';

export interface CareProfile {
  readonly id: string;
  readonly email: string;
  readonly preferredLocale: 'vi-VN' | 'en-US';
  readonly preferredCurrency: 'VND' | 'USD';
  readonly currentCountry: string | null;
  readonly currentCity: string | null;
  readonly timezone: string;
  readonly identity: { readonly fullName: string; readonly dateOfBirth: string } | null;
  readonly contact: { readonly phoneE164: string } | null;
  readonly onboardingCompletedAt: string | null;
}

export interface JourneySummary {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly title: string;
  readonly status: string;
  readonly stage: string;
  readonly progress: number;
  readonly urgency: 'ROUTINE' | 'ATTENTION' | 'URGENT';
  readonly primaryAction: { readonly code: string };
  readonly blockers: readonly { readonly code: string }[];
  readonly owner: { readonly type: string; readonly displayName: string | null } | null;
  readonly expectedAt: string | null;
  readonly nextAppointment: {
    readonly id: string;
    readonly kind: 'CONSULTATION' | 'CLINICAL_VISIT';
    readonly startsAt: string;
    readonly timezone: string;
    readonly status: 'TENTATIVE' | 'CONFIRMED';
  } | null;
  readonly activeMilestone: {
    readonly id: string;
    readonly title: string;
    readonly status: 'PENDING' | 'IN_PROGRESS';
    readonly scheduledAt: string | null;
  } | null;
  readonly timeline: readonly {
    readonly id: string;
    readonly status: string;
    readonly occurredAt: string;
  }[];
  readonly updatedAt: string;
}

export interface ClinicOption {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly locationLabel: string;
  readonly address: string;
  readonly verificationStatus: string;
  readonly verificationDate: string | null;
  readonly evidence: readonly { readonly id: string; readonly category: string }[];
  readonly services: readonly { readonly code: string; readonly name: string }[];
  readonly languages: readonly string[];
  readonly equipment: readonly string[];
  readonly accessibility: readonly string[];
  readonly aftercareSupported: boolean;
  readonly warrantyAvailable: boolean;
  readonly followUpDataAvailable: boolean;
  readonly earliestConsultation: string | null;
  readonly rating: string;
  readonly reviewCount: number;
  readonly estimatedPrice: {
    readonly minimumMinor: string;
    readonly maximumMinor: string;
    readonly currency: string;
  } | null;
}

export interface SavedClinic {
  readonly id: string;
  readonly clinicId: string;
  readonly clinicName: string;
  readonly clinicSlug: string;
  readonly verificationStatus: string;
  readonly createdAt: string;
}

export interface CareNotification {
  readonly id: string;
  readonly category: string;
  readonly channel: string;
  readonly templateKey: string;
  readonly status: string;
  readonly scheduledAt: string;
  readonly deliveredAt: string | null;
  readonly readAt: string | null;
  readonly action: {
    readonly target: string;
    readonly resourceId: string | null;
  } | null;
}

export interface MessageThread {
  readonly id: string;
  readonly caseId: string;
  readonly threadSubject: string;
  readonly closedAt: string | null;
  readonly messageCount: number;
  readonly unreadCount: number;
  readonly lastMessageAt: string | null;
  readonly updatedAt: string;
}

export interface CareMessage {
  readonly id: string;
  readonly threadId: string;
  readonly authorUserId: string;
  readonly messageBody: string;
  readonly readByCurrentUser: boolean;
  readonly createdAt: string;
}

export interface BookingCheckoutOption {
  readonly treatmentPlanAcceptanceId: string;
  readonly treatmentPlanVersionId: string;
  readonly treatmentPlanVersion: number;
  readonly caseId: string;
  readonly caseNumber: string;
  readonly clinicId: string;
  readonly clinicName: string;
  readonly planTotalMinor: string;
  readonly depositMinor: string;
  readonly depositBasisPoints: number;
  readonly currency: 'VND' | 'USD';
  readonly cancellationPolicy: {
    readonly policyVersion: number;
    readonly display: { readonly 'vi-VN': string; readonly 'en-US': string };
  };
  readonly acceptedAt: string;
  readonly expiresAt: string;
}

interface Envelope<T> {
  readonly data?: T;
}

const apiBase = () =>
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function careApi<T>(path: string, authenticated = true): Promise<T | null> {
  const token = authenticated ? (await cookies()).get('dt_session')?.value : undefined;
  if (authenticated && !token) return null;
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const envelope = (await response.json()) as Envelope<T>;
    return envelope.data ?? null;
  } catch {
    return null;
  }
}

export async function getCareHomeData() {
  const [profile, journeys, notifications] = await Promise.all([
    careApi<CareProfile>('/patient/profile'),
    careApi<readonly JourneySummary[]>('/cases/today?limit=10'),
    careApi<readonly CareNotification[]>('/notifications?limit=5'),
  ]);
  return {
    profile,
    journeys: journeys ?? [],
    notifications: notifications ?? [],
  };
}

export async function getDiscoveryData() {
  const [clinics, saved] = await Promise.all([
    careApi<readonly ClinicOption[]>('/public/clinics?locale=vi-VN&limit=20', false),
    careApi<readonly SavedClinic[]>('/saved-clinics?limit=50'),
  ]);
  return { clinics: clinics ?? [], saved: saved ?? [] };
}

export async function getClinic(slug: string) {
  const clinics = await careApi<readonly ClinicOption[]>(
    '/public/clinics?locale=vi-VN&limit=50',
    false,
  );
  return clinics?.find((clinic) => clinic.slug === slug) ?? null;
}

export async function getSavedClinics() {
  return (await careApi<readonly SavedClinic[]>('/saved-clinics?limit=50')) ?? [];
}

export async function getJourneyData(caseId?: string) {
  const journeys = (await careApi<readonly JourneySummary[]>('/cases/today?limit=25')) ?? [];
  const selected = journeys.find((journey) => journey.caseId === caseId) ?? journeys[0] ?? null;
  const detail = selected
    ? await careApi<Record<string, unknown>>(`/cases/${selected.caseId}/journey`)
    : null;
  return { journeys, selected, detail };
}

export async function getMessageData() {
  const journeys = (await careApi<readonly JourneySummary[]>('/cases/today?limit=25')) ?? [];
  const threadGroups = await Promise.all(
    journeys.slice(0, 5).map(async (journey) => {
      const result = await careApi<{ readonly threads?: readonly MessageThread[] }>(
        `/cases/${journey.caseId}/threads`,
      );
      return result?.threads ?? [];
    }),
  );
  return { journeys, threads: threadGroups.flat() };
}

export async function getThreadData(caseId: string, threadId: string) {
  const result = await careApi<{ readonly messages?: readonly CareMessage[] }>(
    `/cases/${caseId}/threads/${threadId}/messages`,
  );
  return result?.messages ?? [];
}

export async function getAccountData() {
  const [profile, saved] = await Promise.all([
    careApi<CareProfile>('/patient/profile'),
    careApi<readonly SavedClinic[]>('/saved-clinics?limit=50'),
  ]);
  return { profile, saved: saved ?? [] };
}

export async function getNotifications() {
  return (await careApi<readonly CareNotification[]>('/notifications?limit=50')) ?? [];
}

export async function getBookingOptions() {
  return (await careApi<readonly BookingCheckoutOption[]>('/bookings/checkout-options')) ?? [];
}
