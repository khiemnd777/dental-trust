import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@prisma/client';

import {
  IntakeRepository,
  IntakeResourceNotFoundError,
} from '../src/repositories/intake.repository.js';

const userId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const consentRecordId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const grantedAt = new Date('2026-07-12T08:00:00.000Z');

describe('consent ledger repository', () => {
  it('scopes bounded ledger reads to the subject user', async () => {
    const findMany = vi.fn().mockResolvedValue([record(), record({ id: 'next-record' })]);
    const repository = new IntakeRepository({
      consentRecord: { findMany },
    } as unknown as PrismaClient);
    await expect(
      repository.consentLedger(userId, { limit: 1, status: 'ACTIVE' }),
    ).resolves.toMatchObject({ records: [{ id: consentRecordId }], nextCursor: consentRecordId });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, withdrawnAt: null },
        take: 2,
      }),
    );
  });

  it('withdraws only an allowlisted own consent with OCC, audit reason, and outbox evidence', async () => {
    const current = record();
    const withdrawn = record({ withdrawnAt: new Date('2026-07-12T09:00:00.000Z') });
    const transaction = {
      consentRecord: {
        findFirst: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(withdrawn),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      idempotencyRecord: {
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      idempotencyRecord: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaClient;
    const repository = new IntakeRepository(database);
    await expect(
      repository.withdrawConsent({
        consentRecordId,
        expectedGrantedAt: grantedAt,
        reason: 'Patient withdrew ongoing health-information processing consent.',
        actor: { userId, sessionId: 'session-1', requestId: 'request-12345678' },
        command: {
          userId,
          key: 'consent-withdrawal-key-1',
          operation: 'patient.consent.withdraw',
          requestHash: 'a'.repeat(64),
        },
      }),
    ).resolves.toMatchObject({ id: consentRecordId, withdrawnAt: withdrawn.withdrawnAt });
    expect(transaction.consentRecord.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: consentRecordId, userId }),
      }),
    );
    expect(transaction.consentRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: consentRecordId,
          userId,
          grantedAt,
          withdrawnAt: null,
        }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'patient.consent-withdrawn',
          reason: 'Patient withdrew ongoing health-information processing consent.',
        }),
      }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'patient.consent-withdrawn' }),
      }),
    );
  });

  it('does not reveal whether another user owns the requested consent', async () => {
    const transaction = {
      consentRecord: { findFirst: vi.fn().mockResolvedValue(null) },
      idempotencyRecord: { create: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      idempotencyRecord: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaClient;
    await expect(
      new IntakeRepository(database).withdrawConsent({
        consentRecordId,
        expectedGrantedAt: grantedAt,
        reason: 'Patient withdrew ongoing health-information processing consent.',
        actor: { userId, sessionId: 'session-1', requestId: 'request-12345678' },
        command: {
          userId,
          key: 'consent-withdrawal-key-2',
          operation: 'patient.consent.withdraw',
          requestHash: 'b'.repeat(64),
        },
      }),
    ).rejects.toBeInstanceOf(IntakeResourceNotFoundError);
  });
});

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: consentRecordId,
    userId,
    grantedAt,
    withdrawnAt: null,
    consentTextVersion: {
      purpose: 'INTAKE_HEALTH_INFORMATION',
      version: '2026-07-12',
      locale: 'en-US',
      contentHash: 'a'.repeat(64),
    },
    ...overrides,
  };
}
