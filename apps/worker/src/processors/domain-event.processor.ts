import type { Prisma, PrismaClient } from '@dental-trust/database';
import type { ServerEnvironment } from '@dental-trust/config/server';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from 'pino';

import { queueNames } from '../jobs/queues.js';
import { FileScanProcessor } from './file-scan.processor.js';

interface DomainEventJob {
  readonly outboxEventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly correlationId: string;
}

export function createDomainEventWorker(
  db: PrismaClient,
  connection: ConnectionOptions,
  logger: Logger,
  environment: ServerEnvironment,
): Worker<DomainEventJob> {
  const fileScanner = new FileScanProcessor(db, environment);
  const worker = new Worker<DomainEventJob>(
    queueNames.domainEvents,
    async (job) => processDomainEvent(db, fileScanner, job),
    { connection, concurrency: 10 },
  );
  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, jobId: job?.id, eventType: job?.data.eventType },
      'domain event job failed',
    );
  });
  return worker;
}

async function processDomainEvent(
  db: PrismaClient,
  fileScanner: FileScanProcessor,
  job: Job<DomainEventJob>,
): Promise<void> {
  if (job.data.eventType === 'file.scan-requested') {
    await fileScanner.process(job.data.aggregateId);
    return;
  }
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
