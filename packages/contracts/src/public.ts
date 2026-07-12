import { z } from 'zod';

import { idempotencyKeySchema, paginationQuerySchema } from './common.js';

export const publicLocaleSchema = z.enum(['vi-VN', 'en-US']).default('vi-VN');

export const publicDirectoryQuerySchema = paginationQuerySchema.extend({
  cursor: z.uuid().optional(),
  locale: publicLocaleSchema,
  verificationStatus: z.enum(['ACTIVE', 'VERIFIED']).optional(),
});

export const publicDentistParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
});

export const contactRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.email().max(254),
  ),
  topic: z.string().trim().min(2).max(100),
  message: z.string().trim().min(20).max(5_000),
  locale: publicLocaleSchema,
});

export const contactIdempotencyKeySchema = idempotencyKeySchema;

export type PublicDirectoryQuery = z.infer<typeof publicDirectoryQuerySchema>;
export type PublicDentistParams = z.infer<typeof publicDentistParamsSchema>;
export type ContactRequest = z.infer<typeof contactRequestSchema>;
