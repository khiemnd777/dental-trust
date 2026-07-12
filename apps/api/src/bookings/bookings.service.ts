import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { hasPermission, requiresMfa, type AccessContext } from '@dental-trust/auth';
import type {
  BookingCheckoutOptionView,
  BookingCheckoutRequest,
  BookingCheckoutView,
  BookingListQuery,
  BookingView,
  CancelBookingRequest,
  CompleteBookingRequest,
  PaymentView,
} from '@dental-trust/contracts';
import {
  BookingRepository,
  cancellationPolicyOf,
  type BookingRecord,
  type BookingScope,
  type PrismaClient,
} from '@dental-trust/database';
import { sha256 } from '@dental-trust/security';

import { PRISMA } from '../common/tokens.js';
import { PaymentsService } from '../payments/payments.service.js';

@Injectable()
export class BookingsService {
  private readonly bookings: BookingRepository;

  constructor(
    @Inject(PRISMA) database: PrismaClient,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {
    this.bookings = new BookingRepository(database);
  }

  async checkoutOptions(access: AccessContext): Promise<readonly BookingCheckoutOptionView[]> {
    if (!hasPermission(access, 'booking:create:own')) throw new ForbiddenException();
    return (await this.bookings.checkoutOptions(access.userId)).map((option) => ({
      ...option,
      planTotalMinor: option.planTotalMinor.toString(),
      depositMinor: option.depositMinor.toString(),
      acceptedAt: option.acceptedAt.toISOString(),
      expiresAt: option.expiresAt.toISOString(),
    }));
  }

  async checkout(
    access: AccessContext,
    input: BookingCheckoutRequest,
    idempotencyKey: string,
  ): Promise<BookingCheckoutView> {
    if (!hasPermission(access, 'booking:create:own') || access.impersonation) {
      throw new ForbiddenException();
    }
    const actor = auditActor(access);
    const booking = await this.bookings.createFromAcceptance(
      access.userId,
      input.treatmentPlanAcceptanceId,
      {
        depositBasisPoints: input.expectedDepositBasisPoints,
        cancellationPolicyVersion: input.expectedCancellationPolicyVersion,
      },
      actor,
      access.requestId,
      command(idempotencyKey, 'booking.checkout', {
        treatmentPlanAcceptanceId: input.treatmentPlanAcceptanceId,
        expectedDepositBasisPoints: input.expectedDepositBasisPoints,
        expectedCancellationPolicyVersion: input.expectedCancellationPolicyVersion,
      }),
    );
    const depositIntent = await this.payments.createDepositIntent(
      access,
      booking.id,
      idempotencyKey,
    );
    return {
      booking: toBookingView(
        await this.bookings.requireById(booking.id, { kind: 'PATIENT', userId: access.userId }),
      ),
      depositIntent,
    };
  }

  async list(
    access: AccessContext,
    query: BookingListQuery,
  ): Promise<{ readonly data: readonly BookingView[]; readonly nextCursor: string | null }> {
    const scope = readScope(access);
    const records = await this.bookings.listScoped(scope, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map(toBookingView),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(access: AccessContext, bookingId: string): Promise<BookingView> {
    return toBookingView(await this.bookings.requireById(bookingId, readScope(access)));
  }

  async cancel(
    access: AccessContext,
    bookingId: string,
    input: CancelBookingRequest,
    idempotencyKey: string,
  ): Promise<BookingView> {
    const scope = mutationScope(access);
    return toBookingView(
      await this.bookings.cancel(
        bookingId,
        input.expectedVersion,
        input.reason,
        scope,
        auditActor(access),
        access.requestId,
        command(idempotencyKey, 'booking.cancel', { bookingId, input }),
      ),
    );
  }

  async complete(
    access: AccessContext,
    bookingId: string,
    input: CompleteBookingRequest,
    idempotencyKey: string,
  ): Promise<BookingView> {
    if (
      !hasPermission(access, 'booking:manage:clinic') ||
      !access.selectedOrganizationId ||
      requiresMfa(access) ||
      access.impersonation
    ) {
      throw new ForbiddenException();
    }
    return toBookingView(
      await this.bookings.complete(
        bookingId,
        input.expectedVersion,
        access.selectedOrganizationId,
        auditActor(access),
        access.requestId,
        command(idempotencyKey, 'booking.complete', { bookingId, input }),
      ),
    );
  }
}

function readScope(access: AccessContext): BookingScope {
  if (hasPermission(access, 'payment:manage')) {
    if (requiresMfa(access) || access.impersonation) throw new ForbiddenException();
    return { kind: 'ALL' };
  }
  if (hasPermission(access, 'booking:read:clinic') && access.selectedOrganizationId) {
    return { kind: 'CLINIC', organizationId: access.selectedOrganizationId };
  }
  if (hasPermission(access, 'booking:read:own')) {
    return { kind: 'PATIENT', userId: access.userId };
  }
  throw new ForbiddenException();
}

function mutationScope(access: AccessContext): Exclude<BookingScope, { readonly kind: 'ALL' }> {
  if (hasPermission(access, 'booking:manage:clinic') && access.selectedOrganizationId) {
    if (requiresMfa(access) || access.impersonation) throw new ForbiddenException();
    return { kind: 'CLINIC', organizationId: access.selectedOrganizationId };
  }
  if (hasPermission(access, 'booking:read:own') && !access.impersonation) {
    return { kind: 'PATIENT', userId: access.userId };
  }
  throw new ForbiddenException();
}

function toBookingView(booking: BookingRecord): BookingView {
  const invoice = booking.invoice;
  if (!invoice) throw new Error('Booking invoice invariant is missing.');
  const refunds = booking.payment?.refunds ?? [];
  const refundedMinor = refunds
    .filter((refund) => refund.status === 'SUCCEEDED')
    .reduce((sum, refund) => sum + refund.amountMinor, 0n);
  const payment = booking.payment ? toPaymentView(booking) : null;
  const receipt = booking.payment?.receipt;
  return {
    id: booking.id,
    caseId: booking.caseId,
    caseNumber: booking.dentalCase.caseNumber,
    treatmentPlanVersionId: booking.treatmentPlanVersionId,
    treatmentPlanAcceptanceId: booking.treatmentPlanAcceptanceId,
    treatmentPlanVersion: booking.treatmentPlanVersion.version,
    clinicId: booking.treatmentPlanVersion.treatmentPlan.clinic.id,
    clinicName: booking.treatmentPlanVersion.treatmentPlan.clinic.name,
    status: booking.status,
    planTotalMinor: booking.planTotalMinor.toString(),
    depositMinor: booking.depositMinor.toString(),
    depositBasisPoints: booking.depositBasisPoints,
    currency: booking.currency,
    cancellationPolicy: cancellationPolicyOf(booking),
    version: booking.version,
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    cancellationReason: booking.cancellationReason,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    invoice: {
      id: invoice.id,
      bookingId: invoice.bookingId,
      paymentId: invoice.paymentId,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      amountMinor: invoice.amountMinor.toString(),
      refundedMinor: refundedMinor.toString(),
      currency: invoice.currency,
      version: invoice.version,
      issuedAt: invoice.issuedAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() ?? null,
      voidedAt: invoice.voidedAt?.toISOString() ?? null,
      updatedAt: invoice.updatedAt.toISOString(),
    },
    receipt: receipt
      ? {
          id: receipt.id,
          paymentId: receipt.paymentId,
          receiptNumber: receipt.receiptNumber,
          status: receipt.status,
          amountMinor: receipt.amountMinor.toString(),
          refundedMinor: refundedMinor.toString(),
          currency: receipt.currency,
          version: receipt.version,
          issuedAt: receipt.issuedAt.toISOString(),
          updatedAt: receipt.updatedAt.toISOString(),
        }
      : null,
    payment,
  };
}

function toPaymentView(booking: BookingRecord): PaymentView {
  const payment = booking.payment;
  if (!payment) throw new Error('Booking payment invariant is missing.');
  if (payment.provider !== 'stripe' && payment.provider !== 'development') {
    throw new Error('Unsupported payment provider in booking ledger.');
  }
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    caseId: booking.caseId,
    provider: payment.provider,
    providerPaymentIntentId: payment.providerPaymentIntentId,
    amountMinor: payment.amountMinor.toString(),
    currency: payment.currency,
    status: payment.status,
    version: payment.version,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    refunds: payment.refunds.map((refund) => ({
      id: refund.id,
      paymentId: refund.paymentId,
      providerRefundId: refund.providerRefundId,
      amountMinor: refund.amountMinor.toString(),
      reason: refund.reason,
      status: refund.status,
      version: refund.version,
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString(),
    })),
  };
}

function auditActor(access: AccessContext) {
  return {
    userId: access.userId,
    sessionId: access.sessionId,
    ...(access.selectedOrganizationId ? { organizationId: access.selectedOrganizationId } : {}),
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}

function command(key: string, operation: string, request: Readonly<Record<string, unknown>>) {
  return { key, operation, requestHash: sha256(JSON.stringify(request)) };
}
