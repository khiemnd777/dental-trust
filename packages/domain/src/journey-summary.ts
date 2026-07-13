import type { DentalCaseStatus } from './cases.js';

export const journeyStages = [
  'INTAKE',
  'MATCHING',
  'PLAN_REVIEW',
  'CONSULTATION',
  'BOOKING',
  'TREATMENT',
  'AFTERCARE',
  'WARRANTY',
  'CLOSED',
] as const;

export const journeyActionCodes = [
  'COMPLETE_INTAKE',
  'UPLOAD_RECORDS',
  'ADD_INFORMATION',
  'REVIEW_CASE',
  'VIEW_MATCHES',
  'COMPARE_CLINICS',
  'REVIEW_INTAKE',
  'PREPARE_PLAN',
  'REVIEW_PLANS',
  'VIEW_APPOINTMENT',
  'VIEW_SCHEDULE',
  'CONFIRM_BOOKING',
  'REVIEW_BOOKING',
  'VIEW_JOURNEY',
  'UPDATE_TREATMENT',
  'COMPLETE_CHECK_IN',
  'REVIEW_AFTERCARE',
  'VIEW_INCIDENT',
  'REVIEW_INCIDENT',
  'VIEW_CASE',
] as const;

export const journeyBlockerCodes = [
  'INTAKE_INCOMPLETE',
  'MISSING_RECORDS',
  'ADDITIONAL_INFORMATION',
  'PLAN_REQUIRED',
  'BOOKING_CONFIRMATION',
  'CHECK_IN_DUE',
  'INCIDENT_OPEN',
] as const;

export type JourneyStage = (typeof journeyStages)[number];
export type JourneyActionCode = (typeof journeyActionCodes)[number];
export type JourneyBlockerCode = (typeof journeyBlockerCodes)[number];
export type JourneyPerspective = 'PATIENT' | 'CLINIC';
export type JourneyOwnerType = 'PATIENT' | 'CLINIC' | 'SUPPORT';
export type JourneyUrgency = 'ROUTINE' | 'ATTENTION' | 'URGENT';

export interface JourneyProjectionInput {
  readonly status: DentalCaseStatus;
  readonly perspective: JourneyPerspective;
  readonly hasOpenIncident?: boolean;
}

export interface JourneyProjection {
  readonly stage: JourneyStage;
  readonly progress: number;
  readonly primaryActionCode: JourneyActionCode;
  readonly ownerType: JourneyOwnerType | null;
  readonly blockerCodes: readonly JourneyBlockerCode[];
  readonly expectedWithinHours: number | null;
  readonly urgency: JourneyUrgency;
}

interface StatusProjection {
  readonly stage: JourneyStage;
  readonly progress: number;
  readonly patientAction: JourneyActionCode;
  readonly clinicAction: JourneyActionCode;
  readonly ownerType: JourneyOwnerType | null;
  readonly blockers?: readonly JourneyBlockerCode[];
  readonly expectedWithinHours?: number | null;
  readonly urgency?: JourneyUrgency;
}

const projections: Readonly<Record<DentalCaseStatus, StatusProjection>> = {
  DRAFT: {
    stage: 'INTAKE',
    progress: 5,
    patientAction: 'COMPLETE_INTAKE',
    clinicAction: 'REVIEW_CASE',
    ownerType: 'PATIENT',
    blockers: ['INTAKE_INCOMPLETE'],
    expectedWithinHours: null,
    urgency: 'ATTENTION',
  },
  RECORDS_PENDING: {
    stage: 'INTAKE',
    progress: 12,
    patientAction: 'UPLOAD_RECORDS',
    clinicAction: 'REVIEW_CASE',
    ownerType: 'PATIENT',
    blockers: ['MISSING_RECORDS'],
    expectedWithinHours: null,
    urgency: 'ATTENTION',
  },
  INTAKE_REVIEW: {
    stage: 'INTAKE',
    progress: 22,
    patientAction: 'VIEW_CASE',
    clinicAction: 'REVIEW_INTAKE',
    ownerType: 'CLINIC',
    expectedWithinHours: 24,
  },
  ADDITIONAL_INFORMATION_REQUESTED: {
    stage: 'INTAKE',
    progress: 18,
    patientAction: 'ADD_INFORMATION',
    clinicAction: 'REVIEW_CASE',
    ownerType: 'PATIENT',
    blockers: ['ADDITIONAL_INFORMATION'],
    expectedWithinHours: null,
    urgency: 'ATTENTION',
  },
  MATCHING_IN_PROGRESS: {
    stage: 'MATCHING',
    progress: 32,
    patientAction: 'VIEW_MATCHES',
    clinicAction: 'VIEW_CASE',
    ownerType: 'SUPPORT',
    expectedWithinHours: 48,
  },
  CLINICS_SHORTLISTED: {
    stage: 'MATCHING',
    progress: 42,
    patientAction: 'COMPARE_CLINICS',
    clinicAction: 'PREPARE_PLAN',
    ownerType: 'PATIENT',
    expectedWithinHours: null,
  },
  TREATMENT_PLANS_PENDING: {
    stage: 'PLAN_REVIEW',
    progress: 48,
    patientAction: 'VIEW_CASE',
    clinicAction: 'PREPARE_PLAN',
    ownerType: 'CLINIC',
    blockers: ['PLAN_REQUIRED'],
    expectedWithinHours: 48,
    urgency: 'ATTENTION',
  },
  TREATMENT_PLANS_READY: {
    stage: 'PLAN_REVIEW',
    progress: 58,
    patientAction: 'REVIEW_PLANS',
    clinicAction: 'VIEW_CASE',
    ownerType: 'PATIENT',
    expectedWithinHours: null,
    urgency: 'ATTENTION',
  },
  CONSULTATION_SCHEDULED: {
    stage: 'CONSULTATION',
    progress: 64,
    patientAction: 'VIEW_APPOINTMENT',
    clinicAction: 'VIEW_SCHEDULE',
    ownerType: 'CLINIC',
    expectedWithinHours: null,
  },
  CONSULTATION_COMPLETED: {
    stage: 'PLAN_REVIEW',
    progress: 68,
    patientAction: 'REVIEW_PLANS',
    clinicAction: 'VIEW_CASE',
    ownerType: 'PATIENT',
    expectedWithinHours: null,
  },
  PATIENT_DECISION_PENDING: {
    stage: 'PLAN_REVIEW',
    progress: 70,
    patientAction: 'REVIEW_PLANS',
    clinicAction: 'VIEW_CASE',
    ownerType: 'PATIENT',
    expectedWithinHours: null,
    urgency: 'ATTENTION',
  },
  BOOKING_PENDING: {
    stage: 'BOOKING',
    progress: 74,
    patientAction: 'CONFIRM_BOOKING',
    clinicAction: 'REVIEW_BOOKING',
    ownerType: 'PATIENT',
    blockers: ['BOOKING_CONFIRMATION'],
    expectedWithinHours: null,
    urgency: 'ATTENTION',
  },
  BOOKED: {
    stage: 'BOOKING',
    progress: 80,
    patientAction: 'VIEW_JOURNEY',
    clinicAction: 'VIEW_SCHEDULE',
    ownerType: 'CLINIC',
    expectedWithinHours: null,
  },
  IN_TREATMENT: {
    stage: 'TREATMENT',
    progress: 86,
    patientAction: 'VIEW_JOURNEY',
    clinicAction: 'UPDATE_TREATMENT',
    ownerType: 'CLINIC',
    expectedWithinHours: null,
  },
  TREATMENT_COMPLETED: {
    stage: 'AFTERCARE',
    progress: 92,
    patientAction: 'COMPLETE_CHECK_IN',
    clinicAction: 'REVIEW_AFTERCARE',
    ownerType: 'PATIENT',
    blockers: ['CHECK_IN_DUE'],
    expectedWithinHours: 24,
  },
  AFTERCARE_ACTIVE: {
    stage: 'AFTERCARE',
    progress: 96,
    patientAction: 'COMPLETE_CHECK_IN',
    clinicAction: 'REVIEW_AFTERCARE',
    ownerType: 'PATIENT',
    blockers: ['CHECK_IN_DUE'],
    expectedWithinHours: 24,
  },
  WARRANTY_CASE_ACTIVE: {
    stage: 'WARRANTY',
    progress: 96,
    patientAction: 'VIEW_INCIDENT',
    clinicAction: 'REVIEW_INCIDENT',
    ownerType: 'CLINIC',
    blockers: ['INCIDENT_OPEN'],
    expectedWithinHours: 4,
    urgency: 'URGENT',
  },
  CLOSED: {
    stage: 'CLOSED',
    progress: 100,
    patientAction: 'VIEW_CASE',
    clinicAction: 'VIEW_CASE',
    ownerType: null,
    expectedWithinHours: null,
  },
  CANCELLED: {
    stage: 'CLOSED',
    progress: 100,
    patientAction: 'VIEW_CASE',
    clinicAction: 'VIEW_CASE',
    ownerType: null,
    expectedWithinHours: null,
  },
};

export function projectJourney(input: JourneyProjectionInput): JourneyProjection {
  if (input.hasOpenIncident) {
    return {
      stage: 'WARRANTY',
      progress: Math.max(projections[input.status].progress, 90),
      primaryActionCode: input.perspective === 'PATIENT' ? 'VIEW_INCIDENT' : 'REVIEW_INCIDENT',
      ownerType: 'CLINIC',
      blockerCodes: ['INCIDENT_OPEN'],
      expectedWithinHours: 4,
      urgency: 'URGENT',
    };
  }
  const projection = projections[input.status];
  return {
    stage: projection.stage,
    progress: projection.progress,
    primaryActionCode:
      input.perspective === 'PATIENT' ? projection.patientAction : projection.clinicAction,
    ownerType: projection.ownerType,
    blockerCodes: projection.blockers ?? [],
    expectedWithinHours: projection.expectedWithinHours ?? null,
    urgency: projection.urgency ?? 'ROUTINE',
  };
}
