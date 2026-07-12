import { z } from 'zod';

import { dentalCaseStatuses } from '@dental-trust/domain/cases';

export const createCaseRequestSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    desiredProcedureCode: z.string().trim().min(2).max(80),
    preferredLocation: z.string().trim().min(2).max(120).optional(),
    expectedArrivalDate: z.string().date().optional(),
    expectedDepartureDate: z.string().date().optional(),
    preferredCurrency: z.enum(['VND', 'USD']).default('USD'),
  })
  .refine(
    ({ expectedArrivalDate, expectedDepartureDate }) =>
      !expectedArrivalDate ||
      !expectedDepartureDate ||
      expectedDepartureDate >= expectedArrivalDate,
    { path: ['expectedDepartureDate'], message: 'Departure must be on or after arrival.' },
  );

export const transitionCaseRequestSchema = z.object({
  toStatus: z.enum(dentalCaseStatuses),
  reason: z.string().trim().min(3).max(1_000),
  expectedVersion: z.number().int().positive(),
});

export const caseListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(dentalCaseStatuses).optional(),
});

export const dentalCaseViewSchema = z.object({
  id: z.uuid(),
  caseNumber: z.string().min(1),
  patientUserId: z.uuid(),
  title: z.string(),
  desiredProcedureCode: z.string(),
  preferredLocation: z.string().nullable(),
  expectedArrivalDate: z.string().date().nullable(),
  expectedDepartureDate: z.string().date().nullable(),
  preferredCurrency: z.enum(['VND', 'USD']),
  status: z.enum(dentalCaseStatuses),
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type CreateCaseRequest = z.infer<typeof createCaseRequestSchema>;
export type TransitionCaseRequest = z.infer<typeof transitionCaseRequestSchema>;
export type CaseListQuery = z.infer<typeof caseListQuerySchema>;
export type DentalCaseView = z.infer<typeof dentalCaseViewSchema>;
