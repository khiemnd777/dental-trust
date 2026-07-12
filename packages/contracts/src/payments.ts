import { z } from 'zod';

import { paginationQuerySchema } from './common.js';

export const paymentStatusSchema = z.enum([
  'REQUIRES_PAYMENT_METHOD',
  'REQUIRES_ACTION',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'CANCELLED',
]);

export const refundStatusSchema = z.enum([
  'REQUESTED',
  'UNDER_REVIEW',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REJECTED',
]);

/** Amount and currency always come from the accepted booking on the server. */
export const createDepositIntentRequestSchema = z.object({
  bookingId: z.uuid(),
});

export const recoverDepositIntentRequestSchema = z.object({
  bookingId: z.uuid(),
  expectedPaymentVersion: z.number().int().positive(),
});

export const paymentListQuerySchema = paginationQuerySchema.extend({
  bookingId: z.uuid().optional(),
  status: paymentStatusSchema.optional(),
});

export const requestRefundRequestSchema = z.object({
  amountMinor: z.number().int().positive().max(99_999_999),
  reason: z.string().trim().min(10).max(1_000),
});

export const refundViewSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid(),
  providerRefundId: z.string().nullable(),
  amountMinor: z.string().regex(/^\d+$/u),
  reason: z.string(),
  status: refundStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const paymentViewSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  caseId: z.uuid(),
  provider: z.enum(['stripe', 'development']),
  providerPaymentIntentId: z.string().nullable(),
  amountMinor: z.string().regex(/^\d+$/u),
  currency: z.enum(['VND', 'USD']),
  status: paymentStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  refunds: z.array(refundViewSchema),
});

export const depositIntentViewSchema = paymentViewSchema.extend({
  clientSecret: z.string().nullable(),
});

export type CreateDepositIntentRequest = z.infer<typeof createDepositIntentRequestSchema>;
export type RecoverDepositIntentRequest = z.infer<typeof recoverDepositIntentRequestSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type RequestRefundRequest = z.infer<typeof requestRefundRequestSchema>;
export type PaymentView = z.infer<typeof paymentViewSchema>;
export type DepositIntentView = z.infer<typeof depositIntentViewSchema>;
export type RefundView = z.infer<typeof refundViewSchema>;
