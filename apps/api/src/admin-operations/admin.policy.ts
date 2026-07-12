import { ForbiddenException } from '@nestjs/common';

import { effectiveRoles, isImpersonating, type AccessContext } from '@dental-trust/auth';

export function assertAdministrator(access: AccessContext): void {
  const roles = effectiveRoles(access);
  if (!roles.some((role) => role === 'PLATFORM_ADMIN' || role === 'SUPER_ADMIN')) {
    throw new ForbiddenException();
  }
  if (isImpersonating(access)) throw new ForbiddenException();
  if (!access.mfaVerified) throw new ForbiddenException();
}

export function assertDangerousOperation(access: AccessContext): void {
  assertAdministrator(access);
}

export function assertFinanceOrAdministrator(access: AccessContext): void {
  const roles = effectiveRoles(access);
  if (
    !roles.some((role) => ['FINANCE_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(role)) ||
    isImpersonating(access) ||
    !access.mfaVerified
  ) {
    throw new ForbiddenException();
  }
}

export function assertContentAdministrator(access: AccessContext): void {
  const roles = effectiveRoles(access);
  if (
    !roles.some((role) => ['CONTENT_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(role)) ||
    isImpersonating(access) ||
    !access.mfaVerified
  ) {
    throw new ForbiddenException();
  }
}

export function isSuperAdministrator(access: AccessContext): boolean {
  return effectiveRoles(access).includes('SUPER_ADMIN');
}
