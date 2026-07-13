import { describe, expect, it } from 'vitest';

import {
  addVerificationEvidenceSchema,
  decideVerificationCaseSchema,
  secondApprovalSchema,
  verificationCaseListQuerySchema,
  verificationEvidenceAccessViewSchema,
  verificationRequirementViewSchema,
} from '@dental-trust/contracts';

describe('verification HTTP contracts', () => {
  it('requires evidence provenance, checklist identity, and an optimistic case version', () => {
    expect(
      addVerificationEvidenceSchema.safeParse({
        expectedCaseVersion: 4,
        requirementId: '118f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        category: 'CLINIC_OPERATING_LICENSE',
      }).success,
    ).toBe(false);
    expect(
      addVerificationEvidenceSchema.safeParse({
        expectedCaseVersion: 4,
        requirementId: '118f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        category: 'CLINIC_OPERATING_LICENSE',
        sourceReference: 'Authoritative registry record',
      }).success,
    ).toBe(true);
  });

  it('keeps high-risk expiry and independent approval inputs explicit', () => {
    expect(
      decideVerificationCaseSchema.safeParse({
        toStatus: 'VERIFIED',
        notes: 'Primary reviewer completed the documented checks.',
        expectedVersion: 8,
        expiresAt: '2027-07-12T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      secondApprovalSchema.safeParse({
        approve: true,
        notes: 'Independent reviewer confirmed the evidence and decision.',
        expectedCaseVersion: 8,
        expiresAt: '2027-07-12T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('bounds queue pages and rejects oversized limits', () => {
    expect(verificationCaseListQuerySchema.safeParse({ limit: 25 }).success).toBe(true);
    expect(verificationCaseListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('gives reviewers criteria and a safe way to access the submitted evidence', () => {
    expect(
      verificationRequirementViewSchema.safeParse({
        id: '118f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        code: 'clinic.operating-license.v1',
        category: 'CLINIC_OPERATING_LICENSE',
        names: { 'vi-VN': 'Giấy phép hoạt động phòng khám' },
        descriptions: { 'vi-VN': 'Giấy phép còn hiệu lực do cơ quan có thẩm quyền cấp.' },
        required: true,
        highRisk: true,
        validityDays: 365,
        templateVersion: 1,
        status: 'PROVIDED',
        evidence: [],
      }).success,
    ).toBe(true);
    expect(
      verificationEvidenceAccessViewSchema.safeParse({
        kind: 'SOURCE',
        sourceReference: '/demo-evidence/clinic-operating-license.html',
      }).success,
    ).toBe(true);
  });
});
