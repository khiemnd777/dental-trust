import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import type { ServerEnvironment } from '@dental-trust/config/server';
import type { PaymentRecord, PrismaClient } from '@dental-trust/database';

import type { PaymentProvider } from '../infrastructure/providers/payment.provider.js';
import { PaymentsService } from './payments.service.js';

const patientAccess: AccessContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  roles: ['PATIENT'],
  memberships: [],
  mfaVerified: false,
  requestId: 'payment-test-request',
};

const environment = {
  NODE_ENV: 'test',
} as ServerEnvironment;

function provider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: 'development',
    createIntent: vi.fn(),
    retrieveIntent: vi.fn(),
    createRefund: vi.fn(),
    verifyWebhook: vi.fn(),
    ...overrides,
  };
}

describe('PaymentsService security boundary', () => {
  it('derives provider amount and currency from the reserved booking ledger', async () => {
    const createIntent = vi.fn().mockResolvedValue({
      provider: 'development',
      providerIntentId: 'dev_intent',
      status: 'REQUIRES_ACTION',
    });
    const service = new PaymentsService(
      {} as PrismaClient,
      provider({ createIntent }),
      environment,
    );
    const payment = paymentRecord();
    Object.defineProperty(service, 'payments', {
      value: {
        reserveDepositIntent: vi.fn().mockResolvedValue(payment),
        finalizeDepositIntent: vi.fn().mockResolvedValue({
          ...payment,
          providerPaymentIntentId: 'dev_intent',
          status: 'REQUIRES_ACTION',
        }),
      },
    });

    await service.createDepositIntent(patientAccess, payment.bookingId, 'payment-idempotency-0001');

    expect(createIntent).toHaveBeenCalledWith({
      paymentId: payment.id,
      amountMinor: 50_000,
      currency: 'USD',
      idempotencyKey: 'payment-idempotency-0001',
    });
  });

  it('requires current MFA for a finance payment history', async () => {
    const service = new PaymentsService({} as PrismaClient, provider(), environment);
    await expect(
      service.list(
        { ...patientAccess, roles: ['FINANCE_ADMIN'], mfaVerified: false },
        { limit: 25 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recovers a failed deposit by reusing its ledger row with a fresh provider attempt', async () => {
    const createIntent = vi.fn().mockResolvedValue({
      provider: 'development',
      providerIntentId: 'dev_recovered_intent',
      status: 'REQUIRES_ACTION',
    });
    const service = new PaymentsService(
      {} as PrismaClient,
      provider({ createIntent }),
      environment,
    );
    const failed = { ...paymentRecord(), status: 'FAILED' as const, version: 4 };
    Object.defineProperty(service, 'payments', {
      value: {
        recoverFailedDeposit: vi.fn().mockResolvedValue({
          ...failed,
          status: 'REQUIRES_PAYMENT_METHOD',
          version: 5,
        }),
        finalizeDepositIntent: vi.fn().mockResolvedValue({
          ...failed,
          providerPaymentIntentId: 'dev_recovered_intent',
          status: 'REQUIRES_ACTION',
          version: 6,
        }),
      },
    });
    await service.recoverDepositIntent(
      patientAccess,
      { bookingId: failed.bookingId, expectedPaymentVersion: 4 },
      'payment-recovery-idempotency-0001',
    );
    expect(createIntent).toHaveBeenCalledWith({
      paymentId: failed.id,
      amountMinor: 50_000,
      currency: 'USD',
      idempotencyKey: 'payment-recovery-idempotency-0001',
    });
  });

  it('rejects refund requests from a patient before loading payment data', async () => {
    const service = new PaymentsService({} as PrismaClient, provider(), environment);
    await expect(
      service.requestRefund(
        patientAccess,
        '00000000-0000-4000-8000-000000000010',
        { amountMinor: 1_000, reason: 'Patient cannot authorize this refund.' },
        'refund-idempotency-0001',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when a Stripe signature cannot be verified', async () => {
    const service = new PaymentsService(
      {} as PrismaClient,
      provider({
        name: 'stripe',
        verifyWebhook: vi.fn(() => {
          throw new Error('bad signature');
        }),
      }),
      environment,
    );
    await expect(
      service.handleStripeWebhook(Buffer.from('{}'), 'invalid', 'webhook-request'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function paymentRecord(): PaymentRecord {
  const now = new Date('2026-07-12T00:00:00.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000020',
    bookingId: '00000000-0000-4000-8000-000000000021',
    provider: 'development',
    providerPaymentIntentId: null,
    idempotencyKey: 'payment-idempotency-0001',
    amountMinor: 50_000n,
    currency: 'USD',
    status: 'REQUIRES_PAYMENT_METHOD',
    version: 1,
    providerEventCreatedAt: null,
    createdAt: now,
    updatedAt: now,
    booking: {
      caseId: '00000000-0000-4000-8000-000000000022',
      dentalCase: {
        patientProfile: { userId: patientAccess.userId },
      },
    },
    refunds: [],
  };
}
