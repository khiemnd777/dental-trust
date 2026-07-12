import { randomUUID } from 'node:crypto';

import type { Prisma, PrismaClient } from '@dental-trust/database';
import { Queue, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';

import { defaultJobOptions, queueNames } from './queues.js';
import { OUTBOX_LEASE_MILLISECONDS, outboxFailureDisposition } from './outbox-policy.js';

const BATCH_SIZE = 50;

export class OutboxRelay {
  private readonly domainEventQueue: Queue;
  private readonly privacyExecutionQueue: Queue;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly lockOwner = randomUUID();

  constructor(
    private readonly db: PrismaClient,
    connection: ConnectionOptions,
    private readonly logger: Logger,
  ) {
    this.domainEventQueue = new Queue(queueNames.domainEvents, { connection, defaultJobOptions });
    this.privacyExecutionQueue = new Queue(queueNames.privacyExports, {
      connection,
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 16,
        backoff: { type: 'exponential', delay: 5_000 },
      },
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
    await Promise.all([this.domainEventQueue.close(), this.privacyExecutionQueue.close()]);
  }

  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - OUTBOX_LEASE_MILLISECONDS);
      const claimableWhere: Prisma.OutboxEventWhereInput = {
        OR: [
          { status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: now } },
          { status: 'PROCESSING', lockedAt: { lte: staleBefore } },
        ],
      };
      const events = await this.db.outboxEvent.findMany({
        where: claimableWhere,
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });
      for (const event of events) {
        const claimed = await this.db.outboxEvent.updateMany({
          where: { id: event.id, ...claimableWhere },
          data: {
            status: 'PROCESSING',
            attemptCount: { increment: 1 },
            lockedAt: new Date(),
            lockOwner: this.lockOwner,
          },
        });
        if (claimed.count !== 1) continue;
        try {
          const queue =
            event.eventType === 'privacy-request.execution-requested'
              ? this.privacyExecutionQueue
              : this.domainEventQueue;
          await queue.add(
            event.eventType,
            {
              outboxEventId: event.id,
              eventType: event.eventType,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payload: event.payload,
              correlationId: event.correlationId,
            },
            { jobId: event.id },
          );
          await this.db.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              processedAt: new Date(),
              lastErrorCode: null,
              lockedAt: null,
              lockOwner: null,
            },
          });
        } catch (error) {
          const disposition = outboxFailureDisposition(event.attemptCount + 1, new Date());
          await this.db.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: disposition.status,
              availableAt: disposition.availableAt,
              lastErrorCode: 'QUEUE_PUBLISH_FAILED',
              lockedAt: null,
              lockOwner: null,
            },
          });
          this.logger.error(
            {
              err: error,
              outboxEventId: event.id,
              deadLetter: disposition.status === 'DEAD_LETTER',
            },
            'outbox event publish failed',
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
