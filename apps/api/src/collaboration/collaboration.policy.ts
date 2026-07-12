import { ForbiddenException } from '@nestjs/common';

import {
  hasPermission,
  requiresMfa,
  type AccessContext,
  type CaseAccessResource,
} from '@dental-trust/auth';
import type { CaregiverPermission } from '@dental-trust/domain';

const clinicRoles = new Set(['DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN']);
const internalStaffRoles = new Set(['DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN', 'CONCIERGE_AGENT']);

export function assertAppointmentReadAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): void {
  if (isPatientOwner(access, resource)) return;
  if (hasCaregiverGrant(access, resource, 'VIEW_APPOINTMENTS')) return;
  if (assignedSelectedOrganization(access, resource)) return;
  throw new ForbiddenException();
}

export function assertAppointmentCreateAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): string {
  const organizationId = assignedSelectedOrganization(access, resource, clinicRoles);
  if (!organizationId) throw new ForbiddenException();
  return organizationId;
}

export function assertAppointmentMutationAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): string | undefined {
  if (isPatientOwner(access, resource)) return undefined;
  const organizationId = assignedSelectedOrganization(access, resource, clinicRoles);
  if (!organizationId) throw new ForbiddenException();
  return organizationId;
}

export function assertAppointmentAttendanceAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): string {
  return assertAppointmentCreateAccess(access, resource);
}

export function assertMessageParticipantAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): string | undefined {
  if (isPatientOwner(access, resource)) return undefined;
  if (hasCaregiverGrant(access, resource, 'PARTICIPATE_IN_MESSAGES')) return undefined;
  const organizationId = assignedSelectedOrganization(access, resource);
  if (organizationId) return organizationId;
  throw new ForbiddenException();
}

export function assertInternalNoteAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): string {
  const organizationId = assignedSelectedOrganization(access, resource, internalStaffRoles);
  if (!organizationId) throw new ForbiddenException();
  return organizationId;
}

function isPatientOwner(access: AccessContext, resource: CaseAccessResource): boolean {
  return (
    !requiresMfa(access) &&
    resource.patientUserId === access.userId &&
    hasPermission(access, 'case:read:own')
  );
}

function hasCaregiverGrant(
  access: AccessContext,
  resource: CaseAccessResource,
  permission: CaregiverPermission,
  now = new Date(),
): boolean {
  return (
    !requiresMfa(access) &&
    hasPermission(access, 'case:read:shared') &&
    resource.caregiverGrants.some(
      (grant) =>
        grant.caregiverUserId === access.userId &&
        !grant.revokedAt &&
        (!grant.expiresAt || grant.expiresAt > now) &&
        grant.permissions.includes(permission),
    )
  );
}

function assignedSelectedOrganization(
  access: AccessContext,
  resource: CaseAccessResource,
  acceptedRoles?: ReadonlySet<string>,
): string | undefined {
  if (requiresMfa(access) || !hasPermission(access, 'case:read:assigned')) return undefined;
  const organizationId = access.selectedOrganizationId;
  if (!organizationId) return undefined;
  const membership = access.memberships.find(
    (candidate) =>
      candidate.organizationId === organizationId &&
      (!acceptedRoles || acceptedRoles.has(candidate.role)),
  );
  if (!membership) return undefined;
  const assigned = resource.assignments.some(
    (assignment) => assignment.active && assignment.organizationId === organizationId,
  );
  return assigned ? organizationId : undefined;
}
