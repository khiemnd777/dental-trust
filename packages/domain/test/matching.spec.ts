import { describe, expect, it } from 'vitest';

import {
  assertRecommendationOverride,
  conciergeSlaDueAt,
  rankOrganicClinicMatches,
  type OrganicMatchingCriteria,
} from '../src/matching.js';

const criteria: OrganicMatchingCriteria = {
  procedureCode: 'IMPLANT',
  preferredCity: 'Ho Chi Minh City',
  arrivalDate: '2026-08-01',
  departureDate: '2026-08-20',
  preferredLanguages: ['Vietnamese'],
  budgetMinimumMinor: 80_000_000,
  budgetMaximumMinor: 150_000_000,
  budgetCurrency: 'VND',
  complexityCategory: 'STANDARD',
  requiresAftercare: true,
  requiresWarranty: true,
  accessibilityNeeds: ['ELEVATOR'],
  preferredEquipment: ['CBCT'],
};

describe('organic clinic matching', () => {
  it('ranks deterministically from clinical and coordination evidence without commercial input', () => {
    const results = rankOrganicClinicMatches(criteria, [
      {
        clinicId: 'clinic-b',
        verifiedProcedureCodes: ['IMPLANT'],
        cities: ['Ho Chi Minh City'],
        districts: ['District 1'],
        earliestConsultationDate: '2026-08-03',
        languages: ['Vietnamese'],
        minimumPriceMinor: 90_000_000,
        maximumPriceMinor: 120_000_000,
        priceCurrency: 'VND',
        supportedComplexities: ['STANDARD'],
        aftercareSupported: true,
        warrantySupported: true,
        accessibilityFeatures: ['ELEVATOR'],
        equipment: ['CBCT'],
        evidenceIds: ['evidence-b'],
      },
      {
        clinicId: 'clinic-a',
        verifiedProcedureCodes: ['CROWN'],
        cities: ['Hanoi'],
        districts: [],
        languages: ['English'],
        supportedComplexities: [],
        aftercareSupported: false,
        warrantySupported: false,
        accessibilityFeatures: [],
        equipment: [],
        evidenceIds: [],
      },
    ]);

    expect(results.map(({ clinicId }) => clinicId)).toEqual(['clinic-b', 'clinic-a']);
    expect(results[0]?.fitScore).toBeGreaterThan(90);
    expect(results[1]?.fitScore).toBeLessThanOrEqual(49);
    expect(results[0]?.algorithmVersion).toBe('organic-v1');
  });

  it('requires transparent documentation when human order overrides organic rank', () => {
    expect(() =>
      assertRecommendationOverride(1, 2, 'Patient explicitly requested this clinic.'),
    ).not.toThrow();
    expect(() => assertRecommendationOverride(1, 2, '')).toThrow();
    expect(() => assertRecommendationOverride(1, 1, undefined)).not.toThrow();
  });

  it('derives stable SLA windows from priority', () => {
    const start = new Date('2026-07-12T00:00:00.000Z');
    expect(conciergeSlaDueAt('URGENT', start).toISOString()).toBe('2026-07-12T02:00:00.000Z');
    expect(conciergeSlaDueAt('LOW', start).toISOString()).toBe('2026-07-14T00:00:00.000Z');
  });
});
