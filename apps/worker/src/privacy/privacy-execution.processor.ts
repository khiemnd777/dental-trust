import { createHash, randomBytes } from 'node:crypto';

import type { ServerEnvironment } from '@dental-trust/config/server';
import {
  PrivacyExecutionRepository,
  type PrivacyCategoryDispositionRecord,
  type PrivacyExecutionRecord,
  type PrismaClient,
} from '@dental-trust/database';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from 'pino';

import { queueNames } from '../jobs/queues.js';
import { attachOutboxDeliveryLifecycle } from '../jobs/outbox-delivery.js';
import { MultipartPrivateObjectStorage } from './multipart-object-storage.js';
import { createZipArchive, type ZipArchiveEntry } from './zip-archive.js';

const EXECUTION_LEASE_MILLISECONDS = 10 * 60_000;

export interface PrivacyExecutionJobData {
  readonly outboxEventId: string;
  readonly eventType: 'privacy-request.execution-requested';
  readonly aggregateType: 'PrivacyRequestExecution';
  readonly aggregateId: string;
  readonly correlationId: string;
}

interface PrivacyArtifactPurgeJobData {
  readonly requestedAt: string;
}

export interface PrivacyExecutionRuntime {
  readonly worker: Worker<PrivacyExecutionJobData | PrivacyArtifactPurgeJobData>;
  close(): Promise<void>;
}

export async function createPrivacyExecutionRuntime(
  db: PrismaClient,
  connection: ConnectionOptions,
  logger: Logger,
  environment: ServerEnvironment,
): Promise<PrivacyExecutionRuntime> {
  const queue = new Queue<PrivacyExecutionJobData | PrivacyArtifactPurgeJobData>(
    queueNames.privacyExports,
    { connection },
  );
  await queue.upsertJobScheduler(
    'privacy-export-artifact-purge-hourly',
    { pattern: '17 * * * *', tz: 'UTC' },
    {
      name: 'privacy-export-artifact-purge',
      data: { requestedAt: new Date().toISOString() },
      opts: { attempts: 8, backoff: { type: 'exponential', delay: 2_000 } },
    },
  );
  const repository = new PrivacyExecutionRepository(db);
  const storage = new MultipartPrivateObjectStorage(environment);
  const processor = new PrivacyExecutionProcessor(
    repository,
    storage,
    new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY),
    environment,
  );
  const worker = new Worker<PrivacyExecutionJobData | PrivacyArtifactPurgeJobData>(
    queueNames.privacyExports,
    async (job) => {
      if (job.name === 'privacy-export-artifact-purge') {
        return purgeExpiredPrivacyArtifacts(repository, storage);
      }
      return processor.process(job as Job<PrivacyExecutionJobData>);
    },
    { connection, concurrency: 2 },
  );
  worker.on('failed', (job, error) => {
    logger.error(
      {
        err: error,
        jobId: job?.id,
        privacyExecutionId:
          job?.data && 'aggregateId' in job.data ? job.data.aggregateId : undefined,
      },
      'privacy execution job failed',
    );
  });
  attachOutboxDeliveryLifecycle(worker, db, logger);
  return {
    worker,
    async close() {
      await Promise.all([worker.close(), queue.close()]);
    },
  };
}

export function createPrivacyExecutionWorker(
  db: PrismaClient,
  connection: ConnectionOptions,
  logger: Logger,
  environment: ServerEnvironment,
): Worker<PrivacyExecutionJobData> {
  const processor = new PrivacyExecutionProcessor(
    new PrivacyExecutionRepository(db),
    new MultipartPrivateObjectStorage(environment),
    new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY),
    environment,
  );
  const worker = new Worker<PrivacyExecutionJobData>(
    queueNames.privacyExports,
    async (job) => processor.process(job),
    { connection, concurrency: 2 },
  );
  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, jobId: job?.id, privacyExecutionId: job?.data.aggregateId },
      'privacy execution job failed',
    );
  });
  attachOutboxDeliveryLifecycle(worker, db, logger);
  return worker;
}

export async function purgeExpiredPrivacyArtifacts(
  repository: PrivacyExecutionRepository,
  storage: Pick<PrivacyArchiveStorage, 'deleteObject'>,
  now = new Date(),
): Promise<{ readonly purged: number }> {
  const expired = await repository.expiredArtifacts(now);
  let purged = 0;
  for (const execution of expired) {
    if (!execution.artifactFileAsset) continue;
    await storage.deleteObject(execution.artifactFileAsset.objectKey);
    await repository.markArtifactPurged(execution.id, execution.artifactFileAsset.id, now);
    purged += 1;
  }
  return { purged };
}

interface PrivacyArchiveStorage {
  uploadArchive(input: {
    readonly objectKey: string;
    readonly body: AsyncIterable<Uint8Array>;
    readonly manifestChecksumSha256: string;
    readonly maximumBytes: number;
  }): Promise<{ readonly checksumSha256: string; readonly sizeBytes: bigint }>;
  objectBody(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
  deleteObject(objectKey: string): Promise<void>;
}

export class PrivacyExecutionProcessor {
  constructor(
    private readonly repository: PrivacyExecutionRepository,
    private readonly storage: PrivacyArchiveStorage,
    private readonly cipher: SensitiveFieldCipher,
    private readonly environment: Pick<
      ServerEnvironment,
      'PRIVACY_EXPORT_MAX_BYTES' | 'PRIVACY_EXPORT_TTL_HOURS'
    >,
  ) {}

  async process(job: Job<PrivacyExecutionJobData>, now = new Date()): Promise<void> {
    if (
      job.data.eventType !== 'privacy-request.execution-requested' ||
      job.data.aggregateType !== 'PrivacyRequestExecution'
    ) {
      throw new Error('PRIVACY_EXECUTION_JOB_INVALID');
    }
    const claim = await this.repository.claimExecution(
      job.data.aggregateId,
      now,
      EXECUTION_LEASE_MILLISECONDS,
    );
    if (claim.kind === 'COMPLETE') return;
    if (claim.kind === 'NOTICE_FAILED') {
      await this.repository.blockFailedDeletionNotice(claim.execution);
      return;
    }
    if (claim.kind === 'WAITING_NOTICE') throw new PrivacyNoticePendingError();

    const execution = claim.execution;
    try {
      if (execution.privacyRequest.type === 'EXPORT') {
        await this.executeExport(execution, now);
      } else if (execution.privacyRequest.type === 'DELETE') {
        await this.executeDeletion(execution, now);
      } else {
        throw new Error('PRIVACY_EXECUTION_TYPE_UNSUPPORTED');
      }
    } catch (error) {
      if (error instanceof PrivacyNoticePendingError) throw error;
      await this.repository.recordFailure(execution.id, execution.version, errorCode(error));
      throw error;
    }
  }

  private async executeExport(execution: PrivacyExecutionRecord, now: Date): Promise<void> {
    const userId = execution.privacyRequest.requesterUserId;
    const [rawSnapshot, files] = await Promise.all([
      this.repository.exportSnapshot(userId),
      this.repository.exportFiles(userId),
    ]);
    const snapshot = materializeExportSnapshot(rawSnapshot, this.cipher);
    const dispositions = exportDispositions(snapshot, files.length);
    const manifest = {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      privacyRequestId: execution.privacyRequestId,
      subjectUserId: userId,
      categories: dispositions,
      files: files.map((file, index) => ({
        path: archiveFilePath(index, file.id, file.originalFileName),
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes.toString(),
        checksumSha256: file.checksumSha256,
        createdAt: file.createdAt.toISOString(),
      })),
    };
    const manifestBody = stableJson(manifest);
    const manifestChecksumSha256 = sha256(manifestBody);
    const objectKey = `privacy-exports/${userId}/${execution.id}.zip`;
    const entries = this.exportEntries(snapshot, manifestBody, files);
    try {
      const uploaded = await this.storage.uploadArchive({
        objectKey,
        body: createZipArchive(entries, this.environment.PRIVACY_EXPORT_MAX_BYTES),
        manifestChecksumSha256,
        maximumBytes: this.environment.PRIVACY_EXPORT_MAX_BYTES,
      });
      await this.repository.completeExport({
        execution,
        objectKey,
        archiveChecksumSha256: uploaded.checksumSha256,
        manifestChecksumSha256,
        archiveSizeBytes: uploaded.sizeBytes,
        recordCount: dispositions.reduce((sum, item) => sum + item.recordCount, 0),
        expiresAt: new Date(now.getTime() + this.environment.PRIVACY_EXPORT_TTL_HOURS * 3_600_000),
        dispositions,
      });
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
  }

  private async *exportEntries(
    snapshot: Record<string, unknown>,
    manifestBody: string,
    files: Awaited<ReturnType<PrivacyExecutionRepository['exportFiles']>>,
  ): AsyncGenerator<ZipArchiveEntry> {
    yield { path: 'manifest.json', body: manifestBody };
    for (const [name, value] of Object.entries(snapshot).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      yield { path: `data/${safeFileSegment(name)}.json`, body: stableJson(value) };
    }
    for (const [index, file] of files.entries()) {
      yield {
        path: archiveFilePath(index, file.id, file.originalFileName),
        body: verifySourceObject(
          await this.storage.objectBody(file.objectKey),
          file.sizeBytes,
          file.checksumSha256,
        ),
        modifiedAt: file.createdAt,
      };
    }
  }

  private async executeDeletion(execution: PrivacyExecutionRecord, now: Date): Promise<void> {
    if (!execution.noticeNotificationId) {
      await this.repository.createDeletionNotice(execution);
      throw new PrivacyNoticePendingError();
    }
    const userId = execution.privacyRequest.requesterUserId;
    const preflight = await this.repository.deletionPreflight(userId, now);
    if (preflight.blockerCodes.length > 0) {
      await this.repository.blockExecution(execution, preflight.blockerCodes);
      return;
    }
    const retainedForLegalHold = preflight.holds.length > 0;
    await this.repository.completeDeletion({
      execution,
      outcome: retainedForLegalHold ? 'RETAINED_LEGAL_HOLD' : 'DEIDENTIFIED_WITH_RETENTION',
      profileId: preflight.profileId,
      tombstoneEmail: deletedEmail(userId),
      tombstonePasswordHash: unusableArgon2idHash(),
      dispositions: deletionDispositions(retainedForLegalHold),
    });
  }
}

export class PrivacyNoticePendingError extends Error {
  constructor() {
    super('PRIVACY_DELETION_NOTICE_PENDING');
    this.name = 'PrivacyNoticePendingError';
  }
}

export function materializeExportSnapshot(
  snapshot: unknown,
  cipher: SensitiveFieldCipher,
): Record<string, unknown> {
  const value = materializeValue(snapshot, cipher, {});
  if (!isRecord(value)) throw new Error('PRIVACY_EXPORT_SNAPSHOT_INVALID');
  return value;
}

interface MaterializeContext {
  readonly collection?: string;
  readonly passportVersionId?: string;
}

function materializeValue(
  value: unknown,
  cipher: SensitiveFieldCipher,
  context: MaterializeContext,
): unknown {
  if (Array.isArray(value)) return value.map((item) => materializeValue(item, cipher, context));
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  const id = typeof value.id === 'string' ? value.id : null;
  for (const [key, fieldValue] of Object.entries(value)) {
    if (key.startsWith('encrypted')) continue;
    const childContext: MaterializeContext = {
      collection: key,
      ...(value.encryptedTreatmentSummary && id ? { passportVersionId: id } : {}),
      ...(context.passportVersionId ? { passportVersionId: context.passportVersionId } : {}),
    };
    output[key] = materializeValue(fieldValue, cipher, childContext);
  }
  if (!id) return output;

  if (typeof value.encryptedContent === 'string') {
    const content = cipher.decrypt(value.encryptedContent, `assistant-message:${id}`);
    if (value.role === 'ASSISTANT') {
      try {
        output.content = JSON.parse(content);
      } catch {
        output.content = content;
      }
    } else {
      output.content = content;
    }
  }

  if (typeof value.encryptedIdentityData === 'string') {
    output.identity = decryptJson(
      cipher,
      value.encryptedIdentityData,
      `patient-profile:${id}:identity`,
    );
    output.contact = decryptJson(
      cipher,
      value.encryptedContactData,
      `patient-profile:${id}:contact`,
    );
    output.preferences = decryptJson(
      cipher,
      value.encryptedPreferences,
      `patient-profile:${id}:preferences`,
    );
  }
  if (typeof value.encryptedPhone === 'string') {
    output.name = cipher.decrypt(String(value.encryptedName), `emergency-contact:${id}:name`);
    output.phone = cipher.decrypt(value.encryptedPhone, `emergency-contact:${id}:phone`);
  }
  if ('encryptedExistingDiagnosis' in value) {
    output.existingDiagnosis = decryptNullable(
      cipher,
      value.encryptedExistingDiagnosis,
      `intake-version:${id}:existing-diagnosis`,
    );
    output.cosmeticExpectations = decryptNullable(
      cipher,
      value.encryptedCosmeticExpectations,
      `intake-version:${id}:cosmetic-expectations`,
    );
    output.priorDentalWork = decryptNullable(
      cipher,
      value.encryptedPriorDentalWork,
      `intake-version:${id}:prior-dental-work`,
    );
  }
  if (typeof value.encryptedSubstance === 'string') {
    output.substance = cipher.decrypt(value.encryptedSubstance, `intake-allergy:${id}:substance`);
    output.reaction = decryptNullable(
      cipher,
      value.encryptedReaction,
      `intake-allergy:${id}:reaction`,
    );
  } else if (typeof value.encryptedName === 'string') {
    output.name = cipher.decrypt(value.encryptedName, `intake-medication:${id}:name`);
    output.dosage = decryptNullable(
      cipher,
      value.encryptedDosage,
      `intake-medication:${id}:dosage`,
    );
  }
  if (typeof value.encryptedDetails === 'string') {
    const aad =
      typeof value.code === 'string'
        ? `intake-condition:${id}:details`
        : typeof value.reasonCode === 'string'
          ? `review-report:${id}:details`
          : `incident:${id}:details`;
    output.details = cipher.decrypt(value.encryptedDetails, aad);
  }
  if (typeof value.encryptedBody === 'string' && context.collection === 'messages') {
    output.body = cipher.decrypt(value.encryptedBody, `message:${id}:body`);
  }
  if (typeof value.encryptedContent === 'string') {
    output.content = cipher.decrypt(value.encryptedContent, `journey-instruction:${id}`);
  }
  if (typeof value.encryptedTreatmentSummary === 'string') {
    output.treatmentSummary = cipher.decrypt(
      value.encryptedTreatmentSummary,
      `passport:${id}:treatment-summary`,
    );
    output.dischargeInstructions = cipher.decrypt(
      String(value.encryptedDischargeInstructions),
      `passport:${id}:discharge-instructions`,
    );
    output.followUpInstructions = cipher.decrypt(
      String(value.encryptedFollowUpInstructions),
      `passport:${id}:follow-up-instructions`,
    );
  }
  if (typeof value.encryptedMedication === 'string' && context.passportVersionId) {
    const prefix = `passport:${context.passportVersionId}:prescription:${id}`;
    output.medication = cipher.decrypt(value.encryptedMedication, `${prefix}:medication`);
    output.dosage = cipher.decrypt(String(value.encryptedDosage), `${prefix}:dosage`);
    output.instructions = cipher.decrypt(
      String(value.encryptedInstructions),
      `${prefix}:instructions`,
    );
  }
  if (
    typeof value.subject === 'string' &&
    Array.isArray(value.messages) &&
    value.subject.startsWith('v1.')
  ) {
    output.subject = cipher.decrypt(value.subject, `message-thread:${id}:subject`);
  }
  return output;
}

function exportDispositions(
  snapshot: Record<string, unknown>,
  fileCount: number,
): PrivacyCategoryDispositionRecord[] {
  const account = isRecord(snapshot.account) ? snapshot.account : {};
  const cases = Array.isArray(snapshot.cases) ? snapshot.cases : [];
  const assistantSessions = Array.isArray(snapshot.assistantSessions)
    ? snapshot.assistantSessions
    : [];
  const counts: Readonly<Record<string, number>> = {
    ACCOUNT_IDENTITY: Object.keys(account).length > 0 ? 1 : 0,
    AUTHENTICATION: 0,
    PROFILE_CONTACT: isRecord(account.patientProfile) ? 1 : 0,
    CONSENT: arrayLength(snapshot.consents),
    CLINICAL_INTAKE: nestedArrayCount(cases, 'intakeQuestionnaire'),
    CLINICAL_CASES: cases.length,
    CLINICAL_FILES: fileCount,
    MESSAGING:
      deepArrayLength(cases, 'messageThreads', 'messages') +
      deepArrayLength(assistantSessions, 'messages'),
    TREATMENT_AND_PASSPORT: deepArrayLength(cases, 'dentalPassport', 'versions'),
    AFTERCARE: deepArrayLength(cases, 'aftercarePlans'),
    TRUST_SAFETY: deepArrayLength(cases, 'incidents') + deepArrayLength(cases, 'reviews'),
    FINANCIAL: deepArrayLength(cases, 'bookings'),
    NOTIFICATIONS: arrayLength(snapshot.notifications),
    AUDIT_SECURITY: arrayLength(snapshot.auditActivity),
  };
  return Object.entries(counts).map(([category, recordCount]) => ({
    category,
    action: recordCount > 0 ? 'EXPORTED' : 'NOT_FOUND',
    reasonCode: recordCount > 0 ? 'SUBJECT_ACCESS_EXPORT' : 'NO_MATCHING_RECORDS',
    recordCount,
  }));
}

function deletionDispositions(retainedForLegalHold: boolean): PrivacyCategoryDispositionRecord[] {
  const categories = [
    'ACCOUNT_IDENTITY',
    'AUTHENTICATION',
    'PROFILE_CONTACT',
    'CONSENT',
    'CLINICAL_INTAKE',
    'CLINICAL_CASES',
    'CLINICAL_FILES',
    'MESSAGING',
    'TREATMENT_AND_PASSPORT',
    'AFTERCARE',
    'TRUST_SAFETY',
    'FINANCIAL',
    'NOTIFICATIONS',
    'AUDIT_SECURITY',
  ];
  return categories.map((category) => ({
    category,
    action:
      category === 'AUTHENTICATION'
        ? 'REVOKED'
        : retainedForLegalHold
          ? 'RETAINED'
          : category === 'ACCOUNT_IDENTITY' || category === 'PROFILE_CONTACT'
            ? 'REDACTED'
            : 'DEIDENTIFIED',
    reasonCode: retainedForLegalHold
      ? 'ACTIVE_LEGAL_HOLD'
      : category === 'AUTHENTICATION'
        ? 'ACCOUNT_DELETION_SESSION_REVOCATION'
        : 'MINIMUM_RECORD_RETENTION_AFTER_DEIDENTIFICATION',
    recordCount: 0,
  }));
}

async function* verifySourceObject(
  body: AsyncIterable<Uint8Array>,
  expectedSize: bigint,
  expectedChecksum: string,
): AsyncGenerator<Uint8Array> {
  const digest = createHash('sha256');
  let size = 0n;
  for await (const chunk of body) {
    size += BigInt(chunk.length);
    if (size > expectedSize) throw new Error('PRIVACY_EXPORT_SOURCE_SIZE_MISMATCH');
    digest.update(chunk);
    yield chunk;
  }
  if (size !== expectedSize) throw new Error('PRIVACY_EXPORT_SOURCE_SIZE_MISMATCH');
  if (digest.digest('hex') !== expectedChecksum) {
    throw new Error('PRIVACY_EXPORT_SOURCE_CHECKSUM_MISMATCH');
  }
}

function archiveFilePath(index: number, id: string, originalName: string): string {
  return `files/${String(index + 1).padStart(5, '0')}-${id}-${safeFileSegment(originalName)}`;
}

function safeFileSegment(value: string): string {
  const normalized = value.normalize('NFC').replaceAll(/[^\p{L}\p{N}._-]+/gu, '-');
  return normalized.replaceAll(/^[-.]+|[-.]+$/gu, '').slice(0, 160) || 'record';
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  )}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value) || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}

function decryptJson(cipher: SensitiveFieldCipher, value: unknown, aad: string): unknown {
  if (typeof value !== 'string') return null;
  return JSON.parse(cipher.decrypt(value, aad)) as unknown;
}

function decryptNullable(cipher: SensitiveFieldCipher, value: unknown, aad: string): string | null {
  return typeof value === 'string' ? cipher.decrypt(value, aad) : null;
}

function deletedEmail(userId: string): string {
  return `deleted+${sha256(userId).slice(0, 32)}@deleted.invalid`;
}

function unusableArgon2idHash(): string {
  const salt = randomBytes(16).toString('base64').replaceAll('=', '');
  const hash = randomBytes(32).toString('base64').replaceAll('=', '');
  return `$argon2id$v=19$m=65536,t=3,p=1$${salt}$${hash}`;
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'PRIVACY_EXECUTION_FAILED';
  return /^[A-Z0-9_]{3,120}$/u.test(error.message) ? error.message : 'PRIVACY_EXECUTION_FAILED';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function nestedArrayCount(values: unknown[], key: string): number {
  return values.reduce<number>((sum, value) => sum + (isRecord(value) && value[key] ? 1 : 0), 0);
}

function deepArrayLength(values: unknown[], first: string, second?: string): number {
  return values.reduce<number>((sum, value) => {
    if (!isRecord(value)) return sum;
    const nested = value[first];
    if (Array.isArray(nested)) {
      return (
        sum +
        (second
          ? nested.reduce<number>(
              (inner, item) => inner + (isRecord(item) ? arrayLength(item[second]) : 0),
              0,
            )
          : nested.length)
      );
    }
    return sum + (second && isRecord(nested) ? arrayLength(nested[second]) : 0);
  }, 0);
}
