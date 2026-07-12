import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AccessContext, CaseAccessResource } from '@dental-trust/auth';

import {
  assertAppointmentCreateAccess,
  assertAppointmentReadAccess,
  assertInternalNoteAccess,
  assertMessageParticipantAccess,
} from './collaboration.policy.js';

const patientId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const caregiverId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const staffId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const organizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';

const resource: CaseAccessResource = {
  caseId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
  patientUserId: patientId,
  caregiverGrants: [
    {
      caregiverUserId: caregiverId,
      permissions: ['VIEW_APPOINTMENTS', 'PARTICIPATE_IN_MESSAGES'],
    },
  ],
  assignments: [{ organizationId, active: true }],
};

describe('scheduling and messaging resource policy', () => {
  it('allows only a current caregiver grant for appointments and messages', () => {
    const caregiver = access(caregiverId, ['CAREGIVER']);
    expect(() => assertAppointmentReadAccess(caregiver, resource)).not.toThrow();
    expect(assertMessageParticipantAccess(caregiver, resource)).toBeUndefined();

    const revoked: CaseAccessResource = {
      ...resource,
      caregiverGrants: resource.caregiverGrants.map((grant) => ({
        ...grant,
        revokedAt: new Date('2026-07-12T00:00:00.000Z'),
      })),
    };
    expect(() => assertAppointmentReadAccess(caregiver, revoked)).toThrow(ForbiddenException);
    expect(() => assertMessageParticipantAccess(caregiver, revoked)).toThrow(ForbiddenException);
  });

  it('requires current MFA, the selected tenant, and an active case assignment for clinic writes', () => {
    const staff = access(staffId, [], true, organizationId);
    staff.memberships = [{ organizationId, role: 'CLINIC_STAFF' }];
    expect(assertAppointmentCreateAccess(staff, resource)).toBe(organizationId);

    const staleMfa = { ...staff, mfaVerified: false };
    expect(() => assertAppointmentCreateAccess(staleMfa, resource)).toThrow(ForbiddenException);
    expect(() => assertAppointmentCreateAccess(staff, { ...resource, assignments: [] })).toThrow(
      ForbiddenException,
    );
  });

  it('keeps internal notes inaccessible to patients, caregivers, and unassigned platform admins', () => {
    expect(() => assertInternalNoteAccess(access(patientId, ['PATIENT']), resource)).toThrow(
      ForbiddenException,
    );
    expect(() => assertInternalNoteAccess(access(caregiverId, ['CAREGIVER']), resource)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertInternalNoteAccess(access('platform-user', ['PLATFORM_ADMIN']), resource),
    ).toThrow(ForbiddenException);
  });
});

function access(
  userId: string,
  roles: AccessContext['roles'],
  mfaVerified = true,
  selectedOrganizationId?: string,
): MutableAccessContext {
  return {
    userId,
    sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
    roles,
    memberships: [],
    mfaVerified,
    requestId: 'collaboration-policy-test',
    ...(selectedOrganizationId ? { selectedOrganizationId } : {}),
  };
}

type MutableAccessContext = Omit<AccessContext, 'memberships'> & {
  memberships: AccessContext['memberships'];
};
