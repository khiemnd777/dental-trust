import { z } from 'zod';

export const treatmentPlanItemInputSchema = z.object({
  procedureCode: z.string().trim().min(1).max(80),
  toothNumbers: z.array(z.number().int().min(1).max(99)).max(32),
  quantity: z.number().int().positive(),
  material: z.string().trim().max(160).optional(),
  brand: z.string().trim().max(160).optional(),
  unitPriceMinor: z.number().int().nonnegative(),
});

export const treatmentPlanDraftRequestSchema = z.object({
  authoringDentistId: z.uuid().optional(),
  preliminaryAssessment: z.string().trim().min(1).max(10_000),
  diagnosisStatement: z.string().trim().min(1).max(10_000),
  risks: z.string().trim().min(1).max(10_000),
  limitations: z.string().trim().min(1).max(10_000),
  warrantyTerms: z.string().trim().min(1).max(10_000),
  exclusions: z.string().trim().min(1).max(10_000),
  currency: z.enum(['VND', 'USD']),
  expiresAt: z.string().datetime({ offset: true }),
  items: z.array(treatmentPlanItemInputSchema).min(1).max(100),
});

export const treatmentPlanPublishRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  contentChecksum: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const treatmentPlanAcceptRequestSchema = z.object({
  consentTextVersionId: z.uuid(),
});

export const treatmentPlanItemViewSchema = z.object({
  id: z.uuid(),
  procedureCode: z.string(),
  toothNumbers: z.array(z.number().int()),
  quantity: z.number().int().positive(),
  material: z.string().nullable(),
  brand: z.string().nullable(),
  unitPriceMinor: z.number().int().nonnegative(),
  totalPriceMinor: z.number().int().nonnegative(),
  sortOrder: z.number().int().nonnegative(),
});

export const treatmentPlanVersionViewSchema = z.object({
  id: z.uuid(),
  treatmentPlanId: z.uuid(),
  caseId: z.uuid(),
  clinicId: z.uuid(),
  clinicName: z.string(),
  authoringDentistId: z.uuid(),
  authoringDentistName: z.string(),
  version: z.number().int().positive(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'EXPIRED']),
  preliminaryAssessment: z.string(),
  diagnosisStatement: z.string(),
  risks: z.string(),
  limitations: z.string(),
  warrantyTerms: z.string(),
  exclusions: z.string(),
  currency: z.enum(['VND', 'USD']),
  totalMinor: z.number().int().nonnegative(),
  expiresAt: z.string().datetime({ offset: true }),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  contentChecksum: z.string().regex(/^[a-f0-9]{64}$/u),
  acceptedAt: z.string().datetime({ offset: true }).nullable(),
  acceptanceConsentTextVersionId: z.uuid().nullable(),
  items: z.array(treatmentPlanItemViewSchema),
  createdAt: z.string().datetime({ offset: true }),
});

export const treatmentPlanAcceptanceViewSchema = z.object({
  id: z.uuid(),
  treatmentPlanVersionId: z.uuid(),
  userId: z.uuid(),
  consentTextVersionId: z.uuid(),
  acceptedAt: z.string().datetime({ offset: true }),
});

export const treatmentPlanAuthoringContextSchema = z.object({
  clinicId: z.uuid(),
  clinicName: z.string(),
  dentistOptions: z.array(
    z.object({ id: z.uuid(), fullName: z.string(), isCurrentUser: z.boolean() }),
  ),
});

export type TreatmentPlanDraftRequest = z.infer<typeof treatmentPlanDraftRequestSchema>;
export type TreatmentPlanPublishRequest = z.infer<typeof treatmentPlanPublishRequestSchema>;
export type TreatmentPlanAcceptRequest = z.infer<typeof treatmentPlanAcceptRequestSchema>;
export type TreatmentPlanVersionView = z.infer<typeof treatmentPlanVersionViewSchema>;
export type TreatmentPlanAcceptanceView = z.infer<typeof treatmentPlanAcceptanceViewSchema>;
export type TreatmentPlanAuthoringContext = z.infer<typeof treatmentPlanAuthoringContextSchema>;
