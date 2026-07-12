import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AccessContext, CaseAccessResource } from '@dental-trust/auth';

import {
  assertAftercareReadAccess,
  assertPatientOwnerPermission,
  assertTreatmentPlanAuthorAccess,
  treatmentPlanVisibilityFor,
} from './clinical.policy.js';

const patientId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const caregiverId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const dentistId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const organizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';

const resource: CaseAccessResource = {
  caseId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
  patientUserId: patientId,
  caregiverGrants: [
    {
      caregiverUserId: caregiverId,
      permissions: ['VIEW_CASE_SUMMARY', 'VIEW_TREATMENT_PLANS'],
    },
  ],
  assignments: [{ organizationId, active: true }],
};

describe('clinical resource policy', () => {
  it('exposes only published plan snapshots to a patient owner', () => {
    expect(treatmentPlanVisibilityFor(access(patientId, ['PATIENT']), resource)).toEqual({
      includeDrafts: false,
      patientUserId: patientId,
    });
  });

  it('loads a current caregiver grant for each treatment-plan authorization', () => {
    expect(treatmentPlanVisibilityFor(access(caregiverId, ['CAREGIVER']), resource)).toEqual({
      includeDrafts: false,
    });
    const revoked: CaseAccessResource = {
      ...resource,
      caregiverGrants: resource.caregiverGrants.map((grant) => ({
        ...grant,
        revokedAt: new Date('2026-07-12T00:00:00.000Z'),
      })),
    };
    expect(() => treatmentPlanVisibilityFor(access(caregiverId, ['CAREGIVER']), revoked)).toThrow(
      ForbiddenException,
    );
  });

  it('requires MFA and an active selected-tenant assignment for plan authors', () => {
    const verified = access(dentistId, [], true, organizationId);
    verified.memberships = [{ organizationId, role: 'DENTIST' }];
    expect(assertTreatmentPlanAuthorAccess(verified, resource)).toBe(organizationId);

    const withoutMfa = access(dentistId, [], false, organizationId);
    withoutMfa.memberships = [{ organizationId, role: 'DENTIST' }];
    expect(() => assertTreatmentPlanAuthorAccess(withoutMfa, resource)).toThrow(ForbiddenException);
    expect(() =>
      assertTreatmentPlanAuthorAccess(verified, { ...resource, assignments: [] }),
    ).toThrow(ForbiddenException);
  });

  it('limits caregiver grant management and acceptance to the patient owner', () => {
    expect(() =>
      assertPatientOwnerPermission(access(patientId, ['PATIENT']), resource, 'case:share'),
    ).not.toThrow();
    expect(() =>
      assertPatientOwnerPermission(access(caregiverId, ['CAREGIVER']), resource, 'case:share'),
    ).toThrow(ForbiddenException);
  });

  it('allows assigned clinical teams to read aftercare only with current MFA', () => {
    const verified = access(dentistId, [], true, organizationId);
    verified.memberships = [{ organizationId, role: 'DENTIST' }];
    expect(() => assertAftercareReadAccess(verified, resource)).not.toThrow();

    const withoutMfa = access(dentistId, [], false, organizationId);
    withoutMfa.memberships = [{ organizationId, role: 'DENTIST' }];
    expect(() => assertAftercareReadAccess(withoutMfa, resource)).toThrow(ForbiddenException);
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
    requestId: 'clinical-policy-test',
    ...(selectedOrganizationId ? { selectedOrganizationId } : {}),
  };
}

type MutableAccessContext = Omit<AccessContext, 'memberships'> & {
  memberships: AccessContext['memberships'];
};
