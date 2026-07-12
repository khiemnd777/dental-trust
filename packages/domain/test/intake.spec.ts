import { describe, expect, it } from 'vitest';

import {
  canonicalIntakeSnapshot,
  intakeProgress,
  validateIntakeSubmission,
  type IntakeSubmissionSnapshot,
} from '../src/intake.js';

const complete: IntakeSubmissionSnapshot = {
  desiredProcedureCode: 'DENTAL_IMPLANT',
  dentalConcerns: ['MISSING_TOOTH'],
  treatmentGoals: ['RESTORE_FUNCTION'],
  currentCountry: 'Australia',
  currentCity: 'Melbourne',
  expectedArrivalDate: '2026-10-10',
  expectedDepartureDate: '2026-10-20',
  preferredLocation: 'Ho Chi Minh City',
  availableTreatmentDays: 10,
  budgetMinimumMinor: 2_000,
  budgetMaximumMinor: 5_000,
  budgetCurrency: 'USD',
  preferredLanguage: 'en',
  smokingStatus: 'NEVER',
  pregnancyStatus: 'NOT_APPLICABLE',
  preferredConsultationTimes: [
    { weekday: 1, start: '09:00', end: '12:00', timezone: 'Australia/Melbourne' },
  ],
  medicalConditions: [],
  medications: [],
  allergies: [],
  consentPurposes: ['INTAKE_HEALTH_INFORMATION', 'INTAKE_MEDICAL_DISCLAIMER'],
};

describe('patient intake rules', () => {
  it('accepts a complete patient-authored snapshot without making a diagnosis', () => {
    expect(() => validateIntakeSubmission(complete)).not.toThrow();
  });

  it('rejects incomplete, invalid, and non-consented submissions', () => {
    expect(() => validateIntakeSubmission({ ...complete, dentalConcerns: [] })).toThrow(
      /required intake steps/i,
    );
    expect(() =>
      validateIntakeSubmission({
        ...complete,
        expectedDepartureDate: '2026-10-01',
      }),
    ).toThrow(/Departure/);
    expect(() =>
      validateIntakeSubmission({ ...complete, consentPurposes: ['INTAKE_HEALTH_INFORMATION'] }),
    ).toThrow(/consent/i);
  });

  it('reports deterministic six-step progress and canonicalizes snapshot keys', () => {
    expect(
      intakeProgress({
        ...complete,
        hasDentalHistoryAnswer: true,
        hasAccessibilityAnswer: true,
      }),
    ).toEqual({ completedSteps: 6, totalSteps: 6, percent: 100, nextStep: 6 });
    expect(JSON.stringify(canonicalIntakeSnapshot({ z: ' value ', a: ['B', 'A'] }))).toBe(
      '{"a":["A","B"],"z":"value"}',
    );
  });
});
