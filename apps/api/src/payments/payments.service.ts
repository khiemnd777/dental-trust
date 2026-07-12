import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Stripe from 'stripe';
import { z } from 'zod';

import { hasPermission, requiresMfa, type AccessContext } from '@dental-trust/auth';
import type {
  DepositIntentView,
  PaymentListQuery,
  PaymentView,
  RecoverDepositIntentRequest,
  RefundView,
  RequestRefundRequest,
} from '@dental-trust/contracts';
import type { ServerEnvironment } from '@dental-trust/config/server';
import {
  PaymentReconciliationError,
  PaymentRepository,
  type PaymentRecord,
  type PrismaClient,
  type Refund,
} from '@dental-trust/database';
import { sha256 } from '@dental-trust/security';

import { PAYMENT_PROVIDER, PRISMA, SERVER_ENV } from '../common/tokens.js';
import type {
  PaymentProvider,
  RefundResult,
} from '../infrastructure/providers/payment.provider.js';

const uuidSchema = z.uuid();

@Injectable()
export class PaymentsService {
  private readonly payments: PaymentRepository;

  constructor(
    @Inject(PRISMA) db: PrismaClient,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(SERVER_ENV) private readonly environment: ServerEnvironment,
  ) {
    this.payments = new PaymentRepository(db);
  }

  async createDepositIntent(
    access: AccessContext,
    bookingId: string,
    idempotencyKey: string,
  ): Promise<DepositIntentView> {
    if (!hasPermission(access, 'payment:read:own')) throw new ForbiddenException();
    const reserved = await this.payments.reserveDepositIntent(
      access.userId,
      bookingId,
      this.provider.name,
      idempotencyKey,
      access.requestId,
      auditActor(access),
    );

    const providerResult = await providerCall(() =>
      reserved.providerPaymentIntentId
        ? this.provider.retrieveIntent(reserved.providerPaymentIntentId)
        : this.provider.createIntent({
            paymentId: reserved.id,
            amountMinor: providerAmount(reserved.amountMinor),
            currency: reserved.currency,
            idempotencyKey,
          }),
    );
    const payment = await this.payments.finalizeDepositIntent(
      reserved.id,
      providerResult.providerIntentId,
      providerResult.status,
      access.requestId,
      auditActor(access),
    );
    return { ...toPaymentView(payment), clientSecret: providerResult.clientSecret ?? null };
  }

  async recoverDepositIntent(
    access: AccessContext,
    input: RecoverDepositIntentRequest,
    idempotencyKey: string,
  ): Promise<DepositIntentView> {
    if (!hasPermission(access, 'payment:read:own') || access.impersonation) {
      throw new ForbiddenException();
    }
    const recovered = await this.payments.recoverFailedDeposit(
      access.userId,
      input.bookingId,
      input.expectedPaymentVersion,
      {
        key: idempotencyKey,
        operation: 'payment.deposit-recover',
        requestHash: sha256(JSON.stringify(input)),
      },
      access.requestId,
      auditActor(access),
    );
    const providerResult = await providerCall(() =>
      recovered.providerPaymentIntentId
        ? this.provider.retrieveIntent(recovered.providerPaymentIntentId)
        : this.provider.createIntent({
            paymentId: recovered.id,
            amountMinor: providerAmount(recovered.amountMinor),
            currency: recovered.currency,
            idempotencyKey,
          }),
    );
    const payment = await this.payments.finalizeDepositIntent(
      recovered.id,
      providerResult.providerIntentId,
      providerResult.status,
      access.requestId,
      auditActor(access),
    );
    return { ...toPaymentView(payment), clientSecret: providerResult.clientSecret ?? null };
  }

  async list(
    access: AccessContext,
    query: PaymentListQuery,
  ): Promise<{ readonly data: readonly PaymentView[]; readonly nextCursor: string | null }> {
    const includeAll = hasPermission(access, 'payment:manage');
    if (includeAll && requiresMfa(access)) throw new ForbiddenException();
    if (!includeAll && !hasPermission(access, 'payment:read:own')) throw new ForbiddenException();
    const records = await this.payments.listScoped(access.userId, includeAll, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map(toPaymentView),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async requestRefund(
    access: AccessContext,
    paymentId: string,
    input: RequestRefundRequest,
    idempotencyKey: string,
  ): Promise<RefundView> {
    if (!hasPermission(access, 'payment:manage') || requiresMfa(access)) {
      throw new ForbiddenException();
    }
    const refund = await this.payments.reserveRefund({
      paymentId,
      requestedByUserId: access.userId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      idempotencyKey,
      requestId: access.requestId,
      actor: auditActor(access),
    });
    const refundPayment = await this.payments.loadRefundPayment(refund.id);
    const providerIntentId = refundPayment?.payment.providerPaymentIntentId;
    if (!providerIntentId || refundPayment.payment.provider !== this.provider.name) {
      throw new ServiceUnavailableException('Payment provider reconciliation is required.');
    }
    const providerResult = await providerCall<RefundResult>(() =>
      this.provider.createRefund({
        refundId: refund.id,
        providerIntentId,
        amountMinor: providerAmount(refund.amountMinor),
        idempotencyKey,
      }),
    );
    return toRefundView(
      await this.payments.finalizeRefund(
        refund.id,
        providerResult.providerRefundId,
        providerResult.status,
        access.requestId,
        auditActor(access),
      ),
    );
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string, requestId: string) {
    let event: Stripe.Event;
    try {
      event = this.provider.verifyWebhook(rawBody, signature);
    } catch {
      throw new BadRequestException('Stripe webhook signature verification failed.');
    }
    if (this.provider.name !== 'stripe') {
      throw new BadRequestException('Stripe webhooks are disabled for this payment adapter.');
    }
    if (
      (this.environment.NODE_ENV === 'production' && !event.livemode) ||
      (this.environment.NODE_ENV !== 'production' && event.livemode)
    ) {
      throw new BadRequestException('Stripe webhook mode does not match this environment.');
    }

    const object = event.data.object as {
      readonly id?: string;
      readonly metadata?: Stripe.Metadata;
    };
    const metadataResourceId =
      validUuid(object.metadata?.dentalTrustPaymentId) ??
      validUuid(object.metadata?.dentalTrustRefundId);
    const reservation = await this.payments.reserveWebhookEvent(event.id, event.type, {
      providerEventId: event.id,
      type: event.type,
      created: event.created,
      livemode: event.livemode,
      objectId: object.id ?? 'unknown',
      ...(metadataResourceId ? { dentalTrustResourceId: metadataResourceId } : {}),
    });
    if (reservation.reservation === 'DUPLICATE') {
      return { accepted: true, outcome: 'DUPLICATE' as const };
    }
    if (reservation.reservation === 'BUSY') {
      throw new ServiceUnavailableException('Webhook processing is already in progress.');
    }

    try {
      const outcome = await this.processStripeEvent(event, reservation.eventId, requestId);
      return { accepted: true, outcome };
    } catch (error) {
      if (error instanceof PaymentReconciliationError) {
        await this.payments.markWebhookFailed(
          reservation.eventId,
          error.code,
          requestId,
          error.resourceId,
        );
        return { accepted: true, outcome: 'RECONCILIATION_REQUIRED' as const };
      }
      await this.payments.markWebhookFailed(
        reservation.eventId,
        'WEBHOOK_PROCESSING_FAILED',
        requestId,
        object.id ?? event.id,
      );
      throw new ServiceUnavailableException('Webhook processing failed and can be retried.');
    }
  }

  private async processStripeEvent(
    event: Stripe.Event,
    webhookEventId: string,
    requestId: string,
  ): Promise<'UPDATED' | 'STALE' | 'IGNORED'> {
    if (isPaymentIntentEvent(event.type)) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const metadataPaymentId = validUuid(intent.metadata.dentalTrustPaymentId);
      return this.payments.applyPaymentWebhook({
        webhookEventId,
        providerEventId: event.id,
        providerEventCreatedAt: new Date(event.created * 1_000),
        providerIntentId: intent.id,
        ...(metadataPaymentId ? { metadataPaymentId } : {}),
        evidence: paymentEvidence(event.type),
        amountMinor:
          event.type === 'payment_intent.succeeded' ? intent.amount_received : intent.amount,
        currency: intent.currency,
        requestId,
      });
    }
    if (isRefundEvent(event.type)) {
      const refund = event.data.object as Stripe.Refund;
      const providerIntentId =
        typeof refund.payment_intent === 'string'
          ? refund.payment_intent
          : refund.payment_intent?.id;
      const metadataRefundId = validUuid(refund.metadata?.dentalTrustRefundId);
      return this.payments.applyRefundWebhook({
        webhookEventId,
        providerEventId: event.id,
        providerEventCreatedAt: new Date(event.created * 1_000),
        providerRefundId: refund.id,
        ...(providerIntentId ? { providerIntentId } : {}),
        ...(metadataRefundId ? { metadataRefundId } : {}),
        status: refundEvidence(event.type, refund.status),
        amountMinor: refund.amount,
        currency: refund.currency,
        requestId,
      });
    }
    await this.payments.completeIgnoredWebhook(webhookEventId);
    return 'IGNORED';
  }
}

function auditActor(access: AccessContext) {
  return {
    userId: access.userId,
    sessionId: access.sessionId,
    ...(access.selectedOrganizationId ? { organizationId: access.selectedOrganizationId } : {}),
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}

function toPaymentView(payment: PaymentRecord): PaymentView {
  if (payment.provider !== 'stripe' && payment.provider !== 'development') {
    throw new Error('Unsupported payment provider persisted in the ledger.');
  }
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    caseId: payment.booking.caseId,
    provider: payment.provider,
    providerPaymentIntentId: payment.providerPaymentIntentId,
    amountMinor: payment.amountMinor.toString(),
    currency: payment.currency,
    status: payment.status,
    version: payment.version,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    refunds: payment.refunds.map(toRefundView),
  };
}

function toRefundView(refund: Refund): RefundView {
  return {
    id: refund.id,
    paymentId: refund.paymentId,
    providerRefundId: refund.providerRefundId,
    amountMinor: refund.amountMinor.toString(),
    reason: refund.reason,
    status: refund.status,
    version: refund.version,
    createdAt: refund.createdAt.toISOString(),
    updatedAt: refund.updatedAt.toISOString(),
  };
}

async function providerCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new ServiceUnavailableException('Payment provider is temporarily unavailable.');
  }
}

function providerAmount(amount: bigint): number {
  if (amount > 99_999_999n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BadRequestException('Payment amount exceeds the provider limit.');
  }
  return Number(amount);
}

function validUuid(value: string | undefined): string | undefined {
  const result = uuidSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function isPaymentIntentEvent(type: string): boolean {
  return [
    'payment_intent.succeeded',
    'payment_intent.processing',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'payment_intent.requires_action',
  ].includes(type);
}

function paymentEvidence(type: string) {
  if (type === 'payment_intent.succeeded') return 'SUCCEEDED' as const;
  if (type === 'payment_intent.processing') return 'PROCESSING' as const;
  if (type === 'payment_intent.canceled') return 'CANCELLED' as const;
  if (type === 'payment_intent.requires_action') return 'REQUIRES_ACTION' as const;
  return 'FAILED' as const;
}

function isRefundEvent(type: string): boolean {
  return ['refund.created', 'refund.updated', 'refund.failed'].includes(type);
}

function refundEvidence(
  eventType: string,
  status: string | null,
): 'PROCESSING' | 'SUCCEEDED' | 'FAILED' {
  if (eventType === 'refund.failed' || status === 'failed' || status === 'canceled')
    return 'FAILED';
  if (status === 'succeeded') return 'SUCCEEDED';
  return 'PROCESSING';
}
