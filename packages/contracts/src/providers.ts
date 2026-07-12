import { z } from 'zod';

export const signedUploadRequestSchema = z.object({
  caseId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  declaredMediaType: z.string().trim().min(3).max(128),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024 * 1024),
  category: z.enum([
    'XRAY',
    'PANORAMIC_XRAY',
    'CBCT',
    'DENTAL_PHOTO',
    'TREATMENT_PLAN',
    'QUOTATION',
    'PRESCRIPTION',
    'IMPLANT_RECORD',
    'MEDICAL_HISTORY',
    'OTHER',
  ]),
});

export const finalizeUploadRequestSchema = z.object({
  caseId: z.uuid(),
});

export const fileDownloadQuerySchema = z.object({
  caseId: z.uuid(),
});

export const clinicSignedUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  declaredMediaType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  category: z.enum([
    'OPERATING_LICENSE',
    'PROFESSIONAL_LICENSE',
    'INSURANCE',
    'EQUIPMENT_CERTIFICATE',
  ]),
});

export type SignedUploadRequest = z.infer<typeof signedUploadRequestSchema>;
export type FinalizeUploadRequest = z.infer<typeof finalizeUploadRequestSchema>;
export type FileDownloadQuery = z.infer<typeof fileDownloadQuerySchema>;
export type ClinicSignedUploadRequest = z.infer<typeof clinicSignedUploadRequestSchema>;
