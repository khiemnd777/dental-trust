import { z } from 'zod';

import { caregiverPermissions } from '@dental-trust/domain';

export const caregiverGrantRequestSchema = z.object({
  caregiverEmail: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.email().max(254),
  ),
  permissions: z.array(z.enum(caregiverPermissions)).min(1),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const caregiverGrantUpdateSchema = z.object({
  permissions: z.array(z.enum(caregiverPermissions)).min(1),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const caregiverGrantViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  caregiverUserId: z.uuid(),
  caregiverEmail: z.email(),
  permissions: z.array(z.enum(caregiverPermissions)),
  grantedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  lastAccessedAt: z.string().datetime({ offset: true }).nullable(),
});

export type CaregiverGrantRequest = z.infer<typeof caregiverGrantRequestSchema>;
export type CaregiverGrantUpdate = z.infer<typeof caregiverGrantUpdateSchema>;
export type CaregiverGrantView = z.infer<typeof caregiverGrantViewSchema>;
