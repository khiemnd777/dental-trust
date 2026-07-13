import { z } from 'zod';

import {
  dentalCaseStatuses,
  journeyActionCodes,
  journeyBlockerCodes,
  journeyStages,
} from '@dental-trust/domain';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const boundedClinicalText = z.string().trim().min(1).max(10_000);

export const milestoneCompleteRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  providerNote: z.string().trim().min(1).max(5_000).optional(),
});

export const treatmentInstructionRequestSchema = z.object({
  milestoneId: z.uuid().optional(),
  type: z.enum(['MEDICATION', 'DISCHARGE', 'FOLLOW_UP']),
  locale: z.enum(['vi-VN', 'en-US']),
  content: boundedClinicalText,
});

export const planChangeFieldSchema = z.enum([
  'PROCEDURE',
  'MATERIAL',
  'QUANTITY',
  'UNIT_PRICE_MINOR',
  'TOTAL_PRICE_MINOR',
  'CURRENCY',
  'SCHEDULE',
  'OTHER_PROVIDER_SUPPLIED',
]);

export const planChangeRequestSchema = z.object({
  fromPlanVersionId: z.uuid(),
  kind: z.enum(['TREATMENT', 'PRICE', 'TREATMENT_AND_PRICE']),
  reason: z.string().trim().min(3).max(5_000),
  changes: z
    .array(
      z
        .object({
          field: planChangeFieldSchema,
          beforeValue: z.string().trim().max(5_000),
          afterValue: z.string().trim().max(5_000),
        })
        .refine(({ beforeValue, afterValue }) => beforeValue !== afterValue, {
          message: 'Change values must differ.',
        }),
    )
    .min(1)
    .max(100)
    .superRefine((changes, context) => {
      const seen = new Set<string>();
      for (const [index, change] of changes.entries()) {
        if (seen.has(change.field)) {
          context.addIssue({
            code: 'custom',
            message: 'Each changed field may appear only once.',
            path: [index, 'field'],
          });
        }
        seen.add(change.field);
      }
    }),
});

export const implantRecordInputSchema = z.object({
  toothNumber: z.number().int().min(1).max(99),
  system: z.string().trim().min(1).max(240),
  manufacturer: z.string().trim().min(1).max(240),
  dimensions: z.string().trim().min(1).max(240),
  abutmentDetails: z.string().trim().max(500).optional(),
  lotNumber: z.string().trim().max(240).optional(),
});

export const materialRecordInputSchema = z.object({
  procedureCode: z.string().trim().min(1).max(80),
  material: z.string().trim().min(1).max(240),
  manufacturer: z.string().trim().max(240).optional(),
  lotNumber: z.string().trim().max(240).optional(),
});

export const prescriptionRecordInputSchema = z.object({
  medication: z.string().trim().min(1).max(500),
  dosage: z.string().trim().min(1).max(500),
  instructions: z.string().trim().min(1).max(5_000),
  prescribedAt: isoDateSchema,
});

export const passportDraftRequestSchema = z.object({
  treatingDentistId: z.uuid(),
  treatmentCompletedAt: isoDateSchema,
  treatmentSummary: boundedClinicalText,
  dischargeInstructions: boundedClinicalText,
  followUpInstructions: boundedClinicalText,
  implants: z.array(implantRecordInputSchema).max(64).default([]),
  materials: z.array(materialRecordInputSchema).min(1).max(100),
  prescriptions: z.array(prescriptionRecordInputSchema).max(100).default([]),
});

export const passportShareRequestSchema = z.object({
  expiresInMinutes: z.number().int().min(5).max(10_080),
  maxAccessCount: z.number().int().min(1).max(100).optional(),
});

export const shareTokenParameterSchema = z
  .string()
  .min(48)
  .max(256)
  .regex(/^dtp_[A-Za-z0-9_-]+$/u);

export const journeyMilestoneViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED']),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  completedByUserId: z.uuid().nullable(),
  version: z.number().int().positive(),
});

export const treatmentInstructionViewSchema = z.object({
  id: z.uuid(),
  milestoneId: z.uuid().nullable(),
  authorUserId: z.uuid(),
  type: z.enum(['MEDICATION', 'DISCHARGE', 'FOLLOW_UP']),
  locale: z.enum(['vi-VN', 'en-US']),
  content: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});

export const planChangeViewSchema = z.object({
  id: z.uuid(),
  fromPlanVersionId: z.uuid(),
  authorUserId: z.uuid(),
  kind: z.enum(['TREATMENT', 'PRICE', 'TREATMENT_AND_PRICE']),
  reason: z.string(),
  changes: z.array(
    z.object({ field: planChangeFieldSchema, beforeValue: z.string(), afterValue: z.string() }),
  ),
  createdAt: z.string().datetime({ offset: true }),
  acknowledgedAt: z.string().datetime({ offset: true }).nullable(),
});

export const journeySummaryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const journeySummaryViewSchema = z.object({
  caseId: z.uuid(),
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(dentalCaseStatuses),
  perspective: z.enum(['PATIENT', 'CLINIC']),
  stage: z.enum(journeyStages),
  progress: z.number().int().min(0).max(100),
  urgency: z.enum(['ROUTINE', 'ATTENTION', 'URGENT']),
  primaryAction: z.object({ code: z.enum(journeyActionCodes) }),
  blockers: z.array(z.object({ code: z.enum(journeyBlockerCodes) })).max(10),
  owner: z
    .object({
      type: z.enum(['PATIENT', 'CLINIC', 'SUPPORT']),
      displayName: z.string().min(1).max(320).nullable(),
    })
    .nullable(),
  expectedAt: z.string().datetime({ offset: true }).nullable(),
  nextAppointment: z
    .object({
      id: z.uuid(),
      kind: z.enum(['CONSULTATION', 'CLINICAL_VISIT']),
      startsAt: z.string().datetime({ offset: true }),
      timezone: z.string().min(1).max(120),
      status: z.enum(['TENTATIVE', 'CONFIRMED']),
    })
    .nullable(),
  activeMilestone: z
    .object({
      id: z.uuid(),
      code: z.string().min(1),
      title: z.string().min(1),
      status: z.enum(['PENDING', 'IN_PROGRESS']),
      scheduledAt: z.string().datetime({ offset: true }).nullable(),
    })
    .nullable(),
  timeline: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.enum(dentalCaseStatuses),
        occurredAt: z.string().datetime({ offset: true }),
      }),
    )
    .max(12),
  updatedAt: z.string().datetime({ offset: true }),
});

export type MilestoneCompleteRequest = z.infer<typeof milestoneCompleteRequestSchema>;
export type TreatmentInstructionRequest = z.infer<typeof treatmentInstructionRequestSchema>;
export type PlanChangeRequestInput = z.infer<typeof planChangeRequestSchema>;
export type PassportDraftRequest = z.infer<typeof passportDraftRequestSchema>;
export type PassportShareRequest = z.infer<typeof passportShareRequestSchema>;
export type JourneyMilestoneView = z.infer<typeof journeyMilestoneViewSchema>;
export type TreatmentInstructionView = z.infer<typeof treatmentInstructionViewSchema>;
export type PlanChangeView = z.infer<typeof planChangeViewSchema>;
export type JourneySummaryListQuery = z.infer<typeof journeySummaryListQuerySchema>;
export type JourneySummaryView = z.infer<typeof journeySummaryViewSchema>;
