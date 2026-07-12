import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@prisma/client';

import { AdminOperationsRepository } from '../src/repositories/admin-operations.repository.js';

const actor = {
  userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  requestId: 'admin-operations-repository-test',
};

describe('AdminOperationsRepository bounded reads', () => {
  it('never selects outbox payloads and requests only one lookahead row', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new AdminOperationsRepository({
      outboxEvent: { findMany },
    } as unknown as PrismaClient);
    await expect(repository.outboxJobs({ limit: 25, status: 'FAILED' })).resolves.toEqual({
      records: [],
      nextCursor: null,
    });
    const query = findMany.mock.calls[0]?.[0] as {
      take?: number;
      select?: Record<string, boolean>;
      where?: unknown;
    };
    expect(query.take).toBe(26);
    expect(query.select).not.toHaveProperty('payload');
    expect(query.where).toEqual({ status: 'FAILED' });
  });

  it('uses an opaque unique cursor and emits continuation only for a full page', async () => {
    const firstId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f10';
    const secondId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f11';
    const findMany = vi.fn().mockResolvedValue([auditRecord(firstId), auditRecord(secondId)]);
    const repository = new AdminOperationsRepository({
      auditLog: { findMany },
    } as unknown as PrismaClient);
    const page = await repository.auditLogs({ limit: 1, cursor: firstId });
    expect(page.records).toHaveLength(1);
    expect(page.nextCursor).toBe(firstId);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: firstId }, skip: 1, take: 2 }),
    );
  });
});

describe('AdminOperationsRepository manual retries', () => {
  it('atomically resets a dead outbox lease and writes reasoned before/after audit evidence', async () => {
    const transaction = {
      outboxEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f11',
          status: 'DEAD_LETTER',
          attemptCount: 8,
          eventType: 'notification.delivery-requested',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const repository = new AdminOperationsRepository({
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient);
    await expect(
      repository.retryOutbox(
        actor,
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f11',
        8,
        'Provider outage was resolved.',
        'admin-retry-idempotency-0001',
      ),
    ).resolves.toEqual({ conflict: false, status: 'PENDING', attemptCount: 0 });
    expect(transaction.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ attemptCount: 8 }),
        data: expect.objectContaining({
          status: 'PENDING',
          attemptCount: 0,
          lockedAt: null,
          lockOwner: null,
        }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'Provider outage was resolved.',
          beforeMetadata: expect.objectContaining({ status: 'DEAD_LETTER', attemptCount: 8 }),
          afterMetadata: {
            status: 'PENDING',
            attemptCount: 0,
            idempotencyKey: 'admin-retry-idempotency-0001',
          },
        }),
      }),
    );
  });

  it('rejects stale outbox state and missing notification records without mutation', async () => {
    const outboxTransaction = {
      outboxEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f11',
          status: 'FAILED',
          attemptCount: 7,
          eventType: 'case.created',
        }),
        updateMany: vi.fn(),
      },
    };
    const outbox = new AdminOperationsRepository({
      $transaction: vi.fn((operation) => operation(outboxTransaction)),
    } as unknown as PrismaClient);
    await expect(
      outbox.retryOutbox(
        actor,
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f11',
        8,
        'Provider outage was resolved.',
        'admin-retry-idempotency-0002',
      ),
    ).resolves.toEqual({ conflict: true });
    expect(outboxTransaction.outboxEvent.updateMany).not.toHaveBeenCalled();

    const notificationTransaction = {
      notification: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const notification = new AdminOperationsRepository({
      $transaction: vi.fn((operation) => operation(notificationTransaction)),
    } as unknown as PrismaClient);
    await expect(
      notification.retryNotification(
        actor,
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f12',
        'SMTP outage was resolved.',
        'admin-retry-idempotency-0003',
      ),
    ).resolves.toBeNull();
  });

  it('requeues only a currently failed notification with a new schedule identity', async () => {
    const transaction = {
      notification: {
        findUnique: vi.fn().mockResolvedValue({
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f12',
          status: 'FAILED',
          channel: 'EMAIL',
          category: 'APPOINTMENTS',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const repository = new AdminOperationsRepository({
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient);
    await expect(
      repository.retryNotification(
        actor,
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f12',
        'SMTP outage was resolved.',
        'admin-retry-idempotency-0004',
      ),
    ).resolves.toEqual({ conflict: false, status: 'PENDING' });
    expect(transaction.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f12', status: 'FAILED' },
        data: expect.objectContaining({ status: 'PENDING', deliveredAt: null }),
      }),
    );
  });
});

function auditRecord(id: string) {
  return {
    id,
    actorType: 'USER',
    actorUserId: null,
    organizationId: null,
    action: 'case.created',
    resourceType: 'DentalCase',
    resourceId: id,
    requestId: 'request-id',
    reason: null,
    success: true,
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
  };
}
