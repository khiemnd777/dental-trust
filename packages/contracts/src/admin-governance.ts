import { z } from 'zod';

import { notificationCategorySchema } from './notifications.js';

export const supportedLocaleSchema = z.enum(['vi-VN', 'en-US']);
export const localizedNamesSchema = z
  .object({
    'vi-VN': z.string().trim().min(2).max(160),
    'en-US': z.string().trim().min(2).max(160),
  })
  .strict();

const reasonSchema = z.string().trim().min(12).max(1_000);
const codeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_.-]{2,119}$/u);

export const adminGovernanceQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const adminContentVersionCommandSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .max(160),
  locale: supportedLocaleSchema,
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(4).max(200),
  summary: z.string().trim().min(8).max(500).optional(),
  body: z.string().trim().min(20).max(100_000),
  publicationStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  reason: reasonSchema,
  confirmation: z.literal('SAVE CONTENT VERSION'),
});

export const adminNotificationTemplateVersionCommandSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_.-]{2,159}$/u),
  category: notificationCategorySchema,
  channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'MESSAGING']),
  locale: supportedLocaleSchema,
  expectedVersion: z.number().int().nonnegative(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(20).max(20_000),
  publicationStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  reason: reasonSchema,
  confirmation: z.literal('SAVE NOTIFICATION TEMPLATE'),
});

export const adminFeatureFlagVersionCommandSchema = z.object({
  key: codeSchema,
  description: z.string().trim().min(8).max(500),
  expectedVersion: z.number().int().nonnegative(),
  enabled: z.boolean(),
  environment: z.enum(['development', 'test', 'staging', 'production', 'all']),
  audiences: z.array(z.string().trim().min(2).max(80)).max(20).default([]),
  reason: reasonSchema,
  confirmation: z.literal('CHANGE FEATURE FLAG'),
});

const configurationValueTypeSchema = z.enum(['STRING', 'BOOLEAN', 'INTEGER', 'DECIMAL']);

export const adminSystemConfigurationVersionCommandSchema = z
  .object({
    key: codeSchema,
    description: z.string().trim().min(8).max(500),
    valueType: configurationValueTypeSchema,
    expectedVersion: z.number().int().nonnegative(),
    value: z.string().max(4_000),
    reason: reasonSchema,
    confirmation: z.literal('CHANGE SYSTEM CONFIGURATION'),
  })
  .superRefine((input, context) => {
    const valid =
      input.valueType === 'STRING' ||
      (input.valueType === 'BOOLEAN' && /^(?:true|false)$/u.test(input.value)) ||
      (input.valueType === 'INTEGER' && /^-?\d+$/u.test(input.value)) ||
      (input.valueType === 'DECIMAL' && /^-?\d+(?:\.\d+)?$/u.test(input.value));
    if (!valid)
      context.addIssue({ code: 'custom', path: ['value'], message: 'invalid_typed_value' });
  });

const taxonomyBaseSchema = z.object({
  code: codeSchema,
  names: localizedNamesSchema,
  active: z.boolean(),
  expectedVersion: z.number().int().nonnegative(),
  reason: reasonSchema,
  confirmation: z.literal('CHANGE TAXONOMY'),
});

export const adminTaxonomyCommandSchema = z.discriminatedUnion('kind', [
  taxonomyBaseSchema.extend({
    kind: z.literal('service_category'),
    parentId: z.uuid().nullable(),
  }),
  taxonomyBaseSchema.extend({
    kind: z.literal('procedure'),
    serviceCategoryId: z.uuid(),
    descriptions: localizedNamesSchema,
  }),
]);

export const adminLocationConfigurationCommandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('country'),
    id: z.uuid().optional(),
    code: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/u),
    names: localizedNamesSchema,
    currency: z.enum(['VND', 'USD']),
    callingCode: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{0,6}$/u),
    active: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
    reason: reasonSchema,
    confirmation: z.literal('CHANGE LOCATION CONFIGURATION'),
  }),
  z.object({
    kind: z.literal('city'),
    id: z.uuid().optional(),
    countryId: z.uuid(),
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{1,79}$/u),
    names: localizedNamesSchema,
    timezone: z.string().trim().min(3).max(80),
    active: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
    reason: reasonSchema,
    confirmation: z.literal('CHANGE LOCATION CONFIGURATION'),
  }),
  z.object({
    kind: z.literal('locale'),
    id: z.uuid().optional(),
    locale: supportedLocaleSchema,
    names: localizedNamesSchema,
    active: z.boolean(),
    isDefault: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
    reason: reasonSchema,
    confirmation: z.literal('CHANGE LOCATION CONFIGURATION'),
  }),
]);

export const adminGovernanceViewSchema = z.enum([
  'content',
  'taxonomy',
  'templates',
  'feature-flags',
  'configuration',
  'locations',
]);

export const adminGovernanceCommandEnvelopeSchema = z.discriminatedUnion('view', [
  z.object({ view: z.literal('content'), command: adminContentVersionCommandSchema }),
  z.object({ view: z.literal('taxonomy'), command: adminTaxonomyCommandSchema }),
  z.object({
    view: z.literal('templates'),
    command: adminNotificationTemplateVersionCommandSchema,
  }),
  z.object({ view: z.literal('feature-flags'), command: adminFeatureFlagVersionCommandSchema }),
  z.object({
    view: z.literal('configuration'),
    command: adminSystemConfigurationVersionCommandSchema,
  }),
  z.object({ view: z.literal('locations'), command: adminLocationConfigurationCommandSchema }),
]);

export type AdminContentVersionCommand = z.infer<typeof adminContentVersionCommandSchema>;
export type AdminNotificationTemplateVersionCommand = z.infer<
  typeof adminNotificationTemplateVersionCommandSchema
>;
export type AdminFeatureFlagVersionCommand = z.infer<typeof adminFeatureFlagVersionCommandSchema>;
export type AdminSystemConfigurationVersionCommand = z.infer<
  typeof adminSystemConfigurationVersionCommandSchema
>;
export type AdminTaxonomyCommand = z.infer<typeof adminTaxonomyCommandSchema>;
export type AdminLocationConfigurationCommand = z.infer<
  typeof adminLocationConfigurationCommandSchema
>;
export type AdminGovernanceView = z.infer<typeof adminGovernanceViewSchema>;
export type AdminGovernanceCommandEnvelope = z.infer<typeof adminGovernanceCommandEnvelopeSchema>;
