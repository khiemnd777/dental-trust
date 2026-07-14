import { describe, expect, it } from 'vitest';

import {
  createDepositIntentRequestSchema,
  contactRequestSchema,
  emailVerificationConsumeSchema,
  idempotencyKeySchema,
  loginRequestSchema,
  mfaVerificationRequestSchema,
  passwordResetConsumeSchema,
  publicDirectoryQuerySchema,
  registerRequestSchema,
  createIncidentRequestSchema,
  createSupportElevationRequestSchema,
  processPrivacyRequestSchema,
  assistantMessageRequestSchema,
  assistantSpeechRequestSchema,
  assistantTranscriptionViewSchema,
} from '@dental-trust/contracts';

describe('HTTP contracts', () => {
  it('requires explicit legal consent versions during registration', () => {
    expect(
      registerRequestSchema.safeParse({
        email: 'patient@example.com',
        password: 'StrongPassword2026',
        preferredLocale: 'vi-VN',
      }).success,
    ).toBe(false);
  });

  it('normalizes login email and enforces mutation idempotency keys', () => {
    expect(
      loginRequestSchema.parse({ email: '  PATIENT@EXAMPLE.COM ', password: 'secret' }).email,
    ).toBe('patient@example.com');
    expect(idempotencyKeySchema.safeParse('short').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('case-create-2026-0001').success).toBe(true);
  });

  it('validates opaque lifecycle tokens, strong reset passwords, and MFA methods', () => {
    expect(emailVerificationConsumeSchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(
      passwordResetConsumeSchema.safeParse({
        token: 'v'.repeat(64),
        newPassword: 'StrongPassword2026',
      }).success,
    ).toBe(true);
    expect(mfaVerificationRequestSchema.parse({ code: '123456' })).toEqual({
      method: 'totp',
      code: '123456',
    });
    expect(
      mfaVerificationRequestSchema.safeParse({ method: 'recovery', code: 'ABCD-2345' }).success,
    ).toBe(true);
  });

  it('bounds public directory cursors and contact content', () => {
    expect(publicDirectoryQuerySchema.parse({ locale: 'en-US' })).toMatchObject({
      locale: 'en-US',
      limit: 25,
    });
    expect(
      contactRequestSchema.safeParse({
        name: 'Patient',
        email: ' PATIENT@example.com ',
        topic: 'General question',
        message: 'A sufficiently detailed contact request.',
        locale: 'en-US',
      }).success,
    ).toBe(true);
  });

  it('does not accept browser-controlled deposit amounts or currency', () => {
    const parsed = createDepositIntentRequestSchema.parse({
      bookingId: '00000000-0000-4000-8000-000000000001',
      amountMinor: 1,
      currency: 'USD',
    });
    expect(parsed).toEqual({ bookingId: '00000000-0000-4000-8000-000000000001' });
  });

  it('bounds trust-and-safety narratives and keeps incident ownership server-controlled', () => {
    const parsed = createIncidentRequestSchema.parse({
      caseId: '00000000-0000-4000-8000-000000000001',
      type: 'CLINICAL_CONCERN',
      reportedSeverity: 'HIGH',
      summary: 'Persistent swelling after treatment',
      details: 'The swelling has increased despite following the supplied instructions.',
      attachmentFileAssetIds: [],
      ownerUserId: '00000000-0000-4000-8000-000000000002',
      slaDueAt: '2099-01-01T00:00:00.000Z',
    });
    expect(parsed).not.toHaveProperty('ownerUserId');
    expect(parsed).not.toHaveProperty('slaDueAt');
  });

  it('does not permit administrators to transition a privacy request back to submitted', () => {
    expect(
      processPrivacyRequestSchema.safeParse({
        toStatus: 'SUBMITTED',
        expectedVersion: 2,
        patientMessage: 'This request has returned to intake.',
      }).success,
    ).toBe(false);
    expect(
      processPrivacyRequestSchema.safeParse({
        toStatus: 'APPROVED',
        expectedVersion: 2,
        reason: 'Identity verification completed under DT-PRIV-9.',
        patientMessage: 'Your request was approved for secure processing.',
        confirmation: 'YES',
      }).success,
    ).toBe(false);
  });

  it('requires bounded, named support elevation capabilities and expiry', () => {
    expect(
      createSupportElevationRequestSchema.safeParse({
        actorUserId: '00000000-0000-4000-8000-000000000001',
        subjectUserId: '00000000-0000-4000-8000-000000000002',
        ticketReference: 'DT-100',
        reason: 'Patient requested scoped assistance reviewing incident status.',
        expiresInMinutes: 240,
        capabilities: ['SYSTEM_ADMIN'],
      }).success,
    ).toBe(false);
  });

  it('requires an explicit AI notice acknowledgement and bounded message', () => {
    const request = {
      clientMessageId: '00000000-0000-4000-8000-000000000001',
      locale: 'vi-VN',
      message: 'Tôi muốn tìm hiểu về Implant.',
    };
    expect(assistantMessageRequestSchema.safeParse(request).success).toBe(false);
    expect(
      assistantMessageRequestSchema.safeParse({ ...request, acknowledgedAiNotice: true }).success,
    ).toBe(true);
  });

  it('bounds bilingual assistant voice payloads', () => {
    expect(
      assistantTranscriptionViewSchema.safeParse({
        text: 'I need an implant consultation.',
        locale: 'en-US',
      }).success,
    ).toBe(true);
    expect(
      assistantSpeechRequestSchema.safeParse({
        sessionId: '00000000-0000-4000-8000-000000000001',
        assistantMessageId: '00000000-0000-4000-8000-000000000002',
        locale: 'vi-VN',
      }).success,
    ).toBe(true);
    expect(
      assistantSpeechRequestSchema.safeParse({
        sessionId: 'not-a-session',
        assistantMessageId: '00000000-0000-4000-8000-000000000002',
        locale: 'vi-VN',
      }).success,
    ).toBe(false);
  });
});
