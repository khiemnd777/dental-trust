import { DomainRuleError } from './errors.js';

export const privacyExecutionStatuses = [
  'PENDING',
  'PROCESSING',
  'NOTICE_PENDING',
  'SUCCEEDED',
  'FAILED',
  'BLOCKED',
] as const;
export type PrivacyExecutionStatus = (typeof privacyExecutionStatuses)[number];

export const privacyExecutionOutcomes = [
  'EXPORT_READY',
  'DEIDENTIFIED_WITH_RETENTION',
  'RETAINED_LEGAL_HOLD',
] as const;
export type PrivacyExecutionOutcome = (typeof privacyExecutionOutcomes)[number];

export const privacyIdentityVerificationMethods = [
  'ACCOUNT_MFA',
  'VERIFIED_COMMUNICATION',
  'DOCUMENT_REVIEW',
] as const;
export type PrivacyIdentityVerificationMethod = (typeof privacyIdentityVerificationMethods)[number];

export const privacyLegalHoldScopes = [
  'ALL',
  'IDENTITY',
  'CLINICAL',
  'FINANCIAL',
  'TRUST_SAFETY',
  'AUDIT_SECURITY',
  'FILES',
] as const;
export type PrivacyLegalHoldScope = (typeof privacyLegalHoldScopes)[number];

export const privacyDataCategories = [
  'ACCOUNT_IDENTITY',
  'AUTHENTICATION',
  'PROFILE_CONTACT',
  'CONSENT',
  'CLINICAL_INTAKE',
  'CLINICAL_CASES',
  'CLINICAL_FILES',
  'MESSAGING',
  'TREATMENT_AND_PASSPORT',
  'AFTERCARE',
  'TRUST_SAFETY',
  'FINANCIAL',
  'NOTIFICATIONS',
  'AUDIT_SECURITY',
] as const;
export type PrivacyDataCategory = (typeof privacyDataCategories)[number];

export const privacyDispositionActions = [
  'EXPORTED',
  'DEIDENTIFIED',
  'REVOKED',
  'REDACTED',
  'RETAINED',
  'NOT_FOUND',
] as const;
export type PrivacyDispositionAction = (typeof privacyDispositionActions)[number];

export const privacyExecutionBlockerCodes = [
  'ACTIVE_PROFESSIONAL_MEMBERSHIP',
  'ACTIVE_TREATMENT',
  'UNSETTLED_FINANCIAL_ACTIVITY',
  'OPEN_TRUST_SAFETY_MATTER',
  'NOTICE_DELIVERY_FAILED',
] as const;
export type PrivacyExecutionBlockerCode = (typeof privacyExecutionBlockerCodes)[number];

const executionTransitions: Readonly<
  Record<PrivacyExecutionStatus, readonly PrivacyExecutionStatus[]>
> = {
  PENDING: ['PROCESSING', 'BLOCKED'],
  PROCESSING: ['NOTICE_PENDING', 'SUCCEEDED', 'FAILED', 'BLOCKED'],
  NOTICE_PENDING: ['PROCESSING', 'FAILED', 'BLOCKED'],
  FAILED: ['PENDING', 'PROCESSING', 'BLOCKED'],
  BLOCKED: ['PENDING'],
  SUCCEEDED: [],
};

export function assertPrivacyExecutionTransition(
  from: PrivacyExecutionStatus,
  to: PrivacyExecutionStatus,
): void {
  if (!executionTransitions[from].includes(to)) {
    throw new DomainRuleError(
      'INVALID_PRIVACY_EXECUTION_TRANSITION',
      `Privacy execution status cannot move from ${from} to ${to}.`,
    );
  }
}

export function isActivePrivacyLegalHold(
  hold: {
    readonly startsAt: Date;
    readonly expiresAt: Date | null;
    readonly releasedAt: Date | null;
  },
  at = new Date(),
): boolean {
  return (
    hold.releasedAt === null &&
    hold.startsAt <= at &&
    (hold.expiresAt === null || hold.expiresAt > at)
  );
}
