import { describe, expect, it } from 'vitest';

import { providerClinicalJourneySchema, providerPassportVersionSchema } from '@/lib/provider-data';

const caseId = '00000000-0000-4000-8000-000000000001';
const resourceId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';

describe('Provider clinical journey projections', () => {
  it('parses milestones, instructions, and immutable plan changes', () => {
    const result = providerClinicalJourneySchema.parse({
      id: caseId,
      caseNumber: 'DT-2026-001',
      title: 'Điều trị implant răng 11',
      status: 'TREATMENT_IN_PROGRESS',
      version: 4,
      milestones: [
        {
          id: resourceId,
          code: 'IMPLANT_PLACEMENT',
          title: 'Đặt trụ implant',
          status: 'IN_PROGRESS',
          scheduledAt: '2026-08-20T02:00:00.000Z',
          completedAt: null,
          completedByUserId: null,
          version: 2,
        },
      ],
      instructions: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          milestoneId: resourceId,
          authorUserId: userId,
          type: 'DISCHARGE',
          locale: 'vi-VN',
          content: 'Giữ vệ sinh vùng điều trị.',
          createdAt: '2026-08-20T05:00:00.000Z',
        },
      ],
      planChanges: [
        {
          id: '00000000-0000-4000-8000-000000000005',
          fromPlanVersionId: '00000000-0000-4000-8000-000000000006',
          authorUserId: userId,
          kind: 'TREATMENT',
          reason: 'Điều chỉnh vật liệu theo đánh giá trực tiếp',
          changes: [{ field: 'MATERIAL', beforeValue: 'Vật liệu A', afterValue: 'Vật liệu B' }],
          createdAt: '2026-08-20T06:00:00.000Z',
          acknowledgedAt: null,
        },
      ],
    });

    expect(result.milestones[0]?.version).toBe(2);
    expect(result.instructions[0]?.content).toContain('vệ sinh');
    expect(result.planChanges[0]?.acknowledgedAt).toBeNull();
  });
});

describe('Provider Dental Passport projections', () => {
  const passport = {
    id: resourceId,
    caseId,
    caseNumber: 'DT-2026-001',
    version: 1,
    schemaVersion: 1,
    status: 'DRAFT',
    clinic: { id: '00000000-0000-4000-8000-000000000007', name: 'Dental Trust Clinic' },
    treatingDentist: {
      id: '00000000-0000-4000-8000-000000000008',
      fullName: 'BS. Nguyễn An',
    },
    treatmentCompletedAt: '2026-08-20',
    treatmentSummary: 'Hoàn tất điều trị implant răng 11.',
    dischargeInstructions: 'Giữ vệ sinh vùng điều trị.',
    followUpInstructions: 'Tái khám sau bảy ngày.',
    implants: [],
    materials: [{ procedureCode: 'IMPLANT', material: 'Titanium grade 5' }],
    prescriptions: [],
    integrity: {
      algorithm: 'SHA-256',
      contentChecksum: 'a'.repeat(64),
      previousVersionChecksum: null,
      verified: true,
    },
    publishedAt: null,
    createdAt: '2026-08-20T07:00:00.000Z',
    downloadable: false,
  } as const;

  it('accepts a verified draft projection', () => {
    expect(providerPassportVersionSchema.parse(passport)).toMatchObject({
      status: 'DRAFT',
      downloadable: false,
    });
  });

  it('rejects malformed integrity metadata instead of displaying it as verified', () => {
    expect(() =>
      providerPassportVersionSchema.parse({
        ...passport,
        integrity: { ...passport.integrity, contentChecksum: 'not-a-checksum' },
      }),
    ).toThrow();
  });
});
