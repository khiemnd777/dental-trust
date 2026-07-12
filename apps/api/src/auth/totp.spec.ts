import { describe, expect, it } from 'vitest';

import {
  buildTotpUri,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyTotpCode,
} from './totp.js';

describe('TOTP and recovery credentials', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    expect(generateTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000, 8)).toBe('94287082');
  });

  it('accepts only the bounded current TOTP time window', () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    expect(verifyTotpCode(secret, generateTotpCode(secret, now), now)).toBe(true);
    expect(verifyTotpCode(secret, generateTotpCode(secret, now - 90_000), now)).toBe(false);
  });

  it('generates unique display-once recovery codes and an authenticator URI', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/u.test(code))).toBe(true);
    expect(normalizeRecoveryCode(codes[0]?.toLowerCase() ?? '')).toBe(codes[0]);
    expect(
      buildTotpUri({ secret: 'ABC234', issuer: 'DENTAL TRUST', accountName: 'a@example.com' }),
    ).toContain('otpauth://totp/');
  });
});
