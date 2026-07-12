import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import {
  notificationCategorySchema,
  updateNotificationPreferenceSchema,
} from '@dental-trust/contracts';
import type { PrismaClient } from '@dental-trust/database';

import { NotificationsService } from './notifications.service.js';

const access: AccessContext = {
  userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
  roles: ['PATIENT'],
  memberships: [],
  mfaVerified: false,
  requestId: 'notification-service-test',
};

describe('notification contracts', () => {
  it('covers every supported category and prevents security opt-out', () => {
    expect(notificationCategorySchema.options).toHaveLength(14);
    expect(() =>
      updateNotificationPreferenceSchema.parse({
        category: 'ACCOUNT_SECURITY',
        channel: 'EMAIL',
        enabled: false,
      }),
    ).toThrow();
    expect(
      updateNotificationPreferenceSchema.parse({
        category: 'AFTERCARE',
        channel: 'EMAIL',
        enabled: false,
      }),
    ).toEqual({ category: 'AFTERCARE', channel: 'EMAIL', enabled: false });
  });
});

describe('NotificationsService', () => {
  it('materializes defaults and forces critical preferences on', async () => {
    const service = new NotificationsService({} as PrismaClient);
    Object.defineProperty(service, 'notifications', {
      value: {
        listPreferences: vi.fn().mockResolvedValue([
          { category: 'ACCOUNT_SECURITY', channel: 'EMAIL', enabled: false },
          { category: 'AFTERCARE', channel: 'EMAIL', enabled: false },
        ]),
      },
    });
    const result = await service.listPreferences(access);
    expect(result).toHaveLength(56);
    expect(result).toContainEqual({
      category: 'ACCOUNT_SECURITY',
      channel: 'EMAIL',
      enabled: true,
      locked: true,
    });
    expect(result).toContainEqual({
      category: 'AFTERCARE',
      channel: 'EMAIL',
      enabled: false,
      locked: false,
    });
  });

  it('passes actor context into audited preference updates', async () => {
    const updatePreference = vi.fn().mockResolvedValue({
      category: 'AFTERCARE',
      channel: 'EMAIL',
      enabled: false,
    });
    const service = new NotificationsService({} as PrismaClient);
    Object.defineProperty(service, 'notifications', { value: { updatePreference } });
    await expect(
      service.updatePreference(
        access,
        { category: 'AFTERCARE', channel: 'EMAIL', enabled: false },
        'notification-preference-idempotency',
      ),
    ).resolves.toEqual({
      category: 'AFTERCARE',
      channel: 'EMAIL',
      enabled: false,
      locked: false,
    });
    expect(updatePreference).toHaveBeenCalledWith(
      expect.objectContaining({ userId: access.userId, requestId: access.requestId }),
      { category: 'AFTERCARE', channel: 'EMAIL', enabled: false },
      'notification-preference-idempotency',
    );
  });

  it('returns only owned notification views and fails closed for a missing read target', async () => {
    const service = new NotificationsService({} as PrismaClient);
    Object.defineProperty(service, 'notifications', {
      value: {
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [notificationRecord()],
          nextCursor: null,
        }),
        markRead: vi.fn().mockResolvedValue(null),
      },
    });
    await expect(service.listNotifications(access, { limit: 25 })).resolves.toMatchObject({
      notifications: [{ category: 'AFTERCARE' }],
      nextCursor: null,
    });
    await expect(
      service.markRead(
        access,
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
        'notification-read-idempotency',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function notificationRecord() {
  return {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
    category: 'AFTERCARE',
    channel: 'IN_APP' as const,
    templateKey: 'aftercare.check-in-due',
    status: 'DELIVERED' as const,
    scheduledAt: '2026-07-12T08:00:00.000Z',
    deliveredAt: '2026-07-12T08:00:01.000Z',
    readAt: null,
  };
}
