import type { PrismaClient } from '@dental-trust/database';
import type { Job, Worker } from 'bullmq';
import type { Logger } from 'pino';

import { outboxFailureDisposition } from './outbox-policy.js';
import type { OutboxJobData } from './outbox-routing.js';

interface OutboxDeliveryLifecycleOptions<T> {
  readonly shouldMarkCompleted?: (job: Job<T>) => boolean;
  readonly terminalFailure?: (job: Job<T>, error: Error) => Promise<boolean>;
}

export function attachOutboxDeliveryLifecycle<T>(
  worker: Worker<T>,
  db: PrismaClient,
  logger: Logger,
  options: OutboxDeliveryLifecycleOptions<T> = {},
): void {
  worker.on('completed', (job) => {
    if (!isOutboxJobData(job.data) || options.shouldMarkCompleted?.(job) === false) return;
    const outboxEventId = job.data.outboxEventId;
    void markOutboxDelivered(db, outboxEventId).catch((error: unknown) => {
      logger.error({ err: error, outboxEventId }, 'outbox delivery completion checkpoint failed');
    });
  });
  worker.on('failed', (job, error) => {
    if (!job || !isOutboxJobData(job.data) || !isFinalAttempt(job)) return;
    const outboxEventId = job.data.outboxEventId;
    void (async () => {
      const terminal = (await options.terminalFailure?.(job, error)) ?? false;
      await job.remove().catch(() => undefined);
      await markOutboxDeliveryFailed(db, outboxEventId, terminal, new Date());
    })().catch((checkpointError: unknown) => {
      logger.error(
        { err: checkpointError, outboxEventId },
        'outbox delivery failure checkpoint failed',
      );
    });
  });
}

export async function markOutboxDelivered(db: PrismaClient, outboxEventId: string): Promise<void> {
  await db.outboxEvent.updateMany({
    where: { id: outboxEventId, status: 'PUBLISHED', processedAt: null },
    data: { processedAt: new Date(), lastErrorCode: null },
  });
}

export async function markOutboxDeliveryFailed(
  db: PrismaClient,
  outboxEventId: string,
  terminal: boolean,
  now: Date,
): Promise<void> {
  const event = await db.outboxEvent.findUnique({
    where: { id: outboxEventId },
    select: { status: true, attemptCount: true, processedAt: true },
  });
  if (!event || event.status !== 'PUBLISHED' || event.processedAt) return;
  const disposition = terminal
    ? { status: 'DEAD_LETTER' as const, availableAt: now }
    : outboxFailureDisposition(event.attemptCount, now);
  await db.outboxEvent.updateMany({
    where: { id: outboxEventId, status: 'PUBLISHED', processedAt: null },
    data: {
      status: disposition.status,
      availableAt: disposition.availableAt,
      lastErrorCode: terminal ? 'DELIVERY_TERMINAL_FAILURE' : 'DELIVERY_RETRIES_EXHAUSTED',
      lockedAt: null,
      lockOwner: null,
    },
  });
}

function isFinalAttempt(job: Job<unknown>): boolean {
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

export function isOutboxJobData(value: unknown): value is OutboxJobData {
  return (
    value !== null &&
    typeof value === 'object' &&
    'outboxEventId' in value &&
    typeof value.outboxEventId === 'string' &&
    'eventType' in value &&
    typeof value.eventType === 'string'
  );
}
