import { z } from 'zod';

import { paginationQuerySchema } from './common.js';
import { depositIntentViewSchema, paymentViewSchema } from './payments.js';

export const bookingStatusSchema = z.enum([
  'PENDING_DEPOSIT',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
]);

export const invoiceStatusSchema = z.enum([
  'ISSUED',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'VOID',
]);

export const receiptStatusSchema = z.enum(['ISSUED', 'PARTIALLY_REFUNDED', 'REFUNDED']);

export const cancellationPolicySnapshotSchema = z.object({
  policyVersion: z.number().int().nonnegative(),
  cancellationCutoffMinutes: z.number().int().min(0).max(43_200),
  termsVersion: z.string().min(1).max(40),
  source: z.enum(['CLINIC_POLICY', 'PLATFORM_DEFAULT']),
  display: z.object({
    'vi-VN': z.string().min(1).max(2_000),
    'en-US': z.string().min(1).max(2_000),
  }),
});

export const bookingCheckoutRequestSchema = z.object({
  treatmentPlanAcceptanceId: z.uuid(),
  expectedDepositBasisPoints: z.number().int().min(1).max(10_000),
  expectedCancellationPolicyVersion: z.number().int().nonnegative(),
});

export const bookingListQuerySchema = paginationQuerySchema.extend({
  status: bookingStatusSchema.optional(),
});

export const cancelBookingRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(10).max(1_000),
});

export const completeBookingRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const invoiceViewSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  paymentId: z.uuid().nullable(),
  invoiceNumber: z.string().min(1),
  status: invoiceStatusSchema,
  amountMinor: z.string().regex(/^\d+$/u),
  refundedMinor: z.string().regex(/^\d+$/u),
  currency: z.enum(['VND', 'USD']),
  version: z.number().int().positive(),
  issuedAt: z.string().datetime({ offset: true }),
  paidAt: z.string().datetime({ offset: true }).nullable(),
  voidedAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const receiptViewSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid(),
  receiptNumber: z.string().min(1),
  status: receiptStatusSchema,
  amountMinor: z.string().regex(/^\d+$/u),
  refundedMinor: z.string().regex(/^\d+$/u),
  currency: z.enum(['VND', 'USD']),
  version: z.number().int().positive(),
  issuedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const bookingViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  caseNumber: z.string().min(1),
  treatmentPlanVersionId: z.uuid(),
  treatmentPlanAcceptanceId: z.uuid(),
  treatmentPlanVersion: z.number().int().positive(),
  clinicId: z.uuid(),
  clinicName: z.string().min(1),
  status: bookingStatusSchema,
  planTotalMinor: z.string().regex(/^\d+$/u),
  depositMinor: z.string().regex(/^\d+$/u),
  depositBasisPoints: z.number().int().min(1).max(10_000),
  currency: z.enum(['VND', 'USD']),
  cancellationPolicy: cancellationPolicySnapshotSchema,
  version: z.number().int().positive(),
  confirmedAt: z.string().datetime({ offset: true }).nullable(),
  cancelledAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  invoice: invoiceViewSchema,
  receipt: receiptViewSchema.nullable(),
  payment: paymentViewSchema.nullable(),
});

export const bookingCheckoutOptionViewSchema = z.object({
  treatmentPlanAcceptanceId: z.uuid(),
  treatmentPlanVersionId: z.uuid(),
  treatmentPlanVersion: z.number().int().positive(),
  caseId: z.uuid(),
  caseNumber: z.string().min(1),
  clinicId: z.uuid(),
  clinicName: z.string().min(1),
  planTotalMinor: z.string().regex(/^\d+$/u),
  depositMinor: z.string().regex(/^\d+$/u),
  depositBasisPoints: z.number().int().min(1).max(10_000),
  currency: z.enum(['VND', 'USD']),
  cancellationPolicy: cancellationPolicySnapshotSchema,
  acceptedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
});

export const bookingCheckoutViewSchema = z.object({
  booking: bookingViewSchema,
  depositIntent: depositIntentViewSchema,
});

export type BookingCheckoutRequest = z.infer<typeof bookingCheckoutRequestSchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export type CancelBookingRequest = z.infer<typeof cancelBookingRequestSchema>;
export type CompleteBookingRequest = z.infer<typeof completeBookingRequestSchema>;
export type CancellationPolicySnapshotView = z.infer<typeof cancellationPolicySnapshotSchema>;
export type InvoiceView = z.infer<typeof invoiceViewSchema>;
export type ReceiptView = z.infer<typeof receiptViewSchema>;
export type BookingView = z.infer<typeof bookingViewSchema>;
export type BookingCheckoutOptionView = z.infer<typeof bookingCheckoutOptionViewSchema>;
export type BookingCheckoutView = z.infer<typeof bookingCheckoutViewSchema>;
