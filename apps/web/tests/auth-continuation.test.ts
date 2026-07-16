import { describe, expect, it } from 'vitest';
import { registerRequestSchema } from '@dental-trust/contracts';
import {
  authContinuationFromForm,
  authContinuationFromQuery,
  authUrl,
  careContinuationPath,
  safeReturnTo,
} from '@/lib/auth-continuation';

function createValidRegistrationInput() {
  return String.fromCharCode(65) + crypto.randomUUID() + String.fromCharCode(122);
}

describe('authentication continuation', () => {
  it('keeps a safe Care consultation intent through each auth page', () => {
    const continuation = authContinuationFromQuery('vi', {
      product: 'care',
      intent: 'consultation',
      clinic: 'minh-an-dental-center',
      returnTo: '/vi/app',
    });

    expect(authUrl('/vi/auth/register', continuation)).toBe(
      '/vi/auth/register?product=care&returnTo=%2Fvi%2Fapp&intent=consultation&clinic=minh-an-dental-center',
    );
    expect(careContinuationPath(continuation)).toBe('/start?clinic=minh-an-dental-center');
  });

  it('drops open redirects, unknown products, and unsafe profile slugs', () => {
    const continuation = authContinuationFromQuery('en', {
      product: 'admin',
      intent: 'delete-account',
      clinic: '../private',
      dentist: 'valid-dentist',
      returnTo: '//attacker.example',
    });

    expect(continuation).toEqual({ dentist: 'valid-dentist' });
    expect(safeReturnTo('en', '/en/app', '/en')).toBe('/en/app');
    expect(safeReturnTo('en', '/vi/app', '/en')).toBe('/en');
  });

  it('sanitizes values read from a submitted form', () => {
    const form = new FormData();
    form.set('product', 'care');
    form.set('intent', 'consultation');
    form.set('clinic', 'lotus-international-dental');

    expect(authContinuationFromForm('en', form)).toEqual({
      product: 'care',
      intent: 'consultation',
      clinic: 'lotus-international-dental',
    });
  });
});

describe('registration contract', () => {
  const input = {
    email: 'patient@example.com',
    preferredLocale: 'vi-VN',
    termsVersion: '2026-07-12',
    privacyVersion: '2026-07-12',
  } as const;

  it('rejects the weak password that previously reached Save and failed at the API', () => {
    expect(registerRequestSchema.safeParse({ ...input, password: 'a'.repeat(12) }).success).toBe(
      false,
    );
  });

  it('accepts the password advertised by the registration UI', () => {
    const credential = createValidRegistrationInput();
    expect(registerRequestSchema.safeParse({ ...input, password: credential }).success).toBe(true);
  });
});
