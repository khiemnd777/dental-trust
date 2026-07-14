import { z } from 'zod';

import { assistantActionCodes } from '@dental-trust/domain';

export const assistantNoticeVersion = '2026-07-14';

export const assistantIntentSchema = z.enum([
  'GENERAL_GUIDANCE',
  'START_CARE_REQUEST',
  'MATCHING_HELP',
  'CONSULTATION_BOOKING',
  'TREATMENT_PLAN',
  'TREATMENT_BOOKING',
  'HUMAN_SUPPORT',
  'OTHER',
]);

export const assistantSafetyLevelSchema = z.enum(['ROUTINE', 'ATTENTION', 'URGENT']);
export const assistantActionCodeSchema = z.enum(assistantActionCodes);
export const assistantMissingFieldSchema = z.enum([
  'PROCEDURE',
  'LOCATION',
  'TIMING',
  'PRIORITY',
  'MEDICAL_CONTEXT',
  'NONE',
]);

export const assistantCollectedFieldsSchema = z.object({
  procedureCode: z
    .enum(['DENTAL_IMPLANT', 'CROWN', 'ORTHODONTICS', 'VENEER', 'GENERAL_CONSULTATION'])
    .nullable(),
  preferredLocation: z.string().trim().min(2).max(120).nullable(),
  timingPreference: z.enum(['FLEXIBLE', 'ONE_MONTH', 'THREE_MONTHS']).nullable(),
  decisionPriority: z.enum(['TRUST', 'COST', 'TIME', 'AFTERCARE']).nullable(),
});

export const assistantMessageRequestSchema = z.object({
  clientMessageId: z.uuid(),
  sessionId: z.uuid().optional(),
  caseId: z.uuid().optional(),
  locale: z.enum(['vi-VN', 'en-US']).default('vi-VN'),
  message: z.string().trim().min(1).max(2_000),
  acknowledgedAiNotice: z.literal(true),
});

export const assistantModelOutputSchema = z.object({
  reply: z.string().trim().min(1).max(2_000),
  intent: assistantIntentSchema,
  safetyLevel: assistantSafetyLevelSchema,
  suggestedAction: assistantActionCodeSchema,
  collectedFields: assistantCollectedFieldsSchema,
  missingFields: z.array(assistantMissingFieldSchema).max(6),
});

export const assistantMessageViewSchema = assistantModelOutputSchema.extend({
  sessionId: z.uuid(),
  assistantMessageId: z.uuid(),
  actionRequiresConfirmation: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
});

export type AssistantMessageRequest = z.infer<typeof assistantMessageRequestSchema>;
export type AssistantModelOutput = z.infer<typeof assistantModelOutputSchema>;
export type AssistantMessageView = z.infer<typeof assistantMessageViewSchema>;
