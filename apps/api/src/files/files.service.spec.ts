import { HttpException } from '@nestjs/common';
import type { Prisma } from '@dental-trust/database';
import { describe, expect, it, vi } from 'vitest';

import { FilesService } from './files.service.js';
import type { UploadQuotaPolicy } from './upload-quota.policy.js';

interface QuotaService {
  uploadQuotaPolicy: UploadQuotaPolicy;
  assertUploadQuota(
    transaction: Prisma.TransactionClient,
    userId: string,
    requestedBytes: number,
  ): Promise<void>;
}

const policy: UploadQuotaPolicy = {
  maxActiveUploadsPerUser: 2,
  maxBytesPerUserWindow: 1_000n,
  windowSeconds: 3_600,
  activeQuarantineSeconds: 900,
};

describe('FilesService upload quota transaction', () => {
  it('locks the user before reading quota usage', async () => {
    const calls: string[] = [];
    const queryRaw = vi.fn<
      (strings: TemplateStringsArray, ...values: unknown[]) => Promise<never[]>
    >(async () => {
      calls.push('lock');
      return [];
    });
    const transaction = {
      $queryRaw: queryRaw,
      fileAsset: {
        count: vi.fn(async () => {
          calls.push('count');
          return 1;
        }),
        aggregate: vi.fn(async () => {
          calls.push('aggregate');
          return { _sum: { sizeBytes: 900n } };
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await quotaService().assertUploadQuota(transaction, crypto.randomUUID(), 100);

    expect(calls).toEqual(['lock', 'count', 'aggregate']);
    const sql = (queryRaw.mock.calls[0]?.[0] as TemplateStringsArray | undefined)?.join('');
    expect(sql).toContain('FOR UPDATE');
  });

  it('returns a stable 429 error when the active upload budget is exhausted', async () => {
    const transaction = quotaTransaction(2, 0n);

    const request = quotaService().assertUploadQuota(transaction, crypto.randomUUID(), 100);

    await expect(request).rejects.toBeInstanceOf(HttpException);
    await expect(request).rejects.toMatchObject({
      errorCode: 'UPLOAD_QUOTA_EXCEEDED',
      reason: 'ACTIVE_UPLOADS',
      retryAfterSeconds: 900,
    });
  });

  it('rejects the request that would cross the rolling byte budget', async () => {
    const transaction = quotaTransaction(0, 901n);

    await expect(
      quotaService().assertUploadQuota(transaction, crypto.randomUUID(), 100),
    ).rejects.toMatchObject({
      errorCode: 'UPLOAD_QUOTA_EXCEEDED',
      reason: 'RECENT_BYTES',
      retryAfterSeconds: 3_600,
    });
  });
});

function quotaService(): QuotaService {
  return Object.assign(Object.create(FilesService.prototype) as object, {
    uploadQuotaPolicy: policy,
  }) as QuotaService;
}

function quotaTransaction(activeUploads: number, recentBytes: bigint): Prisma.TransactionClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    fileAsset: {
      count: vi.fn().mockResolvedValue(activeUploads),
      aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: recentBytes } }),
    },
  } as unknown as Prisma.TransactionClient;
}
