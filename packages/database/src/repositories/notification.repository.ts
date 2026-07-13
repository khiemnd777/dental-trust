import type { NotificationChannel, Prisma, PrismaClient } from '@prisma/client';

export interface NotificationActor {
  readonly userId: string;
  readonly organizationId?: string;
  readonly impersonatorUserId?: string;
  readonly requestId: string;
}

export interface NotificationPageInput {
  readonly cursor?: string;
  readonly limit: number;
}

export interface StoredNotificationPreference {
  readonly category: string;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
}

export class NotificationRepository {
  constructor(private readonly db: PrismaClient) {}

  listPreferences(userId: string): Promise<readonly StoredNotificationPreference[]> {
    return this.db.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ category: 'asc' }, { channel: 'asc' }],
      select: { category: true, channel: true, enabled: true },
    });
  }

  async updatePreference(
    actor: NotificationActor,
    input: StoredNotificationPreference,
    idempotencyKey: string,
  ): Promise<StoredNotificationPreference> {
    return this.db.$transaction(async (transaction) => {
      const previous = await transaction.notificationPreference.findUnique({
        where: {
          userId_category_channel: {
            userId: actor.userId,
            category: input.category,
            channel: input.channel,
          },
        },
        select: { enabled: true },
      });
      const preference = await transaction.notificationPreference.upsert({
        where: {
          userId_category_channel: {
            userId: actor.userId,
            category: input.category,
            channel: input.channel,
          },
        },
        update: { enabled: input.enabled },
        create: { userId: actor.userId, ...input },
        select: { category: true, channel: true, enabled: true },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.userId,
          ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
          ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
          action: 'notification.preference-updated',
          resourceType: 'NotificationPreference',
          resourceId: `${input.category}:${input.channel}`,
          requestId: actor.requestId,
          success: true,
          beforeMetadata: { enabled: previous?.enabled ?? null },
          afterMetadata: { enabled: preference.enabled, idempotencyKey },
        },
      });
      return preference;
    });
  }

  async listNotifications(userId: string, input: NotificationPageInput) {
    const records = await this.db.notification.findMany({
      where: { userId, channel: 'IN_APP' },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
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
        readAt: true,
        payload: true,
      },
    });
    const hasMore = records.length > input.limit;
    const page = records.slice(0, input.limit);
    return {
      notifications: page.map(toNotificationRecord),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async markRead(actor: NotificationActor, notificationId: string, idempotencyKey: string) {
    return this.db.$transaction(async (transaction) => {
      const notification = await transaction.notification.findFirst({
        where: { id: notificationId, userId: actor.userId, channel: 'IN_APP' },
        select: {
          id: true,
          category: true,
          channel: true,
          templateKey: true,
          status: true,
          scheduledAt: true,
          deliveredAt: true,
          readAt: true,
          payload: true,
        },
      });
      if (!notification) return null;
      const updated = notification.readAt
        ? notification
        : await transaction.notification.update({
            where: { id: notification.id },
            data: { readAt: new Date() },
            select: {
              id: true,
              category: true,
              channel: true,
              templateKey: true,
              status: true,
              scheduledAt: true,
              deliveredAt: true,
              readAt: true,
              payload: true,
            },
          });
      if (!notification.readAt) {
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.userId,
            ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
            ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
            action: 'notification.read',
            resourceType: 'Notification',
            resourceId: notification.id,
            requestId: actor.requestId,
            success: true,
            afterMetadata: { idempotencyKey },
          },
        });
      }
      return toNotificationRecord(updated);
    });
  }
}

function toNotificationRecord(notification: {
  id: string;
  category: string;
  channel: NotificationChannel;
  templateKey: string;
  status: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED' | 'SUPPRESSED';
  scheduledAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
  payload: Prisma.JsonValue;
}) {
  return {
    id: notification.id,
    category: notification.category,
    channel: notification.channel,
    templateKey: notification.templateKey,
    status: notification.status,
    scheduledAt: notification.scheduledAt.toISOString(),
    deliveredAt: notification.deliveredAt?.toISOString() ?? null,
    readAt: notification.readAt?.toISOString() ?? null,
    action: notificationAction(notification.category, notification.payload),
  };
}

function notificationAction(category: string, payload: Prisma.JsonValue) {
  const resourceId = payloadCaseId(payload);
  if (resourceId) return { target: 'CASE' as const, resourceId };
  if (category === 'APPOINTMENTS' || category === 'CONSULTATIONS')
    return { target: 'APPOINTMENTS' as const, resourceId: null };
  if (category === 'PAYMENTS') return { target: 'PAYMENTS' as const, resourceId: null };
  if (category === 'AFTERCARE') return { target: 'AFTERCARE' as const, resourceId: null };
  if (category === 'INCIDENTS' || category === 'WARRANTY')
    return { target: 'INCIDENTS' as const, resourceId: null };
  if (category === 'CASE_UPDATES' || category === 'TREATMENT_MILESTONES')
    return { target: 'TODAY' as const, resourceId: null };
  return null;
}

function payloadCaseId(payload: Prisma.JsonValue): string | null {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return null;
  const caseId = (payload as Prisma.JsonObject).caseId;
  return typeof caseId === 'string' && /^[0-9a-f-]{36}$/iu.test(caseId) ? caseId : null;
}
