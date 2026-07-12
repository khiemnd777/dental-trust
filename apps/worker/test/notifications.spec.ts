import { afterEach, describe, expect, it, vi } from 'vitest';

import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';
import type { PrismaClient } from '@dental-trust/database';
import type { Job } from 'bullmq';

import {
  deliveryRecipient,
  shouldDeliverNotification,
} from '../src/notifications/notification-policy.js';
import {
  UnavailableDeliveryProvider,
  WebhookDeliveryProvider,
} from '../src/notifications/providers.js';
import {
  renderManagedNotificationTemplate,
  renderNotificationTemplate,
} from '../src/notifications/templates.js';
import {
  processNotification,
  resolveLifecycleAction,
} from '../src/notifications/notification.processor.js';
import type { NotificationJobData } from '../src/notifications/notification-relay.js';
import type { NotificationProviders } from '../src/notifications/providers.js';

afterEach(() => vi.unstubAllGlobals());

describe('notification policy and templates', () => {
  it('honors user preferences but never suppresses account-security events', () => {
    const preferences = [
      { category: 'AFTERCARE', channel: 'EMAIL' as const, enabled: false },
      { category: 'ACCOUNT_SECURITY', channel: 'EMAIL' as const, enabled: false },
    ];
    expect(shouldDeliverNotification('AFTERCARE', 'EMAIL', preferences)).toBe(false);
    expect(shouldDeliverNotification('ACCOUNT_SECURITY', 'EMAIL', preferences)).toBe(true);
    expect(shouldDeliverNotification('APPOINTMENTS', 'EMAIL', preferences)).toBe(true);
  });

  it('renders localized, privacy-preserving copy without interpolating payload secrets', () => {
    const rendered = renderNotificationTemplate({
      category: 'ACCOUNT_SECURITY',
      templateKey: 'account.password-reset-requested',
      locale: 'vi-VN',
      payload: { resetToken: 'must-never-appear' },
      appUrl: 'https://dentaltrust.example',
    });
    expect(rendered.subject).toContain('mật khẩu');
    expect(rendered.text).toContain('https://dentaltrust.example');
    expect(rendered.text).not.toContain('must-never-appear');
  });

  it('adds mandatory portal and privacy guidance to governed template copy', () => {
    const rendered = renderManagedNotificationTemplate(
      'Appointment update',
      'Your appointment schedule changed.',
      'en-US',
      'https://dentaltrust.example',
    );
    expect(rendered.text).toContain('https://dentaltrust.example');
    expect(rendered.text).toContain('does not contain medical records');
  });

  it('extracts only explicit channel recipients', () => {
    expect(deliveryRecipient({ recipient: '+15551234567' })).toBe('+15551234567');
    expect(deliveryRecipient({ phone: '+15551234567' })).toBeNull();
    expect(deliveryRecipient(null)).toBeNull();
  });

  it('decrypts lifecycle secrets only to create the correct localized action URL', () => {
    const cipher = new SensitiveFieldCipher('worker-test-encryption-key-with-ample-entropy');
    const token = 'opaque-password-reset-token-with-sufficient-entropy';
    const tokenHash = sha256(token);
    const encryptedToken = cipher.encrypt(token, `account-lifecycle:password-reset:${tokenHash}`);
    const action = resolveLifecycleAction(
      'account.password-reset-requested',
      'vi-VN',
      { tokenHash, encryptedToken, expiresAt: '2026-07-13T00:00:00.000Z' },
      'https://dentaltrust.example/base',
      cipher,
      new Date('2026-07-12T00:00:00.000Z'),
    );
    expect(action).toBe(
      `https://dentaltrust.example/vi/auth/password-reset?token=${encodeURIComponent(token)}`,
    );
    expect(encryptedToken).not.toContain(token);
  });

  it('suppresses expired lifecycle actions and rejects malformed encrypted payloads', () => {
    const cipher = new SensitiveFieldCipher('worker-test-encryption-key-with-ample-entropy');
    const tokenHash = sha256('token');
    expect(
      resolveLifecycleAction(
        'account.email-verification-requested',
        'en-US',
        {
          tokenHash,
          encryptedToken: cipher.encrypt(
            'token',
            `account-lifecycle:email-verification:${tokenHash}`,
          ),
          expiresAt: '2026-07-11T00:00:00.000Z',
        },
        'https://dentaltrust.example',
        cipher,
        new Date('2026-07-12T00:00:00.000Z'),
      ),
    ).toBe('EXPIRED');
    expect(() =>
      resolveLifecycleAction(
        'account.email-verification-requested',
        'en-US',
        { tokenHash: 'invalid' },
        'https://dentaltrust.example',
        cipher,
      ),
    ).toThrow('INVALID_LIFECYCLE_NOTIFICATION_PAYLOAD');
    expect(
      resolveLifecycleAction(
        'account.password-reset-completed',
        'en-US',
        {},
        'https://dentaltrust.example',
        cipher,
      ),
    ).toBeNull();
  });
});

describe('notification providers', () => {
  const message = {
    recipient: '+15551234567',
    subject: 'Reminder',
    text: 'Open the secure portal.',
    idempotencyKey: 'notification:test',
  };

  it('uses authenticated, idempotent provider requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await new WebhookDeliveryProvider('https://provider.example/messages', 'secret').send(message);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.example/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret',
          'idempotency-key': 'notification:test',
        }),
      }),
    );
  });

  it('fails on provider rejection and unavailable adapters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(
      new WebhookDeliveryProvider('https://provider.example/messages', 'secret').send(message),
    ).rejects.toThrow('PROVIDER_HTTP_503');
    await expect(new UnavailableDeliveryProvider('NOT_CONFIGURED').send()).rejects.toThrow(
      'NOT_CONFIGURED',
    );
  });
});

describe('notification delivery processor', () => {
  it('delivers a decrypted lifecycle link and records delivery without persisting plaintext', async () => {
    const cipher = new SensitiveFieldCipher('worker-test-encryption-key-with-ample-entropy');
    const token = 'opaque-email-verification-token-with-sufficient-entropy';
    const tokenHash = sha256(token);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      notification: {
        findUnique: vi.fn().mockResolvedValue({
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f01',
          status: 'PROCESSING',
          category: 'ACCOUNT_SECURITY',
          channel: 'EMAIL',
          templateKey: 'account.email-verification-requested',
          templateLocale: 'en-US',
          payload: {
            tokenHash,
            encryptedToken: cipher.encrypt(
              token,
              `account-lifecycle:email-verification:${tokenHash}`,
            ),
            expiresAt: '2999-01-01T00:00:00.000Z',
          },
          idempotencyKey: 'notification:lifecycle',
          user: { email: 'patient@example.test', notificationPreferences: [] },
        }),
        updateMany,
      },
      notificationTemplate: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const providers = providerMocks();

    await processNotification(
      db,
      providers,
      'https://dentaltrust.example',
      cipher,
      notificationJob(),
    );

    expect(providers.email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'patient@example.test',
        text: expect.stringContaining(
          `https://dentaltrust.example/en/auth/verify-email?token=${encodeURIComponent(token)}`,
        ),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
    );
  });

  it('suppresses optional disabled delivery and still delivers in-app updates', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f01',
        status: 'PROCESSING',
        category: 'AFTERCARE',
        channel: 'EMAIL',
        templateKey: 'aftercare.reminder',
        templateLocale: 'en-US',
        payload: {},
        idempotencyKey: 'notification:suppressed',
        user: {
          email: 'patient@example.test',
          notificationPreferences: [{ category: 'AFTERCARE', channel: 'EMAIL', enabled: false }],
        },
      })
      .mockResolvedValueOnce({
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f01',
        status: 'PROCESSING',
        category: 'AFTERCARE',
        channel: 'IN_APP',
        templateKey: 'aftercare.reminder',
        templateLocale: 'en-US',
        payload: {},
        idempotencyKey: 'notification:in-app',
        user: { email: 'patient@example.test', notificationPreferences: [] },
      });
    const db = {
      notification: { findUnique, updateMany },
      notificationTemplate: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const providers = providerMocks();
    const cipher = new SensitiveFieldCipher('worker-test-encryption-key-with-ample-entropy');

    await processNotification(
      db,
      providers,
      'https://dentaltrust.example',
      cipher,
      notificationJob(),
    );
    await processNotification(
      db,
      providers,
      'https://dentaltrust.example',
      cipher,
      notificationJob(),
    );

    expect(providers.email.send).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SUPPRESSED' } }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
    );
  });
});

function providerMocks(): NotificationProviders {
  return {
    email: { send: vi.fn().mockResolvedValue(undefined) },
    sms: { send: vi.fn().mockResolvedValue(undefined) },
    messaging: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

function notificationJob(): Job<NotificationJobData> {
  return {
    data: { notificationId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f01' },
  } as Job<NotificationJobData>;
}
