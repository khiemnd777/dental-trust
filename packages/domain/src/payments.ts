import { DomainRuleError, InvalidStateTransitionError } from './errors.js';

export const paymentStatuses = [
  'REQUIRES_PAYMENT_METHOD',
  'REQUIRES_ACTION',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'CANCELLED',
] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];
export type SupportedCurrency = 'VND' | 'USD';

export const refundStatuses = [
  'REQUESTED',
  'UNDER_REVIEW',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REJECTED',
] as const;

export type RefundStatus = (typeof refundStatuses)[number];
export type PaymentProviderEvidence =
  'REQUIRES_ACTION' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

const transitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  REQUIRES_PAYMENT_METHOD: ['REQUIRES_ACTION', 'PROCESSING', 'FAILED', 'CANCELLED'],
  REQUIRES_ACTION: ['PROCESSING', 'FAILED', 'CANCELLED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: ['REQUIRES_PAYMENT_METHOD', 'CANCELLED'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  REFUNDED: [],
  CANCELLED: [],
};

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!transitions[from].includes(to)) {
    throw new InvalidStateTransitionError('payment', from, to);
  }
}

export function assertMinorUnitAmount(amount: number, currency: SupportedCurrency): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new DomainRuleError(
      'INVALID_MONEY_AMOUNT',
      'Money must be represented as a positive safe integer in minor units.',
      { amount: String(amount), currency },
    );
  }
}

/**
 * Reconciles provider evidence without allowing an older failure/processing
 * event to roll back settled or refunded money. Event ordering is additionally
 * guarded by providerEventCreatedAt in persistence.
 */
export function reconcilePaymentStatus(
  current: PaymentStatus,
  evidence: PaymentProviderEvidence,
): PaymentStatus {
  if (current === 'REFUNDED' || current === 'PARTIALLY_REFUNDED') return current;
  if (current === 'SUCCEEDED' && evidence !== 'SUCCEEDED') return current;
  if (current === 'CANCELLED' && evidence === 'SUCCEEDED') {
    throw new DomainRuleError(
      'PAYMENT_RECONCILIATION_REQUIRED',
      'A cancelled payment cannot be reconciled as succeeded automatically.',
    );
  }
  if (evidence === 'SUCCEEDED') return 'SUCCEEDED';
  if (evidence === 'PROCESSING') return current === 'FAILED' ? current : 'PROCESSING';
  if (evidence === 'REQUIRES_ACTION') {
    return current === 'PROCESSING' || current === 'FAILED' ? current : 'REQUIRES_ACTION';
  }
  if (evidence === 'CANCELLED') return 'CANCELLED';
  return 'FAILED';
}

export function paymentStatusAfterRefunds(
  paidAmountMinor: bigint,
  succeededRefundAmountMinor: bigint,
): Extract<PaymentStatus, 'SUCCEEDED' | 'PARTIALLY_REFUNDED' | 'REFUNDED'> {
  if (succeededRefundAmountMinor < 0n || succeededRefundAmountMinor > paidAmountMinor) {
    throw new DomainRuleError(
      'PAYMENT_RECONCILIATION_REQUIRED',
      'Succeeded refund totals do not reconcile to the payment amount.',
    );
  }
  if (succeededRefundAmountMinor === 0n) return 'SUCCEEDED';
  return succeededRefundAmountMinor === paidAmountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}
