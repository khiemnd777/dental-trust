import { InvalidStateTransitionError } from './errors.js';

export const verificationStatuses = [
  'NOT_SUBMITTED',
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'SITE_AUDIT_REQUIRED',
  'APPROVED',
  'VERIFIED',
  'VERIFICATION_EXPIRING',
  'EXPIRED',
  'SUSPENDED',
  'REJECTED',
] as const;

export type VerificationStatus = (typeof verificationStatuses)[number];

export const verificationEvidenceCategories = [
  'CLINIC_OPERATING_LICENSE',
  'DENTIST_PRACTICE_LICENSE',
  'SCOPE_OF_PRACTICE',
  'DENTIST_CLINIC_AFFILIATION',
  'RESPONSIBLE_CLINICAL_LEADER',
  'LOCATION',
  'SERVICE_CAPABILITIES',
  'INFECTION_CONTROL_PROCESS',
  'EQUIPMENT',
  'EMERGENCY_PROCEDURES',
  'MATERIAL_TRACEABILITY',
  'CLINICAL_RECORD_PROCESS',
  'WARRANTY_PROCESS',
  'INTERNATIONAL_PATIENT_SUPPORT',
  'ENGLISH_RECORDS_CAPABILITY',
] as const;

export type VerificationEvidenceCategory = (typeof verificationEvidenceCategories)[number];

export function requiresFourEyes(_from: VerificationStatus, to: VerificationStatus): boolean {
  return to === 'VERIFIED' || to === 'SUSPENDED';
}

export function assertIndependentVerificationActors(
  submitterUserId: string | undefined,
  reviewerUserId: string,
  secondApproverUserId?: string,
): void {
  if (submitterUserId === reviewerUserId) {
    throw new InvalidStateTransitionError(
      'verification-reviewer-independence',
      'SUBMITTER',
      'REVIEWER',
    );
  }
  if (secondApproverUserId && secondApproverUserId === reviewerUserId) {
    throw new InvalidStateTransitionError(
      'verification-four-eyes',
      'PRIMARY_REVIEWER',
      'SECOND_APPROVER',
    );
  }
  if (secondApproverUserId && secondApproverUserId === submitterUserId) {
    throw new InvalidStateTransitionError(
      'verification-applicant-independence',
      'SUBMITTER',
      'SECOND_APPROVER',
    );
  }
}

const transitions: Readonly<Record<VerificationStatus, readonly VerificationStatus[]>> = {
  NOT_SUBMITTED: ['DRAFT'],
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ADDITIONAL_INFORMATION_REQUIRED', 'SITE_AUDIT_REQUIRED', 'APPROVED', 'REJECTED'],
  ADDITIONAL_INFORMATION_REQUIRED: ['SUBMITTED', 'REJECTED'],
  SITE_AUDIT_REQUIRED: ['UNDER_REVIEW', 'REJECTED'],
  APPROVED: ['VERIFIED'],
  VERIFIED: ['VERIFICATION_EXPIRING', 'SUSPENDED'],
  VERIFICATION_EXPIRING: ['VERIFIED', 'EXPIRED', 'SUSPENDED'],
  EXPIRED: ['UNDER_REVIEW', 'SUSPENDED'],
  SUSPENDED: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
  REJECTED: ['DRAFT'],
};

export function assertVerificationTransition(
  from: VerificationStatus,
  to: VerificationStatus,
): void {
  if (!transitions[from].includes(to)) {
    throw new InvalidStateTransitionError('verification', from, to);
  }
}
