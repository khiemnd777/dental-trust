import { z } from 'zod';

export const requestIdSchema = z.string().min(8).max(128);

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'AUTHENTICATION_REQUIRED',
  'AUTHORIZATION_DENIED',
  'RESOURCE_NOT_FOUND',
  'CONFLICT',
  'OPTIMISTIC_CONCURRENCY_FAILURE',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INVALID_STATE_TRANSITION',
  'DOMAIN_RULE_VIOLATION',
  'REQUEST_REJECTED',
  'INTERNAL_ERROR',
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: requestIdSchema,
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    retryable: z.boolean().default(false),
    domainCode: z.string().min(1).optional(),
  }),
});

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const pageMetadataSchema = z.object({
  nextCursor: z.string().nullable(),
  count: z.number().int().nonnegative(),
});

export const idempotencyKeySchema = z.string().min(16).max(255);

export function dataEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({ data, requestId: requestIdSchema });
}

export function pageEnvelopeSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    page: pageMetadataSchema,
    requestId: requestIdSchema,
  });
}
