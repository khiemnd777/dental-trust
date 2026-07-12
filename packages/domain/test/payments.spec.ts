import { describe, expect, it } from 'vitest';

import { paymentStatusAfterRefunds, reconcilePaymentStatus } from '../src/payments.js';

describe('payment reconciliation policy', () => {
  it('allows verified settlement after a failed attempt but never regresses settled money', () => {
    expect(reconcilePaymentStatus('FAILED', 'SUCCEEDED')).toBe('SUCCEEDED');
    expect(reconcilePaymentStatus('SUCCEEDED', 'FAILED')).toBe('SUCCEEDED');
    expect(reconcilePaymentStatus('PARTIALLY_REFUNDED', 'PROCESSING')).toBe('PARTIALLY_REFUNDED');
    expect(reconcilePaymentStatus('REFUNDED', 'SUCCEEDED')).toBe('REFUNDED');
  });

  it('derives settled, partial, and full refund states from exact integer totals', () => {
    expect(paymentStatusAfterRefunds(10_000n, 0n)).toBe('SUCCEEDED');
    expect(paymentStatusAfterRefunds(10_000n, 2_500n)).toBe('PARTIALLY_REFUNDED');
    expect(paymentStatusAfterRefunds(10_000n, 10_000n)).toBe('REFUNDED');
    expect(() => paymentStatusAfterRefunds(10_000n, 10_001n)).toThrow(
      'Succeeded refund totals do not reconcile',
    );
  });
});
