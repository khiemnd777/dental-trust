import { describe, expect, it } from 'vitest';

import {
  consentLedgerQuerySchema,
  intakeDraftCreateSchema,
  intakeDraftUpdateSchema,
  intakeSubmitSchema,
  patientProfileUpdateSchema,
  withdrawConsentSchema,
} from '@dental-trust/contracts';

const consentA = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const consentB = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';

describe('patient onboarding and intake transport contracts', () => {
  it('validates a complete encrypted-profile source payload', () => {
    expect(
      patientProfileUpdateSchema.parse({
        expectedVersion: 1,
        preferredLocale: 'en-US',
        preferredCurrency: 'USD',
        currentCountry: 'Australia',
        currentCity: 'Melbourne',
        timezone: 'Australia/Melbourne',
        identity: { fullName: 'Linh Nguyen', dateOfBirth: '1988-04-18' },
        contact: { phoneE164: '+61412345678' },
        preferences: {
          contactChannel: 'MESSAGE',
          travelCoordination: true,
          appointmentReminders: true,
        },
      }),
    ).toMatchObject({ preferredLocale: 'en-US', preferredCurrency: 'USD' });
  });

  it('supports bounded partial drafts and rejects invalid travel order', () => {
    expect(intakeDraftCreateSchema.parse({ desiredProcedureCode: 'DENTAL_IMPLANT' })).toMatchObject(
      {
        currentStep: 1,
      },
    );
    expect(
      intakeDraftUpdateSchema.safeParse({
        expectedDraftRevision: 2,
        currentStep: 2,
        expectedArrivalDate: '2026-10-20',
        expectedDepartureDate: '2026-10-10',
      }).success,
    ).toBe(false);
  });

  it('requires affirmative consent to two distinct immutable text versions', () => {
    expect(
      intakeSubmitSchema.parse({
        expectedDraftRevision: 4,
        consentGranted: true,
        consentTextVersionIds: [consentA, consentB],
      }),
    ).toMatchObject({ consentGranted: true });
    expect(
      intakeSubmitSchema.safeParse({
        expectedDraftRevision: 4,
        consentGranted: true,
        consentTextVersionIds: [consentA, consentA],
      }).success,
    ).toBe(false);
    expect(
      intakeSubmitSchema.safeParse({
        expectedDraftRevision: 4,
        consentGranted: false,
        consentTextVersionIds: [consentA, consentB],
      }).success,
    ).toBe(false);
  });

  it('requires explicit reason, current grant evidence, and exact consent-withdrawal confirmation', () => {
    expect(consentLedgerQuerySchema.parse({ limit: '25', status: 'ACTIVE' })).toEqual({
      limit: 25,
      status: 'ACTIVE',
    });
    expect(
      withdrawConsentSchema.parse({
        expectedGrantedAt: '2026-07-12T08:00:00.000Z',
        reason: 'I no longer authorize this ongoing use of my information.',
        confirmation: 'WITHDRAW CONSENT',
      }),
    ).toMatchObject({ confirmation: 'WITHDRAW CONSENT' });
    expect(
      withdrawConsentSchema.safeParse({
        expectedGrantedAt: '2026-07-12T08:00:00.000Z',
        reason: 'Too short',
        confirmation: 'YES',
      }).success,
    ).toBe(false);
  });
});
