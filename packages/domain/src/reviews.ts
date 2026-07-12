import { DomainRuleError } from './errors.js';

export const reviewDimensionKeys = [
  'communication',
  'transparency',
  'cleanlinessEnvironment',
  'scheduling',
  'costAccuracy',
  'treatmentExperience',
  'aftercare',
  'overallExperience',
] as const;
export type ReviewDimensionKey = (typeof reviewDimensionKeys)[number];

export const reviewFollowUpMilestonesDays = [30, 90, 180, 365] as const;
export type ReviewFollowUpMilestoneDays = (typeof reviewFollowUpMilestonesDays)[number];

export interface ReviewEligibilityFacts {
  readonly reviewerUserId: string;
  readonly patientUserId: string;
  readonly caseStatus: string;
  readonly completedTreatmentAt?: Date;
  readonly platformBookingId?: string;
  readonly existingInitialReviewId?: string;
}

export function assertVerifiedReviewEligibility(facts: ReviewEligibilityFacts): void {
  if (facts.reviewerUserId !== facts.patientUserId) {
    throw new DomainRuleError(
      'REVIEW_NOT_CASE_OWNER',
      'Only the treated patient may author a review.',
    );
  }
  if (!facts.platformBookingId || !facts.completedTreatmentAt) {
    throw new DomainRuleError(
      'REVIEW_NOT_PLATFORM_VERIFIED',
      'A verified review requires a platform booking and completed treatment record.',
    );
  }
  if (
    !['TREATMENT_COMPLETED', 'AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE', 'CLOSED'].includes(
      facts.caseStatus,
    )
  ) {
    throw new DomainRuleError(
      'REVIEW_TREATMENT_NOT_COMPLETE',
      'The linked treatment must be complete before review submission.',
    );
  }
  if (facts.existingInitialReviewId) {
    throw new DomainRuleError(
      'REVIEW_ALREADY_EXISTS',
      'Use a follow-up review for later milestones.',
    );
  }
}

export interface ReviewFollowUpEligibilityFacts {
  readonly reviewerUserId: string;
  readonly patientUserId: string;
  readonly verified: boolean;
  readonly treatmentDate: Date;
  readonly submittedAt: Date;
  readonly milestoneDays: number;
  readonly existingMilestoneDays: readonly number[];
}

export function reviewFollowUpDurationDays(treatmentDate: Date, submittedAt: Date): number {
  return Math.max(
    0,
    Math.floor(
      (dateOnlyUtc(submittedAt).getTime() - dateOnlyUtc(treatmentDate).getTime()) / 86_400_000,
    ),
  );
}

export function assertReviewFollowUpEligibility(facts: ReviewFollowUpEligibilityFacts): void {
  if (facts.reviewerUserId !== facts.patientUserId) {
    throw new DomainRuleError(
      'REVIEW_FOLLOW_UP_NOT_CASE_OWNER',
      'Only the treated patient may author a follow-up review.',
    );
  }
  if (!facts.verified) {
    throw new DomainRuleError(
      'REVIEW_FOLLOW_UP_NOT_VERIFIED',
      'A follow-up review requires a verified platform-linked treatment review.',
    );
  }
  if (!reviewFollowUpMilestonesDays.includes(facts.milestoneDays as ReviewFollowUpMilestoneDays)) {
    throw new DomainRuleError(
      'REVIEW_FOLLOW_UP_INVALID_MILESTONE',
      'Follow-up reviews are limited to supported treatment milestones.',
    );
  }
  if (facts.existingMilestoneDays.includes(facts.milestoneDays)) {
    throw new DomainRuleError(
      'REVIEW_FOLLOW_UP_ALREADY_EXISTS',
      'A follow-up review already exists for this treatment milestone.',
    );
  }
  if (reviewFollowUpDurationDays(facts.treatmentDate, facts.submittedAt) < facts.milestoneDays) {
    throw new DomainRuleError(
      'REVIEW_FOLLOW_UP_TOO_EARLY',
      'The requested follow-up milestone has not been reached.',
    );
  }
}

function dateOnlyUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
