import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import { once } from 'node:events';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { fileTypeFromBuffer } from 'file-type';

import type { ServerEnvironment } from '@dental-trust/config/server';
import type { Prisma, PrismaClient } from '@dental-trust/database';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';

import type { OutboxJobData } from '../jobs/outbox-routing.js';
import { attachOutboxDeliveryLifecycle, isOutboxJobData } from '../jobs/outbox-delivery.js';
import { queueNames } from '../jobs/queues.js';

const SNIFF_BYTES = 8_192;
const allowedMediaTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/dicom',
]);

const DEFAULT_FILE_SCAN_CONCURRENCY = 2;
const DEFAULT_FILE_SCAN_MAX_JOBS_PER_MINUTE = 20;
const DEFAULT_FILE_SCAN_DEADLINE_MILLISECONDS = 120_000;
const DEFAULT_FILE_SCAN_MAX_QUEUED_JOBS = 500;
const DEFAULT_QUARANTINE_MAX_AGE_SECONDS = 30 * 60;
const QUARANTINE_CLEANUP_BATCH_SIZE = 50;
const QUARANTINE_CLEANUP_INTERVAL_MILLISECONDS = 5 * 60_000;
const FILE_SCAN_DATABASE_STATEMENT_TIMEOUT_MILLISECONDS = 5_000;
const FILE_SCAN_DATABASE_ACQUIRE_TIMEOUT_MILLISECONDS = 2_000;
const FILE_SCAN_DATABASE_TRANSACTION_TIMEOUT_MILLISECONDS = 6_000;

interface QuarantineCleanupJobData {
  readonly requestedAt: string;
}

type FileProcessingJobData = OutboxJobData | QuarantineCleanupJobData;

export interface FileScanWorkerPolicy {
  readonly concurrency: number;
  readonly maxJobsPerMinute: number;
  readonly deadlineMilliseconds: number;
  readonly maxQueuedJobs: number;
  readonly quarantineMaxAgeSeconds: number;
}

export function readFileScanWorkerPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): FileScanWorkerPolicy {
  return {
    concurrency: readBoundedInteger(
      environment.FILE_SCAN_CONCURRENCY,
      DEFAULT_FILE_SCAN_CONCURRENCY,
      'FILE_SCAN_CONCURRENCY',
      1,
      32,
    ),
    maxJobsPerMinute: readBoundedInteger(
      environment.FILE_SCAN_MAX_JOBS_PER_MINUTE,
      DEFAULT_FILE_SCAN_MAX_JOBS_PER_MINUTE,
      'FILE_SCAN_MAX_JOBS_PER_MINUTE',
      1,
      10_000,
    ),
    deadlineMilliseconds: readBoundedInteger(
      environment.FILE_SCAN_DEADLINE_MILLISECONDS,
      DEFAULT_FILE_SCAN_DEADLINE_MILLISECONDS,
      'FILE_SCAN_DEADLINE_MILLISECONDS',
      5_000,
      10 * 60_000,
    ),
    maxQueuedJobs: readBoundedInteger(
      environment.FILE_SCAN_MAX_QUEUED_JOBS,
      DEFAULT_FILE_SCAN_MAX_QUEUED_JOBS,
      'FILE_SCAN_MAX_QUEUED_JOBS',
      10,
      100_000,
    ),
    quarantineMaxAgeSeconds: readBoundedInteger(
      environment.UPLOAD_QUARANTINE_MAX_AGE_SECONDS,
      DEFAULT_QUARANTINE_MAX_AGE_SECONDS,
      'UPLOAD_QUARANTINE_MAX_AGE_SECONDS',
      10 * 60,
      7 * 24 * 60 * 60,
    ),
  };
}

export async function createFileProcessingWorker(
  db: PrismaClient,
  connection: ConnectionOptions,
  logger: Logger,
  environment: ServerEnvironment,
  policy = readFileScanWorkerPolicy(),
): Promise<Worker<FileProcessingJobData>> {
  const queue = new Queue<FileProcessingJobData>(queueNames.fileProcessing, { connection });
  try {
    await Promise.all([
      queue.setGlobalConcurrency(policy.concurrency),
      queue.setGlobalRateLimit(policy.maxJobsPerMinute, 60_000),
      queue.upsertJobScheduler(
        'file-quarantine-cleanup',
        { every: QUARANTINE_CLEANUP_INTERVAL_MILLISECONDS },
        {
          name: 'file-quarantine-cleanup',
          data: { requestedAt: new Date().toISOString() },
          opts: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, priority: 1 },
        },
      ),
    ]);
  } finally {
    await queue.close();
  }
  const fileScanner = new FileScanProcessor(db, environment);
  const worker = new Worker<FileProcessingJobData>(
    queueNames.fileProcessing,
    async (job) => {
      if (job.name === 'file-quarantine-cleanup') {
        const signal = AbortSignal.timeout(policy.deadlineMilliseconds);
        await raceWithAbort(
          fileScanner.reconcileStaleQuarantine(
            new Date(),
            policy.quarantineMaxAgeSeconds * 1_000,
            signal,
          ),
          signal,
        );
        return;
      }
      if (!isOutboxJobData(job.data) || job.data.eventType !== 'file.scan-requested') {
        throw new Error(`Unsupported file-processing event: ${job.name}`);
      }
      await runFileScanWithDeadline(fileScanner, job.data.aggregateId, policy.deadlineMilliseconds);
    },
    {
      connection,
      concurrency: policy.concurrency,
      limiter: { max: policy.maxJobsPerMinute, duration: 60_000 },
    },
  );
  worker.on('failed', (job, error) => {
    const data = job?.data;
    logger.error(
      { err: error, jobId: job?.id, eventType: isOutboxJobData(data) ? data.eventType : job?.name },
      'file processing job failed',
    );
  });
  attachOutboxDeliveryLifecycle(worker, db, logger, {
    terminalFailure: async (job, error) => {
      if (!isOutboxJobData(job.data) || job.data.eventType !== 'file.scan-requested') return false;
      await markFileScanTerminalFailure(db, job.data.aggregateId, job.data.correlationId, error);
      return true;
    },
  });
  worker.on('closed', () => fileScanner.close());
  return worker;
}

export class FileScanProcessor {
  private readonly storage: S3Client;

  constructor(
    private readonly db: PrismaClient,
    private readonly environment: ServerEnvironment,
  ) {
    this.storage = new S3Client({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.S3_ACCESS_KEY,
        secretAccessKey: environment.S3_SECRET_KEY,
      },
    });
  }

  async process(fileAssetId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const asset = await this.withDatabaseDeadline((transaction) =>
      transaction.fileAsset.findUniqueOrThrow({ where: { id: fileAssetId } }),
    );
    signal.throwIfAborted();
    if (isTerminalFileScanState(asset.status, asset.scanStatus)) return;
    if (asset.status !== 'SCANNING') throw new Error('File asset is not in the scanning state.');

    const object = await this.storage.send(
      new GetObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: asset.objectKey }),
      { abortSignal: signal },
    );
    if (!object.Body || !(Symbol.asyncIterator in object.Body)) {
      throw new Error('Object storage did not return a streaming body.');
    }

    const body = object.Body as AsyncIterable<Uint8Array> & { destroy?: (error?: Error) => void };
    const abortBody = (): void => {
      body.destroy?.(
        signal.reason instanceof Error ? signal.reason : new Error('Object download aborted.'),
      );
    };
    signal.addEventListener('abort', abortBody, { once: true });
    let result: Awaited<ReturnType<typeof inspectAndScan>>;
    try {
      result = await raceWithAbort(
        inspectAndScan(body, this.environment.CLAMAV_HOST, this.environment.CLAMAV_PORT, signal),
        signal,
      );
    } finally {
      signal.removeEventListener('abort', abortBody);
    }
    if (result.infected) {
      signal.throwIfAborted();
      await this.withDatabaseDeadline((transaction) =>
        transaction.fileAsset.updateMany({
          where: { id: fileAssetId, status: 'SCANNING', scanStatus: 'PENDING' },
          data: {
            status: 'REJECTED',
            scanStatus: 'INFECTED',
            checksumSha256: result.checksumSha256,
            ...(result.mediaType ? { detectedMediaType: result.mediaType } : {}),
          },
        }),
      );
      return;
    }
    if (!result.mediaType || !isAllowedDetectedMediaType(result.mediaType)) {
      signal.throwIfAborted();
      await this.withDatabaseDeadline((transaction) =>
        transaction.fileAsset.updateMany({
          where: { id: fileAssetId, status: 'SCANNING', scanStatus: 'PENDING' },
          data: {
            status: 'REJECTED',
            scanStatus: 'CLEAN',
            checksumSha256: result.checksumSha256,
            ...(result.mediaType ? { detectedMediaType: result.mediaType } : {}),
          },
        }),
      );
      return;
    }
    const detectedMediaType = result.mediaType;
    if (!declaredTypeMatches(asset.declaredMediaType, detectedMediaType)) {
      signal.throwIfAborted();
      await this.withDatabaseDeadline((transaction) =>
        transaction.fileAsset.updateMany({
          where: { id: fileAssetId, status: 'SCANNING', scanStatus: 'PENDING' },
          data: {
            status: 'REJECTED',
            scanStatus: 'CLEAN',
            checksumSha256: result.checksumSha256,
            detectedMediaType,
          },
        }),
      );
      return;
    }
    signal.throwIfAborted();
    await this.storage.send(
      new PutObjectTaggingCommand({
        Bucket: this.environment.S3_BUCKET,
        Key: asset.objectKey,
        Tagging: { TagSet: [{ Key: 'state', Value: 'clean' }] },
      }),
      { abortSignal: signal },
    );
    signal.throwIfAborted();
    await this.withDatabaseDeadline((transaction) =>
      transaction.fileAsset.updateMany({
        where: { id: fileAssetId, status: 'SCANNING', scanStatus: 'PENDING' },
        data: {
          status: 'AVAILABLE',
          scanStatus: 'CLEAN',
          checksumSha256: result.checksumSha256,
          detectedMediaType,
        },
      }),
    );
  }

  async reconcileStaleQuarantine(
    now: Date,
    maximumAgeMilliseconds: number,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<{ readonly cleaned: number }> {
    signal.throwIfAborted();
    const staleBefore = new Date(now.getTime() - maximumAgeMilliseconds);
    const candidates = await this.withDatabaseDeadline((transaction) =>
      transaction.fileAsset.findMany({
        where: {
          objectKey: { startsWith: 'quarantine/' },
          deletedAt: null,
          OR: [
            { status: 'QUARANTINED', createdAt: { lte: staleBefore } },
            { status: 'REJECTED', createdAt: { lte: staleBefore } },
            { status: 'DELETION_PENDING' },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: QUARANTINE_CLEANUP_BATCH_SIZE,
        select: { id: true, objectKey: true, status: true },
      }),
    );
    signal.throwIfAborted();
    let cleaned = 0;
    for (const candidate of candidates) {
      signal.throwIfAborted();
      if (candidate.status !== 'DELETION_PENDING') {
        const claimed = await this.withDatabaseDeadline(async (transaction) => {
          const update = await transaction.fileAsset.updateMany({
            where: {
              id: candidate.id,
              status: candidate.status,
              createdAt: { lte: staleBefore },
            },
            data:
              candidate.status === 'QUARANTINED'
                ? { status: 'DELETION_PENDING', scanStatus: 'ERROR' }
                : { status: 'DELETION_PENDING' },
          });
          if (update.count !== 1) return false;
          await transaction.auditLog.create({
            data: {
              actorType: 'SYSTEM',
              action: 'file.quarantine-cleanup-started',
              resourceType: 'FileAsset',
              resourceId: candidate.id,
              requestId: `file-quarantine-cleanup:${candidate.id}`,
              reason:
                candidate.status === 'QUARANTINED'
                  ? 'Quarantined upload was not finalized before its expiry window.'
                  : 'Rejected upload exceeded its bounded error-retention window.',
              success: true,
              beforeMetadata: { status: candidate.status },
              afterMetadata: { status: 'DELETION_PENDING' },
            },
          });
          return true;
        });
        signal.throwIfAborted();
        if (!claimed) continue;
      }
      await this.storage.send(
        new DeleteObjectCommand({
          Bucket: this.environment.S3_BUCKET,
          Key: candidate.objectKey,
        }),
        { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) },
      );
      signal.throwIfAborted();
      const deleted = await this.withDatabaseDeadline(async (transaction) => {
        const update = await transaction.fileAsset.updateMany({
          where: { id: candidate.id, status: 'DELETION_PENDING' },
          data: { status: 'DELETED', deletedAt: now },
        });
        if (update.count !== 1) return false;
        await transaction.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            action: 'file.quarantine-cleanup-completed',
            resourceType: 'FileAsset',
            resourceId: candidate.id,
            requestId: `file-quarantine-cleanup:${candidate.id}`,
            reason: 'Expired quarantined object was deleted from private object storage.',
            success: true,
            beforeMetadata: { status: 'DELETION_PENDING' },
            afterMetadata: { status: 'DELETED' },
          },
        });
        return true;
      });
      signal.throwIfAborted();
      if (deleted) cleaned += 1;
    }
    return { cleaned };
  }

  close(): void {
    this.storage.destroy();
  }

  private withDatabaseDeadline<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          `SET LOCAL statement_timeout = '${FILE_SCAN_DATABASE_STATEMENT_TIMEOUT_MILLISECONDS}ms'`,
        );
        return operation(transaction);
      },
      {
        maxWait: FILE_SCAN_DATABASE_ACQUIRE_TIMEOUT_MILLISECONDS,
        timeout: FILE_SCAN_DATABASE_TRANSACTION_TIMEOUT_MILLISECONDS,
      },
    );
  }
}

async function inspectAndScan(
  body: AsyncIterable<Uint8Array>,
  host: string,
  port: number,
  signal: AbortSignal,
): Promise<{
  readonly checksumSha256: string;
  readonly mediaType?: string;
  readonly infected: boolean;
}> {
  signal.throwIfAborted();
  const socket = connect({ host, port });
  const abort = (): void => {
    socket.destroy(signal.reason instanceof Error ? signal.reason : new Error('Scan aborted.'));
  };
  signal.addEventListener('abort', abort, { once: true });
  socket.setTimeout(30_000, () => socket.destroy(new Error('ClamAV scan timed out.')));
  try {
    await once(socket, 'connect', { signal });
    socket.write('zINSTREAM\0');

    const digest = createHash('sha256');
    const sniffChunks: Buffer[] = [];
    let sniffLength = 0;
    for await (const rawChunk of body) {
      signal.throwIfAborted();
      const chunk = Buffer.from(rawChunk);
      digest.update(chunk);
      if (sniffLength < SNIFF_BYTES) {
        const remaining = SNIFF_BYTES - sniffLength;
        const sample = chunk.subarray(0, remaining);
        sniffChunks.push(sample);
        sniffLength += sample.length;
      }
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(chunk.length, 0);
      if (!socket.write(length)) await once(socket, 'drain', { signal });
      if (!socket.write(chunk)) await once(socket, 'drain', { signal });
    }
    socket.write(Buffer.alloc(4));
    const response = await readClamResponse(socket);
    signal.throwIfAborted();
    const header = Buffer.concat(sniffChunks);
    const detected = await fileTypeFromBuffer(header);
    signal.throwIfAborted();
    const mediaType = detected?.mime ?? (isDicom(header) ? 'application/dicom' : undefined);
    if (!response.endsWith('OK')) {
      if (!response.includes('FOUND')) {
        throw new Error('ClamAV returned an indeterminate scan response.');
      }
      return {
        checksumSha256: digest.digest('hex'),
        ...(mediaType ? { mediaType } : {}),
        infected: true,
      };
    }
    return {
      checksumSha256: digest.digest('hex'),
      ...(mediaType ? { mediaType } : {}),
      infected: false,
    };
  } finally {
    signal.removeEventListener('abort', abort);
    socket.destroy();
  }
}

async function readClamResponse(socket: ReturnType<typeof connect>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const rawChunk of socket) {
    const chunk = Buffer.from(rawChunk);
    chunks.push(chunk);
    if (chunk.includes(0)) break;
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\0+$/u, '').trim();
}

function isDicom(header: Buffer): boolean {
  return header.length >= 132 && header.subarray(128, 132).toString('ascii') === 'DICM';
}

function declaredTypeMatches(declared: string, detected: string): boolean {
  const normalized = declared.toLowerCase().split(';', 1)[0]?.trim();
  if (detected === 'application/dicom') {
    return normalized === 'application/dicom' || normalized === 'application/octet-stream';
  }
  return normalized === detected;
}

export function isAllowedDetectedMediaType(mediaType: string): boolean {
  return allowedMediaTypes.has(mediaType);
}

export function isTerminalFileScanState(status: string, scanStatus: string): boolean {
  return (
    (status === 'AVAILABLE' && scanStatus === 'CLEAN') ||
    (status === 'REJECTED' &&
      (scanStatus === 'CLEAN' || scanStatus === 'INFECTED' || scanStatus === 'ERROR'))
  );
}

export async function markFileScanTerminalFailure(
  db: PrismaClient,
  fileAssetId: string,
  correlationId: string,
  error: Error,
): Promise<void> {
  await db.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL statement_timeout = '${FILE_SCAN_DATABASE_STATEMENT_TIMEOUT_MILLISECONDS}ms'`,
      );
      const changed = await transaction.fileAsset.updateMany({
        where: { id: fileAssetId, status: 'SCANNING', scanStatus: 'PENDING' },
        data: { status: 'REJECTED', scanStatus: 'ERROR' },
      });
      if (changed.count !== 1) return;
      await transaction.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'file.scan-failed',
          resourceType: 'FileAsset',
          resourceId: fileAssetId,
          requestId: correlationId,
          reason: 'Malware scanning exhausted its bounded retry budget.',
          success: false,
          beforeMetadata: { status: 'SCANNING', scanStatus: 'PENDING' },
          afterMetadata: {
            status: 'REJECTED',
            scanStatus: 'ERROR',
            errorType: error.name,
          },
        },
      });
    },
    {
      maxWait: FILE_SCAN_DATABASE_ACQUIRE_TIMEOUT_MILLISECONDS,
      timeout: FILE_SCAN_DATABASE_TRANSACTION_TIMEOUT_MILLISECONDS,
    },
  );
}

function readBoundedInteger(
  rawValue: string | undefined,
  defaultValue: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (rawValue === undefined || rawValue.trim() === '') return defaultValue;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason ?? new Error('Operation aborted.'));
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

export function runFileScanWithDeadline(
  processor: Pick<FileScanProcessor, 'process'>,
  fileAssetId: string,
  deadlineMilliseconds: number,
): Promise<void> {
  const signal = AbortSignal.timeout(deadlineMilliseconds);
  return raceWithAbort(processor.process(fileAssetId, signal), signal);
}
