import { DomainRuleError } from './errors.js';
import type { DentalCaseStatus } from './cases.js';

export type CaseTransitionActor =
  'PATIENT_OWNER' | 'CLINIC_TEAM' | 'DENTIST' | 'CONCIERGE' | 'PLATFORM_ADMIN';

const patientTransitions = new Set<string>([
  'DRAFT:RECORDS_PENDING',
  'DRAFT:CANCELLED',
  'RECORDS_PENDING:CANCELLED',
  'ADDITIONAL_INFORMATION_REQUESTED:RECORDS_PENDING',
  'ADDITIONAL_INFORMATION_REQUESTED:CANCELLED',
  'PATIENT_DECISION_PENDING:BOOKING_PENDING',
  'PATIENT_DECISION_PENDING:CANCELLED',
  'BOOKING_PENDING:PATIENT_DECISION_PENDING',
  'BOOKING_PENDING:CANCELLED',
]);

const clinicTransitions = new Set<string>([
  'CLINICS_SHORTLISTED:TREATMENT_PLANS_PENDING',
  'TREATMENT_PLANS_PENDING:TREATMENT_PLANS_READY',
  'CONSULTATION_SCHEDULED:CONSULTATION_COMPLETED',
  'BOOKED:IN_TREATMENT',
  'IN_TREATMENT:TREATMENT_COMPLETED',
  'TREATMENT_COMPLETED:AFTERCARE_ACTIVE',
  'AFTERCARE_ACTIVE:WARRANTY_CASE_ACTIVE',
  'WARRANTY_CASE_ACTIVE:AFTERCARE_ACTIVE',
]);

const conciergeTransitions = new Set<string>([
  'RECORDS_PENDING:INTAKE_REVIEW',
  'INTAKE_REVIEW:ADDITIONAL_INFORMATION_REQUESTED',
  'INTAKE_REVIEW:MATCHING_IN_PROGRESS',
  'ADDITIONAL_INFORMATION_REQUESTED:INTAKE_REVIEW',
  'MATCHING_IN_PROGRESS:CLINICS_SHORTLISTED',
  'CLINICS_SHORTLISTED:MATCHING_IN_PROGRESS',
  'TREATMENT_PLANS_READY:CONSULTATION_SCHEDULED',
  'CONSULTATION_COMPLETED:PATIENT_DECISION_PENDING',
  'BOOKING_PENDING:BOOKED',
]);

const platformAdministrativeTransitions = new Set<string>([
  'DRAFT:CANCELLED',
  'RECORDS_PENDING:CANCELLED',
  'INTAKE_REVIEW:CANCELLED',
  'MATCHING_IN_PROGRESS:CANCELLED',
  'CLINICS_SHORTLISTED:CANCELLED',
  'TREATMENT_PLANS_PENDING:CANCELLED',
  'TREATMENT_PLANS_READY:CANCELLED',
  'CONSULTATION_SCHEDULED:CANCELLED',
  'PATIENT_DECISION_PENDING:CANCELLED',
  'BOOKING_PENDING:CANCELLED',
  'AFTERCARE_ACTIVE:CLOSED',
  'WARRANTY_CASE_ACTIVE:CLOSED',
]);

export function assertActorMayTransitionCase(
  actor: CaseTransitionActor,
  from: DentalCaseStatus,
  to: DentalCaseStatus,
): void {
  const transition = `${from}:${to}`;
  const allowed =
    (actor === 'PLATFORM_ADMIN' && platformAdministrativeTransitions.has(transition)) ||
    (actor === 'CONCIERGE' && conciergeTransitions.has(transition)) ||
    (actor === 'PATIENT_OWNER' && patientTransitions.has(transition)) ||
    ((actor === 'CLINIC_TEAM' || actor === 'DENTIST') && clinicTransitions.has(transition));
  if (!allowed) {
    throw new DomainRuleError(
      'CASE_TRANSITION_ACTOR_NOT_ALLOWED',
      'The actor is not permitted to perform this case status transition.',
      { actor, from, to },
    );
  }
}
