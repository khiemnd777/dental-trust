import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import type { ClinicOperationsRepository, ClinicOperatorScope } from '@dental-trust/database';

import {
  assertClinicOrganizationCreator,
  assertTargetPermissions,
  clinicScope,
} from './clinic-operations.policy.js';

const organizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const scope: ClinicOperatorScope = {
  clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
  organizationId,
  role: 'CLINIC_STAFF',
  permissions: ['CASE_INBOX', 'SCHEDULING'],
  locationIds: [],
};

describe('clinic operations policy boundary', () => {
  it('requires MFA and the selected organization for privileged clinic work', async () => {
    const repository = {
      loadOperator: vi.fn().mockResolvedValue(scope),
    } as unknown as ClinicOperationsRepository;
    await expect(
      clinicScope({ ...access(), mfaVerified: false }, repository, 'clinic:manage:availability'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      clinicScope(unscopedAccess(), repository, 'clinic:manage:availability'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces custom least-privilege permissions after global RBAC', async () => {
    const repository = {
      loadOperator: vi.fn().mockResolvedValue(scope),
    } as unknown as ClinicOperationsRepository;
    await expect(
      clinicScope(access(), repository, 'clinic:manage:cases', 'CASE_ASSIGN_DENTIST'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      clinicScope(access(), repository, 'clinic:manage:availability', 'SCHEDULING'),
    ).resolves.toEqual(scope);
    expect(repository.loadOperator).toHaveBeenCalledWith(access().userId, organizationId);
  });

  it('allows organization creation only from an MFA-verified unscoped session', () => {
    expect(() => assertClinicOrganizationCreator(unscopedAccess())).not.toThrow();
    expect(() => assertClinicOrganizationCreator(access())).toThrow(ForbiddenException);
    expect(() =>
      assertClinicOrganizationCreator({
        ...unscopedAccess(),
        impersonation: {
          elevationId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
          actorUserId: access().userId,
          reason: 'support',
          expiresAt: new Date(Date.now() + 60_000),
          capabilities: [],
        },
      }),
    ).toThrow(ForbiddenException);
  });

  it('prevents assigning permissions outside the target role ceiling', () => {
    expect(() => assertTargetPermissions('DENTIST', ['SCHEDULING', 'ANALYTICS_READ'])).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertTargetPermissions('CLINIC_STAFF', ['CASE_INBOX', 'SCHEDULING']),
    ).not.toThrow();
  });
});

function access(): AccessContext {
  return {
    userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
    sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04',
    roles: [],
    memberships: [{ organizationId, role: 'CLINIC_STAFF' }],
    selectedOrganizationId: organizationId,
    mfaVerified: true,
    requestId: 'clinic-policy-test',
  };
}

function unscopedAccess(): AccessContext {
  const context = access();
  return {
    userId: context.userId,
    sessionId: context.sessionId,
    roles: context.roles,
    memberships: context.memberships,
    mfaVerified: context.mfaVerified,
    requestId: context.requestId,
  };
}
