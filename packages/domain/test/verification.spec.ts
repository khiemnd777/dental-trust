import { describe, expect, it } from 'vitest';

import {
  assertIndependentVerificationActors,
  assertVerificationTransition,
  requiresFourEyes,
  verificationEvidenceCategories,
} from '../src/verification.js';

describe('verification policy', () => {
  it('allows the documented lifecycle and rejects skipped review states', () => {
    expect(() => assertVerificationTransition('DRAFT', 'SUBMITTED')).not.toThrow();
    expect(() => assertVerificationTransition('SUBMITTED', 'UNDER_REVIEW')).not.toThrow();
    expect(() => assertVerificationTransition('APPROVED', 'VERIFIED')).not.toThrow();
    expect(() => assertVerificationTransition('DRAFT', 'VERIFIED')).toThrow();
    expect(() => assertVerificationTransition('SUSPENDED', 'APPROVED')).toThrow();
  });

  it('requires independent approval for every badge, suspension, and reinstatement decision', () => {
    expect(requiresFourEyes('APPROVED', 'VERIFIED')).toBe(true);
    expect(requiresFourEyes('VERIFIED', 'SUSPENDED')).toBe(true);
    expect(requiresFourEyes('SUSPENDED', 'VERIFIED')).toBe(true);
    expect(requiresFourEyes('SUBMITTED', 'UNDER_REVIEW')).toBe(false);
    expect(() => assertIndependentVerificationActors('submitter', 'submitter')).toThrow();
    expect(() =>
      assertIndependentVerificationActors('submitter', 'reviewer', 'reviewer'),
    ).toThrow();
    expect(() =>
      assertIndependentVerificationActors('submitter', 'reviewer', 'submitter'),
    ).toThrow();
    expect(() =>
      assertIndependentVerificationActors('submitter', 'reviewer', 'approver'),
    ).not.toThrow();
  });

  it('freezes the complete evidence taxonomy without duplicates', () => {
    expect(verificationEvidenceCategories).toHaveLength(15);
    expect(new Set(verificationEvidenceCategories)).toHaveLength(15);
    expect(verificationEvidenceCategories).toContain('CLINIC_OPERATING_LICENSE');
    expect(verificationEvidenceCategories).toContain('ENGLISH_RECORDS_CAPABILITY');
  });
});
