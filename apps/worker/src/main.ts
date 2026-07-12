import 'reflect-metadata';

import { loadWorkspaceEnvironment, parseServerEnvironment } from '@dental-trust/config/server';
import type { PrismaClient } from '@dental-trust/database';
import { createLogger } from '@dental-trust/observability';

import { OutboxRelay } from './jobs/outbox-relay.js';
import { redisConnectionOptions } from './jobs/redis.js';
import { createDomainEventWorker } from './processors/domain-event.processor.js';
import { startHealthServer, stopHealthServer } from './health/server.js';
import { NotificationRelay } from './notifications/notification-relay.js';
import { createNotificationWorker } from './notifications/notification.processor.js';
import { createVerificationMaintenanceRuntime } from './processors/verification-maintenance.processor.js';
import { createPatientReminderRuntime } from './processors/patient-reminders.processor.js';
import { createPrivacyExecutionRuntime } from './privacy/privacy-execution.processor.js';

let activeDatabase: PrismaClient | undefined;

async function main(): Promise<void> {
  loadWorkspaceEnvironment();
  const environment = parseServerEnvironment(process.env);
  const { prisma } = await import('@dental-trust/database');
  activeDatabase = prisma;
  const logger = createLogger({
    service: 'dental-trust-worker',
    environment: environment.NODE_ENV,
    ...(process.env.BUILD_VERSION ? { version: process.env.BUILD_VERSION } : {}),
    level: environment.LOG_LEVEL,
  });
  const redis = redisConnectionOptions(environment.REDIS_URL);
  const relay = new OutboxRelay(prisma, redis, logger);
  const notificationRelay = new NotificationRelay(prisma, redis, logger);
  const domainEventWorker = createDomainEventWorker(prisma, redis, logger, environment);
  const notificationWorker = createNotificationWorker(prisma, redis, logger, environment);
  const privacyExecution = await createPrivacyExecutionRuntime(prisma, redis, logger, environment);
  const verificationMaintenance = await createVerificationMaintenanceRuntime(prisma, redis, logger);
  const patientReminders = await createPatientReminderRuntime(prisma, redis, logger);
  const healthServer = await startHealthServer(
    prisma,
    [
      domainEventWorker,
      notificationWorker,
      privacyExecution.worker,
      verificationMaintenance.worker,
      patientReminders.worker,
    ],
    environment.WORKER_HEALTH_PORT,
  );

  relay.start();
  notificationRelay.start();
  logger.info('worker started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker shutting down');
    await relay.stop();
    await notificationRelay.stop();
    await Promise.all([
      domainEventWorker.close(),
      notificationWorker.close(),
      privacyExecution.close(),
      verificationMaintenance.close(),
      patientReminders.close(),
    ]);
    await stopHealthServer(healthServer);
    await prisma.$disconnect();
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(async (error: unknown) => {
  console.error(
    'Worker bootstrap failed',
    error instanceof Error ? error.message : 'unknown error',
  );
  await activeDatabase?.$disconnect();
  process.exitCode = 1;
});
