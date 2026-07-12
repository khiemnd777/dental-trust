import { ForbiddenException } from '@nestjs/common';

import {
  hasPermission,
  requiresMfa,
  type AccessContext,
  type CaseAccessResource,
} from '@dental-trust/auth';
import type { TreatmentPlanVisibility } from '@dental-trust/database';
import type { CaregiverPermission, Permission } from '@dental-trust/domain';

export function assertPatientOwnerPermission(
  access: AccessContext,
  resource: CaseAccessResource,
  permission: Extract<Permission, 'case:share' | 'case:read:own' | 'treatment-plan:accept'>,
): void {
  if (
    requiresMfa(access) ||
    resource.patientUserId !== access.userId ||
    !hasPermission(access, permission)
  ) {
    throw new ForbiddenException();
  }
}

export function assertTreatmentPlanAuthorAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): string {
  const organizationId = access.selectedOrganizationId;
  if (
    requiresMfa(access) ||
    !hasPermission(access, 'treatment-plan:author') ||
    !organizationId ||
    !resource.assignments.some(
      (assignment) => assignment.active && assignment.organizationId === organizationId,
    )
  ) {
    throw new ForbiddenException();
  }
  return organizationId;
}

export function treatmentPlanVisibilityFor(
  access: AccessContext,
  resource: CaseAccessResource,
): TreatmentPlanVisibility {
  if (requiresMfa(access)) throw new ForbiddenException();
  if (resource.patientUserId === access.userId && hasPermission(access, 'case:read:own')) {
    return { includeDrafts: false, patientUserId: access.userId };
  }
  if (
    currentCaregiverGrant(resource, access.userId, 'VIEW_TREATMENT_PLANS') &&
    hasPermission(access, 'case:read:shared')
  ) {
    return { includeDrafts: false };
  }
  const organizationId = access.selectedOrganizationId;
  if (
    organizationId &&
    hasPermission(access, 'case:read:assigned') &&
    resource.assignments.some(
      (assignment) => assignment.active && assignment.organizationId === organizationId,
    )
  ) {
    return {
      includeDrafts: hasPermission(access, 'treatment-plan:author'),
      clinicOrganizationId: organizationId,
    };
  }
  if (hasPermission(access, 'case:read:any')) return { includeDrafts: true };
  throw new ForbiddenException();
}

export function assertAftercareReadAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): void {
  if (requiresMfa(access)) throw new ForbiddenException();
  if (resource.patientUserId === access.userId && hasPermission(access, 'case:read:own')) return;
  if (hasPermission(access, 'case:read:any')) return;
  const organizations = new Set(access.memberships.map(({ organizationId }) => organizationId));
  if (
    hasPermission(access, 'case:read:assigned') &&
    resource.assignments.some(
      (assignment) =>
        assignment.active &&
        (assignment.userId === access.userId ||
          (assignment.organizationId !== undefined &&
            organizations.has(assignment.organizationId))),
    )
  ) {
    return;
  }
  throw new ForbiddenException();
}

function currentCaregiverGrant(
  resource: CaseAccessResource,
  userId: string,
  permission: CaregiverPermission,
  now = new Date(),
) {
  return resource.caregiverGrants.find(
    (grant) =>
      grant.caregiverUserId === userId &&
      !grant.revokedAt &&
      (!grant.expiresAt || grant.expiresAt > now) &&
      grant.permissions.includes(permission),
  );
}
