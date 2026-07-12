import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '@dental-trust/database';

import { defaultJobOptions, queueNames } from '../jobs/queues.js';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const MAX_RECORDS_PER_SWEEP = 500;

interface PatientReminderJob {
  readonly requestedAt: string;
}

export interface PatientReminderRuntime {
  readonly worker: Worker<PatientReminderJob>;
  close(): Promise<void>;
}

export async function createPatientReminderRuntime(
  db: PrismaClient,
  connection: ConnectionOptions,
  logger: Logger,
): Promise<PatientReminderRuntime> {
  const queue = new Queue<PatientReminderJob>(queueNames.patientReminders, {
    connection,
    defaultJobOptions,
  });
  await queue.upsertJobScheduler(
    'patient-reminders-five-minute',
    { pattern: '*/5 * * * *', tz: 'UTC' },
    {
      name: 'patient-reminder-sweep',
      data: { requestedAt: new Date().toISOString() },
      opts: defaultJobOptions,
    },
  );
  const today = dateKey(new Date());
  await queue.add(
    'patient-reminder-startup-sweep',
    { requestedAt: new Date().toISOString() },
    { jobId: `patient-reminder-startup-${today}` },
  );
  const worker = new Worker<PatientReminderJob>(
    queueNames.patientReminders,
    async () => processPatientReminders(db),
    { connection, concurrency: 1 },
  );
  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, ...result }, 'patient reminder maintenance completed');
  });
  worker.on('failed', (job, error) => {
    logger.error({ err: error, jobId: job?.id }, 'patient reminder maintenance failed');
  });
  return {
    worker,
    async close() {
      await Promise.all([worker.close(), queue.close()]);
    },
  };
}

export async function processPatientReminders(
  db: PrismaClient,
  now = new Date(),
): Promise<{
  readonly appointments: number;
  readonly aftercare: number;
  readonly payments: number;
  readonly notificationsCreated: number;
}> {
  const [appointments, aftercarePlans, failedPayments] = await Promise.all([
    db.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        startsAt: { gt: now, lte: new Date(now.getTime() + DAY_MS) },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: MAX_RECORDS_PER_SWEEP,
      select: {
        id: true,
        startsAt: true,
        timezone: true,
        kind: true,
        dentalCase: {
          select: {
            patientProfile: {
              select: { user: { select: { id: true, preferredLocale: true } } },
            },
          },
        },
      },
    }),
    db.aftercarePlan.findMany({
      where: { active: true, completedAt: null, startsAt: { lte: now } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: MAX_RECORDS_PER_SWEEP,
      select: {
        id: true,
        startsAt: true,
        dentalCase: {
          select: {
            patientProfile: {
              select: { user: { select: { id: true, preferredLocale: true } } },
            },
          },
        },
        checkIns: { orderBy: { submittedAt: 'desc' }, take: 1, select: { submittedAt: true } },
      },
    }),
    db.payment.findMany({
      where: {
        status: 'FAILED',
        updatedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: MAX_RECORDS_PER_SWEEP,
      select: {
        id: true,
        version: true,
        updatedAt: true,
        booking: {
          select: {
            id: true,
            dentalCase: {
              select: {
                patientProfile: {
                  select: { user: { select: { id: true, preferredLocale: true } } },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const appointment of appointments) {
    const remaining = appointment.startsAt.getTime() - now.getTime();
    const milestone = remaining <= 2 * HOUR_MS ? '2h' : '24h';
    rows.push(
      ...notificationRows({
        userId: appointment.dentalCase.patientProfile.user.id,
        locale: appointment.dentalCase.patientProfile.user.preferredLocale,
        category: 'APPOINTMENTS',
        templateKey: 'appointment.reminder',
        idempotencyBase: `appointment-reminder:${appointment.id}:${appointment.startsAt.toISOString()}:${milestone}`,
        payload: {
          appointmentId: appointment.id,
          startsAt: appointment.startsAt.toISOString(),
          timezone: appointment.timezone,
          kind: appointment.kind,
          milestone,
        },
      }),
    );
  }

  let eligibleAftercare = 0;
  for (const plan of aftercarePlans) {
    if (plan.checkIns[0] && dateKey(plan.checkIns[0].submittedAt) === dateKey(now)) continue;
    const daysSinceStart = Math.max(
      0,
      Math.floor((startOfUtcDay(now).getTime() - startOfUtcDay(plan.startsAt).getTime()) / DAY_MS),
    );
    if (daysSinceStart > 14 && daysSinceStart % 7 !== 0) continue;
    eligibleAftercare += 1;
    rows.push(
      ...notificationRows({
        userId: plan.dentalCase.patientProfile.user.id,
        locale: plan.dentalCase.patientProfile.user.preferredLocale,
        category: 'AFTERCARE',
        templateKey: 'aftercare.check-in-reminder',
        idempotencyBase: `aftercare-reminder:${plan.id}:${dateKey(now)}`,
        payload: { aftercarePlanId: plan.id, daysSinceStart },
      }),
    );
  }

  for (const payment of failedPayments) {
    rows.push(
      ...notificationRows({
        userId: payment.booking.dentalCase.patientProfile.user.id,
        locale: payment.booking.dentalCase.patientProfile.user.preferredLocale,
        category: 'PAYMENTS',
        templateKey: 'payment.failed-follow-up',
        idempotencyBase: `payment-failed-follow-up:${payment.id}:${payment.version}`,
        payload: { paymentId: payment.id, bookingId: payment.booking.id, version: payment.version },
      }),
    );
  }

  const created = rows.length
    ? await db.notification.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };
  return {
    appointments: appointments.length,
    aftercare: eligibleAftercare,
    payments: failedPayments.length,
    notificationsCreated: created.count,
  };
}

function notificationRows(input: {
  readonly userId: string;
  readonly locale: string;
  readonly category: string;
  readonly templateKey: string;
  readonly idempotencyBase: string;
  readonly payload: Prisma.InputJsonObject;
}): Prisma.NotificationCreateManyInput[] {
  return (['IN_APP', 'EMAIL'] as const).map((channel) => ({
    userId: input.userId,
    category: input.category,
    channel,
    templateKey: input.templateKey,
    templateLocale: input.locale,
    payload: input.payload,
    idempotencyKey: `${input.idempotencyBase}:${channel}`,
  }));
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
