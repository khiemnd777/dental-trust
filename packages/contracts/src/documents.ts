import { z } from 'zod';

export const caseDocumentViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  fileAssetId: z.uuid(),
  category: z.string(),
  description: z.string().nullable(),
  originalFileName: z.string(),
  declaredMediaType: z.string(),
  detectedMediaType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  status: z.enum([
    'QUARANTINED',
    'SCANNING',
    'AVAILABLE',
    'REJECTED',
    'DELETION_PENDING',
    'DELETED',
  ]),
  scanStatus: z.enum(['PENDING', 'CLEAN', 'INFECTED', 'ERROR']),
  createdAt: z.string().datetime({ offset: true }),
});

export type CaseDocumentView = z.infer<typeof caseDocumentViewSchema>;
