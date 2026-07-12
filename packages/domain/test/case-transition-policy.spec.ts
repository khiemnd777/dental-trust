import { describe, expect, it } from 'vitest';

import { assertActorMayTransitionCase } from '../src/index.js';

describe('case transition actor policy', () => {
  it('lets patients submit/cancel but not claim clinical completion', () => {
    expect(() =>
      assertActorMayTransitionCase('PATIENT_OWNER', 'DRAFT', 'RECORDS_PENDING'),
    ).not.toThrow();
    expect(() =>
      assertActorMayTransitionCase('PATIENT_OWNER', 'IN_TREATMENT', 'TREATMENT_COMPLETED'),
    ).toThrow(/actor is not permitted/i);
  });

  it('lets assigned clinical teams record clinical progress but not patient decisions', () => {
    expect(() =>
      assertActorMayTransitionCase('CLINIC_TEAM', 'BOOKED', 'IN_TREATMENT'),
    ).not.toThrow();
    expect(() =>
      assertActorMayTransitionCase('DENTIST', 'PATIENT_DECISION_PENDING', 'BOOKING_PENDING'),
    ).toThrow();
  });

  it.each(['CONCIERGE', 'PLATFORM_ADMIN'] as const)(
    'prevents %s from claiming clinical treatment completion',
    (actor) => {
      expect(() =>
        assertActorMayTransitionCase(actor, 'IN_TREATMENT', 'TREATMENT_COMPLETED'),
      ).toThrow();
    },
  );

  it('keeps concierge coordination and administrative cancellation explicit', () => {
    expect(() =>
      assertActorMayTransitionCase('CONCIERGE', 'INTAKE_REVIEW', 'MATCHING_IN_PROGRESS'),
    ).not.toThrow();
    expect(() =>
      assertActorMayTransitionCase('PLATFORM_ADMIN', 'INTAKE_REVIEW', 'CANCELLED'),
    ).not.toThrow();
  });
});
