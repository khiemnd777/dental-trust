import { describe, expect, it } from 'vitest';

import {
  clinicDiscoveryQuerySchema,
  introductionRequestSchema,
  shortlistRecommendationRequestSchema,
} from '@dental-trust/contracts';

const resultId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const secondResultId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';

describe('matching and concierge transport contracts', () => {
  it('accepts bounded discovery filters and rejects inverted price ranges', () => {
    expect(
      clinicDiscoveryQuerySchema.parse({
        locale: 'en-US',
        limit: '20',
        city: 'Ho Chi Minh City',
        procedureCode: 'DENTAL_IMPLANT',
        maximumPriceMinor: '40000000',
        minimumRating: '4.5',
        aftercareSupport: 'false',
      }),
    ).toMatchObject({ limit: 20, minimumRating: 4.5, aftercareSupport: false });
    expect(() =>
      clinicDiscoveryQuerySchema.parse({
        minimumPriceMinor: '500',
        maximumPriceMinor: '100',
      }),
    ).toThrow(/Maximum price/);
    expect(
      clinicDiscoveryQuerySchema.parse({
        west: '106.62',
        south: '10.70',
        east: '106.82',
        north: '10.88',
      }),
    ).toMatchObject({ west: 106.62, south: 10.7, east: 106.82, north: 10.88 });
    expect(() => clinicDiscoveryQuerySchema.parse({ west: '106.62', east: '106.82' })).toThrow(
      /Map bounds/,
    );
    expect(() =>
      clinicDiscoveryQuerySchema.parse({
        west: '106.82',
        south: '10.70',
        east: '106.62',
        north: '10.88',
      }),
    ).toThrow(/East longitude/);
  });

  it('requires an explicit affirmative consent assertion for clinic introduction', () => {
    expect(() => introductionRequestSchema.parse({ consentTextVersionId: resultId })).toThrow();
    expect(
      introductionRequestSchema.parse({
        consentTextVersionId: resultId,
        consentGranted: true,
      }),
    ).toMatchObject({ consentGranted: true });
  });

  it('rejects duplicate display ranks and duplicate organic results', () => {
    const base = {
      expectedWorkspaceVersion: 2,
      shareWithPatient: true,
      recommendations: [
        { matchingResultId: resultId, displayedRank: 1 },
        { matchingResultId: secondResultId, displayedRank: 1 },
      ],
    };
    expect(shortlistRecommendationRequestSchema.safeParse(base).success).toBe(false);
    expect(
      shortlistRecommendationRequestSchema.safeParse({
        ...base,
        recommendations: [
          { matchingResultId: resultId, displayedRank: 1 },
          { matchingResultId: resultId, displayedRank: 2 },
        ],
      }).success,
    ).toBe(false);
  });
});
