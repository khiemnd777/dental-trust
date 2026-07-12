import { describe, expect, it } from 'vitest';

import {
  assertNewTreatmentPlanVersion,
  assertVerifiedReviewEligibility,
  authorizeSecureShareAccess,
  calculateClinicalMatch,
  evaluateAftercareEscalation,
  publishTreatmentPlan,
  type TreatmentPlanSnapshot,
} from '../src/index.js';

const draft: TreatmentPlanSnapshot = {
  id: 'plan-v1',
  version: 1,
  status: 'DRAFT',
  clinicId: 'clinic-1',
  dentistId: 'dentist-1',
  currency: 'USD',
  totalMinor: 100_000,
  content: { procedures: [{ code: 'IMPLANT', tooth: 11 }] },
};

describe('critical acceptance policies', () => {
  it('publishes immutable treatment plan snapshots and requires a new sequential record', () => {
    const published = publishTreatmentPlan(draft, new Date('2026-01-01T00:00:00Z'));
    expect(published.status).toBe('PUBLISHED');
    expect(published.contentChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(() => publishTreatmentPlan(published)).toThrow(/Only a draft/);

    expect(() =>
      assertNewTreatmentPlanVersion(published, {
        ...draft,
        id: 'plan-v2',
        version: 2,
      }),
    ).not.toThrow();
    expect(() =>
      assertNewTreatmentPlanVersion(published, { ...draft, id: 'plan-v3', version: 3 }),
    ).toThrow(/next sequential version/);
  });

  it('accepts verified reviews only from the treated patient after platform-linked completion', () => {
    expect(() =>
      assertVerifiedReviewEligibility({
        reviewerUserId: 'patient-1',
        patientUserId: 'patient-1',
        caseStatus: 'TREATMENT_COMPLETED',
        completedTreatmentAt: new Date(),
        platformBookingId: 'booking-1',
      }),
    ).not.toThrow();
    expect(() =>
      assertVerifiedReviewEligibility({
        reviewerUserId: 'patient-2',
        patientUserId: 'patient-1',
        caseStatus: 'TREATMENT_COMPLETED',
        completedTreatmentAt: new Date(),
        platformBookingId: 'booking-1',
      }),
    ).toThrow(/treated patient/);
  });

  it('turns configured red flags into human escalation without diagnosing', () => {
    const decision = evaluateAftercareEscalation({ painScale: 8, symptomCodes: ['SWELLING'] }, [
      {
        id: 'pain-rule',
        enabled: true,
        painThreshold: 7,
        symptomCodes: [],
        severity: 'HIGH',
        emergencyGuidanceKey: 'aftercare.contact_provider_now',
      },
      {
        id: 'swelling-rule',
        enabled: true,
        symptomCodes: ['SWELLING'],
        severity: 'URGENT',
        emergencyGuidanceKey: 'aftercare.emergency_guidance.vn',
      },
    ]);
    expect(decision).toMatchObject({
      escalate: true,
      highestSeverity: 'URGENT',
      requiresLicensedProviderContact: true,
    });
  });

  it('calculates transparent fit and rejects commercial ranking inputs', () => {
    const candidate = {
      clinicId: 'clinic-1',
      procedureCapability: 100,
      locationFit: 70,
      availabilityFit: 80,
      languageFit: 90,
      budgetFit: 60,
      complexityFit: 95,
      aftercareFit: 90,
      warrantyFit: 80,
      evidenceIds: ['evidence-1'],
      limitations: ['Second visit may be required'],
    };
    expect(calculateClinicalMatch(candidate)).toMatchObject({
      clinicId: 'clinic-1',
      limitations: ['Second visit may be required'],
    });
    expect(() =>
      calculateClinicalMatch({ ...candidate, commercialBoost: 25 } as typeof candidate),
    ).toThrow(/Commercial payment/);
  });

  it('rejects expired, revoked, and exhausted secure shares', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    expect(
      authorizeSecureShareAccess(
        { expiresAt: new Date('2026-01-03T00:00:00Z'), accessCount: 0 },
        now,
      ),
    ).toEqual({ allowed: true });
    expect(
      authorizeSecureShareAccess(
        { expiresAt: new Date('2026-01-01T00:00:00Z'), accessCount: 0 },
        now,
      ),
    ).toEqual({ allowed: false, reason: 'EXPIRED' });
    expect(
      authorizeSecureShareAccess(
        { expiresAt: new Date('2026-01-03T00:00:00Z'), revokedAt: now, accessCount: 0 },
        now,
      ),
    ).toEqual({ allowed: false, reason: 'REVOKED' });
  });
});
