import type { PrismaClient } from '@dental-trust/database';
import { Queue, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';

import { defaultJobOptions, queueNames } from '../jobs/queues.js';

const BATCH_SIZE = 50;

export interface NotificationJobData {
  readonly notificationId: string;
}

export class NotificationRelay {
  private readonly queue: Queue<NotificationJobData>;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly db: PrismaClient,
    connection: ConnectionOptions,
    private readonly logger: Logger,
  ) {
    this.queue = new Queue<NotificationJobData>(queueNames.notifications, {
      connection,
      defaultJobOptions,
    });
  }

  start(intervalMilliseconds = 1_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), intervalMilliseconds);
    this.timer.unref();
    void this.poll();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 25));
    await this.queue.close();
  }

  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const notifications = await this.db.notification.findMany({
        where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true, channel: true, scheduledAt: true },
      });
      for (const notification of notifications) {
        const claimed = await this.db.notification.updateMany({
          where: { id: notification.id, status: 'PENDING' },
          data: { status: 'PROCESSING' },
        });
        if (claimed.count !== 1) continue;
        try {
          await this.queue.add(
            `deliver-${notification.channel.toLowerCase()}`,
            { notificationId: notification.id },
            { jobId: `${notification.id}-${notification.scheduledAt.getTime()}` },
          );
        } catch (error) {
          await this.db.notification.updateMany({
            where: { id: notification.id, status: 'PROCESSING' },
            data: { status: 'PENDING' },
          });
          this.logger.error(
            { err: error, notificationId: notification.id },
            'notification queue publish failed',
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
