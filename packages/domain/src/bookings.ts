import { DomainRuleError } from './errors.js';

export const defaultBookingDepositBasisPoints = 2_000;
export const defaultCancellationCutoffMinutes = 1_440;
export const bookingCancellationTermsVersion = '2026-07-12';

export type BookingStatus = 'PENDING_DEPOSIT' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOID';
export type ReceiptStatus = 'ISSUED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

export interface CancellationPolicySnapshot {
  readonly policyVersion: number;
  readonly cancellationCutoffMinutes: number;
  readonly termsVersion: string;
  readonly source: 'CLINIC_POLICY' | 'PLATFORM_DEFAULT';
  readonly display: {
    readonly 'vi-VN': string;
    readonly 'en-US': string;
  };
}

export function depositBasisPointsFromPercent(value: string | undefined): number {
  if (value === undefined) return defaultBookingDepositBasisPoints;
  if (!/^[0-9]+$/u.test(value)) {
    throw new DomainRuleError(
      'BOOKING_DEPOSIT_CONFIGURATION_INVALID',
      'The booking deposit configuration is invalid.',
    );
  }
  const percent = Number(value);
  if (!Number.isSafeInteger(percent) || percent < 1 || percent > 100) {
    throw new DomainRuleError(
      'BOOKING_DEPOSIT_CONFIGURATION_INVALID',
      'The booking deposit percentage must be between 1 and 100.',
    );
  }
  return percent * 100;
}

export function calculateBookingDepositMinor(totalMinor: bigint, basisPoints: number): bigint {
  if (
    totalMinor <= 0n ||
    !Number.isInteger(basisPoints) ||
    basisPoints < 1 ||
    basisPoints > 10_000
  ) {
    throw new DomainRuleError(
      'BOOKING_DEPOSIT_INVALID',
      'A positive plan total and a valid deposit basis are required.',
    );
  }
  return (totalMinor * BigInt(basisPoints) + 9_999n) / 10_000n;
}

export function cancellationPolicySnapshot(input?: {
  readonly version: number;
  readonly cancellationCutoffMinutes: number;
}): CancellationPolicySnapshot {
  const cutoff = input?.cancellationCutoffMinutes ?? defaultCancellationCutoffMinutes;
  if (!Number.isSafeInteger(cutoff) || cutoff < 0 || cutoff > 43_200) {
    throw new DomainRuleError(
      'BOOKING_CANCELLATION_POLICY_INVALID',
      'The clinic cancellation policy is invalid.',
    );
  }
  const hours = Math.ceil(cutoff / 60);
  return {
    policyVersion: input?.version ?? 0,
    cancellationCutoffMinutes: cutoff,
    termsVersion: bookingCancellationTermsVersion,
    source: input ? 'CLINIC_POLICY' : 'PLATFORM_DEFAULT',
    display: {
      'vi-VN': `Yêu cầu hủy hoặc đổi lịch trước ít nhất ${hours} giờ. Tiền hoàn lại được xử lý theo trạng thái thanh toán và cần được xác nhận.`,
      'en-US': `Request cancellation or rescheduling at least ${hours} hours in advance. Refunds depend on payment status and require confirmation.`,
    },
  };
}

export function assertBookingTransition(current: BookingStatus, next: BookingStatus): void {
  const allowed: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
    PENDING_DEPOSIT: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['CANCELLED', 'COMPLETED'],
    CANCELLED: [],
    COMPLETED: [],
  };
  if (!allowed[current].includes(next)) {
    throw new DomainRuleError(
      'BOOKING_TRANSITION_INVALID',
      `A booking cannot transition from ${current} to ${next}.`,
    );
  }
}

export function documentStatusForPayment(
  paymentStatus: 'SUCCEEDED' | 'PARTIALLY_REFUNDED' | 'REFUNDED',
): { readonly invoice: InvoiceStatus; readonly receipt: ReceiptStatus } {
  if (paymentStatus === 'PARTIALLY_REFUNDED') {
    return { invoice: 'PARTIALLY_REFUNDED', receipt: 'PARTIALLY_REFUNDED' };
  }
  if (paymentStatus === 'REFUNDED') return { invoice: 'REFUNDED', receipt: 'REFUNDED' };
  return { invoice: 'PAID', receipt: 'ISSUED' };
}
