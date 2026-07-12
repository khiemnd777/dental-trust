import { z } from 'zod';

import {
  incidentSeverities,
  incidentStatuses,
  privacyRequestStatuses,
  supportCapabilities,
} from '@dental-trust/domain/trust-safety';
import {
  privacyDataCategories,
  privacyDispositionActions,
  privacyExecutionBlockerCodes,
  privacyExecutionOutcomes,
  privacyExecutionStatuses,
  privacyIdentityVerificationMethods,
  privacyLegalHoldScopes,
} from '@dental-trust/domain/privacy-execution';

import { paginationQuerySchema } from './common.js';

export const incidentSeveritySchema = z.enum(incidentSeverities);
export const incidentStatusSchema = z.enum(incidentStatuses);
export const incidentTypeSchema = z.enum([
  'CLINICAL_CONCERN',
  'SERVICE_COMPLAINT',
  'BILLING_DISPUTE',
  'SAFETY_CONCERN',
  'OTHER',
]);

const incidentNarrativeSchema = z.string().trim().min(20).max(5_000);

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
  message: z.string().trim().min(3).max(2_000),
});

export const triageIncidentRequestSchema = z.object({
  severity: incidentSeveritySchema,
  ownerUserId: z.uuid(),
  toStatus: z.enum(['TRIAGED', 'IN_PROGRESS', 'AWAITING_CLINIC']),
  expectedVersion: z.number().int().positive(),
  patientMessage: z.string().trim().min(3).max(2_000),
});

export const closeIncidentRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  patientMessage: z.string().trim().min(3).max(2_000),
});

export const reopenIncidentRequestSchema = closeIncidentRequestSchema;

export const incidentUpdateViewSchema = z.object({
  id: z.uuid(),
  eventType: z.string(),
  message: z.string(),
  createdAt: z.string().datetime({ offset: true }),
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

export const incidentViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  clinicId: z.uuid().nullable(),
  type: z.string(),
  severity: incidentSeveritySchema,
  status: incidentStatusSchema,
  summary: z.string(),
  details: z.string(),
  ownerAssigned: z.boolean(),
  slaDueAt: z.string().datetime({ offset: true }),
  version: z.number().int().positive(),
  closedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  updates: z.array(incidentUpdateViewSchema),
  warrantyClaim: warrantyClaimViewSchema.nullable(),
});

const dimensionRatingSchema = z.number().int().min(1).max(5);
export const createVerifiedReviewRequestSchema = z.object({
  caseId: z.uuid(),
  overallRating: dimensionRatingSchema,
  dimensionRatings: z.object({
    clinicalOutcome: dimensionRatingSchema,
    communication: dimensionRatingSchema,
    facilities: dimensionRatingSchema,
    value: dimensionRatingSchema,
    aftercare: dimensionRatingSchema,
  }),
  content: z.string().trim().min(20).max(5_000),
});

export const createClinicReviewResponseRequestSchema = z.object({
  content: z.string().trim().min(10).max(3_000),
});

export const reportReviewAbuseRequestSchema = z.object({
  reasonCode: z.enum(['PERSONAL_DATA', 'HARASSMENT', 'FALSE_INFORMATION', 'CONFLICT', 'OTHER']),
  details: z.string().trim().min(10).max(2_000),
});

export const moderateReviewRequestSchema = z.object({
  target: z.enum(['REVIEW', 'CLINIC_RESPONSE']).default('REVIEW'),
  status: z.enum(['PUBLISHED', 'HIDDEN', 'REJECTED']),
  reason: z.string().trim().min(10).max(1_000),
});

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

export const reviewViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  clinicId: z.uuid(),
  overallRating: dimensionRatingSchema,
  dimensionRatings: z.record(z.string(), dimensionRatingSchema),
  content: z.string(),
  treatmentDate: z.string().date(),
  followUpDays: z.number().int().nonnegative(),
  verified: z.boolean(),
  moderationStatus: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED']),
  createdAt: z.string().datetime({ offset: true }),
  clinicResponse: z
    .object({
      id: z.uuid(),
      content: z.string(),
      moderationStatus: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED']),
      createdAt: z.string().datetime({ offset: true }),
    })
    .nullable(),
});

export const privacyRequestTypeSchema = z.enum(['EXPORT', 'DELETE']);
export const privacyRequestStatusSchema = z.enum(privacyRequestStatuses);
export const createPrivacyRequestSchema = z.object({
  type: privacyRequestTypeSchema,
  reason: z.string().trim().min(10).max(2_000),
});

export const privacyRequestListQuerySchema = paginationQuerySchema.extend({
  queue: z.coerce.boolean().default(false),
  status: privacyRequestStatusSchema.optional(),
});

export const processPrivacyRequestSchema = z
  .object({
    toStatus: privacyRequestStatusSchema.exclude(['SUBMITTED', 'PROCESSING', 'COMPLETED']),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(12).max(1_000),
    patientMessage: z.string().trim().min(10).max(2_000),
    confirmation: z.literal('PROCESS PRIVACY REQUEST'),
    verification: z
      .object({
        method: z.enum(privacyIdentityVerificationMethods),
        reference: z.string().trim().min(8).max(500),
        verifiedAt: z.string().datetime({ offset: true }),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    if (input.toStatus === 'APPROVED' && !input.verification) {
      context.addIssue({
        code: 'custom',
        message: 'Approval requires structured identity verification evidence',
        path: ['verification'],
      });
    }
    if (input.toStatus !== 'APPROVED' && input.verification) {
      context.addIssue({
        code: 'custom',
        message: 'Identity verification evidence is accepted only for approval',
        path: ['verification'],
      });
    }
  });

export const privacyExecutionStatusSchema = z.enum(privacyExecutionStatuses);
export const privacyExecutionOutcomeSchema = z.enum(privacyExecutionOutcomes);
export const privacyDataCategorySchema = z.enum(privacyDataCategories);
export const privacyDispositionActionSchema = z.enum(privacyDispositionActions);
export const privacyExecutionBlockerCodeSchema = z.enum(privacyExecutionBlockerCodes);
export const privacyIdentityVerificationMethodSchema = z.enum(privacyIdentityVerificationMethods);
export const privacyLegalHoldScopeSchema = z.enum(privacyLegalHoldScopes);

export const privacyCategoryDispositionSchema = z.object({
  category: privacyDataCategorySchema,
  action: privacyDispositionActionSchema,
  reasonCode: z.string().trim().min(1).max(120),
  recordCount: z.number().int().nonnegative(),
});

export const privacyExecutionViewSchema = z.object({
  id: z.uuid(),
  status: privacyExecutionStatusSchema,
  outcome: privacyExecutionOutcomeSchema.nullable(),
  identityVerificationMethod: privacyIdentityVerificationMethodSchema,
  verifiedAt: z.string().datetime({ offset: true }),
  noticeStatus: z.enum(['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SUPPRESSED']).nullable(),
  attemptCount: z.number().int().nonnegative(),
  lastErrorCode: z.string().nullable(),
  version: z.number().int().positive(),
  blockerCodes: z.array(privacyExecutionBlockerCodeSchema),
  categoryDisposition: z.array(privacyCategoryDispositionSchema),
  artifact: z
    .object({
      available: z.boolean(),
      expiresAt: z.string().datetime({ offset: true }),
      purgedAt: z.string().datetime({ offset: true }).nullable(),
      archiveChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      manifestChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      sizeBytes: z.string().regex(/^\d+$/u),
      recordCount: z.number().int().nonnegative(),
    })
    .nullable(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
});

export const privacyRequestViewSchema = z.object({
  id: z.uuid(),
  type: privacyRequestTypeSchema,
  status: privacyRequestStatusSchema,
  reason: z.string().nullable(),
  patientMessage: z.string().nullable(),
  dueAt: z.string().datetime({ offset: true }),
  version: z.number().int().positive(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  execution: privacyExecutionViewSchema.nullable(),
  activeLegalHoldScopes: z.array(privacyLegalHoldScopeSchema),
});

export const retryPrivacyExecutionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(12).max(1_000),
  confirmation: z.literal('RETRY PRIVACY EXECUTION'),
});

export const privacyExportDownloadViewSchema = z.object({
  downloadUrl: z.url(),
  expiresAt: z.string().datetime({ offset: true }),
  archiveChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  manifestChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const privacyLegalHoldListQuerySchema = paginationQuerySchema.extend({
  subjectUserId: z.uuid(),
  activeOnly: z.coerce.boolean().default(true),
});

export const createPrivacyLegalHoldRequestSchema = z
  .object({
    subjectUserId: z.uuid(),
    scopes: z.array(privacyLegalHoldScopeSchema).min(1).max(privacyLegalHoldScopes.length),
    reason: z.string().trim().min(20).max(2_000),
    authorityReference: z.string().trim().min(8).max(500),
    startsAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    confirmation: z.literal('PLACE PRIVACY LEGAL HOLD'),
  })
  .superRefine((input, context) => {
    if (input.expiresAt && new Date(input.expiresAt) <= new Date(input.startsAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Legal hold expiry must follow its start time',
        path: ['expiresAt'],
      });
    }
  });

export const releasePrivacyLegalHoldRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(12).max(1_000),
  confirmation: z.literal('RELEASE PRIVACY LEGAL HOLD'),
});

export const privacyLegalHoldViewSchema = z.object({
  id: z.uuid(),
  subjectUserId: z.uuid(),
  scopes: z.array(privacyLegalHoldScopeSchema),
  reason: z.string(),
  authorityReference: z.string(),
  startsAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  releasedAt: z.string().datetime({ offset: true }).nullable(),
  version: z.number().int().positive(),
  active: z.boolean(),
});

export const supportCapabilitySchema = z.enum(supportCapabilities);
export const createSupportElevationRequestSchema = z.object({
  actorUserId: z.uuid(),
  subjectUserId: z.uuid(),
  ticketReference: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(20).max(1_000),
  expiresInMinutes: z.number().int().min(5).max(120),
  capabilities: z.array(supportCapabilitySchema).min(1).max(supportCapabilities.length),
});

export const revokeSupportElevationRequestSchema = z.object({
  reason: z.string().trim().min(10).max(1_000),
});

export const supportElevationViewSchema = z.object({
  id: z.uuid(),
  actorUserId: z.uuid(),
  subjectUserId: z.uuid(),
  approvedByUserId: z.uuid(),
  ticketReference: z.string(),
  reason: z.string(),
  capabilities: z.array(supportCapabilitySchema),
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
  expiresAt: z.string().datetime({ offset: true }),
  lastUsedAt: z.string().datetime({ offset: true }).nullable(),
  useCount: z.number().int().nonnegative(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export type CreateIncidentRequest = z.infer<typeof createIncidentRequestSchema>;
export type CreateWarrantyClaimRequest = z.infer<typeof createWarrantyClaimRequestSchema>;
export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;
export type IncidentPatientUpdateRequest = z.infer<typeof incidentPatientUpdateRequestSchema>;
export type TriageIncidentRequest = z.infer<typeof triageIncidentRequestSchema>;
export type CloseIncidentRequest = z.infer<typeof closeIncidentRequestSchema>;
export type ReopenIncidentRequest = z.infer<typeof reopenIncidentRequestSchema>;
export type IncidentView = z.infer<typeof incidentViewSchema>;
export type CreateVerifiedReviewRequest = z.infer<typeof createVerifiedReviewRequestSchema>;
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
export type CreatePrivacyRequest = z.infer<typeof createPrivacyRequestSchema>;
export type PrivacyRequestListQuery = z.infer<typeof privacyRequestListQuerySchema>;
export type ProcessPrivacyRequest = z.infer<typeof processPrivacyRequestSchema>;
export type PrivacyRequestView = z.infer<typeof privacyRequestViewSchema>;
export type PrivacyExecutionView = z.infer<typeof privacyExecutionViewSchema>;
export type PrivacyCategoryDisposition = z.infer<typeof privacyCategoryDispositionSchema>;
export type RetryPrivacyExecutionRequest = z.infer<typeof retryPrivacyExecutionRequestSchema>;
export type PrivacyExportDownloadView = z.infer<typeof privacyExportDownloadViewSchema>;
export type PrivacyLegalHoldListQuery = z.infer<typeof privacyLegalHoldListQuerySchema>;
export type CreatePrivacyLegalHoldRequest = z.infer<typeof createPrivacyLegalHoldRequestSchema>;
export type ReleasePrivacyLegalHoldRequest = z.infer<typeof releasePrivacyLegalHoldRequestSchema>;
export type PrivacyLegalHoldView = z.infer<typeof privacyLegalHoldViewSchema>;
export type CreateSupportElevationRequest = z.infer<typeof createSupportElevationRequestSchema>;
export type RevokeSupportElevationRequest = z.infer<typeof revokeSupportElevationRequestSchema>;
export type SupportElevationView = z.infer<typeof supportElevationViewSchema>;
