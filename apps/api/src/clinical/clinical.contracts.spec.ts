import { describe, expect, it } from 'vitest';

import {
  aftercareCheckInRequestSchema,
  caregiverGrantRequestSchema,
  treatmentPlanDraftRequestSchema,
  treatmentPlanPublishRequestSchema,
} from '@dental-trust/contracts';

const id = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';

describe('clinical workflow contracts', () => {
  it('normalizes caregiver email and rejects empty grants', () => {
    expect(
      caregiverGrantRequestSchema.parse({
        caregiverEmail: '  FAMILY@Example.COM ',
        permissions: ['VIEW_CASE_SUMMARY'],
      }).caregiverEmail,
    ).toBe('family@example.com');
    expect(() =>
      caregiverGrantRequestSchema.parse({ caregiverEmail: 'family@example.com', permissions: [] }),
    ).toThrow();
  });

  it('requires complete, priced treatment-plan versions', () => {
    const input = {
      preliminaryAssessment: 'Preliminary assessment',
      diagnosisStatement: 'Provider diagnosis',
      risks: 'Provider-supplied risks',
      limitations: 'In-person assessment required',
      warrantyTerms: 'Clinic warranty terms',
      exclusions: 'Unrelated treatment',
      currency: 'USD',
      expiresAt: '2027-01-01T00:00:00.000Z',
      items: [
        {
          procedureCode: 'IMPLANT',
          toothNumbers: [11],
          quantity: 1,
          unitPriceMinor: 250_000,
        },
      ],
    };
    expect(treatmentPlanDraftRequestSchema.parse(input).items).toHaveLength(1);
    expect(() => treatmentPlanDraftRequestSchema.parse({ ...input, items: [] })).toThrow();
  });

  it('requires optimistic publication evidence', () => {
    expect(
      treatmentPlanPublishRequestSchema.safeParse({
        expectedVersion: 2,
        contentChecksum: 'a'.repeat(64),
      }).success,
    ).toBe(true);
    expect(
      treatmentPlanPublishRequestSchema.safeParse({
        expectedVersion: 2,
        contentChecksum: 'not-a-checksum',
      }).success,
    ).toBe(false);
  });

  it('bounds aftercare symptoms, pain, and photo evidence', () => {
    expect(
      aftercareCheckInRequestSchema.parse({
        aftercarePlanId: id,
        painScale: 7,
        symptomCodes: ['FEVER'],
      }).photoFileAssetIds,
    ).toEqual([]);
    expect(() =>
      aftercareCheckInRequestSchema.parse({
        aftercarePlanId: id,
        painScale: 11,
        symptomCodes: [],
      }),
    ).toThrow();
  });
});
