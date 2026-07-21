import { randomUUID } from 'node:crypto';

import type { Prisma, PrismaClient } from '@dental-trust/database';
import { Queue, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';

import { outboxJobId, outboxQueueName, type OutboxJobData } from './outbox-routing.js';
import { defaultJobOptions, fileProcessingJobOptions, queueNames } from './queues.js';
import { OUTBOX_LEASE_MILLISECONDS, outboxFailureDisposition } from './outbox-policy.js';

const BATCH_SIZE = 50;
const DELIVERY_CHECK_MILLISECONDS = 15 * 60_000;

export class OutboxRelay {
  private readonly domainEventQueue: Queue;
  private readonly fileProcessingQueue: Queue;
  private readonly privacyExecutionQueue: Queue;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly lockOwner = randomUUID();

  constructor(
    private readonly db: PrismaClient,
    connection: ConnectionOptions,
    private readonly logger: Logger,
    private readonly fileQueueCapacity = 500,
  ) {
    this.domainEventQueue = new Queue(queueNames.domainEvents, { connection, defaultJobOptions });
    this.fileProcessingQueue = new Queue(queueNames.fileProcessing, {
      connection,
      defaultJobOptions: fileProcessingJobOptions,
    });
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
    const run = (): void => {
      void this.poll().catch((error: unknown) => {
        this.logger.error({ err: error }, 'outbox relay poll failed');
      });
    };
    this.timer = setInterval(run, intervalMilliseconds);
    this.timer.unref();
    run();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 25));
    await Promise.all([
      this.domainEventQueue.close(),
      this.fileProcessingQueue.close(),
      this.privacyExecutionQueue.close(),
    ]);
  }

  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      await this.reconcilePublished(now);
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
          const data: OutboxJobData = {
            outboxEventId: event.id,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
            correlationId: event.correlationId,
          };
          const queue = this.queueFor(event.eventType);
          const jobId = outboxJobId(data);
          const existing = await queue.getJob(jobId);
          if (existing) {
            const state = await existing.getState();
            if (state === 'completed') {
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
              continue;
            }
            if (state === 'failed') await existing.remove();
          }
          if (!existing && queue === this.fileProcessingQueue) {
            const counts = await queue.getJobCounts(
              'waiting',
              'active',
              'delayed',
              'prioritized',
              'waiting-children',
            );
            const queued = Object.values(counts).reduce((sum, count) => sum + count, 0);
            if (queued >= this.fileQueueCapacity) {
              throw new Error('FILE_SCAN_QUEUE_CAPACITY_EXCEEDED');
            }
          }
          await queue.add(event.eventType, data, { jobId });
          await this.db.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              processedAt: null,
              availableAt: new Date(Date.now() + DELIVERY_CHECK_MILLISECONDS),
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

  private queueFor(eventType: string): Queue {
    const queueName = outboxQueueName(eventType);
    if (queueName === queueNames.fileProcessing) return this.fileProcessingQueue;
    if (queueName === queueNames.privacyExports) return this.privacyExecutionQueue;
    return this.domainEventQueue;
  }

  private async reconcilePublished(now: Date): Promise<void> {
    const events = await this.db.outboxEvent.findMany({
      where: { status: 'PUBLISHED', processedAt: null, availableAt: { lte: now } },
      orderBy: { availableAt: 'asc' },
      take: BATCH_SIZE,
    });
    for (const event of events) {
      const queue = this.queueFor(event.eventType);
      const job = await queue.getJob(event.id);
      const state = await job?.getState();
      if (state === 'completed') {
        await this.db.outboxEvent.updateMany({
          where: { id: event.id, status: 'PUBLISHED', processedAt: null },
          data: { processedAt: now, lastErrorCode: null },
        });
        continue;
      }
      if (
        state === 'active' ||
        state === 'waiting' ||
        state === 'delayed' ||
        state === 'prioritized' ||
        state === 'waiting-children'
      ) {
        await this.db.outboxEvent.updateMany({
          where: { id: event.id, status: 'PUBLISHED', processedAt: null },
          data: { availableAt: new Date(now.getTime() + DELIVERY_CHECK_MILLISECONDS) },
        });
        continue;
      }
      if (job) await job.remove().catch(() => undefined);
      const disposition = outboxFailureDisposition(event.attemptCount, now);
      await this.db.outboxEvent.updateMany({
        where: { id: event.id, status: 'PUBLISHED', processedAt: null },
        data: {
          status: disposition.status,
          availableAt: disposition.availableAt,
          lastErrorCode: state === 'failed' ? 'DELIVERY_RETRIES_EXHAUSTED' : 'DELIVERY_JOB_MISSING',
          lockedAt: null,
          lockOwner: null,
        },
      });
    }
  }
}
