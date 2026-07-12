import { randomUUID } from 'node:crypto';

import { Prisma, type BookingStatus, type PrismaClient } from '@prisma/client';

import {
  assertBookingTransition,
  calculateBookingDepositMinor,
  cancellationPolicySnapshot,
  depositBasisPointsFromPercent,
  DomainRuleError,
  type AuditActor,
  type CancellationPolicySnapshot,
} from '@dental-trust/domain';

import { IdempotencyConflictError, OptimisticConcurrencyError } from './case.repository.js';

const commandLifetimeMs = 24 * 60 * 60_000;

const bookingRecordInclude = {
  dentalCase: {
    select: {
      caseNumber: true,
      patientProfile: { select: { userId: true } },
    },
  },
  treatmentPlanAcceptance: { select: { acceptedAt: true, userId: true } },
  treatmentPlanVersion: {
    select: {
      version: true,
      treatmentPlan: {
        select: { clinic: { select: { id: true, name: true, organizationId: true } } },
      },
    },
  },
  invoice: true,
  payment: {
    include: {
      refunds: { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }] },
      receipt: true,
    },
  },
} satisfies Prisma.BookingInclude;

export type BookingRecord = Prisma.BookingGetPayload<{ include: typeof bookingRecordInclude }>;

export interface BookingCheckoutOptionRecord {
  readonly treatmentPlanAcceptanceId: string;
  readonly treatmentPlanVersionId: string;
  readonly treatmentPlanVersion: number;
  readonly caseId: string;
  readonly caseNumber: string;
  readonly clinicId: string;
  readonly clinicName: string;
  readonly planTotalMinor: bigint;
  readonly depositMinor: bigint;
  readonly depositBasisPoints: number;
  readonly currency: 'VND' | 'USD';
  readonly cancellationPolicy: CancellationPolicySnapshot;
  readonly acceptedAt: Date;
  readonly expiresAt: Date;
}

export type BookingScope =
  | { readonly kind: 'PATIENT'; readonly userId: string }
  | { readonly kind: 'CLINIC'; readonly organizationId: string }
  | { readonly kind: 'ALL' };

export interface BookingCommand {
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface BookingPageOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly status?: BookingStatus;
}

export class BookingNotFoundError extends Error {
  constructor() {
    super('Booking resource was not found in the caller scope.');
    this.name = 'BookingNotFoundError';
  }
}

export class BookingConflictError extends Error {
  constructor(message = 'The booking command conflicts with current state.') {
    super(message);
    this.name = 'BookingConflictError';
  }
}

export class BookingRepository {
  constructor(private readonly db: PrismaClient) {}

  async checkoutOptions(patientUserId: string): Promise<readonly BookingCheckoutOptionRecord[]> {
    const rows = await this.db.treatmentPlanAcceptance.findMany({
      where: {
        userId: patientUserId,
        booking: null,
        treatmentPlanVersion: {
          status: 'PUBLISHED',
          expiresAt: { gt: new Date() },
          contentChecksum: { not: null },
          treatmentPlan: { dentalCase: { patientProfile: { userId: patientUserId } } },
        },
      },
      orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
      include: {
        treatmentPlanVersion: {
          include: {
            treatmentPlan: {
              include: {
                clinic: { select: { id: true, name: true } },
                dentalCase: { select: { id: true, caseNumber: true } },
              },
            },
          },
        },
      },
    });
    const clinicIds = [
      ...new Set(rows.map((row) => row.treatmentPlanVersion.treatmentPlan.clinic.id)),
    ];
    const [configuration, policies] = await Promise.all([
      this.db.systemConfiguration.findUnique({
        where: { key: 'booking.deposit-percent' },
        select: {
          valueType: true,
          versions: { take: 1, orderBy: { version: 'desc' }, select: { value: true } },
        },
      }),
      this.db.clinicSchedulingPolicy.findMany({
        where: { clinicId: { in: clinicIds } },
        select: { clinicId: true, version: true, cancellationCutoffMinutes: true },
      }),
    ]);
    if (configuration && configuration.valueType !== 'INTEGER') {
      throw new DomainRuleError(
        'BOOKING_DEPOSIT_CONFIGURATION_INVALID',
        'The booking deposit configuration must be an integer percentage.',
      );
    }
    const depositBasisPoints = depositBasisPointsFromPercent(configuration?.versions[0]?.value);
    const policiesByClinic = new Map(policies.map((policy) => [policy.clinicId, policy]));
    return rows.map((row) => ({
      treatmentPlanAcceptanceId: row.id,
      treatmentPlanVersionId: row.treatmentPlanVersionId,
      treatmentPlanVersion: row.treatmentPlanVersion.version,
      caseId: row.treatmentPlanVersion.treatmentPlan.dentalCase.id,
      caseNumber: row.treatmentPlanVersion.treatmentPlan.dentalCase.caseNumber,
      clinicId: row.treatmentPlanVersion.treatmentPlan.clinic.id,
      clinicName: row.treatmentPlanVersion.treatmentPlan.clinic.name,
      planTotalMinor: row.treatmentPlanVersion.totalMinor,
      depositMinor: calculateBookingDepositMinor(
        row.treatmentPlanVersion.totalMinor,
        depositBasisPoints,
      ),
      depositBasisPoints,
      currency: row.treatmentPlanVersion.currency,
      cancellationPolicy: cancellationPolicySnapshot(
        policiesByClinic.get(row.treatmentPlanVersion.treatmentPlan.clinic.id),
      ),
      acceptedAt: row.acceptedAt,
      expiresAt: row.treatmentPlanVersion.expiresAt,
    }));
  }

  async createFromAcceptance(
    patientUserId: string,
    treatmentPlanAcceptanceId: string,
    expectedPricing: {
      readonly depositBasisPoints: number;
      readonly cancellationPolicyVersion: number;
    },
    actor: AuditActor,
    requestId: string,
    command: BookingCommand,
  ): Promise<BookingRecord> {
    const resourceId = await this.idempotent(actor.userId, command, async (transaction) => {
      const acceptance = await transaction.treatmentPlanAcceptance.findFirst({
        where: {
          id: treatmentPlanAcceptanceId,
          userId: patientUserId,
          booking: null,
          treatmentPlanVersion: {
            status: 'PUBLISHED',
            expiresAt: { gt: new Date() },
            contentChecksum: { not: null },
            treatmentPlan: { dentalCase: { patientProfile: { userId: patientUserId } } },
          },
        },
        include: {
          treatmentPlanVersion: {
            include: {
              treatmentPlan: {
                include: {
                  clinic: { select: { id: true, organizationId: true } },
                  dentalCase: { select: { id: true } },
                },
              },
            },
          },
        },
      });
      if (!acceptance) throw new BookingNotFoundError();

      const plan = acceptance.treatmentPlanVersion;
      const clinic = plan.treatmentPlan.clinic;
      const [configuration, policy] = await Promise.all([
        transaction.systemConfiguration.findUnique({
          where: { key: 'booking.deposit-percent' },
          select: {
            valueType: true,
            versions: {
              take: 1,
              orderBy: { version: 'desc' },
              select: { version: true, value: true },
            },
          },
        }),
        transaction.clinicSchedulingPolicy.findUnique({
          where: { clinicId: clinic.id },
          select: { version: true, cancellationCutoffMinutes: true },
        }),
      ]);
      if (configuration && configuration.valueType !== 'INTEGER') {
        throw new DomainRuleError(
          'BOOKING_DEPOSIT_CONFIGURATION_INVALID',
          'The booking deposit configuration must be an integer percentage.',
        );
      }
      const configurationVersion = configuration?.versions[0];
      const depositBasisPoints = depositBasisPointsFromPercent(configurationVersion?.value);
      const depositMinor = calculateBookingDepositMinor(plan.totalMinor, depositBasisPoints);
      const cancellationPolicy = cancellationPolicySnapshot(policy ?? undefined);
      if (
        expectedPricing.depositBasisPoints !== depositBasisPoints ||
        expectedPricing.cancellationPolicyVersion !== cancellationPolicy.policyVersion
      ) {
        throw new DomainRuleError(
          'BOOKING_CHECKOUT_PREVIEW_STALE',
          'Deposit or cancellation terms changed. Review the refreshed checkout before continuing.',
        );
      }
      const bookingId = randomUUID();
      const invoiceId = randomUUID();
      const invoiceNumber = documentNumber('DTI', invoiceId);

      await transaction.booking.create({
        data: {
          id: bookingId,
          caseId: plan.treatmentPlan.dentalCase.id,
          treatmentPlanVersionId: plan.id,
          treatmentPlanAcceptanceId: acceptance.id,
          planTotalMinor: plan.totalMinor,
          depositMinor,
          depositBasisPoints,
          currency: plan.currency,
          cancellationPolicySnapshot: cancellationPolicy as unknown as Prisma.InputJsonValue,
          invoice: {
            create: {
              id: invoiceId,
              invoiceNumber,
              amountMinor: depositMinor,
              currency: plan.currency,
            },
          },
        },
      });
      await transaction.auditLog.create({
        data: userAudit(actor, {
          action: 'booking.checkout-created',
          resourceType: 'Booking',
          resourceId: bookingId,
          requestId,
          success: true,
          afterMetadata: {
            treatmentPlanAcceptanceId: acceptance.id,
            treatmentPlanVersionId: plan.id,
            clinicId: clinic.id,
            planTotalMinor: plan.totalMinor.toString(),
            depositMinor: depositMinor.toString(),
            depositBasisPoints,
            currency: plan.currency,
            configurationVersion: configurationVersion?.version ?? 0,
            cancellationPolicyVersion: cancellationPolicy.policyVersion,
            cancellationCutoffMinutes: cancellationPolicy.cancellationCutoffMinutes,
            cancellationPolicySource: cancellationPolicy.source,
          },
        }),
      });
      await transaction.outboxEvent.createMany({
        data: [
          {
            aggregateType: 'Booking',
            aggregateId: bookingId,
            eventType: 'booking.checkout-created',
            payload: { bookingId, caseId: plan.treatmentPlan.dentalCase.id, clinicId: clinic.id },
            correlationId: requestId,
            idempotencyKey: `booking.checkout-created:${bookingId}`,
          },
          {
            aggregateType: 'Invoice',
            aggregateId: invoiceId,
            eventType: 'invoice.issued',
            payload: { invoiceId, bookingId, invoiceNumber },
            correlationId: requestId,
            idempotencyKey: `invoice.issued:${invoiceId}`,
          },
        ],
      });
      return bookingId;
    });
    return this.requireById(resourceId, { kind: 'PATIENT', userId: patientUserId });
  }

  async listScoped(scope: BookingScope, options: BookingPageOptions): Promise<BookingRecord[]> {
    return this.db.booking.findMany({
      where: {
        ...scopeWhere(scope),
        ...(options.status ? { status: options.status } : {}),
      },
      include: bookingRecordInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
  }

  async requireById(id: string, scope: BookingScope): Promise<BookingRecord> {
    const booking = await this.db.booking.findFirst({
      where: { id, ...scopeWhere(scope) },
      include: bookingRecordInclude,
    });
    if (!booking?.invoice) throw new BookingNotFoundError();
    return booking;
  }

  async cancel(
    bookingId: string,
    expectedVersion: number,
    reason: string,
    scope: Exclude<BookingScope, { readonly kind: 'ALL' }>,
    actor: AuditActor,
    requestId: string,
    command: BookingCommand,
  ): Promise<BookingRecord> {
    const resourceId = await this.idempotent(actor.userId, command, async (transaction) => {
      const current = await transaction.booking.findFirst({
        where: { id: bookingId, ...scopeWhere(scope) },
        include: { payment: { select: { status: true } } },
      });
      if (!current) throw new BookingNotFoundError();
      if (current.version !== expectedVersion) throw new OptimisticConcurrencyError();
      if (scope.kind === 'PATIENT' && current.status !== 'PENDING_DEPOSIT') {
        throw new DomainRuleError(
          'BOOKING_MANAGED_CANCELLATION_REQUIRED',
          'A confirmed booking must be cancelled by the clinic so refund handling is not bypassed.',
        );
      }
      assertBookingTransition(current.status, 'CANCELLED');
      const changed = await transaction.booking.updateMany({
        where: { id: bookingId, version: expectedVersion, status: current.status },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new OptimisticConcurrencyError();
      if (
        !current.payment ||
        !['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(current.payment.status)
      ) {
        await transaction.invoice.updateMany({
          where: { bookingId, status: 'ISSUED' },
          data: { status: 'VOID', voidedAt: new Date(), version: { increment: 1 } },
        });
      }
      await transaction.auditLog.create({
        data: userAudit(actor, {
          action: 'booking.cancelled',
          resourceType: 'Booking',
          resourceId: bookingId,
          requestId,
          reason,
          success: true,
          beforeMetadata: { status: current.status, version: current.version },
          afterMetadata: {
            status: 'CANCELLED',
            version: current.version + 1,
            refundReviewRequired: ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(
              current.payment?.status ?? '',
            ),
          },
        }),
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'Booking',
          aggregateId: bookingId,
          eventType: 'booking.cancelled',
          payload: {
            bookingId,
            refundReviewRequired: ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(
              current.payment?.status ?? '',
            ),
          },
          correlationId: requestId,
          idempotencyKey: `booking.cancelled:${bookingId}:${current.version + 1}`,
        },
      });
      return bookingId;
    });
    return this.requireById(resourceId, scope);
  }

  async complete(
    bookingId: string,
    expectedVersion: number,
    organizationId: string,
    actor: AuditActor,
    requestId: string,
    command: BookingCommand,
  ): Promise<BookingRecord> {
    const scope = { kind: 'CLINIC' as const, organizationId };
    const resourceId = await this.idempotent(actor.userId, command, async (transaction) => {
      const current = await transaction.booking.findFirst({
        where: { id: bookingId, ...scopeWhere(scope) },
      });
      if (!current) throw new BookingNotFoundError();
      if (current.version !== expectedVersion) throw new OptimisticConcurrencyError();
      assertBookingTransition(current.status, 'COMPLETED');
      const changed = await transaction.booking.updateMany({
        where: { id: bookingId, version: expectedVersion, status: 'CONFIRMED' },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new OptimisticConcurrencyError();
      await transaction.auditLog.create({
        data: userAudit(actor, {
          action: 'booking.completed',
          resourceType: 'Booking',
          resourceId: bookingId,
          requestId,
          success: true,
          beforeMetadata: { status: current.status, version: current.version },
          afterMetadata: { status: 'COMPLETED', version: current.version + 1 },
        }),
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'Booking',
          aggregateId: bookingId,
          eventType: 'booking.completed',
          payload: { bookingId },
          correlationId: requestId,
          idempotencyKey: `booking.completed:${bookingId}:${current.version + 1}`,
        },
      });
      return bookingId;
    });
    return this.requireById(resourceId, scope);
  }

  private async idempotent(
    userId: string,
    command: BookingCommand,
    operation: (transaction: Prisma.TransactionClient) => Promise<string>,
  ): Promise<string> {
    const replay = await this.resolveReplay(userId, command, false);
    if (replay) return replay;
    try {
      return await this.db.$transaction(
        async (transaction) => {
          await transaction.idempotencyRecord.create({
            data: {
              userId,
              key: command.key,
              operation: command.operation,
              requestHash: command.requestHash,
              expiresAt: new Date(Date.now() + commandLifetimeMs),
            },
          });
          const resourceId = await operation(transaction);
          await transaction.idempotencyRecord.update({
            where: { userId_key: { userId, key: command.key } },
            data: {
              status: 'COMPLETED',
              resourceId,
              response: { resourceId },
              completedAt: new Date(),
            },
          });
          return resourceId;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isIdempotencyInsertRace(error)) {
        const raced = await this.resolveReplay(userId, command, true);
        if (raced) return raced;
      }
      if (isPrismaCode(error, 'P2002')) {
        throw new BookingConflictError(
          'The accepted plan is already bound to another checkout command.',
        );
      }
      if (isPrismaCode(error, 'P2034')) {
        throw new IdempotencyConflictError(
          'The booking command conflicted with another transaction.',
        );
      }
      throw error;
    }
  }

  private async resolveReplay(
    userId: string,
    command: BookingCommand,
    wait: boolean,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < (wait ? 25 : 1); attempt += 1) {
      const record = await this.db.idempotencyRecord.findUnique({
        where: { userId_key: { userId, key: command.key } },
      });
      if (!record) {
        if (!wait) return null;
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      if (record.operation !== command.operation || record.requestHash !== command.requestHash) {
        throw new IdempotencyConflictError('The idempotency key was used for a different command.');
      }
      if (record.expiresAt <= new Date()) {
        await this.db.idempotencyRecord.deleteMany({
          where: { id: record.id, expiresAt: { lte: new Date() } },
        });
        return null;
      }
      if (record.status === 'COMPLETED' && record.resourceId) return record.resourceId;
      if (!wait) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new IdempotencyConflictError('The original booking command is still in progress.');
  }
}

function scopeWhere(scope: BookingScope): Prisma.BookingWhereInput {
  if (scope.kind === 'PATIENT') {
    return { dentalCase: { patientProfile: { userId: scope.userId } } };
  }
  if (scope.kind === 'CLINIC') {
    return {
      treatmentPlanVersion: {
        treatmentPlan: { clinic: { organizationId: scope.organizationId } },
      },
    };
  }
  return {};
}

function documentNumber(prefix: 'DTI', id: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `${prefix}-${date}-${id.replaceAll('-', '').slice(0, 16).toUpperCase()}`;
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

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

function isIdempotencyInsertRace(error: unknown): boolean {
  if (!isPrismaCode(error, 'P2002') || !error || typeof error !== 'object' || !('meta' in error)) {
    return false;
  }
  const target = (error as { readonly meta?: { readonly target?: unknown } }).meta?.target;
  return Array.isArray(target)
    ? target.includes('user_id') && target.includes('key')
    : String(target).includes('idempotency_records');
}

export function cancellationPolicyOf(record: BookingRecord): CancellationPolicySnapshot {
  return record.cancellationPolicySnapshot as unknown as CancellationPolicySnapshot;
}
