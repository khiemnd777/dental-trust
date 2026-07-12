import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { OptimisticConcurrencyError } from '../src/repositories/case.repository.js';
import { AdminGovernanceRepository } from '../src/repositories/admin-governance.repository.js';

const actor = {
  userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  requestId: 'admin-governance-repository-test',
};
const command = {
  key: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99',
  operation: 'admin-governance:content',
  requestHash: 'a'.repeat(64),
};

describe('AdminGovernanceRepository immutable versions', () => {
  it('appends content history with audit, outbox, and idempotency evidence', async () => {
    const transaction = transactionBase({
      contentPage: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: actor.userId,
          version: 1,
          publicationStatus: 'PUBLISHED',
        }),
      },
    });
    const repository = repositoryWithTransaction(transaction);
    const result = await repository.appendContent({
      actor,
      command,
      reason: 'Approved public patient-safety page.',
      slug: 'patient-safety',
      locale: 'en-US',
      expectedVersion: 0,
      title: 'Patient safety commitments',
      summary: 'How Dental Trust protects patients.',
      body: 'This page explains the durable patient safety controls in the care journey.',
      publicationStatus: 'PUBLISHED',
    });
    expect(result).toEqual({ resourceId: actor.userId, version: 1 });
    expect(transaction.contentPage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 1, publishedAt: expect.any(Date) }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.content-version-created',
          reason: 'Approved public patient-safety page.',
        }),
      }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalled();
    expect(transaction.idempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('rejects stale taxonomy versions before writing a mutation', async () => {
    const transaction = transactionBase({
      serviceCategory: {
        findUnique: vi.fn().mockResolvedValue({ id: actor.userId, code: 'general', version: 2 }),
      },
    });
    const repository = repositoryWithTransaction(transaction);
    await expect(
      repository.changeTaxonomy({
        actor,
        command: { ...command, operation: 'admin-governance:taxonomy' },
        reason: 'Approved taxonomy maintenance ticket.',
        kind: 'service_category',
        code: 'general',
        names: { 'vi-VN': 'Tổng quát', 'en-US': 'General' },
        active: true,
        parentId: null,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('never copies a configuration value into audit or outbox metadata', async () => {
    const transaction = transactionBase({
      systemConfiguration: {
        upsert: vi.fn().mockResolvedValue({
          id: actor.userId,
          description: 'Default deposit percentage.',
          valueType: 'INTEGER',
          secret: false,
          versions: [],
        }),
      },
      systemConfigurationVersion: {
        create: vi.fn().mockResolvedValue({ id: actor.userId, version: 1 }),
      },
    });
    const repository = repositoryWithTransaction(transaction);
    await repository.appendConfiguration({
      actor,
      command: { ...command, operation: 'admin-governance:configuration' },
      reason: 'Approved booking policy change DT-2048.',
      key: 'booking.deposit-percent',
      description: 'Default deposit percentage.',
      valueType: 'INTEGER',
      expectedVersion: 0,
      value: '20',
    });
    const auditCall = transaction.auditLog.create.mock.calls[0]?.[0];
    const outboxCall = transaction.outboxEvent.create.mock.calls[0]?.[0];
    expect(JSON.stringify({ auditCall, outboxCall })).not.toContain('"20"');
    expect(transaction.systemConfigurationVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ value: '20' }) }),
    );
  });

  it('returns a completed response when the same idempotency command is replayed', async () => {
    const unique = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    const db = {
      $transaction: vi.fn().mockRejectedValue(unique),
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue({
          operation: command.operation,
          requestHash: command.requestHash,
          status: 'COMPLETED',
          response: { resourceId: actor.userId, version: 4 },
        }),
      },
    } as unknown as PrismaClient;
    const repository = new AdminGovernanceRepository(db);
    await expect(
      repository.appendContent({
        actor,
        command,
        reason: 'Approved public patient-safety page.',
        slug: 'patient-safety',
        locale: 'en-US',
        expectedVersion: 3,
        title: 'Patient safety commitments',
        body: 'This page explains the durable patient safety controls in the care journey.',
        publicationStatus: 'PUBLISHED',
      }),
    ).resolves.toEqual({ resourceId: actor.userId, version: 4 });
  });
});

describe('AdminGovernanceRepository bounded views', () => {
  it('maps content dates and emits a stable continuation cursor', async () => {
    const records = [1, 2].map((version) => ({
      id: `018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e0${version}`,
      slug: 'patient-safety',
      locale: 'en-US',
      version,
      title: 'Patient safety',
      summary: null,
      publicationStatus: 'DRAFT',
      publishedAt: null,
      archivedAt: null,
      createdAt: new Date(`2026-07-1${version}T00:00:00.000Z`),
    }));
    const db = {
      contentPage: { findMany: vi.fn().mockResolvedValue(records) },
    } as unknown as PrismaClient;
    const page = await new AdminGovernanceRepository(db).content({ limit: 1 });
    expect(page.records).toHaveLength(1);
    expect(page.records[0]?.createdAt).toBe('2026-07-11T00:00:00.000Z');
    expect(page.nextCursor).toBe(records[0]?.id);
  });
});

function transactionBase<T extends Record<string, unknown>>(overrides: T) {
  return {
    idempotencyRecord: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function repositoryWithTransaction(transaction: object) {
  const db = {
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(transaction)),
  } as unknown as PrismaClient;
  return new AdminGovernanceRepository(db);
}
