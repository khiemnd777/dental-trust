import { describe, expect, it, vi } from 'vitest';

import {
  isAllowedDetectedMediaType,
  isTerminalFileScanState,
  FileScanProcessor,
  markFileScanTerminalFailure,
  raceWithAbort,
  readFileScanWorkerPolicy,
  runFileScanWithDeadline,
} from '../src/processors/file-scan.processor.js';

describe('file scan media policy', () => {
  it('keeps every advertised clinical upload format scan-eligible', () => {
    expect(
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/dicom'].every(
        isAllowedDetectedMediaType,
      ),
    ).toBe(true);
  });

  it('rejects executable and unrecognized formats after malware scanning', () => {
    expect(isAllowedDetectedMediaType('application/x-msdownload')).toBe(false);
    expect(isAllowedDetectedMediaType('text/html')).toBe(false);
  });

  it('treats successful and rejected scan outcomes as idempotent terminal states', () => {
    expect(isTerminalFileScanState('AVAILABLE', 'CLEAN')).toBe(true);
    expect(isTerminalFileScanState('REJECTED', 'CLEAN')).toBe(true);
    expect(isTerminalFileScanState('REJECTED', 'INFECTED')).toBe(true);
    expect(isTerminalFileScanState('REJECTED', 'ERROR')).toBe(true);
    expect(isTerminalFileScanState('SCANNING', 'PENDING')).toBe(false);
  });

  it('uses bounded configurable scan concurrency and throughput', () => {
    expect(readFileScanWorkerPolicy({})).toEqual({
      concurrency: 2,
      maxJobsPerMinute: 20,
      deadlineMilliseconds: 120_000,
      maxQueuedJobs: 500,
      quarantineMaxAgeSeconds: 1_800,
    });
    expect(
      readFileScanWorkerPolicy({
        FILE_SCAN_CONCURRENCY: '4',
        FILE_SCAN_MAX_JOBS_PER_MINUTE: '60',
        FILE_SCAN_DEADLINE_MILLISECONDS: '90000',
        FILE_SCAN_MAX_QUEUED_JOBS: '200',
        UPLOAD_QUARANTINE_MAX_AGE_SECONDS: '3600',
      }),
    ).toEqual({
      concurrency: 4,
      maxJobsPerMinute: 60,
      deadlineMilliseconds: 90_000,
      maxQueuedJobs: 200,
      quarantineMaxAgeSeconds: 3_600,
    });
    expect(() => readFileScanWorkerPolicy({ FILE_SCAN_CONCURRENCY: '0' })).toThrow(
      'FILE_SCAN_CONCURRENCY',
    );
  });

  it('enforces the absolute deadline even when an upstream promise hangs', async () => {
    const controller = new AbortController();
    const result = raceWithAbort(new Promise<void>(() => undefined), controller.signal);
    const rejection = expect(result).rejects.toBe('deadline');
    controller.abort('deadline');
    await rejection;
  });

  it('bounds the complete processor workflow, including a hanging database phase', async () => {
    let observedSignal: AbortSignal | undefined;
    const processor = {
      process: vi.fn((_fileAssetId: string, signal: AbortSignal) => {
        observedSignal = signal;
        return new Promise<void>(() => undefined);
      }),
    };

    await expect(runFileScanWithDeadline(processor, 'asset-1', 10)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(observedSignal?.aborted).toBe(true);
  });

  it('puts file scan database reads behind server and transaction deadlines', async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ status: 'AVAILABLE', scanStatus: 'CLEAN' });
    const transaction = vi.fn(async (callback) =>
      callback({ $executeRawUnsafe: executeRawUnsafe, fileAsset: { findUniqueOrThrow } }),
    );
    const processor = new FileScanProcessor(
      { $transaction: transaction } as never,
      {
        S3_ENDPOINT: 'http://storage.invalid',
        S3_REGION: 'test',
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY: 'test',
        S3_SECRET_KEY: 'test',
        S3_BUCKET: 'test',
      } as never,
    );

    await processor.process('asset-1', new AbortController().signal);

    expect(executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL statement_timeout = '5000ms'");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 2_000,
      timeout: 6_000,
    });
  });

  it('terminally rejects a scanning asset and writes an audit checkpoint once', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({});
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const db = {
      $transaction: vi.fn(async (callback) =>
        callback({
          $executeRawUnsafe: executeRawUnsafe,
          fileAsset: { updateMany },
          auditLog: { create: auditCreate },
        }),
      ),
    };

    await markFileScanTerminalFailure(
      db as never,
      'asset-1',
      'request-1',
      new Error('scanner unavailable'),
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1', status: 'SCANNING', scanStatus: 'PENDING' },
        data: { status: 'REJECTED', scanStatus: 'ERROR' },
      }),
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it('claims stale quarantine and every rejected outcome before deleting objects', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({});
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([
      { id: 'asset-1', objectKey: 'quarantine/user-1/object.pdf', status: 'QUARANTINED' },
      { id: 'asset-2', objectKey: 'quarantine/user-1/infected.pdf', status: 'REJECTED' },
    ]);
    const db = {
      $transaction: vi.fn(async (callback) =>
        callback({
          $executeRawUnsafe: executeRawUnsafe,
          fileAsset: { findMany, updateMany },
          auditLog: { create: auditCreate },
        }),
      ),
    };
    const processor = new FileScanProcessor(
      db as never,
      {
        S3_ENDPOINT: 'http://storage.invalid',
        S3_REGION: 'test',
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY: 'test',
        S3_SECRET_KEY: 'test',
        S3_BUCKET: 'test',
      } as never,
    );
    const storageSend = vi.fn().mockResolvedValue({});
    (processor as unknown as { storage: { send: typeof storageSend } }).storage = {
      send: storageSend,
    };

    await expect(
      processor.reconcileStaleQuarantine(new Date('2026-07-20T01:00:00.000Z'), 30 * 60_000),
    ).resolves.toEqual({ cleaned: 2 });

    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'asset-1', status: 'QUARANTINED' },
      data: { status: 'DELETION_PENDING', scanStatus: 'ERROR' },
    });
    expect(storageSend).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[1]?.[0]).toMatchObject({
      where: { id: 'asset-1', status: 'DELETION_PENDING' },
      data: { status: 'DELETED', deletedAt: expect.any(Date) },
    });
    expect(updateMany.mock.calls[2]?.[0]).toMatchObject({
      where: { id: 'asset-2', status: 'REJECTED' },
      data: { status: 'DELETION_PENDING' },
    });
    expect(updateMany.mock.calls[2]?.[0]).not.toMatchObject({
      data: { scanStatus: expect.anything() },
    });
    expect(updateMany.mock.calls[3]?.[0]).toMatchObject({
      where: { id: 'asset-2', status: 'DELETION_PENDING' },
      data: { status: 'DELETED', deletedAt: expect.any(Date) },
    });
    expect(auditCreate).toHaveBeenCalledTimes(4);
  });
});
