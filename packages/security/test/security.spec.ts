import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { redactSensitive, SensitiveFieldCipher, verifyHmacSha256 } from '../src/index.js';

describe('security primitives', () => {
  it('binds authenticated encryption to its resource context', () => {
    const cipher = new SensitiveFieldCipher(
      'a sufficiently long test-only field encryption secret',
    );
    const encrypted = cipher.encrypt('allergy: penicillin', 'patient:1');
    expect(cipher.decrypt(encrypted, 'patient:1')).toBe('allergy: penicillin');
    expect(() => cipher.decrypt(encrypted, 'patient:2')).toThrow();
  });

  it('verifies HMAC signatures without accepting malformed values', () => {
    const payload = '{"event":"paid"}';
    const signature = createHmac('sha256', 'secret').update(payload).digest('hex');
    expect(verifyHmacSha256(payload, signature, 'secret')).toBe(true);
    expect(verifyHmacSha256(payload, 'not-hex', 'secret')).toBe(false);
  });

  it('recursively redacts sensitive fields', () => {
    expect(
      redactSensitive({
        event: 'payment_failed',
        nested: {
          access_token: 'secret',
          PatientNotes: 'clinical detail',
          paymentMethodData: { cardNumber: '4242424242424242' },
        },
      }),
    ).toEqual({
      event: 'payment_failed',
      nested: {
        access_token: '[REDACTED]',
        PatientNotes: '[REDACTED]',
        paymentMethodData: '[REDACTED]',
      },
    });
  });
});
