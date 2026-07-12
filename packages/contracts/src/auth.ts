import { z } from 'zod';

import { systemRoles } from '@dental-trust/domain';

const normalizedEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.email().max(254),
);

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((value) => /[a-z]/u.test(value) && /[A-Z]/u.test(value) && /\d/u.test(value), {
    message: 'Password must include upper-case, lower-case, and numeric characters.',
  });

export const registerRequestSchema = z.object({
  email: normalizedEmailSchema,
  password: passwordSchema,
  preferredLocale: z.enum(['vi-VN', 'en-US']).default('vi-VN'),
  termsVersion: z.string().min(1).max(64),
  privacyVersion: z.string().min(1).max(64),
});

export const loginRequestSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1).max(128),
});

export const emailVerificationRequestSchema = z.object({ email: normalizedEmailSchema });

export const emailVerificationConsumeSchema = z.object({
  token: z.string().min(32).max(512),
});

export const passwordResetRequestSchema = z.object({ email: normalizedEmailSchema });

export const passwordResetConsumeSchema = z.object({
  token: z.string().min(32).max(512),
  newPassword: passwordSchema,
});

export const mfaEnrollmentRequestSchema = z.object({
  password: z.string().min(1).max(128),
});

export const mfaConfirmationRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/u),
});

export const mfaVerificationRequestSchema = z.preprocess(
  (value) =>
    value && typeof value === 'object' && !('method' in value) && 'code' in value
      ? { ...value, method: 'totp' }
      : value,
  z.discriminatedUnion('method', [
    z.object({ method: z.literal('totp'), code: z.string().regex(/^\d{6}$/u) }),
    z.object({
      method: z.literal('recovery'),
      code: z
        .string()
        .trim()
        .regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/iu),
    }),
  ]),
);

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  emailVerified: z.boolean(),
  preferredLocale: z.enum(['vi-VN', 'en-US']),
  roles: z.array(z.enum(systemRoles)),
  mfaVerified: z.boolean(),
  mfaRequired: z.boolean().default(false),
});

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  user: authUserSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type EmailVerificationRequest = z.infer<typeof emailVerificationRequestSchema>;
export type EmailVerificationConsume = z.infer<typeof emailVerificationConsumeSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConsume = z.infer<typeof passwordResetConsumeSchema>;
export type MfaEnrollmentRequest = z.infer<typeof mfaEnrollmentRequestSchema>;
export type MfaConfirmationRequest = z.infer<typeof mfaConfirmationRequestSchema>;
export type MfaVerificationRequest = z.infer<typeof mfaVerificationRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
