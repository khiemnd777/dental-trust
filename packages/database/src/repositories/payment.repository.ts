import {
  type Currency,
  type PaymentStatus as PrismaPaymentStatus,
  Prisma,
  type PrismaClient,
  type Refund,
  type RefundStatus as PrismaRefundStatus,
} from '@prisma/client';

import {
  assertMinorUnitAmount,
  calculateBookingDepositMinor,
  DomainRuleError,
  paymentStatusAfterRefunds,
  reconcilePaymentStatus,
  type AuditActor,
  type PaymentProviderEvidence,
} from '@dental-trust/domain';

import { IdempotencyConflictError, OptimisticConcurrencyError } from './case.repository.js';

const paymentCommandLifetimeMs = 24 * 60 * 60_000;

const paymentRecordInclude = {
  booking: {
    select: {
      caseId: true,
      dentalCase: { select: { patientProfile: { select: { userId: true } } } },
    },
  },
  refunds: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
} satisfies Prisma.PaymentInclude;

export type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentRecordInclude }>;
export type RefundRecord = Refund;

export interface PaymentPageOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly bookingId?: string;
  readonly status?: PrismaPaymentStatus;
}

export interface RefundReservationInput {
  readonly paymentId: string;
  readonly requestedByUserId: string;
  readonly amountMinor: number;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly actor: AuditActor;
}

export interface PaymentRecoveryCommand {
  readonly key: string;
  readonly operation: 'payment.deposit-recover';
  readonly requestHash: string;
}

export interface PaymentWebhookInput {
  readonly webhookEventId: string;
  readonly providerEventId: string;
  readonly providerEventCreatedAt: Date;
  readonly providerIntentId: string;
  readonly metadataPaymentId?: string;
  readonly evidence: PaymentProviderEvidence;
  readonly amountMinor: number;
  readonly currency: string;
  readonly requestId: string;
}

export interface RefundWebhookInput {
  readonly webhookEventId: string;
  readonly providerEventId: string;
  readonly providerEventCreatedAt: Date;
  readonly providerRefundId: string;
  readonly providerIntentId?: string;
  readonly metadataRefundId?: string;
  readonly status: Extract<PrismaRefundStatus, 'PROCESSING' | 'SUCCEEDED' | 'FAILED'>;
  readonly amountMinor: number;
  readonly currency: string;
  readonly requestId: string;
}

export class PaymentNotFoundError extends Error {
  constructor() {
    super('Payment resource was not found in the caller scope.');
    this.name = 'PaymentNotFoundError';
  }
}

export class PaymentConflictError extends Error {
  constructor(message = 'The payment command conflicts with existing ledger state.') {
    super(message);
    this.name = 'PaymentConflictError';
  }
}

export class PaymentReconciliationError extends Error {
  constructor(
    readonly code: string,
    readonly resourceId: string,
  ) {
    super('Provider evidence requires payment reconciliation.');
    this.name = 'PaymentReconciliationError';
  }
}

export type WebhookReservation = 'PROCESS' | 'DUPLICATE' | 'BUSY';

export class PaymentRepository {
  constructor(private readonly db: PrismaClient) {}

  async reserveDepositIntent(
    patientUserId: string,
    bookingId: string,
    provider: 'stripe' | 'development',
    idempotencyKey: string,
    requestId: string,
    actor: AuditActor,
  ): Promise<PaymentRecord> {
    const replay = await this.findDepositReplay(bookingId, provider, idempotencyKey);
    if (replay) return replay;

    return this.db
      .$transaction(async (transaction) => {
        const booking = await transaction.booking.findFirst({
          where: {
            id: bookingId,
            dentalCase: { patientProfile: { userId: patientUserId } },
          },
          include: {
            treatmentPlanAcceptance: {
              select: { id: true, userId: true, acceptedAt: true },
            },
            treatmentPlanVersion: true,
          },
        });
        if (!booking) throw new PaymentNotFoundError();
        if (booking.status !== 'PENDING_DEPOSIT') {
          throw new PaymentConflictError('Only a booking pending its deposit can be paid.');
        }
        const plan = booking.treatmentPlanVersion;
        if (
          plan.status !== 'PUBLISHED' ||
          plan.expiresAt <= new Date() ||
          booking.treatmentPlanAcceptance.id !== booking.treatmentPlanAcceptanceId ||
          booking.treatmentPlanAcceptance.userId !== patientUserId
        ) {
          throw new DomainRuleError(
            'ACCEPTED_PLAN_REQUIRED',
            'A current, accepted, immutable treatment-plan version is required for a deposit.',
          );
        }
        if (
          plan.currency !== booking.currency ||
          booking.planTotalMinor !== plan.totalMinor ||
          booking.depositMinor !==
            calculateBookingDepositMinor(booking.planTotalMinor, booking.depositBasisPoints)
        ) {
          throw new DomainRuleError(
            'BOOKING_MONEY_MISMATCH',
            'The booking deposit does not reconcile to the accepted plan.',
          );
        }
        const amount = bigintToProviderAmount(booking.depositMinor, booking.currency);
        assertMinorUnitAmount(amount, booking.currency);

        const payment = await transaction.payment.create({
          data: {
            bookingId,
            provider,
            idempotencyKey,
            amountMinor: booking.depositMinor,
            currency: booking.currency,
          },
          include: paymentRecordInclude,
        });
        await transaction.auditLog.create({
          data: userAudit(actor, {
            action: 'payment.deposit-intent-requested',
            resourceType: 'Payment',
            resourceId: payment.id,
            requestId,
            success: true,
            afterMetadata: {
              bookingId,
              planVersionId: booking.treatmentPlanVersionId,
              amountMinor: booking.depositMinor.toString(),
              currency: booking.currency,
              status: payment.status,
            },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Payment',
            aggregateId: payment.id,
            eventType: 'payment.deposit-intent-requested',
            payload: { paymentId: payment.id, bookingId },
            correlationId: requestId,
            idempotencyKey: `payment.deposit-intent-requested:${payment.id}`,
          },
        });
        return payment;
      })
      .catch(async (error: unknown) => {
        if (!isUniqueConflict(error)) throw error;
        const raced = await this.findDepositReplay(bookingId, provider, idempotencyKey);
        if (raced) return raced;
        throw new PaymentConflictError();
      });
  }

  async recoverFailedDeposit(
    patientUserId: string,
    bookingId: string,
    expectedPaymentVersion: number,
    command: PaymentRecoveryCommand,
    requestId: string,
    actor: AuditActor,
  ): Promise<PaymentRecord> {
    const replay = await this.resolveRecoveryReplay(patientUserId, command, false);
    if (replay) return replay;
    try {
      return await this.db.$transaction(
        async (transaction) => {
          await transaction.idempotencyRecord.create({
            data: {
              userId: patientUserId,
              key: command.key,
              operation: command.operation,
              requestHash: command.requestHash,
              expiresAt: new Date(Date.now() + paymentCommandLifetimeMs),
            },
          });
          const current = await transaction.payment.findFirst({
            where: {
              bookingId,
              booking: {
                status: 'PENDING_DEPOSIT',
                dentalCase: { patientProfile: { userId: patientUserId } },
              },
            },
            include: paymentRecordInclude,
          });
          if (!current) throw new PaymentNotFoundError();
          if (current.version !== expectedPaymentVersion) throw new OptimisticConcurrencyError();
          if (current.status !== 'FAILED') {
            throw new PaymentConflictError(
              'Only a failed deposit can start a fresh provider attempt.',
            );
          }
          const updated = await transaction.payment.update({
            where: { id: current.id },
            data: {
              providerPaymentIntentId: null,
              providerEventCreatedAt: null,
              status: 'REQUIRES_PAYMENT_METHOD',
              version: { increment: 1 },
            },
            include: paymentRecordInclude,
          });
          await transaction.auditLog.create({
            data: userAudit(actor, {
              action: 'payment.failed-deposit-recovery-requested',
              resourceType: 'Payment',
              resourceId: current.id,
              requestId,
              success: true,
              beforeMetadata: {
                status: current.status,
                version: current.version,
                providerIntentBound: Boolean(current.providerPaymentIntentId),
              },
              afterMetadata: {
                status: updated.status,
                version: updated.version,
                bookingId,
              },
            }),
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateType: 'Payment',
              aggregateId: current.id,
              eventType: 'payment.failed-deposit-recovery-requested',
              payload: { paymentId: current.id, bookingId, version: updated.version },
              correlationId: requestId,
              idempotencyKey: `payment.failed-deposit-recovery:${current.id}:${updated.version}`,
            },
          });
          await transaction.idempotencyRecord.update({
            where: { userId_key: { userId: patientUserId, key: command.key } },
            data: {
              status: 'COMPLETED',
              resourceId: current.id,
              response: { resourceId: current.id },
              completedAt: new Date(),
            },
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isIdempotencyInsertRace(error)) {
        const raced = await this.resolveRecoveryReplay(patientUserId, command, true);
        if (raced) return raced;
      }
      if (isPrismaCode(error, 'P2034')) {
        throw new IdempotencyConflictError(
          'The payment recovery command conflicted with another transaction.',
        );
      }
      throw error;
    }
  }

  async finalizeDepositIntent(
    paymentId: string,
    providerIntentId: string,
    providerStatus:
      'REQUIRES_PAYMENT_METHOD' | 'REQUIRES_ACTION' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED',
    requestId: string,
    actor: AuditActor,
  ): Promise<PaymentRecord> {
    return this.db.$transaction(async (transaction) => {
      const current = await transaction.payment.findUnique({
        where: { id: paymentId },
        include: paymentRecordInclude,
      });
      if (!current) throw new PaymentNotFoundError();
      if (current.providerPaymentIntentId && current.providerPaymentIntentId !== providerIntentId) {
        throw new PaymentConflictError('A payment cannot be rebound to another provider intent.');
      }
      const synchronousStatus = providerStatus === 'SUCCEEDED' ? 'PROCESSING' : providerStatus;
      const status = current.providerEventCreatedAt ? current.status : synchronousStatus;
      const alreadyFinalized =
        current.providerPaymentIntentId === providerIntentId && current.status === status;
      if (alreadyFinalized) return current;

      const updated = await transaction.payment.update({
        where: { id: paymentId },
        data: {
          providerPaymentIntentId: providerIntentId,
          status,
          version: { increment: 1 },
        },
        include: paymentRecordInclude,
      });
      await transaction.auditLog.create({
        data: userAudit(actor, {
          action: 'payment.deposit-intent-created',
          resourceType: 'Payment',
          resourceId: paymentId,
          requestId,
          success: true,
          beforeMetadata: { status: current.status, version: current.version },
          afterMetadata: { status: updated.status, version: updated.version, providerIntentId },
        }),
      });
      await transaction.outboxEvent.upsert({
        where: { idempotencyKey: `payment.deposit-intent-created:${paymentId}` },
        update: {},
        create: {
          aggregateType: 'Payment',
          aggregateId: paymentId,
          eventType: 'payment.deposit-intent-created',
          payload: { paymentId, bookingId: updated.bookingId, status: updated.status },
          correlationId: requestId,
          idempotencyKey: `payment.deposit-intent-created:${paymentId}`,
        },
      });
      return updated;
    });
  }

  async listScoped(
    userId: string,
    includeAll: boolean,
    options: PaymentPageOptions,
  ): Promise<PaymentRecord[]> {
    return this.db.payment.findMany({
      where: {
        AND: [
          includeAll ? {} : { booking: { dentalCase: { patientProfile: { userId } } } },
          options.bookingId ? { bookingId: options.bookingId } : {},
          options.status ? { status: options.status } : {},
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: options.limit + 1,
      include: paymentRecordInclude,
    });
  }

  async reserveRefund(input: RefundReservationInput): Promise<RefundRecord> {
    const replay = await this.findRefundReplay(input);
    if (replay) return replay;

    return this.db
      .$transaction(
        async (transaction) => {
          await transaction.$queryRaw(
            Prisma.sql`SELECT "id" FROM "payments" WHERE "id" = ${input.paymentId}::uuid FOR UPDATE`,
          );
          const payment = await transaction.payment.findUnique({
            where: { id: input.paymentId },
            include: { refunds: true },
          });
          if (!payment) throw new PaymentNotFoundError();
          if (!['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
            throw new PaymentConflictError('Only a settled payment can be refunded.');
          }
          if (!payment.providerPaymentIntentId) {
            throw new PaymentConflictError('The settled payment has no provider intent.');
          }
          const amount = BigInt(input.amountMinor);
          const reserved = payment.refunds
            .filter(({ status }) => status !== 'FAILED' && status !== 'REJECTED')
            .reduce((sum, refund) => sum + refund.amountMinor, 0n);
          if (reserved + amount > payment.amountMinor) {
            throw new DomainRuleError(
              'REFUND_EXCEEDS_REMAINING_AMOUNT',
              'The refund exceeds the unreserved settled amount.',
            );
          }

          const refund = await transaction.refund.create({
            data: {
              paymentId: input.paymentId,
              requestedByUserId: input.requestedByUserId,
              idempotencyKey: input.idempotencyKey,
              amountMinor: amount,
              reason: input.reason,
            },
          });
          await transaction.auditLog.create({
            data: userAudit(input.actor, {
              action: 'refund.requested',
              resourceType: 'Refund',
              resourceId: refund.id,
              requestId: input.requestId,
              reason: input.reason,
              success: true,
              afterMetadata: {
                paymentId: input.paymentId,
                amountMinor: amount.toString(),
                status: refund.status,
              },
            }),
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateType: 'Refund',
              aggregateId: refund.id,
              eventType: 'refund.requested',
              payload: { refundId: refund.id, paymentId: input.paymentId },
              correlationId: input.requestId,
              idempotencyKey: `refund.requested:${refund.id}`,
            },
          });
          return refund;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch(async (error: unknown) => {
        if (!isUniqueConflict(error)) throw error;
        const raced = await this.findRefundReplay(input);
        if (raced) return raced;
        throw new PaymentConflictError();
      });
  }

  async loadRefundPayment(refundId: string) {
    return this.db.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
  }

  async finalizeRefund(
    refundId: string,
    providerRefundId: string,
    providerStatus: 'PROCESSING' | 'SUCCEEDED' | 'FAILED',
    requestId: string,
    actor: AuditActor,
  ): Promise<RefundRecord> {
    return this.db.$transaction(async (transaction) => {
      const current = await transaction.refund.findUnique({ where: { id: refundId } });
      if (!current) throw new PaymentNotFoundError();
      if (current.providerRefundId && current.providerRefundId !== providerRefundId) {
        throw new PaymentConflictError('A refund cannot be rebound to another provider refund.');
      }
      const synchronousStatus = providerStatus === 'SUCCEEDED' ? 'PROCESSING' : providerStatus;
      const status = current.providerEventCreatedAt ? current.status : synchronousStatus;
      if (current.providerRefundId === providerRefundId && current.status === status)
        return current;
      const updated = await transaction.refund.update({
        where: { id: refundId },
        data: { providerRefundId, status, version: { increment: 1 } },
      });
      await transaction.auditLog.create({
        data: userAudit(actor, {
          action: 'refund.submitted-to-provider',
          resourceType: 'Refund',
          resourceId: refundId,
          requestId,
          reason: updated.reason,
          success: providerStatus !== 'FAILED',
          beforeMetadata: { status: current.status, version: current.version },
          afterMetadata: { status: updated.status, version: updated.version, providerRefundId },
        }),
      });
      await transaction.outboxEvent.upsert({
        where: { idempotencyKey: `refund.submitted-to-provider:${refundId}` },
        update: {},
        create: {
          aggregateType: 'Refund',
          aggregateId: refundId,
          eventType: 'refund.submitted-to-provider',
          payload: { refundId, paymentId: updated.paymentId, status: updated.status },
          correlationId: requestId,
          idempotencyKey: `refund.submitted-to-provider:${refundId}`,
        },
      });
      return updated;
    });
  }

  async reserveWebhookEvent(
    providerEventId: string,
    type: string,
    sanitizedPayload: Prisma.InputJsonValue,
  ): Promise<{ readonly eventId: string; readonly reservation: WebhookReservation }> {
    const now = new Date();
    try {
      const created = await this.db.webhookEvent.create({
        data: {
          provider: 'stripe',
          providerEventId,
          type,
          payload: sanitizedPayload,
          status: 'PROCESSING',
          attemptCount: 1,
          processingStartedAt: now,
        },
      });
      return { eventId: created.id, reservation: 'PROCESS' };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }

    const existing = await this.db.webhookEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider: 'stripe', providerEventId } },
    });
    if (existing.status === 'PROCESSED') {
      return { eventId: existing.id, reservation: 'DUPLICATE' };
    }
    const staleBefore = new Date(now.getTime() - 5 * 60_000);
    const changed = await this.db.webhookEvent.updateMany({
      where: {
        id: existing.id,
        status: { in: ['RECEIVED', 'FAILED', 'PROCESSING'] },
        OR: [
          { status: { in: ['RECEIVED', 'FAILED'] } },
          { processingStartedAt: null },
          { processingStartedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: 'PROCESSING',
        processingStartedAt: now,
        processedAt: null,
        lastErrorCode: null,
        attemptCount: { increment: 1 },
      },
    });
    return {
      eventId: existing.id,
      reservation: changed.count === 1 ? 'PROCESS' : 'BUSY',
    };
  }

  async applyPaymentWebhook(input: PaymentWebhookInput): Promise<'UPDATED' | 'STALE'> {
    return this.db.$transaction(
      async (transaction) => {
        const candidate = await transaction.payment.findFirst({
          where: {
            OR: [
              ...(input.metadataPaymentId ? [{ id: input.metadataPaymentId }] : []),
              { providerPaymentIntentId: input.providerIntentId },
            ],
          },
        });
        if (!candidate) {
          throw new PaymentReconciliationError('PAYMENT_NOT_FOUND', input.providerIntentId);
        }
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "payments" WHERE "id" = ${candidate.id}::uuid FOR UPDATE`,
        );
        const current = await transaction.payment.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        if (
          current.provider !== 'stripe' ||
          (current.providerPaymentIntentId &&
            current.providerPaymentIntentId !== input.providerIntentId) ||
          (input.metadataPaymentId && input.metadataPaymentId !== current.id)
        ) {
          throw new PaymentReconciliationError('PAYMENT_PROVIDER_ID_MISMATCH', current.id);
        }
        if (
          current.providerEventCreatedAt &&
          current.providerEventCreatedAt > input.providerEventCreatedAt
        ) {
          await markWebhookProcessed(transaction, input.webhookEventId);
          return 'STALE';
        }
        if (
          input.evidence === 'SUCCEEDED' &&
          (BigInt(input.amountMinor) !== current.amountMinor ||
            input.currency.toUpperCase() !== current.currency)
        ) {
          throw new PaymentReconciliationError('PAYMENT_AMOUNT_MISMATCH', current.id);
        }

        const status = reconcilePaymentStatus(current.status, input.evidence);
        const updated = await transaction.payment.update({
          where: { id: current.id },
          data: {
            providerPaymentIntentId: input.providerIntentId,
            providerEventCreatedAt: input.providerEventCreatedAt,
            status,
            version: { increment: 1 },
          },
        });
        const newlySettled = status === 'SUCCEEDED' && current.status !== 'SUCCEEDED';
        const receipt = newlySettled
          ? await transaction.receipt.findUnique({
              where: { paymentId: current.id },
              select: { id: true, receiptNumber: true },
            })
          : null;
        await transaction.auditLog.create({
          data: providerAudit({
            action: 'payment.provider-status-reconciled',
            resourceType: 'Payment',
            resourceId: current.id,
            requestId: input.requestId,
            success: true,
            beforeMetadata: { status: current.status, version: current.version },
            afterMetadata: {
              status: updated.status,
              version: updated.version,
              providerEventId: input.providerEventId,
            },
          }),
        });
        if (newlySettled) {
          await transaction.auditLog.create({
            data: providerAudit({
              action: 'booking.deposit-confirmed',
              resourceType: 'Booking',
              resourceId: current.bookingId,
              requestId: input.requestId,
              success: true,
              afterMetadata: { paymentId: current.id, receiptId: receipt?.id ?? null },
            }),
          });
        }
        await transaction.outboxEvent.createMany({
          data: [
            {
              aggregateType: 'Payment',
              aggregateId: current.id,
              eventType: 'payment.provider-status-reconciled',
              payload: {
                paymentId: current.id,
                bookingId: current.bookingId,
                status: updated.status,
              },
              correlationId: input.requestId,
              idempotencyKey: `payment.provider-event:${input.providerEventId}`,
            },
            ...(receipt
              ? [
                  {
                    aggregateType: 'Receipt',
                    aggregateId: receipt.id,
                    eventType: 'receipt.issued',
                    payload: {
                      receiptId: receipt.id,
                      receiptNumber: receipt.receiptNumber,
                      paymentId: current.id,
                      bookingId: current.bookingId,
                    },
                    correlationId: input.requestId,
                    idempotencyKey: `receipt.issued:${receipt.id}`,
                  },
                ]
              : []),
          ],
        });
        await markWebhookProcessed(transaction, input.webhookEventId);
        return 'UPDATED';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async applyRefundWebhook(input: RefundWebhookInput): Promise<'UPDATED' | 'STALE'> {
    return this.db.$transaction(
      async (transaction) => {
        const candidate = await transaction.refund.findFirst({
          where: {
            OR: [
              ...(input.metadataRefundId ? [{ id: input.metadataRefundId }] : []),
              { providerRefundId: input.providerRefundId },
            ],
          },
          include: { payment: true },
        });
        if (!candidate) {
          throw new PaymentReconciliationError('REFUND_NOT_FOUND', input.providerRefundId);
        }
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "payments" WHERE "id" = ${candidate.paymentId}::uuid FOR UPDATE`,
        );
        const current = await transaction.refund.findUniqueOrThrow({
          where: { id: candidate.id },
          include: { payment: true },
        });
        if (
          current.payment.provider !== 'stripe' ||
          (current.providerRefundId && current.providerRefundId !== input.providerRefundId) ||
          (input.metadataRefundId && input.metadataRefundId !== current.id) ||
          (input.providerIntentId &&
            current.payment.providerPaymentIntentId !== input.providerIntentId)
        ) {
          throw new PaymentReconciliationError('REFUND_PROVIDER_ID_MISMATCH', current.id);
        }
        if (
          current.providerEventCreatedAt &&
          current.providerEventCreatedAt > input.providerEventCreatedAt
        ) {
          await markWebhookProcessed(transaction, input.webhookEventId);
          return 'STALE';
        }
        if (
          BigInt(input.amountMinor) !== current.amountMinor ||
          input.currency.toUpperCase() !== current.payment.currency
        ) {
          throw new PaymentReconciliationError('REFUND_AMOUNT_MISMATCH', current.id);
        }
        const status = reconcileRefundStatus(current.status, input.status);
        const updated = await transaction.refund.update({
          where: { id: current.id },
          data: {
            providerRefundId: input.providerRefundId,
            providerEventCreatedAt: input.providerEventCreatedAt,
            status,
            version: { increment: 1 },
          },
        });

        let paymentStatus = current.payment.status;
        if (status === 'SUCCEEDED') {
          const succeeded = await transaction.refund.aggregate({
            where: { paymentId: current.paymentId, status: 'SUCCEEDED' },
            _sum: { amountMinor: true },
          });
          paymentStatus = paymentStatusAfterRefunds(
            current.payment.amountMinor,
            succeeded._sum.amountMinor ?? 0n,
          );
          if (paymentStatus !== current.payment.status) {
            await transaction.payment.update({
              where: { id: current.paymentId },
              data: { status: paymentStatus, version: { increment: 1 } },
            });
          }
        }
        await transaction.auditLog.create({
          data: providerAudit({
            action: 'refund.provider-status-reconciled',
            resourceType: 'Refund',
            resourceId: current.id,
            requestId: input.requestId,
            success: true,
            beforeMetadata: { status: current.status, version: current.version },
            afterMetadata: {
              status: updated.status,
              version: updated.version,
              paymentStatus,
              providerEventId: input.providerEventId,
            },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Refund',
            aggregateId: current.id,
            eventType: 'refund.provider-status-reconciled',
            payload: { refundId: current.id, paymentId: current.paymentId, status: updated.status },
            correlationId: input.requestId,
            idempotencyKey: `refund.provider-event:${input.providerEventId}`,
          },
        });
        await markWebhookProcessed(transaction, input.webhookEventId);
        return 'UPDATED';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async completeIgnoredWebhook(webhookEventId: string): Promise<void> {
    await this.db.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: 'PROCESSED', processedAt: new Date(), processingStartedAt: null },
    });
  }

  async markWebhookFailed(
    webhookEventId: string,
    errorCode: string,
    requestId: string,
    resourceId: string,
  ): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const changed = await transaction.webhookEvent.updateMany({
        where: { id: webhookEventId, status: 'PROCESSING' },
        data: { status: 'FAILED', lastErrorCode: errorCode, processingStartedAt: null },
      });
      if (changed.count === 0) return;
      await transaction.auditLog.create({
        data: providerAudit({
          action: 'payment.reconciliation-required',
          resourceType: 'ProviderPaymentResource',
          resourceId,
          requestId,
          success: false,
          afterMetadata: { errorCode, webhookEventId },
        }),
      });
      await transaction.outboxEvent.upsert({
        where: { idempotencyKey: `payment.reconciliation-required:${webhookEventId}` },
        update: {},
        create: {
          aggregateType: 'WebhookEvent',
          aggregateId: webhookEventId,
          eventType: 'payment.reconciliation-required',
          payload: { webhookEventId, errorCode, resourceId },
          correlationId: requestId,
          idempotencyKey: `payment.reconciliation-required:${webhookEventId}`,
        },
      });
    });
  }

  private async findDepositReplay(
    bookingId: string,
    provider: 'stripe' | 'development',
    idempotencyKey: string,
  ): Promise<PaymentRecord | null> {
    const byKey = await this.db.payment.findUnique({
      where: { idempotencyKey },
      include: paymentRecordInclude,
    });
    if (byKey) {
      if (byKey.bookingId !== bookingId || byKey.provider !== provider) {
        throw new PaymentConflictError('The idempotency key belongs to another payment command.');
      }
      return byKey;
    }
    const byBooking = await this.db.payment.findUnique({
      where: { bookingId },
      include: paymentRecordInclude,
    });
    if (byBooking) {
      throw new PaymentConflictError(
        'This booking already has a deposit intent; replay its original idempotency key.',
      );
    }
    return null;
  }

  private async resolveRecoveryReplay(
    patientUserId: string,
    command: PaymentRecoveryCommand,
    wait: boolean,
  ): Promise<PaymentRecord | null> {
    for (let attempt = 0; attempt < (wait ? 25 : 1); attempt += 1) {
      const record = await this.db.idempotencyRecord.findUnique({
        where: { userId_key: { userId: patientUserId, key: command.key } },
      });
      if (!record) {
        if (!wait) return null;
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      if (record.operation !== command.operation || record.requestHash !== command.requestHash) {
        throw new IdempotencyConflictError(
          'The idempotency key was used for another payment command.',
        );
      }
      if (record.expiresAt <= new Date()) {
        await this.db.idempotencyRecord.deleteMany({
          where: { id: record.id, expiresAt: { lte: new Date() } },
        });
        return null;
      }
      if (record.status === 'COMPLETED' && record.resourceId) {
        const payment = await this.db.payment.findFirst({
          where: {
            id: record.resourceId,
            booking: { dentalCase: { patientProfile: { userId: patientUserId } } },
          },
          include: paymentRecordInclude,
        });
        if (!payment) throw new PaymentNotFoundError();
        return payment;
      }
      if (!wait) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new IdempotencyConflictError('The original payment recovery is still in progress.');
  }

  private async findRefundReplay(input: RefundReservationInput): Promise<RefundRecord | null> {
    const refund = await this.db.refund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!refund) return null;
    if (
      refund.paymentId !== input.paymentId ||
      refund.requestedByUserId !== input.requestedByUserId ||
      refund.amountMinor !== BigInt(input.amountMinor) ||
      refund.reason !== input.reason
    ) {
      throw new PaymentConflictError('The idempotency key belongs to another refund command.');
    }
    return refund;
  }
}

function bigintToProviderAmount(amount: bigint, currency: Currency): number {
  if (amount > 99_999_999n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainRuleError(
      'PAYMENT_AMOUNT_UNSUPPORTED',
      'The booking deposit exceeds the configured provider amount limit.',
      { amount: amount.toString(), currency },
    );
  }
  return Number(amount);
}

function userAudit(
  actor: AuditActor,
  event: Omit<Prisma.AuditLogUncheckedCreateInput, 'actorUserId'>,
): Prisma.AuditLogUncheckedCreateInput {
  return {
    ...event,
    actorType: 'USER',
    actorUserId: actor.userId,
    ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
    ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
  };
}

function providerAudit(
  event: Omit<Prisma.AuditLogUncheckedCreateInput, 'actorType'>,
): Prisma.AuditLogUncheckedCreateInput {
  return { ...event, actorType: 'PROVIDER' };
}

async function markWebhookProcessed(
  transaction: Prisma.TransactionClient,
  webhookEventId: string,
): Promise<void> {
  await transaction.webhookEvent.update({
    where: { id: webhookEventId },
    data: { status: 'PROCESSED', processedAt: new Date(), processingStartedAt: null },
  });
}

function reconcileRefundStatus(
  current: PrismaRefundStatus,
  evidence: Extract<PrismaRefundStatus, 'PROCESSING' | 'SUCCEEDED' | 'FAILED'>,
): PrismaRefundStatus {
  if (current === 'SUCCEEDED') return current;
  if (evidence === 'SUCCEEDED') return 'SUCCEEDED';
  if (current === 'FAILED' && evidence === 'PROCESSING') return current;
  return evidence;
}

function isUniqueConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

function isIdempotencyInsertRace(error: unknown): boolean {
  if (!isUniqueConflict(error)) return false;
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes('user_id') && target.includes('key')
    : String(target).includes('idempotency_records');
}
