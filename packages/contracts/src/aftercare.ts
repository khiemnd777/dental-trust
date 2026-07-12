import { z } from 'zod';

export const aftercareCheckInRequestSchema = z.object({
  aftercarePlanId: z.uuid(),
  painScale: z.number().int().min(0).max(10),
  symptomCodes: z.array(z.string().trim().min(1).max(80)).max(50),
  patientNotes: z.string().trim().max(4_000).optional(),
  photoFileAssetIds: z.array(z.uuid()).max(12).default([]),
});

export const aftercareEscalationViewSchema = z.object({
  id: z.uuid(),
  severity: z.enum(['URGENT', 'HIGH', 'ROUTINE']),
  matchedRuleIds: z.array(z.string()),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  dueAt: z.string().datetime({ offset: true }),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export const aftercareCheckInViewSchema = z.object({
  id: z.uuid(),
  aftercarePlanId: z.uuid(),
  painScale: z.number().int().min(0).max(10),
  symptomCodes: z.array(z.string()),
  patientNotes: z.string().nullable(),
  submittedAt: z.string().datetime({ offset: true }),
  escalations: z.array(aftercareEscalationViewSchema),
});

export const aftercarePlanViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  active: z.boolean(),
  startsAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  checkIns: z.array(aftercareCheckInViewSchema),
});

export type AftercareCheckInRequest = z.infer<typeof aftercareCheckInRequestSchema>;
export type AftercareEscalationView = z.infer<typeof aftercareEscalationViewSchema>;
export type AftercareCheckInView = z.infer<typeof aftercareCheckInViewSchema>;
export type AftercarePlanView = z.infer<typeof aftercarePlanViewSchema>;
