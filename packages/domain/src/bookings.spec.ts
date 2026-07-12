import { describe, expect, it } from 'vitest';

import {
  assertBookingTransition,
  calculateBookingDepositMinor,
  cancellationPolicySnapshot,
  depositBasisPointsFromPercent,
  documentStatusForPayment,
} from './bookings.js';

describe('booking policies', () => {
  it('calculates a server-owned deposit and rounds up minor units', () => {
    expect(calculateBookingDepositMinor(10_001n, 2_000)).toBe(2_001n);
    expect(depositBasisPointsFromPercent('20')).toBe(2_000);
  });

  it('rejects invalid deposit configuration and terminal transitions', () => {
    expect(() => depositBasisPointsFromPercent('0')).toThrow(/between 1 and 100/u);
    expect(() => assertBookingTransition('COMPLETED', 'CANCELLED')).toThrow(/cannot transition/u);
  });

  it('creates bilingual immutable policy terms and payment document projections', () => {
    const policy = cancellationPolicySnapshot({ version: 3, cancellationCutoffMinutes: 720 });
    expect(policy.display['vi-VN']).toContain('12 giờ');
    expect(policy.display['en-US']).toContain('12 hours');
    expect(documentStatusForPayment('PARTIALLY_REFUNDED')).toEqual({
      invoice: 'PARTIALLY_REFUNDED',
      receipt: 'PARTIALLY_REFUNDED',
    });
  });
});
