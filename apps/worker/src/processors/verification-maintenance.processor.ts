import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '@dental-trust/database';

import { defaultJobOptions, queueNames } from '../jobs/queues.js';

const DAY_MS = 24 * 60 * 60_000;
const EXPIRY_HORIZON_DAYS = 90;
const MAX_CASES_PER_SWEEP = 500;

interface VerificationMaintenanceJob {
  readonly requestedAt: string;
}

export interface VerificationMaintenanceRuntime {
  readonly worker: Worker<VerificationMaintenanceJob>;
  close(): Promise<void>;
}

export async function createVerificationMaintenanceRuntime(
  db: PrismaClient,
  connection: ConnectionOptions,
  logger: Logger,
): Promise<VerificationMaintenanceRuntime> {
  const queue = new Queue<VerificationMaintenanceJob>(queueNames.verificationMaintenance, {
    connection,
    defaultJobOptions,
  });
  await queue.upsertJobScheduler(
    'verification-expiry-daily',
    { pattern: '0 1 * * *', tz: 'Asia/Ho_Chi_Minh' },
    {
      name: 'verification-expiry-sweep',
      data: { requestedAt: new Date().toISOString() },
      opts: { attempts: 8, backoff: { type: 'exponential', delay: 2_000 } },
    },
  );
  const today = new Date().toISOString().slice(0, 10);
  await queue.add(
    'verification-expiry-startup-sweep',
    { requestedAt: new Date().toISOString() },
    { jobId: `verification-expiry-startup-${today}` },
  );
  const worker = new Worker<VerificationMaintenanceJob>(
    queueNames.verificationMaintenance,
    async () => processVerificationMaintenance(db),
    { connection, concurrency: 1 },
  );
  worker.on('failed', (job, error) => {
    logger.error({ err: error, jobId: job?.id }, 'verification expiry maintenance job failed');
  });
  return {
    worker,
    async close() {
      await Promise.all([worker.close(), queue.close()]);
    },
  };
}

export async function processVerificationMaintenance(
  db: PrismaClient,
  now = new Date(),
): Promise<{
  readonly processed: number;
  readonly transitioned: number;
  readonly reminders: number;
}> {
  const horizon = new Date(now.getTime() + EXPIRY_HORIZON_DAYS * DAY_MS);
  const cases = await db.verificationCase.findMany({
    where: {
      status: { in: ['VERIFIED', 'VERIFICATION_EXPIRING'] },
      reviews: { none: { status: 'PENDING_SECOND_APPROVAL' } },
      OR: [
        { expiresAt: { lte: horizon } },
        {
          requirements: {
            some: {
              required: true,
              evidence: {
                some: {
                  approvedAt: { not: null },
                  revokedAt: null,
                  expiresAt: { lte: horizon },
                },
              },
            },
          },
        },
      ],
    },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    take: MAX_CASES_PER_SWEEP,
    include: {
      submittedBy: { select: { id: true, preferredLocale: true } },
      requirements: {
        where: { required: true },
        select: {
          id: true,
          template: { select: { code: true, category: true } },
          evidence: {
            where: { approvedAt: { not: null }, revokedAt: null, expiresAt: { not: null } },
            select: { id: true, expiresAt: true },
          },
        },
      },
    },
  });
  let transitioned = 0;
  let reminders = 0;
  for (const verificationCase of cases) {
    const expiries = [
      ...(verificationCase.expiresAt ? [verificationCase.expiresAt] : []),
      ...verificationCase.requirements.flatMap(({ evidence }) =>
        evidence.flatMap(({ expiresAt }) => (expiresAt ? [expiresAt] : [])),
      ),
    ];
    const earliestExpiry = expiries.sort((left, right) => left.getTime() - right.getTime())[0];
    if (!earliestExpiry) continue;
    const targetStatus = earliestExpiry <= now ? 'EXPIRED' : 'VERIFICATION_EXPIRING';
    if (verificationCase.status !== targetStatus) {
      const changed = await db.$transaction(async (transaction) => {
        const update = await transaction.verificationCase.updateMany({
          where: {
            id: verificationCase.id,
            version: verificationCase.version,
            status: verificationCase.status,
          },
          data: { status: targetStatus, version: { increment: 1 } },
        });
        if (update.count !== 1) return false;
        if (verificationCase.clinicId) {
          await transaction.clinic.update({
            where: { id: verificationCase.clinicId },
            data: { verificationStatus: targetStatus },
          });
        } else if (verificationCase.dentistId) {
          await transaction.dentist.update({
            where: { id: verificationCase.dentistId },
            data: { licenseStatus: targetStatus },
          });
        }
        await transaction.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            action: `verification.case.${targetStatus.toLowerCase()}`,
            resourceType: 'VerificationCase',
            resourceId: verificationCase.id,
            requestId: `verification-maintenance:${dateKey(now)}`,
            reason: 'Approved verification evidence reached an expiry threshold.',
            success: true,
            beforeMetadata: {
              status: verificationCase.status,
              version: verificationCase.version,
            },
            afterMetadata: {
              status: targetStatus,
              version: verificationCase.version + 1,
              earliestExpiry: earliestExpiry.toISOString(),
            },
          },
        });
        await transaction.outboxEvent.upsert({
          where: {
            idempotencyKey: `verification-maintenance:${verificationCase.id}:${targetStatus}:${dateKey(now)}`,
          },
          update: {},
          create: {
            aggregateType: 'VerificationCase',
            aggregateId: verificationCase.id,
            eventType:
              targetStatus === 'EXPIRED'
                ? 'verification.case.expired'
                : 'verification.case.expiring',
            payload: {
              verificationCaseId: verificationCase.id,
              status: targetStatus,
              expiresAt: earliestExpiry.toISOString(),
            },
            correlationId: `verification-maintenance:${dateKey(now)}`,
            idempotencyKey: `verification-maintenance:${verificationCase.id}:${targetStatus}:${dateKey(now)}`,
          },
        });
        return true;
      });
      if (changed) transitioned += 1;
    }
    if (!verificationCase.submittedBy) continue;
    for (const requirement of verificationCase.requirements) {
      for (const evidence of requirement.evidence) {
        if (!evidence.expiresAt || evidence.expiresAt <= now || evidence.expiresAt > horizon)
          continue;
        const milestoneDays = reminderMilestone(evidence.expiresAt, now);
        for (const channel of ['IN_APP', 'EMAIL'] as const) {
          const idempotencyKey = `verification-expiry:${evidence.id}:${dateKey(evidence.expiresAt)}:${milestoneDays}:${channel}`;
          await db.notification.upsert({
            where: { idempotencyKey },
            update: {},
            create: {
              userId: verificationCase.submittedBy.id,
              category: 'VERIFICATION_EXPIRY',
              channel,
              templateKey: 'verification.evidence-expiring',
              templateLocale: verificationCase.submittedBy.preferredLocale,
              payload: {
                verificationCaseId: verificationCase.id,
                evidenceId: evidence.id,
                requirementCode: requirement.template.code,
                evidenceCategory: requirement.template.category,
                expiresAt: evidence.expiresAt.toISOString().slice(0, 10),
                milestoneDays,
              } satisfies Prisma.InputJsonObject,
              idempotencyKey,
            },
          });
          reminders += 1;
        }
      }
    }
  }
  return { processed: cases.length, transitioned, reminders };
}

function reminderMilestone(expiresAt: Date, now: Date): 7 | 30 | 90 {
  const remainingDays = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
  if (remainingDays <= 7) return 7;
  if (remainingDays <= 30) return 30;
  return 90;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
