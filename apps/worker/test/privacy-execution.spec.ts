import { createHash } from 'node:crypto';

import type { PrivacyExecutionRecord, PrivacyExecutionRepository } from '@dental-trust/database';
import { SensitiveFieldCipher } from '@dental-trust/security';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import {
  materializeExportSnapshot,
  purgeExpiredPrivacyArtifacts,
  PrivacyExecutionProcessor,
  type PrivacyExecutionJobData,
  PrivacyNoticePendingError,
} from '../src/privacy/privacy-execution.processor.js';
import { createZipArchive, crc32 } from '../src/privacy/zip-archive.js';

const key = 'test-field-encryption-key-that-is-long-enough';
const now = new Date('2026-07-12T12:00:00.000Z');

describe('privacy ZIP generation', () => {
  it('streams a deterministic store-only archive with verified CRC values', async () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    const archive = await collect(
      createZipArchive(
        [
          { path: 'manifest.json', body: '{"schemaVersion":1}\n', modifiedAt: now },
          { path: 'files/x.txt', body: chunks('patient-file'), modifiedAt: now },
        ],
        10_000,
      ),
    );
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.includes(Buffer.from('manifest.json'))).toBe(true);
    expect(archive.includes(Buffer.from('patient-file'))).toBe(true);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
  });

  it('rejects traversal paths and bounded archive overflow', async () => {
    await expect(
      collect(createZipArchive([{ path: '../secret.txt', body: 'x' }], 1_000)),
    ).rejects.toThrow('ZIP_ENTRY_PATH_UNSAFE');
    await expect(
      collect(createZipArchive([{ path: 'safe.txt', body: 'too-large' }], 35)),
    ).rejects.toThrow('ZIP_SIZE_LIMIT_EXCEEDED');
  });
});

describe('privacy execution processor', () => {
  it('decrypts selected subject-owned fields without exporting ciphertext', () => {
    const cipher = new SensitiveFieldCipher(key);
    const snapshot = materializeExportSnapshot(
      {
        account: {
          id: 'user-a',
          patientProfile: {
            id: 'profile-a',
            encryptedIdentityData: cipher.encrypt(
              JSON.stringify({ legalName: 'Patient A' }),
              'patient-profile:profile-a:identity',
            ),
            encryptedContactData: cipher.encrypt(
              JSON.stringify({ phone: '+12025550123' }),
              'patient-profile:profile-a:contact',
            ),
            encryptedPreferences: cipher.encrypt(
              JSON.stringify({ language: 'vi-VN' }),
              'patient-profile:profile-a:preferences',
            ),
          },
        },
        cases: [
          {
            messageThreads: [
              {
                id: 'thread-a',
                subject: cipher.encrypt('Consultation', 'message-thread:thread-a:subject'),
                messages: [
                  {
                    id: 'message-a',
                    encryptedBody: cipher.encrypt('Private message', 'message:message-a:body'),
                  },
                ],
              },
            ],
          },
        ],
      },
      cipher,
    );
    const serialized = JSON.stringify(snapshot);
    expect(serialized).toContain('Patient A');
    expect(serialized).toContain('Private message');
    expect(serialized).toContain('Consultation');
    expect(serialized).not.toContain('encryptedIdentityData');
    expect(serialized).not.toContain('encryptedBody');
  });

  it('queues the mandatory deletion notice and does not mis-record it as a failure', async () => {
    const execution = executionRecord('DELETE');
    const repository = repositoryMock({ kind: 'CLAIMED', execution });
    const processor = processorWith(repository);
    await expect(processor.process(job(), now)).rejects.toBeInstanceOf(PrivacyNoticePendingError);
    expect(repository.createDeletionNotice).toHaveBeenCalledWith(execution);
    expect(repository.recordFailure).not.toHaveBeenCalled();
  });

  it('blocks deletion when the mandatory notice cannot be delivered', async () => {
    const execution = executionRecord('DELETE', 'notice-a');
    const repository = repositoryMock({ kind: 'NOTICE_FAILED', execution });
    await processorWith(repository).process(job(), now);
    expect(repository.blockFailedDeletionNotice).toHaveBeenCalledWith(execution);
  });

  it('generates and records a bounded export artifact', async () => {
    const execution = executionRecord('EXPORT');
    const repository = repositoryMock({ kind: 'CLAIMED', execution });
    repository.exportSnapshot.mockResolvedValue({
      account: { id: 'user-a', email: 'patient@example.com' },
      consents: [],
      cases: [],
      notifications: [],
      privacyRequests: [],
      auditActivity: [],
    });
    repository.exportFiles.mockResolvedValue([]);
    const storage = {
      uploadArchive: vi.fn(async ({ body }: { body: AsyncIterable<Uint8Array> }) => {
        const archive = await collect(body);
        return {
          checksumSha256: createHash('sha256').update(archive).digest('hex'),
          sizeBytes: BigInt(archive.length),
        };
      }),
      objectBody: vi.fn(),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const processor = new PrivacyExecutionProcessor(
      repository as unknown as PrivacyExecutionRepository,
      storage,
      new SensitiveFieldCipher(key),
      { PRIVACY_EXPORT_MAX_BYTES: 1_000_000, PRIVACY_EXPORT_TTL_HOURS: 72 },
    );
    await processor.process(job(), now);
    expect(storage.uploadArchive).toHaveBeenCalledOnce();
    expect(repository.completeExport).toHaveBeenCalledWith(
      expect.objectContaining({
        execution,
        objectKey: 'privacy-exports/user-a/execution-a.zip',
        expiresAt: new Date('2026-07-15T12:00:00.000Z'),
      }),
    );
  });

  it('purges expired export objects before recording immutable purge evidence', async () => {
    const repository = {
      expiredArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'execution-a',
          artifactFileAsset: { id: 'file-a', objectKey: 'privacy-exports/user-a/export.zip' },
        },
      ]),
      markArtifactPurged: vi.fn().mockResolvedValue(undefined),
    };
    const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
    await expect(
      purgeExpiredPrivacyArtifacts(
        repository as unknown as PrivacyExecutionRepository,
        storage,
        now,
      ),
    ).resolves.toEqual({ purged: 1 });
    expect(storage.deleteObject).toHaveBeenCalledWith('privacy-exports/user-a/export.zip');
    expect(repository.markArtifactPurged).toHaveBeenCalledWith('execution-a', 'file-a', now);
  });
});

function executionRecord(
  type: 'EXPORT' | 'DELETE',
  noticeNotificationId: string | null = null,
): PrivacyExecutionRecord {
  return {
    id: 'execution-a',
    privacyRequestId: 'request-a',
    privacyRequest: {
      id: 'request-a',
      requesterUserId: 'user-a',
      type,
      requester: {
        id: 'user-a',
        email: 'patient@example.com',
        preferredLocale: 'en-US',
        accountStatus: 'ACTIVE',
        patientProfile: { id: 'profile-a' },
      },
    },
    noticeNotificationId,
    version: 2,
  } as PrivacyExecutionRecord;
}

function repositoryMock(claim: unknown) {
  return {
    claimExecution: vi.fn().mockResolvedValue(claim),
    blockFailedDeletionNotice: vi.fn(),
    createDeletionNotice: vi.fn(),
    deletionPreflight: vi.fn(),
    blockExecution: vi.fn(),
    completeDeletion: vi.fn(),
    exportSnapshot: vi.fn(),
    exportFiles: vi.fn(),
    completeExport: vi.fn(),
    recordFailure: vi.fn(),
  };
}

function processorWith(repository: ReturnType<typeof repositoryMock>) {
  return new PrivacyExecutionProcessor(
    repository as unknown as PrivacyExecutionRepository,
    {
      uploadArchive: vi.fn(),
      objectBody: vi.fn(),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    },
    new SensitiveFieldCipher(key),
    { PRIVACY_EXPORT_MAX_BYTES: 1_000_000, PRIVACY_EXPORT_TTL_HOURS: 72 },
  );
}

function job(): Job<PrivacyExecutionJobData> {
  return {
    data: {
      outboxEventId: 'event-a',
      eventType: 'privacy-request.execution-requested',
      aggregateType: 'PrivacyRequestExecution',
      aggregateId: 'execution-a',
      correlationId: 'request-a',
    },
  } as Job<PrivacyExecutionJobData>;
}

async function collect(body: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function* chunks(value: string): AsyncGenerator<Uint8Array> {
  yield Buffer.from(value.slice(0, 4));
  yield Buffer.from(value.slice(4));
}
