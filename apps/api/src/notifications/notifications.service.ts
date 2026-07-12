import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { AccessContext } from '@dental-trust/auth';
import {
  notificationCategorySchema,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferenceView,
  type NotificationView,
  type UpdateNotificationPreference,
} from '@dental-trust/contracts';
import { NotificationRepository, type PrismaClient } from '@dental-trust/database';

import { PRISMA } from '../common/tokens.js';

const categories = notificationCategorySchema.options;
const channels: readonly NotificationChannel[] = ['IN_APP', 'EMAIL', 'SMS', 'MESSAGING'];

@Injectable()
export class NotificationsService {
  private readonly notifications: NotificationRepository;

  constructor(@Inject(PRISMA) database: PrismaClient) {
    this.notifications = new NotificationRepository(database);
  }

  async listPreferences(access: AccessContext): Promise<readonly NotificationPreferenceView[]> {
    const stored = await this.notifications.listPreferences(access.userId);
    return categories.flatMap((category) =>
      channels.map((channel) => {
        const locked = category === 'ACCOUNT_SECURITY';
        const preference = stored.find(
          (candidate) => candidate.category === category && candidate.channel === channel,
        );
        return {
          category,
          channel,
          enabled: locked ? true : (preference?.enabled ?? true),
          locked,
        };
      }),
    );
  }

  async updatePreference(
    access: AccessContext,
    input: UpdateNotificationPreference,
    idempotencyKey: string,
  ): Promise<NotificationPreferenceView> {
    const locked = input.category === 'ACCOUNT_SECURITY';
    const preference = await this.notifications.updatePreference(
      actorFrom(access),
      { ...input, enabled: locked ? true : input.enabled },
      idempotencyKey,
    );
    return {
      category: parseCategory(preference.category),
      channel: preference.channel,
      enabled: preference.enabled,
      locked,
    };
  }

  async listNotifications(
    access: AccessContext,
    input: { readonly cursor?: string; readonly limit: number },
  ): Promise<{
    readonly notifications: readonly NotificationView[];
    readonly nextCursor: string | null;
  }> {
    const page = await this.notifications.listNotifications(access.userId, input);
    return {
      notifications: page.notifications.map((notification) => ({
        ...notification,
        category: parseCategory(notification.category),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async markRead(
    access: AccessContext,
    notificationId: string,
    idempotencyKey: string,
  ): Promise<NotificationView> {
    const notification = await this.notifications.markRead(
      actorFrom(access),
      notificationId,
      idempotencyKey,
    );
    if (!notification) throw new NotFoundException();
    return { ...notification, category: parseCategory(notification.category) };
  }
}

function parseCategory(value: string): NotificationCategory {
  return notificationCategorySchema.parse(value);
}

function actorFrom(access: AccessContext) {
  return {
    userId: access.userId,
    requestId: access.requestId,
    ...(access.selectedOrganizationId ? { organizationId: access.selectedOrganizationId } : {}),
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}
