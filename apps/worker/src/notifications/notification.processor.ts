import type { ServerEnvironment } from '@dental-trust/config/server';
import type { PrismaClient } from '@dental-trust/database';
import { SensitiveFieldCipher } from '@dental-trust/security';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from 'pino';

import { defaultJobOptions, queueNames } from '../jobs/queues.js';
import { deliveryRecipient, shouldDeliverNotification } from './notification-policy.js';
import type { NotificationJobData } from './notification-relay.js';
import {
  createNotificationProviders,
  type DeliveryMessage,
  type NotificationProviders,
} from './providers.js';
import { renderManagedNotificationTemplate, renderNotificationTemplate } from './templates.js';

export function createNotificationWorker(
  db: PrismaClient,
  connection: ConnectionOptions,
  logger: Logger,
  environment: ServerEnvironment,
): Worker<NotificationJobData> {
  const providers = createNotificationProviders(environment);
  const cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
  const worker = new Worker<NotificationJobData>(
    queueNames.notifications,
    async (job) => processNotification(db, providers, environment.APP_URL, cipher, job),
    { connection, concurrency: 10 },
  );
  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, jobId: job?.id, notificationId: job?.data.notificationId },
      'notification delivery failed',
    );
    if (job && job.attemptsMade >= (job.opts.attempts ?? defaultJobOptions.attempts)) {
      void db.notification.updateMany({
        where: { id: job.data.notificationId, status: 'PROCESSING' },
        data: { status: 'FAILED' },
      });
    }
  });
  return worker;
}

export async function processNotification(
  db: PrismaClient,
  providers: NotificationProviders,
  appUrl: string,
  cipher: SensitiveFieldCipher,
  job: Job<NotificationJobData>,
): Promise<void> {
  const notification = await db.notification.findUnique({
    where: { id: job.data.notificationId },
    include: {
      user: {
        select: {
          email: true,
          notificationPreferences: {
            select: { category: true, channel: true, enabled: true },
          },
        },
      },
    },
  });
  if (!notification || notification.status === 'DELIVERED' || notification.status === 'SUPPRESSED')
    return;
  if (notification.status !== 'PROCESSING') throw new Error('NOTIFICATION_NOT_CLAIMED');

  if (
    !shouldDeliverNotification(
      notification.category,
      notification.channel,
      notification.user.notificationPreferences,
    )
  ) {
    await db.notification.updateMany({
      where: { id: notification.id, status: 'PROCESSING' },
      data: { status: 'SUPPRESSED' },
    });
    return;
  }

  const managedTemplate = await db.notificationTemplate.findUnique({
    where: {
      key_channel_locale: {
        key: notification.templateKey,
        channel: notification.channel,
        locale: notification.templateLocale,
      },
    },
    select: {
      versions: {
        where: { publicationStatus: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        take: 1,
        select: { subject: true, body: true },
      },
    },
  });
  const managedVersion = managedTemplate?.versions[0];
  const rendered = managedVersion
    ? renderManagedNotificationTemplate(
        managedVersion.subject,
        managedVersion.body,
        notification.templateLocale,
        appUrl,
      )
    : renderNotificationTemplate({
        category: notification.category,
        templateKey: notification.templateKey,
        locale: notification.templateLocale,
        payload: notification.payload,
        appUrl,
      });
  const action = resolveLifecycleAction(
    notification.templateKey,
    notification.templateLocale,
    notification.payload,
    appUrl,
    cipher,
  );
  if (action === 'EXPIRED') {
    await db.notification.updateMany({
      where: { id: notification.id, status: 'PROCESSING' },
      data: { status: 'SUPPRESSED' },
    });
    return;
  }
  const delivery: DeliveryMessage = {
    recipient:
      notification.channel === 'EMAIL'
        ? notification.user.email
        : (deliveryRecipient(notification.payload) ?? ''),
    subject: rendered.subject,
    text: action ? `${rendered.text}\n\n${action}` : rendered.text,
    idempotencyKey: notification.idempotencyKey,
  };

  if (notification.channel === 'EMAIL') await providers.email.send(delivery);
  else if (notification.channel === 'SMS') await providers.sms.send(delivery);
  else if (notification.channel === 'MESSAGING') await providers.messaging.send(delivery);

  const delivered = await db.notification.updateMany({
    where: { id: notification.id, status: 'PROCESSING' },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });
  if (delivered.count !== 1) throw new Error('NOTIFICATION_DELIVERY_STATE_CONFLICT');
}

export function resolveLifecycleAction(
  templateKey: string,
  locale: string,
  payload: unknown,
  appUrl: string,
  cipher: SensitiveFieldCipher,
  now = new Date(),
): string | 'EXPIRED' | null {
  const flow =
    templateKey === 'account.email-verification-requested'
      ? { context: 'email-verification', path: 'verify-email' }
      : templateKey === 'account.password-reset-requested'
        ? { context: 'password-reset', path: 'password-reset' }
        : null;
  if (!flow) return null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('INVALID_LIFECYCLE_NOTIFICATION_PAYLOAD');
  const tokenHash = Reflect.get(payload, 'tokenHash');
  const encryptedToken = Reflect.get(payload, 'encryptedToken');
  const expiresAt = Reflect.get(payload, 'expiresAt');
  if (
    typeof tokenHash !== 'string' ||
    !/^[a-f0-9]{64}$/iu.test(tokenHash) ||
    typeof encryptedToken !== 'string' ||
    typeof expiresAt !== 'string'
  ) {
    throw new Error('INVALID_LIFECYCLE_NOTIFICATION_PAYLOAD');
  }
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) throw new Error('INVALID_LIFECYCLE_NOTIFICATION_EXPIRY');
  if (expiry <= now) return 'EXPIRED';
  const token = cipher.decrypt(encryptedToken, `account-lifecycle:${flow.context}:${tokenHash}`);
  const url = new URL(appUrl);
  url.pathname = `/${locale.toLowerCase().startsWith('vi') ? 'vi' : 'en'}/auth/${flow.path}`;
  url.search = '';
  url.hash = '';
  url.searchParams.set('token', token);
  return url.toString();
}
