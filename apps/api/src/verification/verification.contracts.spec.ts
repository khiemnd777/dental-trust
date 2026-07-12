import { describe, expect, it } from 'vitest';

import {
  addVerificationEvidenceSchema,
  decideVerificationCaseSchema,
  secondApprovalSchema,
  verificationCaseListQuerySchema,
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
});
