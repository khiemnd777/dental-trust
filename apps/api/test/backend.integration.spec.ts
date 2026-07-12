import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadWorkspaceEnvironment } from '@dental-trust/config/server';
import { CaseRepository, PaymentRepository, prisma } from '@dental-trust/database';

loadWorkspaceEnvironment();

const databaseAvailable = Boolean(process.env.DATABASE_URL);

if (databaseAvailable) assertDisposableIntegrationDatabase(process.env.DATABASE_URL ?? '');

describe.skipIf(!databaseAvailable)('migrated PostgreSQL and HTTP integration', () => {
  let app: INestApplication;

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

  it('authenticates seeded users and requires an explicit selected clinic tenant', async () => {
    const patientLogin = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'patient@dentaltrust.local', password: 'DentalTrustDev!2026' })
      .expect(200);
    const patientCookie = requiredCookies(patientLogin.headers['set-cookie']);
    await supertest(app.getHttpServer())
      .get('/api/v1/cases')
      .set('Cookie', patientCookie)
      .expect(200);

    const clinicAdminLogin = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'clinic.admin@saigon-smiles.local', password: 'DentalTrustDev!2026' })
      .expect(200);
    const clinicCookie = requiredCookies(clinicAdminLogin.headers['set-cookie']);
    await supertest(app.getHttpServer())
      .get('/api/v1/cases')
      .set('Cookie', clinicCookie)
      .expect(403);
    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { slug: 'saigon-smiles' },
      select: { organizationId: true },
    });
    await supertest(app.getHttpServer())
      .get('/api/v1/cases')
      .set('Cookie', clinicCookie)
      .set('x-organization-id', clinic.organizationId)
      .expect(200);
    await supertest(app.getHttpServer())
      .get('/api/v1/cases')
      .set('Cookie', clinicCookie)
      .set('x-organization-id', randomUUID())
      .expect(403);
  });

  it('deduplicates concurrent case creation and replays the immutable stored response', async () => {
    const patient = await prisma.user.findUniqueOrThrow({
      where: { email: 'patient@dentaltrust.local' },
    });
    const repository = new CaseRepository(prisma);
    const key = `integration-${randomUUID()}`;
    const command = {
      userId: patient.id,
      key,
      operation: 'case.create' as const,
      requestHash: 'e'.repeat(64),
    };
    const create = () =>
      repository.createForPatient(
        patient.id,
        {
          title: 'Concurrent idempotency integration case',
          desiredProcedureCode: 'DENTAL_IMPLANT',
          preferredCurrency: 'USD',
        },
        { userId: patient.id, sessionId: randomUUID() },
        randomUUID(),
        command,
      );
    const [first, second] = await Promise.all([create(), create()]);
    expect(first.id).toBe(second.id);

    await repository.transition(
      { userId: patient.id, organizationIds: [], includeAll: false },
      first.id,
      'RECORDS_PENDING',
      1,
      'Integration transition.',
      { userId: patient.id, sessionId: randomUUID() },
      randomUUID(),
      {
        userId: patient.id,
        key: `transition-${randomUUID()}`,
        operation: 'case.transition',
        requestHash: 'f'.repeat(64),
      },
    );
    const replay = await repository.findIdempotentCaseResponse(command);
    expect(replay).toMatchObject({ id: first.id, status: 'DRAFT', version: 1 });
    expect(
      await prisma.auditLog.count({ where: { resourceId: first.id, action: 'case.created' } }),
    ).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: first.id } })).toBe(2);
  });

  it('enforces append-only audit and published child immutability in PostgreSQL', async () => {
    const published = await prisma.treatmentPlanVersion.findFirstOrThrow({
      where: { status: 'PUBLISHED', items: { some: {} } },
      include: { items: { take: 1 } },
    });
    const item = published.items[0];
    if (!item) throw new Error('Seeded published plan item is required.');
    await expect(
      prisma.treatmentPlanItem.update({ where: { id: item.id }, data: { quantity: 2 } }),
    ).rejects.toThrow();
    await expect(
      prisma.treatmentPlanVersion.update({
        where: { id: published.id },
        data: { status: 'DRAFT' },
      }),
    ).rejects.toThrow();
    const audit = await prisma.auditLog.findFirstOrThrow();
    await expect(
      prisma.auditLog.update({ where: { id: audit.id }, data: { reason: 'mutation' } }),
    ).rejects.toThrow();
    const consent = await prisma.consentRecord.findFirst();
    if (consent) {
      await expect(
        prisma.consentRecord.update({
          where: { id: consent.id },
          data: { requestId: 'rewritten-evidence' },
        }),
      ).rejects.toThrow();
    }
    const patient = await prisma.user.findUniqueOrThrow({
      where: { email: 'patient@dentaltrust.local' },
    });
    const consentText = await prisma.consentTextVersion.findFirstOrThrow({
      where: { purpose: 'TREATMENT_PLAN_ACCEPTANCE' },
    });
    const session = await prisma.session.create({
      data: {
        userId: patient.id,
        tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const acceptance =
      (await prisma.treatmentPlanAcceptance.findFirst({
        where: { treatmentPlanVersionId: published.id, userId: patient.id },
      })) ??
      (await prisma.treatmentPlanAcceptance.create({
        data: {
          treatmentPlanVersionId: published.id,
          userId: patient.id,
          consentTextVersionId: consentText.id,
          sessionId: session.id,
          requestId: randomUUID(),
        },
      }));
    await expect(
      prisma.treatmentPlanAcceptance.update({
        where: { id: acceptance.id },
        data: { requestId: 'rewritten-acceptance' },
      }),
    ).rejects.toThrow();
  });

  it('settles an accepted-plan deposit only from provider evidence and deduplicates its webhook', async () => {
    const patient = await prisma.user.findUniqueOrThrow({
      where: { email: 'patient@dentaltrust.local' },
    });
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@dentaltrust.local' },
    });
    const templatePlan = await prisma.treatmentPlanVersion.findFirstOrThrow({
      where: {
        status: 'PUBLISHED',
        treatmentPlan: { dentalCase: { patientProfile: { userId: patient.id } } },
      },
      include: { treatmentPlan: true },
    });
    const patientProfile = await prisma.patientProfile.findUniqueOrThrow({
      where: { userId: patient.id },
    });
    const paymentCase = await prisma.dentalCase.create({
      data: {
        caseNumber: `DT-TEST-${randomUUID()}`,
        patientProfileId: patientProfile.id,
        title: 'Payment webhook integration case',
        desiredProcedureCode: 'DENTAL_IMPLANT',
        preferredCurrency: templatePlan.currency,
      },
    });
    const treatmentPlan = await prisma.treatmentPlan.create({
      data: {
        caseId: paymentCase.id,
        clinicId: templatePlan.treatmentPlan.clinicId,
      },
    });
    const draftPlan = await prisma.treatmentPlanVersion.create({
      data: {
        treatmentPlanId: treatmentPlan.id,
        version: 1,
        authoringDentistId: templatePlan.authoringDentistId,
        preliminaryAssessment: 'Provider-authored integration assessment.',
        diagnosisStatement: 'Provider-authored integration diagnosis statement.',
        risks: 'Provider-authored integration risks.',
        limitations: 'Provider-authored integration limitations.',
        warrantyTerms: 'Provider-authored integration warranty.',
        exclusions: 'Provider-authored integration exclusions.',
        currency: templatePlan.currency,
        totalMinor: templatePlan.totalMinor,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        contentChecksum: randomUUID().replaceAll('-', '').repeat(2),
        items: {
          create: {
            procedureCode: 'DENTAL_IMPLANT',
            toothNumbers: [],
            quantity: 1,
            unitPriceMinor: templatePlan.totalMinor,
            totalPriceMinor: templatePlan.totalMinor,
            sortOrder: 1,
          },
        },
      },
    });
    const plan = await prisma.treatmentPlanVersion.update({
      where: { id: draftPlan.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
      include: { treatmentPlan: true },
    });
    const consentText = await prisma.consentTextVersion.findFirstOrThrow({
      where: { purpose: 'TREATMENT_PLAN_ACCEPTANCE' },
    });
    const session = await prisma.session.create({
      data: {
        userId: patient.id,
        tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '1'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const acceptance = await prisma.treatmentPlanAcceptance.upsert({
      where: {
        treatmentPlanVersionId_userId: {
          treatmentPlanVersionId: plan.id,
          userId: patient.id,
        },
      },
      update: {},
      create: {
        treatmentPlanVersionId: plan.id,
        userId: patient.id,
        consentTextVersionId: consentText.id,
        sessionId: session.id,
        requestId: randomUUID(),
      },
    });
    const booking = await prisma.booking.create({
      data: {
        caseId: plan.treatmentPlan.caseId,
        treatmentPlanVersionId: plan.id,
        treatmentPlanAcceptanceId: acceptance.id,
        planTotalMinor: plan.totalMinor,
        depositMinor: (plan.totalMinor * 2_000n + 9_999n) / 10_000n,
        depositBasisPoints: 2_000,
        currency: plan.currency,
        cancellationPolicySnapshot: {
          policyVersion: 0,
          cancellationCutoffMinutes: 1_440,
          termsVersion: '2026-07-12',
          source: 'PLATFORM_DEFAULT',
          display: {
            'vi-VN': 'Yêu cầu hủy hoặc đổi lịch trước ít nhất 24 giờ.',
            'en-US': 'Request cancellation or rescheduling at least 24 hours in advance.',
          },
        },
        invoice: {
          create: {
            invoiceNumber: `DTI-TEST-${randomUUID()}`,
            amountMinor: (plan.totalMinor * 2_000n + 9_999n) / 10_000n,
            currency: plan.currency,
          },
        },
      },
    });
    const payments = new PaymentRepository(prisma);
    const actor = { userId: patient.id, sessionId: session.id };
    const payment = await payments.reserveDepositIntent(
      patient.id,
      booking.id,
      'stripe',
      `payment-${randomUUID()}`,
      randomUUID(),
      actor,
    );
    await payments.finalizeDepositIntent(
      payment.id,
      `pi_${randomUUID().replaceAll('-', '')}`,
      'PROCESSING',
      randomUUID(),
      actor,
    );
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const providerIntentId = stored.providerPaymentIntentId;
    if (!providerIntentId) throw new Error('Provider intent was not persisted.');
    const providerEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const webhook = await payments.reserveWebhookEvent(
      providerEventId,
      'payment_intent.succeeded',
      {
        providerEventId,
      },
    );
    expect(webhook.reservation).toBe('PROCESS');
    await payments.applyPaymentWebhook({
      webhookEventId: webhook.eventId,
      providerEventId,
      providerEventCreatedAt: new Date(),
      providerIntentId,
      metadataPaymentId: stored.id,
      evidence: 'SUCCEEDED',
      amountMinor: Number(booking.depositMinor),
      currency: 'usd',
      requestId: randomUUID(),
    });
    await payments.finalizeDepositIntent(
      stored.id,
      providerIntentId,
      'PROCESSING',
      randomUUID(),
      actor,
    );
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: stored.id } }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    await expect(
      prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).resolves.toMatchObject({ status: 'CONFIRMED' });
    await expect(
      payments.reserveWebhookEvent(providerEventId, 'payment_intent.succeeded', {
        providerEventId,
      }),
    ).resolves.toMatchObject({ reservation: 'DUPLICATE' });
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: stored.id,
          action: 'payment.provider-status-reconciled',
          actorType: 'PROVIDER',
          actorUserId: null,
        },
      }),
    ).toBe(1);

    const refund = await payments.reserveRefund({
      paymentId: stored.id,
      requestedByUserId: admin.id,
      amountMinor: 10_000,
      reason: 'Integration finance-approved partial refund.',
      idempotencyKey: `refund-${randomUUID()}`,
      requestId: randomUUID(),
      actor: { userId: admin.id, sessionId: randomUUID() },
    });
    const providerRefundId = `re_${randomUUID().replaceAll('-', '')}`;
    await payments.finalizeRefund(refund.id, providerRefundId, 'PROCESSING', randomUUID(), {
      userId: admin.id,
      sessionId: randomUUID(),
    });
    const refundEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const refundWebhook = await payments.reserveWebhookEvent(refundEventId, 'refund.updated', {
      providerEventId: refundEventId,
    });
    await payments.applyRefundWebhook({
      webhookEventId: refundWebhook.eventId,
      providerEventId: refundEventId,
      providerEventCreatedAt: new Date(Date.now() + 1_000),
      providerRefundId,
      providerIntentId,
      metadataRefundId: refund.id,
      status: 'SUCCEEDED',
      amountMinor: 10_000,
      currency: 'usd',
      requestId: randomUUID(),
    });
    await payments.finalizeRefund(refund.id, providerRefundId, 'PROCESSING', randomUUID(), {
      userId: admin.id,
      sessionId: randomUUID(),
    });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: stored.id } }),
    ).resolves.toMatchObject({ status: 'PARTIALLY_REFUNDED' });
    await expect(
      payments.reserveRefund({
        paymentId: stored.id,
        requestedByUserId: admin.id,
        amountMinor: 45_000,
        reason: 'This request exceeds the remaining settled amount.',
        idempotencyKey: `refund-${randomUUID()}`,
        requestId: randomUUID(),
        actor: { userId: admin.id, sessionId: randomUUID() },
      }),
    ).rejects.toThrow('exceeds the unreserved settled amount');
  });

  it('serves clinical resources and idempotently escalates an aftercare check-in', async () => {
    const login = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'patient@dentaltrust.local', password: 'DentalTrustDev!2026' })
      .expect(200);
    const token = login.body.data?.accessToken as string | undefined;
    if (!token) throw new Error('Patient login did not return an access token.');
    const authorization = `Bearer ${token}`;
    const primaryCase = await prisma.dentalCase.findUniqueOrThrow({
      where: { caseNumber: 'DT-DEV-0001' },
    });
    const plans = await supertest(app.getHttpServer())
      .get(`/api/v1/cases/${primaryCase.id}/treatment-plans`)
      .set('Authorization', authorization)
      .expect(200);
    expect(plans.body.data.plans).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'DRAFT' })]),
    );
    await supertest(app.getHttpServer())
      .get(`/api/v1/cases/${primaryCase.id}/caregivers`)
      .set('Authorization', authorization)
      .expect(200);
    await supertest(app.getHttpServer())
      .get(`/api/v1/cases/${primaryCase.id}/documents`)
      .set('Authorization', authorization)
      .expect(200);

    const aftercareCase = await prisma.dentalCase.findUniqueOrThrow({
      where: { caseNumber: 'DT-DEV-AFTERCARE' },
    });
    const aftercarePlan = await prisma.aftercarePlan.findFirstOrThrow({
      where: { caseId: aftercareCase.id, active: true },
    });
    const idempotencyKey = randomUUID();
    const submit = () =>
      supertest(app.getHttpServer())
        .post(`/api/v1/cases/${aftercareCase.id}/aftercare/check-ins`)
        .set('Authorization', authorization)
        .set('x-idempotency-key', idempotencyKey)
        .send({
          aftercarePlanId: aftercarePlan.id,
          painScale: 9,
          symptomCodes: ['UNCONTROLLED_BLEEDING'],
          photoFileAssetIds: [],
        })
        .expect(201);
    const first = await submit();
    const replay = await submit();
    const firstCheckIn = first.body.data.checkIns[0];
    expect(replay.body.data.checkIns[0].id).toBe(firstCheckIn.id);
    expect(firstCheckIn.escalations[0]).toMatchObject({ severity: 'URGENT', status: 'OPEN' });
    expect(
      await prisma.auditLog.count({
        where: { action: 'aftercare.check-in-submitted', resourceId: firstCheckIn.id },
      }),
    ).toBe(1);
  });
});

function requiredCookies(value: string | string[] | undefined): string[] {
  if (!value) throw new Error('Authentication response did not set a session cookie.');
  return Array.isArray(value) ? value : [value];
}

function assertDisposableIntegrationDatabase(databaseUrl: string): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Backend integration tests require NODE_ENV=test.');
  }
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//u, '').toLowerCase();
  if (!/(?:test|ci|e2e|verify)/u.test(databaseName)) {
    throw new Error('Backend integration tests require an explicitly disposable database name.');
  }
}
