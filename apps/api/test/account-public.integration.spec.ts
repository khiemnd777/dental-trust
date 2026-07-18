import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadWorkspaceEnvironment } from '@dental-trust/config/server';
import { prisma } from '@dental-trust/database';
import { sha256 } from '@dental-trust/security';

import { generateTotpCode } from '../src/auth/totp.js';

loadWorkspaceEnvironment();

const databaseAvailable = Boolean(process.env.DATABASE_URL);

describe.skipIf(!databaseAvailable)('account lifecycle and public directory integration', () => {
  let app: INestApplication;
  const email = `account-${randomUUID()}@example.com`;
  const originalPassword = 'StrongPassword2026';
  const replacementPassword = 'ReplacementPassword2027';
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('registers with a hashed single-use verification token and encrypted outbox credential', async () => {
    const registration = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: originalPassword,
        preferredLocale: 'en-US',
        termsVersion: '2026-07-12',
        privacyVersion: '2026-07-12',
      })
      .expect(201);
    userId = registration.body.data.id as string;
    const lifecycleToken = await prisma.accountLifecycleToken.findFirstOrThrow({
      where: { userId, type: 'EMAIL_VERIFICATION' },
    });
    expect(lifecycleToken.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: userId, eventType: 'account.email-verification-requested' },
    });
    expect(outbox.payload).toMatchObject({
      tokenHash: lifecycleToken.tokenHash,
      encryptedToken: expect.stringMatching(/^v1\./u),
    });
    expect(JSON.stringify(outbox.payload)).not.toContain(originalPassword);
  });

  it('consumes verification once and creates an active login session', async () => {
    const rawToken = `verify_${randomUUID()}_${randomUUID()}`;
    await prisma.accountLifecycleToken.updateMany({
      where: { userId, type: 'EMAIL_VERIFICATION', consumedAt: null },
      data: { tokenHash: sha256(rawToken) },
    });
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/email-verification/consume')
      .send({ token: rawToken })
      .expect(200);
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/email-verification/consume')
      .send({ token: rawToken })
      .expect(400);
    const login = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: originalPassword })
      .expect(200);
    accessToken = login.body.data.accessToken as string;
  });

  it('enrolls TOTP, displays recovery codes once, and consumes a recovery code once', async () => {
    const enrollment = await supertest(app.getHttpServer())
      .post('/api/v1/auth/mfa/totp/enroll')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ password: originalPassword })
      .expect(200);
    const secret = enrollment.body.data.secret as string;
    const confirmation = await supertest(app.getHttpServer())
      .post('/api/v1/auth/mfa/totp/confirm')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ code: generateTotpCode(secret) })
      .expect(200);
    const recoveryCode = confirmation.body.data.recoveryCodes[0] as string;
    const secondLogin = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: originalPassword })
      .expect(200);
    expect(secondLogin.body.data.user.mfaRequired).toBe(true);
    const secondToken = secondLogin.body.data.accessToken as string;
    await supertest(app.getHttpServer())
      .get('/api/v1/cases')
      .set('authorization', `Bearer ${secondToken}`)
      .expect(403);
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .set('authorization', `Bearer ${secondToken}`)
      .send({ method: 'recovery', code: recoveryCode })
      .expect(200);
    await supertest(app.getHttpServer())
      .get('/api/v1/cases')
      .set('authorization', `Bearer ${secondToken}`)
      .expect(200);
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .set('authorization', `Bearer ${secondToken}`)
      .send({ method: 'recovery', code: recoveryCode })
      .expect(401);
  });

  it('returns enumeration-safe reset acknowledgements and revokes sessions on consume', async () => {
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email })
      .expect(202);
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: `missing-${randomUUID()}@example.com` })
      .expect(202);
    const rawToken = `reset_${randomUUID()}_${randomUUID()}`;
    await prisma.accountLifecycleToken.updateMany({
      where: { userId, type: 'PASSWORD_RESET', consumedAt: null },
      data: { tokenHash: sha256(rawToken) },
    });
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/password-reset/consume')
      .send({ token: rawToken, newPassword: replacementPassword })
      .expect(200);
    expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(0);
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: replacementPassword })
      .expect(200);
  });

  it('persists idempotent encrypted contact requests without PII in outbox payloads', async () => {
    const key = `contact-${randomUUID()}`;
    const request = {
      name: 'Integration Patient',
      email: 'integration-patient@example.com',
      topic: 'General care coordination',
      message: 'Please contact me about the non-clinical coordination process.',
      locale: 'en-US',
    };
    const first = await supertest(app.getHttpServer())
      .post('/api/v1/contact')
      .set('x-idempotency-key', key)
      .send(request)
      .expect(202);
    const replay = await supertest(app.getHttpServer())
      .post('/api/v1/contact')
      .set('x-idempotency-key', key)
      .send(request)
      .expect(202);
    expect(replay.body.data.reference).toBe(first.body.data.reference);
    await supertest(app.getHttpServer())
      .post('/api/v1/contact')
      .set('x-idempotency-key', key)
      .send({ ...request, message: `${request.message} Different content.` })
      .expect(409);
    const record = await prisma.contactRequest.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });
    expect(record.encryptedEmail).not.toContain(request.email);
    expect(record.encryptedMessage).not.toContain(request.message);
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: record.id, eventType: 'contact.requested' },
    });
    expect(JSON.stringify(outbox.payload)).not.toContain(request.email);
    expect(JSON.stringify(outbox.payload)).not.toContain(request.message);
  });

  it('exposes only currently verified public clinics and dentists', async () => {
    const clinics = await supertest(app.getHttpServer())
      .get('/api/v1/public/clinics?locale=en-US')
      .expect(200);
    expect(clinics.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'saigon-smiles',
          coordinates: { latitude: expect.any(Number), longitude: expect.any(Number) },
          evidence: expect.any(Array),
        }),
      ]),
    );
    await supertest(app.getHttpServer())
      .get('/api/v1/public/clinics/saigon-smiles?locale=en-US')
      .expect(200);
    const dentists = await supertest(app.getHttpServer())
      .get('/api/v1/public/dentists?locale=en-US')
      .expect(200);
    expect(dentists.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'dr-minh-nguyen' })]),
    );
    const dentist = await supertest(app.getHttpServer())
      .get('/api/v1/public/dentists/dr-minh-nguyen?locale=en-US')
      .expect(200);
    expect(dentist.body.data).toMatchObject({
      slug: 'dr-minh-nguyen',
      verification: { status: 'VERIFIED' },
    });

    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { slug: 'saigon-smiles' },
    });
    const verification = await prisma.verificationCase.findFirstOrThrow({
      where: { clinicId: clinic.id, status: 'VERIFIED' },
    });
    try {
      await prisma.verificationCase.update({
        where: { id: verification.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      await supertest(app.getHttpServer())
        .get('/api/v1/public/clinics/saigon-smiles?locale=en-US')
        .expect(404);
    } finally {
      await prisma.verificationCase.update({
        where: { id: verification.id },
        data: { expiresAt: verification.expiresAt },
      });
    }
  });
});
