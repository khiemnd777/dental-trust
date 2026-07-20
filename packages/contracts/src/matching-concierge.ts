import { z } from 'zod';

import { paginationQuerySchema } from './common.js';

const dateSchema = z.string().date();
const uuidSchema = z.uuid();
const shortText = z.string().trim().min(1).max(500);
const clinicalFreeText = z.string().trim().min(1).max(5_000);
const stringList = z.array(z.string().trim().min(1).max(120)).max(50).default([]);
const booleanQuerySchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);
const latitudeQuerySchema = z.coerce.number().finite().min(-90).max(90);
const longitudeQuerySchema = z.coerce.number().finite().min(-180).max(180);

export const caseComplexityCategorySchema = z.enum(['UNKNOWN', 'STANDARD', 'COMPLEX']);
export const conciergePrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const conciergeWorkStatusSchema = z.enum([
  'UNASSIGNED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_PATIENT',
  'WAITING_CLINIC',
  'SUPERVISOR_REVIEW',
  'HANDED_OFF',
  'RESOLVED',
]);
export const conciergeTaskKindSchema = z.enum([
  'MISSING_DOCUMENT',
  'MATCHING',
  'APPOINTMENT',
  'TRAVEL',
  'AFTERCARE',
  'INCIDENT',
  'FOLLOW_UP',
  'OTHER',
]);
export const conciergeTaskStatusSchema = z.enum([
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'CANCELLED',
]);

export const clinicDiscoveryQuerySchema = paginationQuerySchema
  .extend({
    cursor: uuidSchema.optional(),
    locale: z.enum(['vi-VN', 'en-US']).default('vi-VN'),
    city: z.string().trim().min(1).max(120).optional(),
    district: z.string().trim().min(1).max(120).optional(),
    procedureCode: z.string().trim().min(1).max(80).optional(),
    dentistSpecialization: z.string().trim().min(1).max(240).optional(),
    language: z.string().trim().min(1).max(80).optional(),
    consultationAvailableBy: dateSchema.optional(),
    minimumPriceMinor: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    maximumPriceMinor: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    currency: z.enum(['VND', 'USD']).optional(),
    equipment: z.string().trim().min(1).max(120).optional(),
    aftercareSupport: booleanQuerySchema.optional(),
    warrantyAvailable: booleanQuerySchema.optional(),
    accessibility: z.string().trim().min(1).max(120).optional(),
    minimumRating: z.coerce.number().min(1).max(5).optional(),
    followUpDataAvailable: booleanQuerySchema.optional(),
    west: longitudeQuerySchema.optional(),
    south: latitudeQuerySchema.optional(),
    east: longitudeQuerySchema.optional(),
    north: latitudeQuerySchema.optional(),
  })
  .refine(
    ({ minimumPriceMinor, maximumPriceMinor }) =>
      minimumPriceMinor === undefined ||
      maximumPriceMinor === undefined ||
      maximumPriceMinor >= minimumPriceMinor,
    { path: ['maximumPriceMinor'], message: 'Maximum price must not be below minimum price.' },
  )
  .refine(
    ({ west, south, east, north }) =>
      [west, south, east, north].every((value) => value === undefined) ||
      [west, south, east, north].every((value) => value !== undefined),
    { path: ['west'], message: 'Map bounds must include west, south, east, and north.' },
  )
  .refine(({ west, east }) => west === undefined || east === undefined || east > west, {
    path: ['east'],
    message: 'East longitude must be greater than west longitude.',
  })
  .refine(({ south, north }) => south === undefined || north === undefined || north > south, {
    path: ['north'],
    message: 'North latitude must be greater than south latitude.',
  });

export const matchingCriteriaRequestSchema = z
  .object({
    procedureCode: z.string().trim().min(1).max(80),
    preferredCity: z.string().trim().min(1).max(120).optional(),
    preferredDistrict: z.string().trim().min(1).max(120).optional(),
    arrivalDate: dateSchema.optional(),
    departureDate: dateSchema.optional(),
    preferredLanguages: stringList,
    budgetMinimumMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    budgetMaximumMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    budgetCurrency: z.enum(['VND', 'USD']).optional(),
    complexityCategory: caseComplexityCategorySchema.default('UNKNOWN'),
    requiresAftercare: z.boolean().default(false),
    requiresWarranty: z.boolean().default(false),
    accessibilityNeeds: stringList,
    preferredEquipment: stringList,
    preferences: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  })
  .superRefine((value, context) => {
    if (value.arrivalDate && value.departureDate && value.departureDate < value.arrivalDate) {
      context.addIssue({
        code: 'custom',
        path: ['departureDate'],
        message: 'Departure must follow arrival.',
      });
    }
    if (
      value.budgetMinimumMinor !== undefined &&
      value.budgetMaximumMinor !== undefined &&
      value.budgetMaximumMinor < value.budgetMinimumMinor
    ) {
      context.addIssue({
        code: 'custom',
        path: ['budgetMaximumMinor'],
        message: 'Invalid budget range.',
      });
    }
    if (
      (value.budgetMinimumMinor !== undefined || value.budgetMaximumMinor !== undefined) &&
      !value.budgetCurrency
    ) {
      context.addIssue({
        code: 'custom',
        path: ['budgetCurrency'],
        message: 'Budget currency is required.',
      });
    }
  });

export const calculateMatchesRequestSchema = z.object({
  criteriaVersionId: uuidSchema,
});

export const saveClinicRequestSchema = z.object({ clinicId: uuidSchema });

export const shortlistRecommendationRequestSchema = z.object({
  expectedWorkspaceVersion: z.number().int().positive(),
  shareWithPatient: z.boolean().default(false),
  recommendations: z
    .array(
      z.object({
        matchingResultId: uuidSchema,
        displayedRank: z.number().int().min(1).max(25),
        overrideReason: z.string().trim().min(10).max(2_000).optional(),
      }),
    )
    .min(1)
    .max(10)
    .superRefine((recommendations, context) => {
      const ranks = new Set<number>();
      const resultIds = new Set<string>();
      for (const [index, recommendation] of recommendations.entries()) {
        if (ranks.has(recommendation.displayedRank)) {
          context.addIssue({
            code: 'custom',
            path: [index, 'displayedRank'],
            message: 'Displayed ranks must be unique.',
          });
        }
        ranks.add(recommendation.displayedRank);
        if (resultIds.has(recommendation.matchingResultId)) {
          context.addIssue({
            code: 'custom',
            path: [index, 'matchingResultId'],
            message: 'A matching result can appear only once.',
          });
        }
        resultIds.add(recommendation.matchingResultId);
      }
    }),
});

export const shortlistInterestRequestSchema = z.object({ interested: z.boolean() });

export const introductionRequestSchema = z.object({
  consentTextVersionId: uuidSchema,
  consentGranted: z.literal(true),
  patientNote: z.string().trim().max(2_000).optional(),
});

export const conciergeQueueQuerySchema = paginationQuerySchema.extend({
  cursor: uuidSchema.optional(),
  priority: conciergePrioritySchema.optional(),
  status: conciergeWorkStatusSchema.optional(),
  assignment: z.enum(['MINE', 'UNASSIGNED', 'ALL']).default('MINE'),
  sla: z.enum(['OVERDUE', 'DUE_SOON', 'ON_TRACK']).optional(),
});

export const conciergeWorkspaceUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  priority: conciergePrioritySchema,
  priorityChangeReason: z
    .enum([
      'CLINICAL_RISK',
      'TRAVEL_DEADLINE',
      'MISSING_DOCUMENT',
      'PATIENT_REQUEST',
      'CLINIC_DEPENDENCY',
      'SUPERVISOR_DECISION',
    ])
    .optional(),
  status: conciergeWorkStatusSchema,
  patientSummary: clinicalFreeText,
  missingDocumentCategories: stringList,
});

export const conciergeAssignmentRequestSchema = z.object({
  assignedAgentUserId: uuidSchema,
  supervisorUserId: uuidSchema.optional(),
  priority: conciergePrioritySchema,
  expectedVersion: z.number().int().nonnegative(),
});

export const conciergeHandoffRequestSchema = z.object({
  toAgentUserId: uuidSchema,
  reason: z.string().trim().min(10).max(2_000),
  expectedVersion: z.number().int().positive(),
});

export const conciergeHandoffAcceptRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const conciergeSupervisorReviewRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  note: z.string().trim().min(3).max(5_000),
  expectedVersion: z.number().int().positive(),
});

export const conciergeInternalNoteRequestSchema = z.object({ body: clinicalFreeText });
export const conciergeTravelNoteRequestSchema = z.object({ body: clinicalFreeText });
export const conciergeCommunicationRequestSchema = z.object({
  channel: z.enum(['PHONE', 'EMAIL', 'MESSAGE', 'VIDEO', 'IN_PERSON', 'SYSTEM']),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']),
  occurredAt: z.string().datetime({ offset: true }),
  summary: clinicalFreeText,
});

export const conciergeTaskRequestSchema = z.object({
  kind: conciergeTaskKindSchema,
  title: shortText,
  details: z.string().trim().max(5_000).optional(),
  assignedUserId: uuidSchema.optional(),
  dueAt: z.string().datetime({ offset: true }),
});

export const conciergeTaskTransitionRequestSchema = z.object({
  status: conciergeTaskStatusSchema,
  expectedVersion: z.number().int().positive(),
});

export const organicMatchViewSchema = z.object({
  id: uuidSchema,
  clinicId: uuidSchema,
  clinicName: z.string(),
  clinicSlug: z.string(),
  organicRank: z.number().int().positive(),
  fitScore: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  limitations: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  algorithmVersion: z.string(),
  calculatedAt: z.string().datetime({ offset: true }),
});

export const shortlistEntryViewSchema = z.object({
  id: uuidSchema,
  clinicId: uuidSchema,
  clinicName: z.string(),
  clinicSlug: z.string(),
  fitScore: z.number().int().min(0).max(100),
  organicRank: z.number().int().positive(),
  displayedRank: z.number().int().positive(),
  overrideReason: z.string().nullable(),
  status: z.enum([
    'PROPOSED',
    'SHARED',
    'INTERESTED',
    'INTRO_REQUESTED',
    'INTRODUCED',
    'DECLINED',
    'REMOVED',
  ]),
  reasons: z.array(z.string()),
  limitations: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  patientInterestedAt: z.string().datetime({ offset: true }).nullable(),
});

export type ClinicDiscoveryQuery = z.infer<typeof clinicDiscoveryQuerySchema>;
export type MatchingCriteriaRequest = z.infer<typeof matchingCriteriaRequestSchema>;
export type CalculateMatchesRequest = z.infer<typeof calculateMatchesRequestSchema>;
export type SaveClinicRequest = z.infer<typeof saveClinicRequestSchema>;
export type ShortlistRecommendationRequest = z.infer<typeof shortlistRecommendationRequestSchema>;
export type ShortlistInterestRequest = z.infer<typeof shortlistInterestRequestSchema>;
export type IntroductionRequest = z.infer<typeof introductionRequestSchema>;
export type ConciergeQueueQuery = z.infer<typeof conciergeQueueQuerySchema>;
export type ConciergeWorkspaceUpdate = z.infer<typeof conciergeWorkspaceUpdateSchema>;
export type ConciergeAssignmentRequest = z.infer<typeof conciergeAssignmentRequestSchema>;
export type ConciergeHandoffRequest = z.infer<typeof conciergeHandoffRequestSchema>;
export type ConciergeHandoffAcceptRequest = z.infer<typeof conciergeHandoffAcceptRequestSchema>;
export type ConciergeSupervisorReviewRequest = z.infer<
  typeof conciergeSupervisorReviewRequestSchema
>;
export type ConciergeInternalNoteRequest = z.infer<typeof conciergeInternalNoteRequestSchema>;
export type ConciergeTravelNoteRequest = z.infer<typeof conciergeTravelNoteRequestSchema>;
export type ConciergeCommunicationRequest = z.infer<typeof conciergeCommunicationRequestSchema>;
export type ConciergeTaskRequest = z.infer<typeof conciergeTaskRequestSchema>;
export type ConciergeTaskTransitionRequest = z.infer<typeof conciergeTaskTransitionRequestSchema>;
export type OrganicMatchView = z.infer<typeof organicMatchViewSchema>;
export type ShortlistEntryView = z.infer<typeof shortlistEntryViewSchema>;
