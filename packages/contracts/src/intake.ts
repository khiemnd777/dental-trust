import { z } from 'zod';

import { paginationQuerySchema } from './common.js';

const uuidSchema = z.uuid();
const dateSchema = z.string().date();
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Z0-9_-]+$/u);
const codeListSchema = z
  .array(codeSchema)
  .max(50)
  .refine((items) => new Set(items).size === items.length, 'Values must be unique.');

export const patientProfileUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  preferredLocale: z.enum(['vi-VN', 'en-US']),
  preferredCurrency: z.enum(['VND', 'USD']),
  currentCountry: z.string().trim().min(2).max(120),
  currentCity: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(100),
  identity: z.object({
    fullName: z.string().trim().min(2).max(160),
    dateOfBirth: dateSchema,
    pronouns: z.string().trim().min(1).max(80).optional(),
  }),
  contact: z.object({
    phoneE164: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/u),
  }),
  preferences: z.object({
    contactChannel: z.enum(['EMAIL', 'PHONE', 'MESSAGE']),
    travelCoordination: z.boolean(),
    appointmentReminders: z.boolean(),
  }),
});

export const emergencyContactUpdateSchema = z.object({
  contactId: uuidSchema.optional(),
  expectedVersion: z.number().int().nonnegative(),
  name: z.string().trim().min(2).max(160),
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/u),
  relationship: z.string().trim().min(2).max(100),
});

export const consultationTimeSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    timezone: z.string().trim().min(1).max(100),
  })
  .refine(({ start, end }) => start < end, {
    path: ['end'],
    message: 'Consultation end time must be after start time.',
  });

export const intakeMedicalConditionSchema = z.object({
  code: codeSchema,
  details: z.string().trim().max(2_000).optional(),
});
export const intakeMedicationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(200).optional(),
});
export const intakeAllergySchema = z.object({
  substance: z.string().trim().min(1).max(200),
  reaction: z.string().trim().max(500).optional(),
});

const intakeFields = {
  desiredProcedureCode: z.string().trim().min(1).max(100).optional(),
  dentalConcerns: codeListSchema.optional(),
  existingDiagnosis: z.string().trim().max(5_000).optional(),
  treatmentGoals: codeListSchema.optional(),
  cosmeticExpectations: z.string().trim().max(5_000).optional(),
  currentCountry: z.string().trim().min(2).max(120).optional(),
  currentCity: z.string().trim().min(1).max(120).optional(),
  expectedArrivalDate: dateSchema.optional(),
  expectedDepartureDate: dateSchema.optional(),
  preferredLocation: z.string().trim().min(1).max(120).optional(),
  availableTreatmentDays: z.number().int().min(1).max(365).optional(),
  budget: z
    .object({
      minimumMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      maximumMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      currency: z.enum(['VND', 'USD']),
    })
    .refine(({ minimumMinor, maximumMinor }) => maximumMinor >= minimumMinor, {
      path: ['maximumMinor'],
      message: 'Maximum budget must not be below minimum budget.',
    })
    .optional(),
  preferredLanguage: z.string().trim().min(2).max(20).optional(),
  priorDentalWork: z.string().trim().max(5_000).optional(),
  existingImplantSystems: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  medicalConditions: z.array(intakeMedicalConditionSchema).max(50).optional(),
  medications: z.array(intakeMedicationSchema).max(50).optional(),
  allergies: z.array(intakeAllergySchema).max(50).optional(),
  smokingStatus: z.enum(['NEVER', 'FORMER', 'CURRENT', 'PREFER_NOT_TO_SAY']).optional(),
  pregnancyStatus: z
    .enum(['NOT_APPLICABLE', 'NOT_PREGNANT', 'PREGNANT', 'UNSURE', 'PREFER_NOT_TO_SAY'])
    .optional(),
  accessibilityNeeds: codeListSchema.optional(),
  preferredConsultationTimes: z.array(consultationTimeSchema).min(1).max(14).optional(),
} as const;

export const intakeDraftCreateSchema = z
  .object({ currentStep: z.number().int().min(1).max(6).default(1), ...intakeFields })
  .superRefine(validateTravelPair);

export const intakeDraftUpdateSchema = z
  .object({
    expectedDraftRevision: z.number().int().positive(),
    currentStep: z.number().int().min(1).max(6),
    ...intakeFields,
  })
  .superRefine(validateTravelPair);

export const intakeSubmitSchema = z.object({
  expectedDraftRevision: z.number().int().positive(),
  consentGranted: z.literal(true),
  consentTextVersionIds: z
    .array(uuidSchema)
    .length(2)
    .refine((ids) => new Set(ids).size === 2, 'Consent text versions must be distinct.'),
});

export const intakeRevisionCreateSchema = z.object({
  expectedQuestionnaireVersion: z.number().int().positive(),
});

export const intakeConsentQuerySchema = z.object({
  locale: z.enum(['vi-VN', 'en-US']).default('vi-VN'),
});

export const consentLedgerQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ACTIVE', 'WITHDRAWN']).optional(),
});

export const withdrawConsentSchema = z.object({
  expectedGrantedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(10).max(1_000),
  confirmation: z.literal('WITHDRAW CONSENT'),
});

export const consentLedgerRecordViewSchema = z.object({
  id: uuidSchema,
  purpose: z.string().min(1).max(120),
  textVersion: z.string().min(1).max(120),
  locale: z.enum(['vi-VN', 'en-US']),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
  grantedAt: z.string().datetime({ offset: true }),
  withdrawnAt: z.string().datetime({ offset: true }).nullable(),
  withdrawable: z.boolean(),
});

export const intakeVersionParameterSchema = z.object({
  caseId: uuidSchema,
  versionId: uuidSchema,
});

function validateTravelPair(
  value: {
    expectedArrivalDate?: string | undefined;
    expectedDepartureDate?: string | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (
    value.expectedArrivalDate &&
    value.expectedDepartureDate &&
    value.expectedDepartureDate < value.expectedArrivalDate
  ) {
    context.addIssue({
      code: 'custom',
      path: ['expectedDepartureDate'],
      message: 'Departure must be on or after arrival.',
    });
  }
}

export type PatientProfileUpdate = z.infer<typeof patientProfileUpdateSchema>;
export type EmergencyContactUpdate = z.infer<typeof emergencyContactUpdateSchema>;
export type IntakeDraftCreate = z.infer<typeof intakeDraftCreateSchema>;
export type IntakeDraftUpdate = z.infer<typeof intakeDraftUpdateSchema>;
export type IntakeSubmit = z.infer<typeof intakeSubmitSchema>;
export type IntakeRevisionCreate = z.infer<typeof intakeRevisionCreateSchema>;
export type IntakeConsentQuery = z.infer<typeof intakeConsentQuerySchema>;
export type IntakeMedicalCondition = z.infer<typeof intakeMedicalConditionSchema>;
export type IntakeMedication = z.infer<typeof intakeMedicationSchema>;
export type IntakeAllergy = z.infer<typeof intakeAllergySchema>;
export type ConsentLedgerQuery = z.infer<typeof consentLedgerQuerySchema>;
export type WithdrawConsent = z.infer<typeof withdrawConsentSchema>;
export type ConsentLedgerRecordView = z.infer<typeof consentLedgerRecordViewSchema>;

export interface PatientProfileView {
  readonly id: string;
  readonly email: string;
  readonly preferredLocale: 'vi-VN' | 'en-US';
  readonly preferredCurrency: 'VND' | 'USD';
  readonly currentCountry: string | null;
  readonly currentCity: string | null;
  readonly timezone: string;
  readonly identity: {
    readonly fullName: string;
    readonly dateOfBirth: string;
    readonly pronouns?: string | undefined;
  } | null;
  readonly contact: { readonly phoneE164: string } | null;
  readonly preferences: {
    readonly contactChannel: 'EMAIL' | 'PHONE' | 'MESSAGE';
    readonly travelCoordination: boolean;
    readonly appointmentReminders: boolean;
  } | null;
  readonly emergencyContact: {
    readonly id: string;
    readonly name: string;
    readonly phoneE164: string;
    readonly relationship: string;
    readonly version: number;
  } | null;
  readonly onboardingCompletedAt: string | null;
  readonly version: number;
}

export interface IntakeConsentTextView {
  readonly id: string;
  readonly purpose: 'INTAKE_HEALTH_INFORMATION' | 'INTAKE_MEDICAL_DISCLAIMER';
  readonly version: string;
  readonly locale: 'vi-VN' | 'en-US';
  readonly contentHash: string;
  readonly publishedAt: string;
}

export interface IntakeVersionView {
  readonly id: string;
  readonly version: number;
  readonly status: 'DRAFT' | 'SUBMITTED' | 'SUPERSEDED';
  readonly desiredProcedureCode: string | null;
  readonly dentalConcerns: readonly string[];
  readonly existingDiagnosis: string | null;
  readonly treatmentGoals: readonly string[];
  readonly cosmeticExpectations: string | null;
  readonly currentCountry: string | null;
  readonly currentCity: string | null;
  readonly expectedArrivalDate: string | null;
  readonly expectedDepartureDate: string | null;
  readonly preferredLocation: string | null;
  readonly availableTreatmentDays: number | null;
  readonly budget: {
    readonly minimumMinor: number;
    readonly maximumMinor: number;
    readonly currency: 'VND' | 'USD';
  } | null;
  readonly preferredLanguage: string | null;
  readonly priorDentalWork: string | null;
  readonly existingImplantSystems: readonly string[];
  readonly medicalConditions: readonly IntakeMedicalCondition[];
  readonly medications: readonly IntakeMedication[];
  readonly allergies: readonly IntakeAllergy[];
  readonly smokingStatus: 'NEVER' | 'FORMER' | 'CURRENT' | 'PREFER_NOT_TO_SAY' | null;
  readonly pregnancyStatus:
    'NOT_APPLICABLE' | 'NOT_PREGNANT' | 'PREGNANT' | 'UNSURE' | 'PREFER_NOT_TO_SAY' | null;
  readonly accessibilityNeeds: readonly string[];
  readonly preferredConsultationTimes: readonly z.infer<typeof consultationTimeSchema>[];
  readonly consentPurposes: readonly string[];
  readonly currentStep: number;
  readonly draftRevision: number;
  readonly submittedAt: string | null;
  readonly contentChecksum: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IntakeQuestionnaireView {
  readonly id: string | null;
  readonly caseId: string;
  readonly current: IntakeVersionView | null;
  readonly history: readonly IntakeVersionView[];
  readonly progress: {
    readonly completedSteps: number;
    readonly totalSteps: 6;
    readonly percent: number;
    readonly nextStep: number;
  };
}
