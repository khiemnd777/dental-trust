import { z } from 'zod';

export const adminRetryCommandSchema = z.object({
  reason: z.string().trim().min(12).max(1_000),
  confirmation: z.literal('RETRY FAILED DELIVERY'),
  expectedAttemptCount: z.number().int().nonnegative(),
});

export const adminNotificationRetryCommandSchema = z.object({
  reason: z.string().trim().min(12).max(1_000),
  confirmation: z.literal('RETRY FAILED DELIVERY'),
});

export const adminOperationsQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminAuditQuerySchema = adminOperationsQuerySchema.extend({
  action: z.string().trim().min(1).max(120).optional(),
  resourceType: z.string().trim().min(1).max(120).optional(),
});

export const adminOutboxQuerySchema = adminOperationsQuerySchema.extend({
  status: z.enum(['PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER']).optional(),
});

export const adminNotificationQuerySchema = adminOperationsQuerySchema.extend({
  status: z.enum(['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SUPPRESSED']).optional(),
});

export const adminWebhookQuerySchema = adminOperationsQuerySchema.extend({
  status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED']).optional(),
  provider: z.string().trim().min(1).max(60).optional(),
});

export const adminOperationsSummarySchema = z.object({
  activeUsers: z.number().int().nonnegative(),
  openCases: z.number().int().nonnegative(),
  pendingVerifications: z.number().int().nonnegative(),
  unresolvedIncidents: z.number().int().nonnegative(),
  failedOutboxEvents: z.number().int().nonnegative(),
  failedNotifications: z.number().int().nonnegative(),
  failedWebhooks: z.number().int().nonnegative(),
  pendingPrivacyRequests: z.number().int().nonnegative(),
  generatedAt: z.string().datetime({ offset: true }),
});

export const adminOutboxJobViewSchema = z.object({
  id: z.uuid(),
  eventType: z.string(),
  aggregateType: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER']),
  attemptCount: z.number().int().nonnegative(),
  availableAt: z.string().datetime({ offset: true }),
  processedAt: z.string().datetime({ offset: true }).nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export const adminNotificationJobViewSchema = z.object({
  id: z.uuid(),
  category: z.string(),
  channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'MESSAGING']),
  templateKey: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SUPPRESSED']),
  scheduledAt: z.string().datetime({ offset: true }),
  deliveredAt: z.string().datetime({ offset: true }).nullable(),
});

export const adminWebhookViewSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  providerEventId: z.string(),
  type: z.string(),
  status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED']),
  attemptCount: z.number().int().nonnegative(),
  receivedAt: z.string().datetime({ offset: true }),
  processedAt: z.string().datetime({ offset: true }).nullable(),
  lastErrorCode: z.string().nullable(),
});

export const adminAuditLogViewSchema = z.object({
  id: z.uuid(),
  actorType: z.enum(['USER', 'SYSTEM', 'PROVIDER']),
  actorUserId: z.uuid().nullable(),
  organizationId: z.uuid().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  requestId: z.string(),
  reason: z.string().nullable(),
  success: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
});

export type AdminRetryCommand = z.infer<typeof adminRetryCommandSchema>;
export type AdminNotificationRetryCommand = z.infer<typeof adminNotificationRetryCommandSchema>;
export type AdminOperationsQuery = z.infer<typeof adminOperationsQuerySchema>;
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;
export type AdminOutboxQuery = z.infer<typeof adminOutboxQuerySchema>;
export type AdminNotificationQuery = z.infer<typeof adminNotificationQuerySchema>;
export type AdminWebhookQuery = z.infer<typeof adminWebhookQuerySchema>;
export type AdminOperationsSummary = z.infer<typeof adminOperationsSummarySchema>;
export type AdminOutboxJobView = z.infer<typeof adminOutboxJobViewSchema>;
export type AdminNotificationJobView = z.infer<typeof adminNotificationJobViewSchema>;
export type AdminWebhookView = z.infer<typeof adminWebhookViewSchema>;
export type AdminAuditLogView = z.infer<typeof adminAuditLogViewSchema>;
