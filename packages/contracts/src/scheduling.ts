import { z } from 'zod';

const utcInstantSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => value.endsWith('Z'), 'Timestamp must be an explicit UTC instant ending in Z.');

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

const appointmentWindowSchema = z.object({
  startsAt: utcInstantSchema,
  endsAt: utcInstantSchema,
  timezone: timeZoneSchema,
});

function validateWindow(
  value: { readonly startsAt: string; readonly endsAt: string },
  context: z.RefinementCtx,
): void {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    context.addIssue({
      code: 'custom',
      message: 'Appointment end must be after its start.',
      path: ['endsAt'],
    });
  }
  if (Date.parse(value.endsAt) - Date.parse(value.startsAt) > 8 * 60 * 60_000) {
    context.addIssue({
      code: 'custom',
      message: 'An appointment cannot exceed eight hours.',
      path: ['endsAt'],
    });
  }
}

export const appointmentKindSchema = z.enum(['CONSULTATION', 'CLINICAL_VISIT']);

export const createAppointmentRequestSchema = appointmentWindowSchema
  .extend({
    clinicId: z.uuid(),
    clinicLocationId: z.uuid().optional(),
    dentistId: z.uuid(),
    kind: appointmentKindSchema.default('CONSULTATION'),
    meetingJoinUrl: z.url().max(2_048).optional(),
  })
  .superRefine((value, context) => {
    validateWindow(value, context);
    if (value.kind === 'CLINICAL_VISIT' && value.meetingJoinUrl) {
      context.addIssue({
        code: 'custom',
        message: 'Clinical visits cannot contain a remote meeting link.',
        path: ['meetingJoinUrl'],
      });
    }
    if (value.kind === 'CLINICAL_VISIT' && !value.clinicLocationId) {
      context.addIssue({
        code: 'custom',
        message: 'Clinical visits require an active clinic location.',
        path: ['clinicLocationId'],
      });
    }
  });

export const rescheduleAppointmentRequestSchema = appointmentWindowSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .superRefine(validateWindow);

export const cancelAppointmentRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});

export const recordAttendanceRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  outcome: z.enum(['COMPLETED', 'NO_SHOW']),
});

export const appointmentAvailabilityQuerySchema = appointmentWindowSchema
  .extend({
    clinicId: z.uuid(),
    clinicLocationId: z.uuid().optional(),
    dentistId: z.uuid(),
    kind: appointmentKindSchema.default('CONSULTATION'),
  })
  .superRefine((value, context) => {
    validateWindow(value, context);
    if (value.kind === 'CLINICAL_VISIT' && !value.clinicLocationId) {
      context.addIssue({
        code: 'custom',
        message: 'Clinical visits require an active clinic location.',
        path: ['clinicLocationId'],
      });
    }
  });

export const appointmentViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  clinicId: z.uuid(),
  clinicLocationId: z.uuid().nullable(),
  dentistId: z.uuid().nullable(),
  kind: appointmentKindSchema,
  startsAt: utcInstantSchema,
  endsAt: utcInstantSchema,
  timezone: timeZoneSchema,
  status: z.enum(['TENTATIVE', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  version: z.number().int().positive(),
  meetingProvider: z.string().nullable(),
  meetingJoinUrl: z.url().nullable(),
  cancellationReason: z.string().nullable(),
  cancelledAt: utcInstantSchema.nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
});

export const appointmentAvailabilityViewSchema = z.object({
  caseId: z.uuid(),
  clinicId: z.uuid(),
  clinicLocationId: z.uuid().nullable(),
  dentistId: z.uuid(),
  startsAt: utcInstantSchema,
  endsAt: utcInstantSchema,
  available: z.boolean(),
});

export const schedulingContextViewSchema = z.object({
  clinicId: z.uuid(),
  clinicName: z.string(),
  dentists: z.array(z.object({ id: z.uuid(), fullName: z.string() })),
  locations: z.array(z.object({ id: z.uuid(), name: z.string(), timezone: timeZoneSchema })),
});

export type AppointmentKind = z.infer<typeof appointmentKindSchema>;
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;
export type RescheduleAppointmentRequest = z.infer<typeof rescheduleAppointmentRequestSchema>;
export type CancelAppointmentRequest = z.infer<typeof cancelAppointmentRequestSchema>;
export type RecordAttendanceRequest = z.infer<typeof recordAttendanceRequestSchema>;
export type AppointmentAvailabilityQuery = z.infer<typeof appointmentAvailabilityQuerySchema>;
export type AppointmentView = z.infer<typeof appointmentViewSchema>;
export type AppointmentAvailabilityView = z.infer<typeof appointmentAvailabilityViewSchema>;
export type SchedulingContextView = z.infer<typeof schedulingContextViewSchema>;
