import { z } from 'zod';

export const notificationCategorySchema = z.enum([
  'ACCOUNT_SECURITY',
  'CASE_UPDATES',
  'MISSING_DOCUMENTS',
  'TREATMENT_PLANS',
  'CONSULTATIONS',
  'APPOINTMENTS',
  'PAYMENTS',
  'TRAVEL_PREPARATION',
  'TREATMENT_MILESTONES',
  'AFTERCARE',
  'INCIDENTS',
  'WARRANTY',
  'VERIFICATION_EXPIRY',
  'ADMINISTRATIVE_ALERTS',
]);

export const notificationChannelSchema = z.enum(['IN_APP', 'EMAIL', 'SMS', 'MESSAGING']);

export const notificationActionTargetSchema = z.enum([
  'CASE',
  'TODAY',
  'APPOINTMENTS',
  'PAYMENTS',
  'AFTERCARE',
  'INCIDENTS',
]);

export const notificationPreferenceViewSchema = z.object({
  category: notificationCategorySchema,
  channel: notificationChannelSchema,
  enabled: z.boolean(),
  locked: z.boolean(),
});

export const updateNotificationPreferenceSchema = z
  .object({
    category: notificationCategorySchema,
    channel: notificationChannelSchema,
    enabled: z.boolean(),
  })
  .superRefine((preference, context) => {
    if (preference.category === 'ACCOUNT_SECURITY' && !preference.enabled) {
      context.addIssue({
        code: 'custom',
        message: 'Critical account security notifications cannot be disabled.',
        path: ['enabled'],
      });
    }
  });

export const notificationViewSchema = z.object({
  id: z.uuid(),
  category: notificationCategorySchema,
  channel: notificationChannelSchema,
  templateKey: z.string().min(1),
  status: z.enum(['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SUPPRESSED']),
  scheduledAt: z.string().datetime({ offset: true }),
  deliveredAt: z.string().datetime({ offset: true }).nullable(),
  readAt: z.string().datetime({ offset: true }).nullable(),
  action: z
    .object({
      target: notificationActionTargetSchema,
      resourceId: z.uuid().nullable(),
    })
    .nullable(),
});

export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationPreferenceView = z.infer<typeof notificationPreferenceViewSchema>;
export type UpdateNotificationPreference = z.infer<typeof updateNotificationPreferenceSchema>;
export type NotificationView = z.infer<typeof notificationViewSchema>;
