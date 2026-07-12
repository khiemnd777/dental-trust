import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import { adminRetryCommandSchema } from '@dental-trust/contracts';
import type { PrismaClient } from '@dental-trust/database';

import { AdminOperationsService } from './admin-operations.service.js';

const administrator: AccessContext = {
  userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
  roles: ['PLATFORM_ADMIN'],
  memberships: [],
  mfaVerified: true,
  requestId: 'admin-operations-test',
};

describe('admin operations command contract', () => {
  it('requires a reason, exact confirmation, and optimistic attempt count', () => {
    expect(
      adminRetryCommandSchema.parse({
        reason: 'Provider outage has been resolved.',
        confirmation: 'RETRY FAILED DELIVERY',
        expectedAttemptCount: 8,
      }),
    ).toMatchObject({ expectedAttemptCount: 8 });
    expect(() =>
      adminRetryCommandSchema.parse({
        reason: 'retry',
        confirmation: 'yes',
        expectedAttemptCount: -1,
      }),
    ).toThrow();
  });
});

describe('AdminOperationsService authorization', () => {
  it('rejects non-admin and impersonated reads', () => {
    const service = serviceWith({ summary: vi.fn() });
    expect(() => service.summary({ ...administrator, roles: ['FINANCE_ADMIN'] })).toThrow(
      ForbiddenException,
    );
    expect(() =>
      service.summary({
        ...administrator,
        impersonation: {
          elevationId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
          actorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04',
          reason: 'Support ticket',
          expiresAt: new Date(Date.now() + 60_000),
          capabilities: [],
        },
      }),
    ).toThrow(ForbiddenException);
  });

  it('requires current MFA for manual retries', async () => {
    const service = serviceWith({ retryOutbox: vi.fn() });
    await expect(
      service.retryOutbox(
        { ...administrator, mfaVerified: false },
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
        retryCommand(),
        'admin-retry-idempotency-0001',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AdminOperationsService retry handling', () => {
  it('passes an audited reason and optimistic attempt count to the repository', async () => {
    const retryOutbox = vi.fn().mockResolvedValue({
      conflict: false,
      status: 'PENDING',
      attemptCount: 0,
    });
    const service = serviceWith({ retryOutbox });
    await expect(
      service.retryOutbox(
        administrator,
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
        retryCommand(),
        'admin-retry-idempotency-0001',
      ),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(retryOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: administrator.userId,
        requestId: administrator.requestId,
      }),
      '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
      8,
      'Provider outage has been resolved.',
      'admin-retry-idempotency-0001',
    );
  });

  it('maps missing and stale operations to safe HTTP errors', async () => {
    const missing = serviceWith({ retryNotification: vi.fn().mockResolvedValue(null) });
    await expect(
      missing.retryNotification(
        administrator,
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
        {
          reason: 'Provider outage has been resolved.',
          confirmation: 'RETRY FAILED DELIVERY',
        },
        'admin-retry-idempotency-0002',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const stale = serviceWith({ retryOutbox: vi.fn().mockResolvedValue({ conflict: true }) });
    await expect(
      stale.retryOutbox(
        administrator,
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
        retryCommand(),
        'admin-retry-idempotency-0003',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function retryCommand() {
  return {
    reason: 'Provider outage has been resolved.',
    confirmation: 'RETRY FAILED DELIVERY' as const,
    expectedAttemptCount: 8,
  };
}

function serviceWith(operations: Record<string, unknown>) {
  const service = new AdminOperationsService({} as PrismaClient);
  Object.defineProperty(service, 'operations', { value: operations });
  return service;
}
