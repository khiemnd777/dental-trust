import { describe, expect, it } from 'vitest';

import {
  allowedCaseTransitions,
  assertCaseTransition,
  canTransitionCase,
  InvalidStateTransitionError,
} from '../src/index.js';

describe('dental case state machine', () => {
  it('allows the normal intake path', () => {
    expect(canTransitionCase('DRAFT', 'RECORDS_PENDING')).toBe(true);
    expect(allowedCaseTransitions('INTAKE_REVIEW')).toContain('MATCHING_IN_PROGRESS');
    expect(() => assertCaseTransition('BOOKING_PENDING', 'BOOKED')).not.toThrow();
  });

  it('rejects skipped and terminal transitions', () => {
    expect(() => assertCaseTransition('DRAFT', 'BOOKED')).toThrow(InvalidStateTransitionError);
    expect(() => assertCaseTransition('CANCELLED', 'DRAFT')).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );
  });
});
