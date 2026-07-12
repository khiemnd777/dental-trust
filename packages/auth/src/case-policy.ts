import type { Permission } from '@dental-trust/domain';
import type { CaregiverPermission } from '@dental-trust/domain';

import {
  hasPermission,
  isImpersonating,
  requiresMfa,
  type AccessContext,
} from './access-context.js';

export interface CaregiverGrantClaim {
  readonly caregiverUserId: string;
  readonly permissions: readonly CaregiverPermission[];
  readonly expiresAt?: Date;
  readonly revokedAt?: Date;
}

export interface CaseAssignmentClaim {
  readonly userId?: string;
  readonly organizationId?: string;
  readonly active: boolean;
}

export interface CaseAccessResource {
  readonly caseId: string;
  readonly patientUserId: string;
  readonly caregiverGrants: readonly CaregiverGrantClaim[];
  readonly assignments: readonly CaseAssignmentClaim[];
}

export type CaseAction =
  'READ_SUMMARY' | 'TRANSITION' | 'SHARE' | 'READ_DOCUMENTS' | 'UPLOAD_DOCUMENTS';

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason:
    | 'OWNER'
    | 'ACTIVE_CAREGIVER_GRANT'
    | 'DIRECT_ASSIGNMENT'
    | 'ORGANIZATION_ASSIGNMENT'
    | 'ELEVATED_ACCESS'
    | 'MFA_REQUIRED'
    | 'IMPERSONATION_EXPIRED'
    | 'ELEVATION_SCOPE_DENIED'
    | 'MISSING_PERMISSION'
    | 'OUTSIDE_RESOURCE_SCOPE';
  readonly organizationId?: string;
}

const actionPermission: Readonly<Record<CaseAction, readonly Permission[]>> = {
  READ_SUMMARY: ['case:read:own', 'case:read:shared', 'case:read:assigned', 'case:read:any'],
  TRANSITION: ['case:transition:own', 'case:transition:assigned'],
  SHARE: ['case:share'],
  READ_DOCUMENTS: ['document:read:own', 'document:read:shared', 'document:read:assigned'],
  UPLOAD_DOCUMENTS: ['document:upload:own', 'document:upload:assigned'],
};

const caregiverPermissionForAction: Partial<Record<CaseAction, CaregiverPermission>> = {
  READ_SUMMARY: 'VIEW_CASE_SUMMARY',
  READ_DOCUMENTS: 'VIEW_DOCUMENTS',
  UPLOAD_DOCUMENTS: 'UPLOAD_DOCUMENTS',
};

export function authorizeCaseAction(
  context: AccessContext,
  resource: CaseAccessResource,
  action: CaseAction,
  now = new Date(),
): AuthorizationDecision {
  if (context.impersonation && !isImpersonating(context, now)) {
    return { allowed: false, reason: 'IMPERSONATION_EXPIRED' };
  }

  if (
    context.impersonation &&
    (action !== 'READ_SUMMARY' || !context.impersonation.capabilities.includes('CASE_READ'))
  ) {
    return { allowed: false, reason: 'ELEVATION_SCOPE_DENIED' };
  }

  if (requiresMfa(context)) {
    return { allowed: false, reason: 'MFA_REQUIRED' };
  }

  if (!actionPermission[action].some((permission) => hasPermission(context, permission))) {
    return { allowed: false, reason: 'MISSING_PERMISSION' };
  }

  if (hasPermission(context, 'case:read:any') && action === 'READ_SUMMARY') {
    return { allowed: true, reason: 'ELEVATED_ACCESS' };
  }

  if (resource.patientUserId === context.userId) {
    return ownerDecision(context, action);
  }

  const caregiverPermission = caregiverPermissionForAction[action];
  if (caregiverPermission) {
    const grant = resource.caregiverGrants.find(
      (candidate) =>
        candidate.caregiverUserId === context.userId &&
        candidate.revokedAt === undefined &&
        (candidate.expiresAt === undefined || candidate.expiresAt > now) &&
        candidate.permissions.includes(caregiverPermission),
    );
    if (grant) {
      return { allowed: true, reason: 'ACTIVE_CAREGIVER_GRANT' };
    }
  }

  const organizationIds = new Set(context.memberships.map(({ organizationId }) => organizationId));
  const directAssignment = resource.assignments.find(
    (assignment) =>
      assignment.active &&
      assignment.userId === context.userId &&
      (assignment.organizationId === undefined || organizationIds.has(assignment.organizationId)),
  );
  if (directAssignment) {
    return {
      allowed: true,
      reason: 'DIRECT_ASSIGNMENT',
      ...(directAssignment.organizationId
        ? { organizationId: directAssignment.organizationId }
        : {}),
    };
  }

  const organizationAssignment = resource.assignments.find(
    (assignment) =>
      assignment.active &&
      assignment.organizationId !== undefined &&
      organizationIds.has(assignment.organizationId),
  );
  if (organizationAssignment?.organizationId) {
    return {
      allowed: true,
      reason: 'ORGANIZATION_ASSIGNMENT',
      organizationId: organizationAssignment.organizationId,
    };
  }

  return { allowed: false, reason: 'OUTSIDE_RESOURCE_SCOPE' };
}

function ownerDecision(context: AccessContext, action: CaseAction): AuthorizationDecision {
  const ownerPermission: Partial<Record<CaseAction, Permission>> = {
    READ_SUMMARY: 'case:read:own',
    TRANSITION: 'case:transition:own',
    SHARE: 'case:share',
    READ_DOCUMENTS: 'document:read:own',
    UPLOAD_DOCUMENTS: 'document:upload:own',
  };
  const permission = ownerPermission[action];
  return permission && hasPermission(context, permission)
    ? { allowed: true, reason: 'OWNER' }
    : { allowed: false, reason: 'MISSING_PERMISSION' };
}
