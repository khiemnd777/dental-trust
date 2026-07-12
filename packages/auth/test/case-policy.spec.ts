import { describe, expect, it } from 'vitest';

import type { AccessContext, CaseAccessResource } from '../src/index.js';
import { authorizeCaseAction } from '../src/index.js';

const baseContext: AccessContext = {
  userId: 'user-patient',
  sessionId: 'session-1',
  roles: ['PATIENT'],
  memberships: [],
  mfaVerified: false,
  requestId: 'request-1',
};

const resource: CaseAccessResource = {
  caseId: 'case-1',
  patientUserId: 'user-patient',
  caregiverGrants: [],
  assignments: [],
};

describe('case resource policy', () => {
  it('allows an owner but rejects another patient', () => {
    expect(authorizeCaseAction(baseContext, resource, 'READ_SUMMARY')).toEqual({
      allowed: true,
      reason: 'OWNER',
    });

    expect(
      authorizeCaseAction({ ...baseContext, userId: 'other-patient' }, resource, 'READ_SUMMARY'),
    ).toEqual({ allowed: false, reason: 'OUTSIDE_RESOURCE_SCOPE' });
  });

  it('enforces granular, revocable caregiver grants', () => {
    const caregiver: AccessContext = {
      ...baseContext,
      userId: 'caregiver-1',
      roles: ['CAREGIVER'],
    };
    const shared: CaseAccessResource = {
      ...resource,
      caregiverGrants: [{ caregiverUserId: 'caregiver-1', permissions: ['VIEW_CASE_SUMMARY'] }],
    };

    expect(authorizeCaseAction(caregiver, shared, 'READ_SUMMARY').allowed).toBe(true);
    expect(authorizeCaseAction(caregiver, shared, 'READ_DOCUMENTS').allowed).toBe(false);
    expect(
      authorizeCaseAction(
        caregiver,
        {
          ...shared,
          caregiverGrants: [
            {
              caregiverUserId: 'caregiver-1',
              permissions: ['VIEW_CASE_SUMMARY'],
              revokedAt: new Date(),
            },
          ],
        },
        'READ_SUMMARY',
      ).allowed,
    ).toBe(false);
  });

  it('requires both organization assignment and active membership', () => {
    const staff: AccessContext = {
      ...baseContext,
      userId: 'staff-1',
      roles: [],
      memberships: [{ organizationId: 'clinic-a', role: 'CLINIC_STAFF' }],
      mfaVerified: true,
    };
    const assigned: CaseAccessResource = {
      ...resource,
      assignments: [{ organizationId: 'clinic-b', active: true }],
    };

    expect(authorizeCaseAction(staff, assigned, 'READ_SUMMARY').allowed).toBe(false);
    expect(
      authorizeCaseAction(
        staff,
        {
          ...assigned,
          assignments: [{ organizationId: 'clinic-a', active: true }],
        },
        'READ_SUMMARY',
      ).allowed,
    ).toBe(true);
  });

  it('rejects an organization-bound direct assignment after membership suspension', () => {
    const staffWithoutMembership: AccessContext = {
      ...baseContext,
      userId: 'staff-1',
      roles: ['CLINIC_STAFF'],
      memberships: [],
    };
    expect(
      authorizeCaseAction(
        staffWithoutMembership,
        {
          ...resource,
          assignments: [{ userId: 'staff-1', organizationId: 'clinic-a', active: true }],
        },
        'READ_SUMMARY',
      ).allowed,
    ).toBe(false);
  });

  it('requires MFA for privileged roles and rejects expired impersonation', () => {
    const admin: AccessContext = {
      ...baseContext,
      userId: 'admin-1',
      roles: ['PLATFORM_ADMIN'],
    };
    expect(authorizeCaseAction(admin, resource, 'READ_SUMMARY').reason).toBe('MFA_REQUIRED');

    const impersonating: AccessContext = {
      ...admin,
      mfaVerified: true,
      impersonation: {
        elevationId: 'elevation-1',
        actorUserId: 'admin-1',
        reason: 'Support request DT-123',
        expiresAt: new Date('2024-01-01T00:00:00Z'),
        capabilities: ['CASE_READ'],
      },
    };
    expect(
      authorizeCaseAction(impersonating, resource, 'READ_SUMMARY', new Date('2025-01-01T00:00:00Z'))
        .reason,
    ).toBe('IMPERSONATION_EXPIRED');
  });

  it('limits an active impersonation to the recorded elevation capability', () => {
    const impersonation = {
      elevationId: 'elevation-1',
      actorUserId: 'support-1',
      reason: 'Support request DT-124',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      capabilities: ['INCIDENT_READ'] as const,
    };
    const impersonating: AccessContext = {
      ...baseContext,
      impersonation,
    };

    expect(
      authorizeCaseAction(
        impersonating,
        resource,
        'READ_SUMMARY',
        new Date('2026-01-01T00:00:00Z'),
      ),
    ).toEqual({ allowed: false, reason: 'ELEVATION_SCOPE_DENIED' });
    expect(
      authorizeCaseAction(
        {
          ...impersonating,
          impersonation: { ...impersonation, capabilities: ['CASE_READ'] },
        },
        resource,
        'READ_SUMMARY',
        new Date('2026-01-01T00:00:00Z'),
      ).allowed,
    ).toBe(true);
  });
});
