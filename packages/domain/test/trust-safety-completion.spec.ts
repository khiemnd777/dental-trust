import { describe, expect, it } from 'vitest';

import { DomainRuleError } from '../src/errors.js';
import { assertIncidentEscalation, incidentTypes } from '../src/incidents.js';
import {
  assertReviewFollowUpEligibility,
  reviewDimensionKeys,
  reviewFollowUpDurationDays,
  reviewFollowUpMilestonesDays,
} from '../src/reviews.js';

describe('trust and safety completion policies', () => {
  it('uses the exact patient incident intake categories', () => {
    expect(incidentTypes).toEqual([
      'PAIN_OR_SYMPTOMS',
      'TREATMENT_CONCERN',
      'BILLING_DISPUTE',
      'SERVICE_COMPLAINT',
      'RECORD_CORRECTION',
      'PRIVACY_CONCERN',
      'WARRANTY_CLAIM',
    ]);
  });

  it('uses the exact eight verified-review dimensions', () => {
    expect(reviewDimensionKeys).toEqual([
      'communication',
      'transparency',
      'cleanlinessEnvironment',
      'scheduling',
      'costAccuracy',
      'treatmentExperience',
      'aftercare',
      'overallExperience',
    ]);
  });

  it('allows only reached, unique follow-up milestones for the treated patient', () => {
    expect(reviewFollowUpMilestonesDays).toEqual([30, 90, 180, 365]);
    expect(
      reviewFollowUpDurationDays(
        new Date('2026-01-01T23:00:00.000Z'),
        new Date('2026-04-01T01:00:00.000Z'),
      ),
    ).toBe(90);
    expect(() =>
      assertReviewFollowUpEligibility({
        reviewerUserId: 'patient-1',
        patientUserId: 'patient-1',
        verified: true,
        treatmentDate: new Date('2026-01-01T00:00:00.000Z'),
        submittedAt: new Date('2026-04-01T00:00:00.000Z'),
        milestoneDays: 90,
        existingMilestoneDays: [30],
      }),
    ).not.toThrow();
    expect(() =>
      assertReviewFollowUpEligibility({
        reviewerUserId: 'patient-1',
        patientUserId: 'patient-1',
        verified: true,
        treatmentDate: new Date('2026-01-01T00:00:00.000Z'),
        submittedAt: new Date('2026-02-01T00:00:00.000Z'),
        milestoneDays: 90,
        existingMilestoneDays: [],
      }),
    ).toThrow(DomainRuleError);
  });

  it('requires escalation to increase severity to high or critical', () => {
    expect(() => assertIncidentEscalation('MEDIUM', 'HIGH')).not.toThrow();
    expect(() => assertIncidentEscalation('HIGH', 'HIGH')).toThrow(DomainRuleError);
    expect(() => assertIncidentEscalation('LOW', 'MEDIUM')).toThrow(DomainRuleError);
  });
});
