import { ForbiddenException } from '@nestjs/common';

import { hasPermission, requiresMfa, type AccessContext } from '@dental-trust/auth';
import type { ClinicOperationsRepository, ClinicOperatorScope } from '@dental-trust/database';
import {
  clinicPermissionAllowedForRole,
  type ClinicOperationPermission,
  type Permission,
} from '@dental-trust/domain';

export async function clinicScope(
  access: AccessContext,
  repository: ClinicOperationsRepository,
  permission: Permission,
  operationPermission?: ClinicOperationPermission,
): Promise<ClinicOperatorScope> {
  if (
    access.impersonation ||
    requiresMfa(access) ||
    !access.selectedOrganizationId ||
    !hasPermission(access, permission)
  ) {
    throw new ForbiddenException();
  }
  const scope = await repository.loadOperator(access.userId, access.selectedOrganizationId);
  if (!scope || (operationPermission && !scope.permissions.includes(operationPermission))) {
    throw new ForbiddenException();
  }
  return scope;
}

export function assertClinicOrganizationCreator(access: AccessContext): void {
  if (access.impersonation || !access.mfaVerified || access.selectedOrganizationId) {
    throw new ForbiddenException();
  }
}

export function assertTargetPermissions(
  role: ClinicOperatorScope['role'],
  permissions: readonly ClinicOperationPermission[],
): void {
  if (!permissions.every((permission) => clinicPermissionAllowedForRole(role, permission))) {
    throw new ForbiddenException();
  }
}
