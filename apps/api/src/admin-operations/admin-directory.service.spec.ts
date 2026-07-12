import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import {
  adminAccountStatusCommandSchema,
  adminUserRoleCommandSchema,
} from '@dental-trust/contracts';
import type { PrismaClient } from '@dental-trust/database';

import { AdminDirectoryService } from './admin-directory.service.js';

const administrator: AccessContext = {
  userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
  roles: ['PLATFORM_ADMIN'],
  memberships: [],
  mfaVerified: true,
  requestId: 'admin-directory-test',
};

describe('admin directory command contracts', () => {
  it('requires explicit confirmation and optimistic prior state', () => {
    expect(
      adminAccountStatusCommandSchema.parse({
        toStatus: 'SUSPENDED',
        expectedStatus: 'ACTIVE',
        reason: 'Confirmed account compromise investigation.',
        confirmation: 'CHANGE ACCOUNT STATUS',
      }),
    ).toMatchObject({ toStatus: 'SUSPENDED', expectedStatus: 'ACTIVE' });
    expect(() =>
      adminUserRoleCommandSchema.parse({
        role: 'CLINIC_ADMIN',
        action: 'GRANT',
        expectedRolePresent: false,
        reason: 'Role requested',
        confirmation: 'CHANGE USER ROLE',
      }),
    ).toThrow();
  });
});

describe('AdminDirectoryService reads', () => {
  it('sanitizes optional query properties before repository access', async () => {
    const users = vi.fn().mockResolvedValue({ records: [], nextCursor: null });
    const service = serviceWith({ users });
    await service.listUsers(administrator, {
      limit: 25,
      cursor: undefined,
      search: undefined,
      status: undefined,
    });
    expect(users).toHaveBeenCalledWith({ limit: 25 });
  });

  it('rejects non-administrator and impersonated directory reads', () => {
    const service = serviceWith({ users: vi.fn() });
    expect(() =>
      service.listUsers({ ...administrator, roles: ['CONTENT_ADMIN'] }, { limit: 25 }),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.listUsers(
        {
          ...administrator,
          impersonation: {
            elevationId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
            actorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04',
            reason: 'Support ticket',
            expiresAt: new Date(Date.now() + 60_000),
            capabilities: [],
          },
        },
        { limit: 25 },
      ),
    ).toThrow(ForbiddenException);
  });
});

describe('AdminDirectoryService dangerous mutations', () => {
  it('requires MFA and maps repository safety outcomes', async () => {
    const service = serviceWith(
      {},
      { changeAccountStatus: vi.fn().mockResolvedValue({ outcome: 'UPDATED' }) },
    );
    await expect(
      service.changeAccountStatus(
        { ...administrator, mfaVerified: false },
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
        statusCommand(),
        'admin-user-idempotency-0001',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    for (const [outcome, error] of [
      ['NOT_FOUND', NotFoundException],
      ['CONFLICT', ConflictException],
      ['PROTECTED', ForbiddenException],
    ] as const) {
      const guarded = serviceWith(
        {},
        { changeAccountStatus: vi.fn().mockResolvedValue({ outcome }) },
      );
      await expect(
        guarded.changeAccountStatus(
          administrator,
          '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
          statusCommand(),
          'admin-user-idempotency-0002',
        ),
      ).rejects.toBeInstanceOf(error);
    }
  });

  it('passes a super-administrator fact into protected role changes', async () => {
    const changeRole = vi.fn().mockResolvedValue({
      outcome: 'UPDATED',
      userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
      accountStatus: 'ACTIVE',
    });
    const service = serviceWith({}, { changeRole });
    await service.changeRole(
      { ...administrator, roles: ['SUPER_ADMIN'] },
      '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
      {
        role: 'VERIFICATION_OFFICER',
        action: 'GRANT',
        expectedRolePresent: false,
        reason: 'Approved verification team assignment.',
        confirmation: 'CHANGE USER ROLE',
      },
      'admin-role-idempotency-0001',
    );
    expect(changeRole).toHaveBeenCalledWith(
      expect.objectContaining({ superAdministrator: true }),
      '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
      'VERIFICATION_OFFICER',
      'GRANT',
      false,
      'Approved verification team assignment.',
      'admin-role-idempotency-0001',
    );
  });
});

function statusCommand() {
  return {
    toStatus: 'SUSPENDED' as const,
    expectedStatus: 'ACTIVE' as const,
    reason: 'Confirmed account compromise investigation.',
    confirmation: 'CHANGE ACCOUNT STATUS' as const,
  };
}

function serviceWith(directory: Record<string, unknown>, users: Record<string, unknown> = {}) {
  const service = new AdminDirectoryService({} as PrismaClient);
  Object.defineProperty(service, 'directory', { value: directory });
  Object.defineProperty(service, 'users', { value: users });
  return service;
}
