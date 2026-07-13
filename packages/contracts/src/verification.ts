import { z } from 'zod';

import { verificationEvidenceCategories, verificationStatuses } from '@dental-trust/domain';

import { paginationQuerySchema } from './common.js';

export const verificationSubjectTypeSchema = z.enum(['CLINIC', 'DENTIST']);
export const verificationStatusSchema = z.enum(verificationStatuses);
export const verificationRiskLevelSchema = z.enum(['STANDARD', 'HIGH']);
export const verificationEvidenceCategorySchema = z.enum(verificationEvidenceCategories);
export const verificationRequirementStatusSchema = z.enum([
  'NOT_PROVIDED',
  'PROVIDED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'WAIVED',
]);

export const createVerificationCaseSchema = z.object({
  subjectType: verificationSubjectTypeSchema,
  subjectId: z.uuid(),
});

export const verificationCaseListQuerySchema = paginationQuerySchema.extend({
  subjectType: verificationSubjectTypeSchema.optional(),
  status: verificationStatusSchema.optional(),
  assignedToMe: z.coerce.boolean().default(false),
  expiresBefore: z.string().datetime({ offset: true }).optional(),
});

export const assignVerificationCaseSchema = z.object({
  reviewerUserId: z.uuid(),
  expectedVersion: z.number().int().positive(),
});

export const submitVerificationCaseSchema = z.object({
  expectedVersion: z.number().int().positive(),
  attestation: z.string().trim().min(20).max(2_000),
});

export const addVerificationEvidenceSchema = z
  .object({
    expectedCaseVersion: z.number().int().positive(),
    requirementId: z.uuid(),
    category: verificationEvidenceCategorySchema,
    fileAssetId: z.uuid().optional(),
    sourceReference: z.string().trim().min(5).max(1_000).optional(),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    issuedAt: z.string().date().optional(),
    expiresAt: z.string().date().optional(),
  })
  .refine(({ fileAssetId, sourceReference }) => Boolean(fileAssetId || sourceReference), {
    message: 'A clean file or source reference is required.',
  });

export const reviewVerificationEvidenceSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REVOKE']),
  notes: z.string().trim().min(10).max(2_000),
  expectedCaseVersion: z.number().int().positive(),
});

export const decideVerificationCaseSchema = z.object({
  toStatus: verificationStatusSchema.exclude(['NOT_SUBMITTED', 'DRAFT']),
  notes: z.string().trim().min(10).max(2_000),
  expectedVersion: z.number().int().positive(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const secondApprovalSchema = z.object({
  approve: z.boolean(),
  notes: z.string().trim().min(10).max(2_000),
  expectedCaseVersion: z.number().int().positive(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const createSiteAuditSchema = z.object({
  expectedCaseVersion: z.number().int().positive(),
  auditorUserId: z.uuid(),
  clinicLocationId: z.uuid(),
  scheduledAt: z.string().datetime({ offset: true }),
  checklist: z.record(z.string().min(1), z.boolean()).default({}),
});

export const completeSiteAuditSchema = z.object({
  expectedCaseVersion: z.number().int().positive(),
  findings: z.string().trim().min(20).max(5_000),
  checklist: z.record(z.string().min(1), z.boolean()),
  attachmentFileAssetIds: z.array(z.uuid()).max(25).default([]),
});

export const createCorrectiveActionSchema = z.object({
  expectedCaseVersion: z.number().int().positive(),
  requirementId: z.uuid().optional(),
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20).max(5_000),
  dueAt: z.string().datetime({ offset: true }),
});

export const respondCorrectiveActionSchema = z.object({
  response: z.string().trim().min(20).max(5_000),
  expectedVersion: z.number().int().positive(),
  expectedCaseVersion: z.number().int().positive(),
  attachmentFileAssetIds: z.array(z.uuid()).max(25).default([]),
});

export const decideCorrectiveActionSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT', 'CLOSE']),
  notes: z.string().trim().min(10).max(2_000),
  expectedVersion: z.number().int().positive(),
  expectedCaseVersion: z.number().int().positive(),
});

export const verificationRequirementTemplateViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  subjectType: verificationSubjectTypeSchema,
  category: verificationEvidenceCategorySchema,
  names: z.record(z.string(), z.string()),
  descriptions: z.record(z.string(), z.string()),
  required: z.boolean(),
  highRisk: z.boolean(),
  validityDays: z.number().int().positive().nullable(),
  version: z.number().int().positive(),
});

export const verificationEvidenceViewSchema = z.object({
  id: z.uuid(),
  requirementId: z.uuid(),
  category: verificationEvidenceCategorySchema,
  fileAssetId: z.uuid().nullable(),
  fileName: z.string().nullable(),
  mediaType: z.string().nullable(),
  sizeBytes: z.string().nullable(),
  fileStatus: z
    .enum(['QUARANTINED', 'SCANNING', 'AVAILABLE', 'REJECTED', 'DELETION_PENDING', 'DELETED'])
    .nullable(),
  scanStatus: z.enum(['PENDING', 'CLEAN', 'INFECTED', 'ERROR']).nullable(),
  sourceReference: z.string().nullable(),
  contentHash: z.string().nullable(),
  issuedAt: z.string().date().nullable(),
  expiresAt: z.string().date().nullable(),
  approvedAt: z.string().datetime({ offset: true }).nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export const verificationRequirementViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  category: verificationEvidenceCategorySchema,
  names: z.record(z.string(), z.string()),
  descriptions: z.record(z.string(), z.string()),
  required: z.boolean(),
  highRisk: z.boolean(),
  validityDays: z.number().int().positive().nullable(),
  templateVersion: z.number().int().positive(),
  status: verificationRequirementStatusSchema,
  evidence: z.array(verificationEvidenceViewSchema),
});

export const verificationReviewViewSchema = z.object({
  id: z.uuid(),
  reviewerUserId: z.uuid(),
  reviewerEmail: z.email(),
  secondApproverUserId: z.uuid().nullable(),
  secondApproverEmail: z.email().nullable(),
  fromStatus: verificationStatusSchema,
  toStatus: verificationStatusSchema,
  status: z.enum(['PENDING_SECOND_APPROVAL', 'APPLIED', 'REJECTED']),
  fourEyesRequired: z.boolean(),
  notes: z.string().nullable(),
  secondApprovalNotes: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  appliedAt: z.string().datetime({ offset: true }).nullable(),
});

export const verificationEvidenceAccessViewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('FILE'),
    downloadUrl: z.url(),
    expiresAt: z.string().datetime({ offset: true }),
    fileName: z.string(),
    mediaType: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('SOURCE'),
    sourceReference: z.string(),
  }),
]);

export const siteAuditViewSchema = z.object({
  id: z.uuid(),
  auditorUserId: z.uuid(),
  clinicLocationId: z.uuid(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'FINDINGS_ISSUED', 'COMPLETED', 'CANCELLED']),
  scheduledAt: z.string().datetime({ offset: true }),
  checklist: z.record(z.string(), z.boolean()),
  findings: z.string().nullable(),
  attachmentFileAssetIds: z.array(z.uuid()),
  completedAt: z.string().datetime({ offset: true }).nullable(),
});

export const correctiveActionViewSchema = z.object({
  id: z.uuid(),
  requirementId: z.uuid().nullable(),
  title: z.string(),
  description: z.string(),
  response: z.string().nullable(),
  status: z.enum(['OPEN', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CLOSED']),
  dueAt: z.string().datetime({ offset: true }),
  version: z.number().int().positive(),
  attachmentFileAssetIds: z.array(z.uuid()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const verificationCaseSummarySchema = z.object({
  id: z.uuid(),
  subjectType: verificationSubjectTypeSchema,
  subjectId: z.uuid(),
  subjectName: z.string(),
  status: verificationStatusSchema,
  riskLevel: verificationRiskLevelSchema,
  assignedReviewerUserId: z.uuid().nullable(),
  version: z.number().int().positive(),
  submittedAt: z.string().datetime({ offset: true }).nullable(),
  decidedAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const verificationCaseDetailSchema = verificationCaseSummarySchema.extend({
  methodologyVersion: z.string(),
  requirements: z.array(verificationRequirementViewSchema),
  reviews: z.array(verificationReviewViewSchema),
  siteAudits: z.array(siteAuditViewSchema),
  correctiveActions: z.array(correctiveActionViewSchema),
});

export type CreateVerificationCase = z.infer<typeof createVerificationCaseSchema>;
export type VerificationCaseListQuery = z.infer<typeof verificationCaseListQuerySchema>;
export type AssignVerificationCase = z.infer<typeof assignVerificationCaseSchema>;
export type SubmitVerificationCase = z.infer<typeof submitVerificationCaseSchema>;
export type AddVerificationEvidence = z.infer<typeof addVerificationEvidenceSchema>;
export type ReviewVerificationEvidence = z.infer<typeof reviewVerificationEvidenceSchema>;
export type DecideVerificationCase = z.infer<typeof decideVerificationCaseSchema>;
export type SecondApproval = z.infer<typeof secondApprovalSchema>;
export type CreateSiteAudit = z.infer<typeof createSiteAuditSchema>;
export type CompleteSiteAudit = z.infer<typeof completeSiteAuditSchema>;
export type CreateCorrectiveAction = z.infer<typeof createCorrectiveActionSchema>;
export type RespondCorrectiveAction = z.infer<typeof respondCorrectiveActionSchema>;
export type DecideCorrectiveAction = z.infer<typeof decideCorrectiveActionSchema>;
export type VerificationCaseSummary = z.infer<typeof verificationCaseSummarySchema>;
export type VerificationCaseDetail = z.infer<typeof verificationCaseDetailSchema>;
export type VerificationRequirementTemplateView = z.infer<
  typeof verificationRequirementTemplateViewSchema
>;
export type VerificationEvidenceView = z.infer<typeof verificationEvidenceViewSchema>;
export type VerificationEvidenceAccessView = z.infer<typeof verificationEvidenceAccessViewSchema>;
export type VerificationRequirementView = z.infer<typeof verificationRequirementViewSchema>;
export type VerificationReviewView = z.infer<typeof verificationReviewViewSchema>;
export type SiteAuditView = z.infer<typeof siteAuditViewSchema>;
export type CorrectiveActionView = z.infer<typeof correctiveActionViewSchema>;
