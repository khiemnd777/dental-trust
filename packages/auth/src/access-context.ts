import type { Permission, SupportCapability, SystemRole } from '@dental-trust/domain';
import { permissionsForRoles, privilegedRoles } from '@dental-trust/domain';

export interface OrganizationMembershipClaim {
  readonly organizationId: string;
  readonly role: Extract<
    SystemRole,
    'DENTIST' | 'CLINIC_STAFF' | 'CLINIC_ADMIN' | 'CONCIERGE_AGENT'
  >;
  readonly locationIds?: readonly string[];
}

export interface ImpersonationClaim {
  readonly elevationId: string;
  readonly actorUserId: string;
  readonly reason: string;
  readonly expiresAt: Date;
  readonly capabilities: readonly SupportCapability[];
}

export interface AccessContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly SystemRole[];
  readonly memberships: readonly OrganizationMembershipClaim[];
  readonly availableMemberships?: readonly OrganizationMembershipClaim[];
  readonly mfaVerified: boolean;
  readonly mfaRequired?: boolean;
  readonly requestId: string;
  readonly selectedOrganizationId?: string;
  readonly impersonation?: ImpersonationClaim;
}

export function effectiveRoles(context: AccessContext): readonly SystemRole[] {
  return [...new Set([...context.roles, ...context.memberships.map(({ role }) => role)])];
}

export function hasPermission(context: AccessContext, permission: Permission): boolean {
  return permissionsForRoles(effectiveRoles(context)).has(permission);
}

export function requiresMfa(context: AccessContext): boolean {
  const privileged = new Set<SystemRole>(privilegedRoles);
  return effectiveRoles(context).some((role) => privileged.has(role)) && !context.mfaVerified;
}

export function isImpersonating(context: AccessContext, at = new Date()): boolean {
  return context.impersonation !== undefined && context.impersonation.expiresAt > at;
}
