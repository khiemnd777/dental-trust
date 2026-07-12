import { z } from 'zod';

import { paginationQuerySchema } from './common.js';

const utcInstantSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => value.endsWith('Z'), 'Timestamp must be an explicit UTC instant ending in Z.');
const localDateSchema = z.iso.date();
const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Timezone must be a valid IANA timezone.');
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const uniqueStrings = (maximumItems: number, maximumLength: number) =>
  z
    .array(boundedText(maximumLength))
    .max(maximumItems)
    .refine((values) => new Set(values).size === values.length, 'Values must be unique.');

export const clinicOperationPermissionSchema = z.enum([
  'CASE_INBOX',
  'CASE_ASSIGN_DENTIST',
  'TREATMENT_PLAN',
  'SCHEDULING',
  'CLINICAL_RECORDS',
  'AFTERCARE',
  'INCIDENT_RESPONSE',
  'REVIEW_RESPONSE',
  'ANALYTICS_READ',
]);

export const clinicOrganizationRoleSchema = z.enum(['DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN']);

export const createClinicOrganizationRequestSchema = z.object({
  name: boundedText(160),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  legalEntityName: boundedText(200),
  registrationNumber: boundedText(100),
  registrationCountry: z.string().trim().toUpperCase().length(2),
});

export const clinicBusinessContactSchema = z.object({
  email: z.email().max(254),
  phone: z.string().trim().min(7).max(32),
  website: z.url().max(2_048).optional(),
  contactName: boundedText(160),
});

export const updateClinicProfileRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  legalEntityName: boundedText(200),
  registrationNumber: boundedText(100),
  registrationCountry: z.string().trim().toUpperCase().length(2),
  businessContact: clinicBusinessContactSchema,
  responsibleClinicalLeaderDentistId: z.uuid(),
  aftercarePolicy: z.object({
    responseTargetHours: z.number().int().min(1).max(168),
    emergencyProtocol: boundedText(2_000),
    remoteFollowUpAvailable: z.boolean(),
  }),
});

export const upsertClinicLocationRequestSchema = z.object({
  locationId: z.uuid().optional(),
  name: boundedText(160),
  address: boundedText(500),
  city: boundedText(120),
  district: z.string().trim().max(120).optional(),
  timezone: timeZoneSchema,
  businessContact: clinicBusinessContactSchema,
  active: z.boolean().default(true),
});

export const clinicDeclarationKindSchema = z.enum([
  'EQUIPMENT',
  'SERVICE_CAPABILITY',
  'WARRANTY',
  'AFTERCARE',
]);

export const upsertClinicDeclarationRequestSchema = z.object({
  declarationId: z.uuid().optional(),
  kind: clinicDeclarationKindSchema,
  code: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Z0-9_:-]+$/u),
  name: boundedText(200),
  details: z.record(z.string().max(80), z.union([z.string().max(2_000), z.number(), z.boolean()])),
  active: z.boolean().default(true),
});

export const clinicOnboardingDocumentKindSchema = z.enum([
  'OPERATING_LICENSE',
  'PROFESSIONAL_LICENSE',
  'INSURANCE',
  'EQUIPMENT_CERTIFICATE',
]);

export const addClinicOnboardingDocumentRequestSchema = z.object({
  kind: clinicOnboardingDocumentKindSchema,
  fileAssetId: z.uuid(),
  professionalLicenseId: z.uuid().optional(),
  label: boundedText(160),
});

export const acceptClinicTermsRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  termsVersion: z.string().trim().min(1).max(64),
  accepted: z.literal(true),
});

export const beginPayoutOnboardingRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  returnUrl: z.url().max(2_048),
  refreshUrl: z.url().max(2_048),
});

export const refreshPayoutOnboardingRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const submitClinicOnboardingRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  attestation: z.string().trim().min(20).max(2_000),
});

export const addClinicDentistRequestSchema = z.union([
  z.object({ dentistId: z.uuid() }),
  z.object({
    fullName: boundedText(160),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    licenseNumber: boundedText(100),
    authority: boundedText(200),
    scopeOfPractice: z.string().trim().max(1_000).optional(),
    issuedAt: localDateSchema.optional(),
    expiresAt: localDateSchema.optional(),
  }),
]);

export const updateClinicDentistRequestSchema = z.object({
  active: z.boolean(),
  reason: boundedText(500),
});

export const inviteClinicTeamMemberRequestSchema = z.object({
  email: z.email().max(254),
  role: clinicOrganizationRoleSchema,
  locationIds: z
    .array(z.uuid())
    .max(20)
    .refine((values) => new Set(values).size === values.length),
  permissions: z
    .array(clinicOperationPermissionSchema)
    .max(20)
    .refine((values) => new Set(values).size === values.length),
  jobTitle: z.string().trim().max(160).optional(),
});

export const acceptClinicTeamInvitationRequestSchema = z.object({
  token: z.string().min(32).max(512),
});

export const updateClinicTeamAccessRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  role: clinicOrganizationRoleSchema,
  locationIds: z
    .array(z.uuid())
    .max(20)
    .refine((values) => new Set(values).size === values.length),
  permissions: z
    .array(clinicOperationPermissionSchema)
    .max(20)
    .refine((values) => new Set(values).size === values.length),
  jobTitle: z.string().trim().max(160).nullable().optional(),
});

export const changeClinicTeamStatusRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: boundedText(500),
});

export const clinicOpportunityStatusSchema = z.enum([
  'ASSIGNED',
  'ACCEPTED',
  'DECLINED',
  'ADDITIONAL_RECORDS_REQUESTED',
]);

export const clinicOpportunityQuerySchema = paginationQuerySchema.extend({
  status: clinicOpportunityStatusSchema.optional(),
});

export const decideClinicOpportunityRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    decision: z.enum(['ACCEPT', 'DECLINE', 'REQUEST_RECORDS']),
    reason: z.string().trim().max(2_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision !== 'ACCEPT' && (!value.reason || value.reason.length < 5)) {
      context.addIssue({
        code: 'custom',
        message: 'A bounded reason is required for this decision.',
        path: ['reason'],
      });
    }
  });

export const assignClinicDentistRequestSchema = z.object({ dentistId: z.uuid() });

export const availabilitySlotKindSchema = z.enum(['CONSULTATION', 'TREATMENT', 'BOTH']);
export const availabilityBlockKindSchema = z.enum(['BLOCK', 'TIME_OFF']);

export const upsertAvailabilityRuleRequestSchema = z
  .object({
    ruleId: z.uuid().optional(),
    locationId: z.uuid(),
    dentistId: z.uuid().optional(),
    slotKind: availabilitySlotKindSchema,
    dayOfWeek: z.number().int().min(0).max(6),
    startsAtLocal: localTimeSchema,
    endsAtLocal: localTimeSchema,
    timezone: timeZoneSchema,
    capacity: z.number().int().min(1).max(100),
    procedureDurationMinutes: z.number().int().min(15).max(720),
    effectiveFrom: localDateSchema,
    effectiveUntil: localDateSchema.optional(),
    active: z.boolean().default(true),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.endsAtLocal <= value.startsAtLocal) {
      context.addIssue({
        code: 'custom',
        message: 'End must be after start.',
        path: ['endsAtLocal'],
      });
    }
    if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        message: 'Effective-until must not precede effective-from.',
        path: ['effectiveUntil'],
      });
    }
  });

export const createAvailabilityBlockRequestSchema = z
  .object({
    locationId: z.uuid().optional(),
    dentistId: z.uuid().optional(),
    kind: availabilityBlockKindSchema,
    startsAt: utcInstantSchema,
    endsAt: utcInstantSchema,
    reason: boundedText(500),
  })
  .superRefine((value, context) => {
    if (!value.locationId && !value.dentistId) {
      context.addIssue({
        code: 'custom',
        message: 'A location or dentist scope is required.',
        path: ['locationId'],
      });
    }
    if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      context.addIssue({ code: 'custom', message: 'End must be after start.', path: ['endsAt'] });
    }
  });

export const updateClinicSchedulingPolicyRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  minimumNoticeMinutes: z.number().int().min(0).max(43_200),
  maximumAdvanceDays: z.number().int().min(1).max(730),
  rescheduleCutoffMinutes: z.number().int().min(0).max(43_200),
  cancellationCutoffMinutes: z.number().int().min(0).max(43_200),
  defaultConsultationMinutes: z.number().int().min(15).max(480),
  defaultTreatmentMinutes: z.number().int().min(15).max(720),
  overbookingAllowed: z.boolean(),
});

export const connectClinicCalendarRequestSchema = z.object({
  provider: z.string().trim().min(2).max(80),
  externalCalendarReference: z.string().trim().min(1).max(512),
  dentistId: z.uuid().optional(),
});

export const syncClinicCalendarRequestSchema = z.object({
  expectedStatus: z.enum(['PENDING', 'ACTIVE', 'ERROR']),
});

export const disconnectClinicCalendarRequestSchema = z.object({
  reason: boundedText(500),
});

export const publishClinicServiceRequestSchema = z
  .object({
    clinicServiceId: z.uuid().optional(),
    procedureDefinitionId: z.uuid(),
    displayNames: z.object({ 'vi-VN': boundedText(160), 'en-US': boundedText(160) }),
    includedServices: uniqueStrings(50, 240),
    exclusions: uniqueStrings(50, 500),
    estimatedDurationDays: z.number().int().min(1).max(365),
    warrantyPolicy: z.object({ name: boundedText(160), terms: z.record(z.string(), z.unknown()) }),
    minimumMinor: z.number().int().nonnegative().safe(),
    maximumMinor: z.number().int().nonnegative().safe(),
    currency: z.enum(['VND', 'USD']),
    materialOptions: uniqueStrings(50, 160),
    brandOptions: uniqueStrings(50, 160),
    effectiveAt: utcInstantSchema,
  })
  .refine((value) => value.maximumMinor >= value.minimumMinor, {
    message: 'Maximum price must be greater than or equal to minimum price.',
    path: ['maximumMinor'],
  });

export const archiveClinicServiceRequestSchema = z.object({
  reason: boundedText(500),
});

export const clinicActivityQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(120).optional(),
});

export const clinicOnboardingViewSchema = z.object({
  clinicId: z.uuid(),
  organizationId: z.uuid(),
  clinicName: z.string(),
  slug: z.string(),
  verificationStatus: z.string(),
  version: z.number().int().positive(),
  progressPercent: z.number().int().min(0).max(100),
  missingRequirements: z.array(z.string()),
  legalEntityName: z.string(),
  registrationNumber: z.string().nullable(),
  registrationCountry: z.string().nullable(),
  businessContact: clinicBusinessContactSchema.nullable(),
  responsibleClinicalLeaderDentistId: z.uuid().nullable(),
  aftercarePolicy: z.record(z.string(), z.unknown()).nullable(),
  payoutStatus: z.enum(['NOT_STARTED', 'INCOMPLETE', 'PENDING_REVIEW', 'ACTIVE', 'RESTRICTED']),
  termsVersion: z.string().nullable(),
  termsAcceptedAt: utcInstantSchema.nullable(),
  verificationCaseId: z.uuid().nullable(),
  submittedAt: utcInstantSchema.nullable(),
  locations: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      address: z.string(),
      city: z.string(),
      district: z.string().nullable(),
      timezone: z.string(),
      active: z.boolean(),
      businessContact: clinicBusinessContactSchema.nullable(),
    }),
  ),
  declarations: z.array(
    z.object({
      id: z.uuid(),
      kind: clinicDeclarationKindSchema,
      code: z.string(),
      name: z.string(),
      details: z.record(z.string(), z.unknown()),
      active: z.boolean(),
    }),
  ),
  documents: z.array(
    z.object({
      id: z.uuid(),
      kind: clinicOnboardingDocumentKindSchema,
      fileAssetId: z.uuid(),
      label: z.string(),
      status: z.string(),
      scanStatus: z.string(),
      createdAt: utcInstantSchema,
    }),
  ),
});

export const clinicDentistViewSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  slug: z.string(),
  licenseNumber: z.string(),
  licenseStatus: z.string(),
  active: z.boolean(),
  startedAt: utcInstantSchema,
  endedAt: utcInstantSchema.nullable(),
});

export const clinicTeamMemberViewSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  email: z.email(),
  role: clinicOrganizationRoleSchema,
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED']),
  jobTitle: z.string().nullable(),
  locationIds: z.array(z.uuid()),
  permissions: z.array(clinicOperationPermissionSchema),
  mfaEnabled: z.boolean(),
  version: z.number().int().positive(),
  acceptedAt: utcInstantSchema.nullable(),
});

export const clinicOpportunityViewSchema = z.object({
  caseId: z.uuid(),
  caseNumber: z.string(),
  status: clinicOpportunityStatusSchema,
  caseStatus: z.string(),
  desiredProcedureCode: z.string(),
  preferredLocation: z.string().nullable(),
  expectedArrivalDate: localDateSchema.nullable(),
  expectedDepartureDate: localDateSchema.nullable(),
  preferredCurrency: z.enum(['VND', 'USD']),
  assignedAt: utcInstantSchema,
  respondedAt: utcInstantSchema.nullable(),
  assignedDentistId: z.uuid().nullable(),
  version: z.number().int().nonnegative(),
});

export const availabilityRuleViewSchema = upsertAvailabilityRuleRequestSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
});

export const availabilityBlockViewSchema = z.object({
  id: z.uuid(),
  locationId: z.uuid().nullable(),
  dentistId: z.uuid().nullable(),
  kind: availabilityBlockKindSchema,
  startsAt: utcInstantSchema,
  endsAt: utcInstantSchema,
  reason: z.string(),
  createdAt: utcInstantSchema,
});

export const clinicServiceViewSchema = z.object({
  id: z.uuid(),
  procedureDefinitionId: z.uuid(),
  procedureCode: z.string(),
  displayNames: z.record(z.string(), z.string()),
  active: z.boolean(),
  versions: z.array(
    z.object({
      id: z.uuid(),
      minimumMinor: z.number().safe().nonnegative(),
      maximumMinor: z.number().safe().nonnegative(),
      currency: z.enum(['VND', 'USD']),
      materialOptions: z.array(z.string()),
      brandOptions: z.array(z.string()),
      serviceSnapshot: z.record(z.string(), z.unknown()),
      effectiveAt: utcInstantSchema,
      expiresAt: utcInstantSchema.nullable(),
    }),
  ),
});

export const clinicProcedureCatalogItemViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  names: z.record(z.string(), z.string()),
});

export const clinicServicesWorkspaceViewSchema = z.object({
  services: z.array(clinicServiceViewSchema),
  catalog: z.array(clinicProcedureCatalogItemViewSchema),
});

export const clinicTeamInvitationViewSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: clinicOrganizationRoleSchema,
  permissions: z.array(clinicOperationPermissionSchema),
  jobTitle: z.string().nullable(),
  expiresAt: utcInstantSchema,
  createdAt: utcInstantSchema,
});

export const clinicTeamViewSchema = z.object({
  members: z.array(clinicTeamMemberViewSchema),
  invitations: z.array(clinicTeamInvitationViewSchema),
  activity: z.array(
    z.object({
      id: z.uuid(),
      actorUserId: z.uuid().nullable(),
      action: z.string(),
      resourceType: z.string(),
      resourceId: z.uuid().nullable(),
      success: z.boolean(),
      createdAt: utcInstantSchema,
    }),
  ),
});

export const clinicSchedulingPolicyViewSchema = z.object({
  id: z.uuid(),
  clinicId: z.uuid(),
  minimumNoticeMinutes: z.number().int().nonnegative(),
  maximumAdvanceDays: z.number().int().positive(),
  rescheduleCutoffMinutes: z.number().int().nonnegative(),
  cancellationCutoffMinutes: z.number().int().nonnegative(),
  defaultConsultationMinutes: z.number().int().positive(),
  defaultTreatmentMinutes: z.number().int().positive(),
  overbookingAllowed: z.boolean(),
  version: z.number().int().positive(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
});

export const clinicCalendarConnectionViewSchema = z.object({
  id: z.uuid(),
  dentistId: z.uuid().nullable(),
  provider: z.string(),
  status: z.enum(['PENDING', 'ACTIVE', 'ERROR', 'DISCONNECTED']),
  lastSyncedAt: utcInstantSchema.nullable(),
  lastErrorCode: z.string().nullable(),
});

export const clinicAvailabilityViewSchema = z.object({
  rules: z.array(availabilityRuleViewSchema),
  blocks: z.array(availabilityBlockViewSchema),
  policy: clinicSchedulingPolicyViewSchema.nullable(),
  calendarConnections: z.array(clinicCalendarConnectionViewSchema),
});

export const clinicOverviewViewSchema = z.object({
  clinicId: z.uuid(),
  newCases: z.number().int().nonnegative(),
  activeAppointments: z.number().int().nonnegative(),
  activeTeam: z.number().int().nonnegative(),
  openIncidents: z.number().int().nonnegative(),
  activeServices: z.number().int().nonnegative(),
  onboarding: clinicOnboardingViewSchema.nullable(),
});

const nullableMetricSchema = z.number().finite().nullable();
export const clinicAnalyticsViewSchema = z.object({
  generatedAt: utcInstantSchema,
  periodDays: z.number().int().positive(),
  metrics: z.object({
    newCases: z.number().int().nonnegative(),
    averageResponseHours: nullableMetricSchema,
    averagePlanCompletionHours: nullableMetricSchema,
    consultationConversionRate: nullableMetricSchema,
    bookingConversionRate: nullableMetricSchema,
    treatmentCompletionRate: nullableMetricSchema,
    averageCostVarianceRate: nullableMetricSchema,
    averageScheduleVarianceHours: nullableMetricSchema,
    incidentRate: nullableMetricSchema,
    warrantyRate: nullableMetricSchema,
    verifiedReviewCount: z.number().int().nonnegative(),
    averageVerifiedRating: nullableMetricSchema,
    aftercareResponseSlaRate: nullableMetricSchema,
    nextVerificationExpiry: localDateSchema.nullable(),
  }),
  paymentSummaries: z.array(
    z.object({
      currency: z.enum(['VND', 'USD']),
      count: z.number().int().nonnegative(),
      grossAmountMinor: z.number().safe().nonnegative(),
    }),
  ),
  unavailableMetrics: z.array(z.string()),
});

export const clinicBillingViewSchema = z.object({
  payout: z
    .object({
      provider: z.string().nullable(),
      status: z.enum(['NOT_STARTED', 'INCOMPLETE', 'PENDING_REVIEW', 'ACTIVE', 'RESTRICTED']),
      updatedAt: utcInstantSchema,
    })
    .nullable(),
  payments: z.array(
    z.object({
      currency: z.enum(['VND', 'USD']),
      status: z.string(),
      count: z.number().int().nonnegative(),
      amountMinor: z.number().safe().nonnegative(),
    }),
  ),
});

export type ClinicOperationPermission = z.infer<typeof clinicOperationPermissionSchema>;
export type CreateClinicOrganizationRequest = z.infer<typeof createClinicOrganizationRequestSchema>;
export type UpdateClinicProfileRequest = z.infer<typeof updateClinicProfileRequestSchema>;
export type UpsertClinicLocationRequest = z.infer<typeof upsertClinicLocationRequestSchema>;
export type UpsertClinicDeclarationRequest = z.infer<typeof upsertClinicDeclarationRequestSchema>;
export type AddClinicOnboardingDocumentRequest = z.infer<
  typeof addClinicOnboardingDocumentRequestSchema
>;
export type AcceptClinicTermsRequest = z.infer<typeof acceptClinicTermsRequestSchema>;
export type BeginPayoutOnboardingRequest = z.infer<typeof beginPayoutOnboardingRequestSchema>;
export type RefreshPayoutOnboardingRequest = z.infer<typeof refreshPayoutOnboardingRequestSchema>;
export type SubmitClinicOnboardingRequest = z.infer<typeof submitClinicOnboardingRequestSchema>;
export type AddClinicDentistRequest = z.infer<typeof addClinicDentistRequestSchema>;
export type UpdateClinicDentistRequest = z.infer<typeof updateClinicDentistRequestSchema>;
export type InviteClinicTeamMemberRequest = z.infer<typeof inviteClinicTeamMemberRequestSchema>;
export type AcceptClinicTeamInvitationRequest = z.infer<
  typeof acceptClinicTeamInvitationRequestSchema
>;
export type UpdateClinicTeamAccessRequest = z.infer<typeof updateClinicTeamAccessRequestSchema>;
export type ChangeClinicTeamStatusRequest = z.infer<typeof changeClinicTeamStatusRequestSchema>;
export type ClinicOpportunityQuery = z.infer<typeof clinicOpportunityQuerySchema>;
export type DecideClinicOpportunityRequest = z.infer<typeof decideClinicOpportunityRequestSchema>;
export type AssignClinicDentistRequest = z.infer<typeof assignClinicDentistRequestSchema>;
export type UpsertAvailabilityRuleRequest = z.infer<typeof upsertAvailabilityRuleRequestSchema>;
export type CreateAvailabilityBlockRequest = z.infer<typeof createAvailabilityBlockRequestSchema>;
export type UpdateClinicSchedulingPolicyRequest = z.infer<
  typeof updateClinicSchedulingPolicyRequestSchema
>;
export type ConnectClinicCalendarRequest = z.infer<typeof connectClinicCalendarRequestSchema>;
export type SyncClinicCalendarRequest = z.infer<typeof syncClinicCalendarRequestSchema>;
export type DisconnectClinicCalendarRequest = z.infer<typeof disconnectClinicCalendarRequestSchema>;
export type PublishClinicServiceRequest = z.infer<typeof publishClinicServiceRequestSchema>;
export type ArchiveClinicServiceRequest = z.infer<typeof archiveClinicServiceRequestSchema>;
export type ClinicActivityQuery = z.infer<typeof clinicActivityQuerySchema>;
export type ClinicOnboardingView = z.infer<typeof clinicOnboardingViewSchema>;
export type ClinicDentistView = z.infer<typeof clinicDentistViewSchema>;
export type ClinicTeamMemberView = z.infer<typeof clinicTeamMemberViewSchema>;
export type ClinicOpportunityView = z.infer<typeof clinicOpportunityViewSchema>;
export type AvailabilityRuleView = z.infer<typeof availabilityRuleViewSchema>;
export type AvailabilityBlockView = z.infer<typeof availabilityBlockViewSchema>;
export type ClinicServiceView = z.infer<typeof clinicServiceViewSchema>;
export type ClinicProcedureCatalogItemView = z.infer<typeof clinicProcedureCatalogItemViewSchema>;
export type ClinicServicesWorkspaceView = z.infer<typeof clinicServicesWorkspaceViewSchema>;
export type ClinicTeamInvitationView = z.infer<typeof clinicTeamInvitationViewSchema>;
export type ClinicTeamView = z.infer<typeof clinicTeamViewSchema>;
export type ClinicSchedulingPolicyView = z.infer<typeof clinicSchedulingPolicyViewSchema>;
export type ClinicCalendarConnectionView = z.infer<typeof clinicCalendarConnectionViewSchema>;
export type ClinicAvailabilityView = z.infer<typeof clinicAvailabilityViewSchema>;
export type ClinicOverviewView = z.infer<typeof clinicOverviewViewSchema>;
export type ClinicAnalyticsView = z.infer<typeof clinicAnalyticsViewSchema>;
export type ClinicBillingView = z.infer<typeof clinicBillingViewSchema>;
