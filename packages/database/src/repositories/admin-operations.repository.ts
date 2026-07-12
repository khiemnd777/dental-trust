import type {
  NotificationStatus,
  OutboxStatus,
  Prisma,
  PrismaClient,
  WebhookStatus,
} from '@prisma/client';

export interface AdminOperationsActor {
  readonly userId: string;
  readonly requestId: string;
  readonly impersonatorUserId?: string;
}

export interface AdminPageInput {
  readonly cursor?: string;
  readonly limit: number;
}

export class AdminOperationsRepository {
  constructor(private readonly db: PrismaClient) {}

  async summary() {
    const [
      activeUsers,
      openCases,
      pendingVerifications,
      unresolvedIncidents,
      failedOutboxEvents,
      failedNotifications,
      failedWebhooks,
      pendingPrivacyRequests,
    ] = await Promise.all([
      this.db.user.count({ where: { accountStatus: 'ACTIVE', deletedAt: null } }),
      this.db.dentalCase.count({ where: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
      this.db.verificationCase.count({
        where: {
          status: {
            in: [
              'SUBMITTED',
              'UNDER_REVIEW',
              'ADDITIONAL_INFORMATION_REQUIRED',
              'SITE_AUDIT_REQUIRED',
              'VERIFICATION_EXPIRING',
            ],
          },
        },
      }),
      this.db.incident.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      this.db.outboxEvent.count({ where: { status: { in: ['FAILED', 'DEAD_LETTER'] } } }),
      this.db.notification.count({ where: { status: 'FAILED' } }),
      this.db.webhookEvent.count({ where: { status: 'FAILED' } }),
      this.db.privacyRequest.count({
        where: { status: { notIn: ['COMPLETED', 'REJECTED', 'CANCELLED'] } },
      }),
    ]);
    return {
      activeUsers,
      openCases,
      pendingVerifications,
      unresolvedIncidents,
      failedOutboxEvents,
      failedNotifications,
      failedWebhooks,
      pendingPrivacyRequests,
      generatedAt: new Date().toISOString(),
    };
  }

  async auditLogs(
    input: AdminPageInput & { readonly action?: string; readonly resourceType?: string },
  ) {
    const rows = await this.db.auditLog.findMany({
      where: {
        ...(input.action ? { action: input.action } : {}),
        ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        actorType: true,
        actorUserId: true,
        organizationId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        requestId: true,
        reason: true,
        success: true,
        createdAt: true,
      },
    });
    return page(rows, input.limit, (row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async outboxJobs(input: AdminPageInput & { readonly status?: OutboxStatus }) {
    const rows = await this.db.outboxEvent.findMany({
      where: { ...(input.status ? { status: input.status } : {}) },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        eventType: true,
        aggregateType: true,
        status: true,
        attemptCount: true,
        availableAt: true,
        processedAt: true,
        lastErrorCode: true,
        createdAt: true,
      },
    });
    return page(rows, input.limit, (row) => ({
      ...row,
      availableAt: row.availableAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async notificationJobs(input: AdminPageInput & { readonly status?: NotificationStatus }) {
    const rows = await this.db.notification.findMany({
      where: { ...(input.status ? { status: input.status } : {}) },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        category: true,
        channel: true,
        templateKey: true,
        status: true,
        scheduledAt: true,
        deliveredAt: true,
      },
    });
    return page(rows, input.limit, (row) => ({
      ...row,
      scheduledAt: row.scheduledAt.toISOString(),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
    }));
  }

  async webhooks(
    input: AdminPageInput & { readonly status?: WebhookStatus; readonly provider?: string },
  ) {
    const rows = await this.db.webhookEvent.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
      },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        provider: true,
        providerEventId: true,
        type: true,
        status: true,
        attemptCount: true,
        receivedAt: true,
        processedAt: true,
        lastErrorCode: true,
      },
    });
    return page(rows, input.limit, (row) => ({
      ...row,
      receivedAt: row.receivedAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
    }));
  }

  async retryOutbox(
    actor: AdminOperationsActor,
    eventId: string,
    expectedAttemptCount: number,
    reason: string,
    idempotencyKey: string,
  ) {
    return this.db.$transaction(async (transaction) => {
      const current = await transaction.outboxEvent.findUnique({
        where: { id: eventId },
        select: { id: true, status: true, attemptCount: true, eventType: true },
      });
      if (!current) return null;
      if (
        !['FAILED', 'DEAD_LETTER'].includes(current.status) ||
        current.attemptCount !== expectedAttemptCount
      ) {
        return { conflict: true as const };
      }
      const updated = await transaction.outboxEvent.updateMany({
        where: {
          id: current.id,
          status: { in: ['FAILED', 'DEAD_LETTER'] },
          attemptCount: expectedAttemptCount,
        },
        data: {
          status: 'PENDING',
          attemptCount: 0,
          availableAt: new Date(),
          lockedAt: null,
          lockOwner: null,
          processedAt: null,
          lastErrorCode: null,
        },
      });
      if (updated.count !== 1) return { conflict: true as const };
      await privilegedAudit(transaction, actor, {
        action: 'admin.outbox-retry-requested',
        resourceType: 'OutboxEvent',
        resourceId: current.id,
        reason,
        beforeMetadata: {
          status: current.status,
          attemptCount: current.attemptCount,
          eventType: current.eventType,
        },
        afterMetadata: { status: 'PENDING', attemptCount: 0, idempotencyKey },
      });
      return { conflict: false as const, status: 'PENDING' as const, attemptCount: 0 };
    });
  }

  async retryNotification(
    actor: AdminOperationsActor,
    notificationId: string,
    reason: string,
    idempotencyKey: string,
  ) {
    return this.db.$transaction(async (transaction) => {
      const current = await transaction.notification.findUnique({
        where: { id: notificationId },
        select: { id: true, status: true, channel: true, category: true },
      });
      if (!current) return null;
      if (current.status !== 'FAILED') return { conflict: true as const };
      const updated = await transaction.notification.updateMany({
        where: { id: current.id, status: 'FAILED' },
        data: { status: 'PENDING', scheduledAt: new Date(), deliveredAt: null },
      });
      if (updated.count !== 1) return { conflict: true as const };
      await privilegedAudit(transaction, actor, {
        action: 'admin.notification-retry-requested',
        resourceType: 'Notification',
        resourceId: current.id,
        reason,
        beforeMetadata: {
          status: current.status,
          channel: current.channel,
          category: current.category,
        },
        afterMetadata: { status: 'PENDING', idempotencyKey },
      });
      return { conflict: false as const, status: 'PENDING' as const };
    });
  }
}

function cursor(input: AdminPageInput): { cursor?: { id: string }; skip?: number } {
  return input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {};
}

function page<T extends { readonly id: string }, V>(
  rows: readonly T[],
  limit: number,
  view: (row: T) => V,
) {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  return {
    records: selected.map(view),
    nextCursor: hasMore ? (selected.at(-1)?.id ?? null) : null,
  };
}

async function privilegedAudit(
  transaction: Prisma.TransactionClient,
  actor: AdminOperationsActor,
  input: {
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly reason: string;
    readonly beforeMetadata: Prisma.InputJsonObject;
    readonly afterMetadata: Prisma.InputJsonObject;
  },
) {
  await transaction.auditLog.create({
    data: {
      actorUserId: actor.userId,
      ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: actor.requestId,
      reason: input.reason,
      success: true,
      beforeMetadata: input.beforeMetadata,
      afterMetadata: input.afterMetadata,
    },
  });
}
