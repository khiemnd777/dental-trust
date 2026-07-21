import type { Prisma, PrismaClient } from '@dental-trust/database';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from 'pino';

import { outboxJobId, type OutboxJobData } from '../jobs/outbox-routing.js';
import { attachOutboxDeliveryLifecycle } from '../jobs/outbox-delivery.js';
import { fileProcessingJobOptions, queueNames } from '../jobs/queues.js';

export interface DomainEventRuntime {
  readonly worker: Worker<OutboxJobData>;
  close(): Promise<void>;
}

export function createDomainEventWorker(
  db: PrismaClient,
  connection: ConnectionOptions,
  logger: Logger,
): DomainEventRuntime {
  const fileProcessingQueue = new Queue<OutboxJobData>(queueNames.fileProcessing, {
    connection,
    defaultJobOptions: fileProcessingJobOptions,
  });
  const worker = new Worker<OutboxJobData>(
    queueNames.domainEvents,
    async (job) => {
      if (job.data.eventType === 'file.scan-requested') {
        await fileProcessingQueue.add(job.name, job.data, { jobId: outboxJobId(job.data) });
        logger.warn({ jobId: job.id }, 'forwarded legacy file scan job to dedicated queue');
        return;
      }
      await processDomainEvent(db, job);
    },
    { connection, concurrency: 10 },
  );
  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, jobId: job?.id, eventType: job?.data.eventType },
      'domain event job failed',
    );
  });
  attachOutboxDeliveryLifecycle(worker, db, logger, {
    shouldMarkCompleted: (job) => job.data.eventType !== 'file.scan-requested',
  });
  return {
    worker,
    close: async () => {
      await worker.close();
      await fileProcessingQueue.close();
    },
  };
}

async function processDomainEvent(db: PrismaClient, job: Job<OutboxJobData>): Promise<void> {
  if (
    job.data.eventType === 'account.email-verification-requested' ||
    job.data.eventType === 'account.password-reset-requested' ||
    job.data.eventType === 'account.password-reset-completed' ||
    job.data.eventType === 'account.mfa-enabled' ||
    job.data.eventType === 'account.mfa-recovery-code-used'
  ) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: job.data.aggregateId },
      select: { id: true, preferredLocale: true },
    });
    await db.notification.upsert({
      where: { idempotencyKey: `notification:${job.data.outboxEventId}` },
      update: {},
      create: {
        userId: user.id,
        category: 'ACCOUNT_SECURITY',
        channel: 'EMAIL',
        templateKey: job.data.eventType,
        templateLocale: user.preferredLocale,
        payload: job.data.payload as Prisma.InputJsonValue,
        idempotencyKey: `notification:${job.data.outboxEventId}`,
      },
    });
    return;
  }
  if (job.data.eventType !== 'case.created' && job.data.eventType !== 'case.status-transitioned') {
    return;
  }
  const dentalCase = await db.dentalCase.findUniqueOrThrow({
    where: { id: job.data.aggregateId },
    select: { id: true, status: true, patientProfile: { select: { userId: true } } },
  });
  await db.notification.upsert({
    where: { idempotencyKey: `notification:${job.data.outboxEventId}` },
    update: {},
    create: {
      userId: dentalCase.patientProfile.userId,
      category: 'CASE_UPDATES',
      channel: 'IN_APP',
      templateKey: job.data.eventType,
      templateLocale: 'vi-VN',
      payload: { caseId: dentalCase.id, status: dentalCase.status },
      idempotencyKey: `notification:${job.data.outboxEventId}`,
    },
  });
}
