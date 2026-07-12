import { z } from 'zod';

import {
  incidentSeverities,
  incidentStatuses,
  incidentTypes,
  reviewFollowUpMilestonesDays,
} from '@dental-trust/domain';

import { paginationQuerySchema } from './common.js';

export const incidentSeveritySchema = z.enum(incidentSeverities);
export const incidentStatusSchema = z.enum(incidentStatuses);
export const incidentTypeSchema = z.enum(incidentTypes);

const incidentNarrativeSchema = z.string().trim().min(20).max(5_000);
const incidentMessageSchema = z.string().trim().min(3).max(2_000);
const incidentReasonSchema = z.string().trim().min(10).max(2_000);

export const createIncidentRequestSchema = z.object({
  caseId: z.uuid(),
  type: incidentTypeSchema,
  reportedSeverity: incidentSeveritySchema,
  summary: z.string().trim().min(10).max(200),
  details: incidentNarrativeSchema,
  attachmentFileAssetIds: z.array(z.uuid()).max(10).default([]),
});

export const createWarrantyClaimRequestSchema = z.object({
  reportedSeverity: incidentSeveritySchema,
  summary: z.string().trim().min(10).max(200),
  details: incidentNarrativeSchema,
  attachmentFileAssetIds: z.array(z.uuid()).max(10).default([]),
});

export const incidentListQuerySchema = paginationQuerySchema.extend({
  caseId: z.uuid().optional(),
  status: incidentStatusSchema.optional(),
});

export const incidentPatientUpdateRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  message: incidentMessageSchema,
});

export const incidentInternalNoteRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  note: incidentReasonSchema,
});

export const incidentClinicResponseRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  message: incidentMessageSchema,
});

export const triageIncidentRequestSchema = z.object({
  severity: incidentSeveritySchema,
  ownerUserId: z.uuid(),
  toStatus: z.enum(['TRIAGED', 'IN_PROGRESS', 'AWAITING_CLINIC']),
  expectedVersion: z.number().int().positive(),
  patientMessage: incidentMessageSchema,
});

export const escalateIncidentRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  severity: z.enum(['HIGH', 'CRITICAL']),
  ownerUserId: z.uuid().optional(),
  reason: incidentReasonSchema,
  patientMessage: incidentMessageSchema,
});

export const proposeIncidentResolutionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  proposal: incidentNarrativeSchema,
  refundId: z.uuid().optional(),
  warrantyClaimId: z.uuid().optional(),
});

export const closeIncidentRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  closureReason: incidentReasonSchema,
  patientMessage: incidentMessageSchema,
});

export const reopenIncidentRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reopenReason: incidentReasonSchema,
  patientMessage: incidentMessageSchema,
});

export const incidentEventViewSchema = z.object({
  id: z.uuid(),
  eventType: z.string(),
  audience: z.enum(['PATIENT_VISIBLE', 'INTERNAL']),
  actorUserId: z.uuid().nullable(),
  message: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});

export const incidentAttachmentViewSchema = z.object({
  fileAssetId: z.uuid(),
  originalFileName: z.string(),
  mediaType: z.string().nullable(),
  sizeBytes: z.string().regex(/^\d+$/u),
});

export const warrantyClaimViewSchema = z.object({
  id: z.uuid(),
  status: z.enum([
    'SUBMITTED',
    'UNDER_REVIEW',
    'ACCEPTED',
    'REJECTED',
    'REMEDIATION_IN_PROGRESS',
    'RESOLVED',
    'CLOSED',
  ]),
  warrantyTerms: z.string(),
  resolution: z.string().nullable(),
});

export const incidentResolutionProposalViewSchema = z.object({
  message: z.string(),
  proposedAt: z.string().datetime({ offset: true }),
  refundId: z.uuid().nullable(),
  warrantyClaimId: z.uuid().nullable(),
});

export const incidentViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  clinicId: z.uuid().nullable(),
  type: incidentTypeSchema,
  severity: incidentSeveritySchema,
  status: incidentStatusSchema,
  summary: z.string(),
  details: z.string(),
  assignedOwnerUserId: z.uuid().nullable(),
  attachments: z.array(incidentAttachmentViewSchema),
  slaDueAt: z.string().datetime({ offset: true }),
  slaBreached: z.boolean(),
  version: z.number().int().positive(),
  closedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  patientUpdates: z.array(incidentEventViewSchema),
  clinicResponses: z.array(incidentEventViewSchema),
  internalNotes: z.array(incidentEventViewSchema),
  escalations: z.array(incidentEventViewSchema),
  auditHistory: z.array(incidentEventViewSchema),
  resolutionProposal: incidentResolutionProposalViewSchema.nullable(),
  closureReason: z.string().nullable(),
  refundId: z.uuid().nullable(),
  warrantyClaim: warrantyClaimViewSchema.nullable(),
  reopenCount: z.number().int().nonnegative(),
});

const dimensionRatingSchema = z.number().int().min(1).max(5);
export const reviewDimensionRatingsSchema = z
  .object({
    communication: dimensionRatingSchema,
    transparency: dimensionRatingSchema,
    cleanlinessEnvironment: dimensionRatingSchema,
    scheduling: dimensionRatingSchema,
    costAccuracy: dimensionRatingSchema,
    treatmentExperience: dimensionRatingSchema,
    aftercare: dimensionRatingSchema,
    overallExperience: dimensionRatingSchema,
  })
  .strict();

export const createVerifiedReviewRequestSchema = z
  .object({
    caseId: z.uuid(),
    dimensionRatings: reviewDimensionRatingsSchema,
    content: z.string().trim().min(20).max(5_000),
    patientApprovedMediaFileAssetIds: z.array(z.uuid()).max(10).default([]),
    patientMediaConsentConfirmed: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.patientApprovedMediaFileAssetIds.length > 0 && !value.patientMediaConsentConfirmed) {
      context.addIssue({
        code: 'custom',
        message: 'Patient media consent is required for review media.',
        path: ['patientMediaConsentConfirmed'],
      });
    }
  });

export const reviewFollowUpMilestoneSchema = z.union(
  reviewFollowUpMilestonesDays.map((days) => z.literal(days)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ],
);

export const createReviewFollowUpRequestSchema = z.object({
  milestoneDays: reviewFollowUpMilestoneSchema,
  overallRating: dimensionRatingSchema,
  content: z.string().trim().min(20).max(5_000),
});

export const createClinicReviewResponseRequestSchema = z.object({
  content: z.string().trim().min(10).max(3_000),
});

export const reportReviewAbuseRequestSchema = z.object({
  reasonCode: z.enum(['PERSONAL_DATA', 'HARASSMENT', 'FALSE_INFORMATION', 'CONFLICT', 'OTHER']),
  details: z.string().trim().min(10).max(2_000),
});

const moderationDecisionSchema = z.object({
  status: z.enum(['PUBLISHED', 'HIDDEN', 'REJECTED']),
  reason: z.string().trim().min(10).max(1_000),
});

export const moderateReviewRequestSchema = z.discriminatedUnion('target', [
  moderationDecisionSchema.extend({ target: z.literal('REVIEW') }),
  moderationDecisionSchema.extend({ target: z.literal('CLINIC_RESPONSE') }),
  moderationDecisionSchema.extend({ target: z.literal('FOLLOW_UP'), followUpId: z.uuid() }),
]);

export const reviewListQuerySchema = paginationQuerySchema.extend({
  clinicId: z.uuid().optional(),
  caseId: z.uuid().optional(),
  moderationStatus: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED']).optional(),
});

export const reviewReportStatusSchema = z.enum(['OPEN', 'UNDER_REVIEW', 'ACTIONED', 'DISMISSED']);
export const reviewAbuseReportListQuerySchema = paginationQuerySchema.extend({
  status: reviewReportStatusSchema.optional(),
});

export const decideReviewAbuseReportRequestSchema = z.object({
  status: z.enum(['ACTIONED', 'DISMISSED']),
  reason: z.string().trim().min(10).max(1_000),
});

export const reviewAbuseReportViewSchema = z.object({
  id: z.uuid(),
  reviewId: z.uuid(),
  reasonCode: z.enum(['PERSONAL_DATA', 'HARASSMENT', 'FALSE_INFORMATION', 'CONFLICT', 'OTHER']),
  details: z.string(),
  status: reviewReportStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const reviewMediaViewSchema = z.object({
  fileAssetId: z.uuid(),
  originalFileName: z.string(),
  mediaType: z.string().nullable(),
  approvedByPatientAt: z.string().datetime({ offset: true }),
});

export const reviewFollowUpViewSchema = z.object({
  id: z.uuid(),
  milestoneDays: reviewFollowUpMilestoneSchema,
  followUpDurationDays: z.number().int().nonnegative(),
  overallRating: dimensionRatingSchema,
  content: z.string(),
  reviewDate: z.string().date(),
  moderationStatus: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED']),
  createdAt: z.string().datetime({ offset: true }),
});

export const reviewViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  clinicId: z.uuid(),
  procedureCategory: z.string(),
  overallRating: dimensionRatingSchema,
  dimensionRatings: reviewDimensionRatingsSchema,
  content: z.string(),
  treatmentDate: z.string().date(),
  reviewDate: z.string().date(),
  followUpDurationDays: z.number().int().nonnegative(),
  verificationStatus: z.literal('VERIFIED_PLATFORM_TREATMENT'),
  moderationStatus: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED']),
  createdAt: z.string().datetime({ offset: true }),
  patientApprovedMedia: z.array(reviewMediaViewSchema),
  followUps: z.array(reviewFollowUpViewSchema),
  clinicResponse: z
    .object({
      id: z.uuid(),
      content: z.string(),
      moderationStatus: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED']),
      createdAt: z.string().datetime({ offset: true }),
    })
    .nullable(),
});

export type CreateIncidentRequest = z.infer<typeof createIncidentRequestSchema>;
export type CreateWarrantyClaimRequest = z.infer<typeof createWarrantyClaimRequestSchema>;
export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;
export type IncidentPatientUpdateRequest = z.infer<typeof incidentPatientUpdateRequestSchema>;
export type IncidentInternalNoteRequest = z.infer<typeof incidentInternalNoteRequestSchema>;
export type IncidentClinicResponseRequest = z.infer<typeof incidentClinicResponseRequestSchema>;
export type TriageIncidentRequest = z.infer<typeof triageIncidentRequestSchema>;
export type EscalateIncidentRequest = z.infer<typeof escalateIncidentRequestSchema>;
export type ProposeIncidentResolutionRequest = z.infer<
  typeof proposeIncidentResolutionRequestSchema
>;
export type CloseIncidentRequest = z.infer<typeof closeIncidentRequestSchema>;
export type ReopenIncidentRequest = z.infer<typeof reopenIncidentRequestSchema>;
export type IncidentView = z.infer<typeof incidentViewSchema>;
export type CreateVerifiedReviewRequest = z.infer<typeof createVerifiedReviewRequestSchema>;
export type CreateReviewFollowUpRequest = z.infer<typeof createReviewFollowUpRequestSchema>;
export type CreateClinicReviewResponseRequest = z.infer<
  typeof createClinicReviewResponseRequestSchema
>;
export type ReportReviewAbuseRequest = z.infer<typeof reportReviewAbuseRequestSchema>;
export type ModerateReviewRequest = z.infer<typeof moderateReviewRequestSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type ReviewAbuseReportListQuery = z.infer<typeof reviewAbuseReportListQuerySchema>;
export type DecideReviewAbuseReportRequest = z.infer<typeof decideReviewAbuseReportRequestSchema>;
export type ReviewAbuseReportView = z.infer<typeof reviewAbuseReportViewSchema>;
export type ReviewView = z.infer<typeof reviewViewSchema>;
