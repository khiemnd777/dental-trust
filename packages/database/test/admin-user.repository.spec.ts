import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@prisma/client';

import { AdminUserRepository } from '../src/repositories/admin-user.repository.js';

const actor = {
  userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  requestId: 'admin-user-repository-test',
  superAdministrator: false,
};
const targetId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';

describe('AdminUserRepository account protection', () => {
  it('prevents administrators from suspending their own account', async () => {
    const transaction = transactionFor({ roles: [{ role: { code: 'PLATFORM_ADMIN' } }] });
    const repository = repositoryWith(transaction);
    await expect(
      repository.changeAccountStatus(
        actor,
        actor.userId,
        'ACTIVE',
        'SUSPENDED',
        'Investigating a potential account compromise.',
        'admin-user-idempotency-0001',
      ),
    ).resolves.toEqual({ outcome: 'PROTECTED' });
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });

  it('protects the final active super administrator and stale status transitions', async () => {
    const finalSuper = transactionFor({ roles: [{ role: { code: 'SUPER_ADMIN' } }] });
    finalSuper.user.count.mockResolvedValue(1);
    const repository = repositoryWith(finalSuper);
    await expect(
      repository.changeAccountStatus(
        { ...actor, superAdministrator: true },
        targetId,
        'ACTIVE',
        'SUSPENDED',
        'Confirmed security response action.',
        'admin-user-idempotency-0002',
      ),
    ).resolves.toEqual({ outcome: 'PROTECTED' });

    const stale = transactionFor({ accountStatus: 'LOCKED' });
    await expect(
      repositoryWith(stale).changeAccountStatus(
        actor,
        targetId,
        'ACTIVE',
        'SUSPENDED',
        'Confirmed security response action.',
        'admin-user-idempotency-0003',
      ),
    ).resolves.toEqual({ outcome: 'CONFLICT' });
  });

  it('atomically suspends, revokes sessions, audits, and emits a minimal event', async () => {
    const transaction = transactionFor();
    const repository = repositoryWith(transaction);
    await expect(
      repository.changeAccountStatus(
        actor,
        targetId,
        'ACTIVE',
        'SUSPENDED',
        'Confirmed account compromise investigation.',
        'admin-user-idempotency-0004',
      ),
    ).resolves.toEqual({ outcome: 'UPDATED', userId: targetId, accountStatus: 'SUSPENDED' });
    expect(transaction.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: targetId, accountStatus: 'ACTIVE', deletedAt: null },
        data: expect.objectContaining({ accountStatus: 'SUSPENDED' }),
      }),
    );
    expect(transaction.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: targetId, revokedAt: null } }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'Confirmed account compromise investigation.',
          beforeMetadata: { accountStatus: 'ACTIVE' },
          afterMetadata: {
            accountStatus: 'SUSPENDED',
            idempotencyKey: 'admin-user-idempotency-0004',
          },
        }),
      }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payload: { userId: targetId } }) }),
    );
  });
});

describe('AdminUserRepository role protection', () => {
  it('allows only a super administrator to grant SUPER_ADMIN', async () => {
    const transaction = transactionFor({ roles: [] });
    transaction.roleDefinition.findUnique.mockResolvedValue({
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
      code: 'SUPER_ADMIN',
    });
    await expect(
      repositoryWith(transaction).changeRole(
        actor,
        targetId,
        'SUPER_ADMIN',
        'GRANT',
        false,
        'Approved emergency platform ownership change.',
        'admin-role-idempotency-0001',
      ),
    ).resolves.toEqual({ outcome: 'PROTECTED' });
    expect(transaction.userRole.create).not.toHaveBeenCalled();
  });

  it('grants an approved role with audit and outbox evidence', async () => {
    const transaction = transactionFor({ roles: [] });
    transaction.roleDefinition.findUnique.mockResolvedValue({
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
      code: 'VERIFICATION_OFFICER',
    });
    await expect(
      repositoryWith(transaction).changeRole(
        actor,
        targetId,
        'VERIFICATION_OFFICER',
        'GRANT',
        false,
        'Approved verification operations assignment.',
        'admin-role-idempotency-0002',
      ),
    ).resolves.toEqual({ outcome: 'UPDATED', userId: targetId, accountStatus: 'ACTIVE' });
    expect(transaction.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: targetId,
        roleId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
      },
    });
    expect(transaction.auditLog.create).toHaveBeenCalled();
    expect(transaction.outboxEvent.create).toHaveBeenCalled();
  });
});

function transactionFor(
  user: {
    accountStatus?: string;
    deletedAt?: Date | null;
    roles?: { role: { code: string } }[];
  } = {},
) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: targetId,
        accountStatus: user.accountStatus ?? 'ACTIVE',
        deletedAt: user.deletedAt ?? null,
        roles: user.roles ?? [],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(2),
    },
    roleDefinition: { findUnique: vi.fn() },
    userRole: {
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

function repositoryWith(transaction: ReturnType<typeof transactionFor>) {
  return new AdminUserRepository({
    $transaction: vi.fn((operation) => operation(transaction)),
  } as unknown as PrismaClient);
}
