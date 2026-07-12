import { describe, expect, it } from 'vitest';

import {
  assertMinorUnitAmount,
  assertPaymentTransition,
  assertVerificationTransition,
  DomainRuleError,
  permissionsForRoles,
} from '../src/index.js';

describe('critical domain policies', () => {
  it('unions permissions without granting unrelated medical access', () => {
    const permissions = permissionsForRoles(['CONTENT_ADMIN', 'FINANCE_ADMIN']);

    expect(permissions.has('content:manage')).toBe(true);
    expect(permissions.has('payment:manage')).toBe(true);
    expect(permissions.has('document:read:assigned')).toBe(false);
  });

  it('validates payment transitions and integer minor units', () => {
    expect(() => assertPaymentTransition('PROCESSING', 'SUCCEEDED')).not.toThrow();
    expect(() => assertPaymentTransition('REFUNDED', 'SUCCEEDED')).toThrow();
    expect(() => assertMinorUnitAmount(1_000_000, 'VND')).not.toThrow();
    expect(() => assertMinorUnitAmount(12.5, 'USD')).toThrow(DomainRuleError);
  });

  it('requires verification review before publication', () => {
    expect(() => assertVerificationTransition('APPROVED', 'VERIFIED')).not.toThrow();
    expect(() => assertVerificationTransition('SUBMITTED', 'VERIFIED')).toThrow();
  });
});
