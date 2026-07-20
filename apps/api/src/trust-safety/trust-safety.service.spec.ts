import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import type { ServerEnvironment } from '@dental-trust/config/server';
import type {
  ClinicOperationsRepository,
  IncidentRecord,
  PrismaClient,
  TrustSafetyRepository,
} from '@dental-trust/database';
import { SensitiveFieldCipher } from '@dental-trust/security';

import { TrustSafetyService } from './trust-safety.service.js';

const patientId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const incidentId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const organizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e0a';
const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e0b';
const privacyRequestId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e09';

const environment = {
  FIELD_ENCRYPTION_KEY: 'unit-test-field-encryption-key-with-ample-entropy',
} as ServerEnvironment;

describe('TrustSafetyService security boundary', () => {
  it('forces safety concerns to the critical SLA and encrypts the narrative before persistence', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    let captured:
      | {
          readonly id: string;
          readonly encryptedDetails: string;
          readonly severity: string;
          readonly slaDueAt: Date;
        }
      | undefined;
    Object.defineProperty(service, 'trust', {
      value: {
        loadPatientCaseForIncident: vi.fn().mockResolvedValue({
          id: caseId,
          status: 'AFTERCARE_ACTIVE',
          treatmentPlans: [],
        }),
        createIncident: vi.fn((input) => {
          captured = input;
          return incidentRecord(input.id, input.encryptedDetails, input.severity, input.slaDueAt);
        }),
      },
    });

    const before = Date.now();
    const result = await service.createIncident(
      patientAccess(),
      {
        caseId,
        type: 'SAFETY_CONCERN',
        reportedSeverity: 'LOW',
        summary: 'Unexpected post-treatment bleeding',
        details: 'Bleeding has continued despite following the discharge instructions.',
        attachmentFileAssetIds: [],
      },
      'incident-idempotency-0001',
    );

    if (!captured) throw new Error('Repository input was not captured.');
    expect(captured?.severity).toBe('CRITICAL');
    expect(captured?.encryptedDetails).not.toContain('Bleeding has continued');
    expect(captured.slaDueAt.getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(captured.slaDueAt.getTime()).toBeLessThan(before + 60 * 60_000 + 1_000);
    expect(result.details).toContain('Bleeding has continued');
  });

  it('does not let an impersonating support actor submit an incident as the patient', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    await expect(
      service.createIncident(
        {
          ...patientAccess(),
          impersonation: {
            elevationId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04',
            actorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
            reason: 'Support ticket DT-100',
            expiresAt: new Date(Date.now() + 60_000),
            capabilities: ['INCIDENT_READ'],
          },
        },
        {
          caseId,
          type: 'OTHER',
          reportedSeverity: 'LOW',
          summary: 'A sufficiently long summary',
          details: 'A sufficiently detailed incident narrative for intake.',
          attachmentFileAssetIds: [],
        },
        'incident-idempotency-0002',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires current MFA before an incident manager can triage', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    await expect(
      service.triageIncident(
        {
          ...patientAccess(),
          roles: ['PLATFORM_ADMIN'],
          mfaVerified: false,
        },
        incidentId,
        {
          severity: 'HIGH',
          ownerUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
          toStatus: 'TRIAGED',
          expectedVersion: 1,
          patientMessage: 'A coordinator has reviewed your report.',
        },
        'incident-idempotency-0003',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('routes clinic responses and internal notes through the scoped incident event primitive', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    const current = incidentRecord(
      incidentId,
      new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY).encrypt(
        'A sufficiently detailed incident narrative for provider review.',
        `incident:${incidentId}:details`,
      ),
      'HIGH',
      new Date('2026-07-12T04:00:00.000Z'),
      clinicId,
    );
    const addClinicIncidentEvent = vi.fn().mockResolvedValue(current);
    replaceClinicOperations(service, {
      loadOperator: vi.fn().mockResolvedValue(clinicOperator()),
    });
    replaceTrust(service, {
      findClinicIncidentScoped: vi.fn().mockResolvedValue(current),
      addClinicIncidentEvent,
    });

    await service.addClinicResponse(
      clinicAccess(),
      incidentId,
      { expectedVersion: 1, message: 'The clinic has reviewed this incident.' },
      'incident-clinic-response-0001',
    );
    await service.addIncidentInternalNote(
      clinicAccess(),
      incidentId,
      { expectedVersion: 1, note: 'Assigned to the aftercare lead for same-day follow-up.' },
      'incident-internal-note-0001',
    );

    expect(addClinicIncidentEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        incidentId,
        clinicId,
        organizationId,
        expectedVersion: 1,
        kind: 'CLINIC_RESPONSE',
        message: 'The clinic has reviewed this incident.',
        actor: expect.objectContaining({ organizationId }),
        command: expect.objectContaining({ operation: 'incident.clinic-response' }),
      }),
    );
    expect(addClinicIncidentEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'INTERNAL_NOTE',
        message: 'Assigned to the aftercare lead for same-day follow-up.',
        command: expect.objectContaining({ operation: 'incident.internal-note' }),
      }),
    );
  });

  it('requires current MFA before a clinic operator can respond to an incident', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    const loadOperator = vi.fn();
    replaceClinicOperations(service, { loadOperator });

    await expect(
      service.addClinicResponse(
        { ...clinicAccess(), mfaVerified: false },
        incidentId,
        { expectedVersion: 1, message: 'The clinic has reviewed this incident.' },
        'incident-clinic-response-0002',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(loadOperator).not.toHaveBeenCalled();
  });

  it('requires an explicitly selected organization for a clinic incident mutation', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    const loadOperator = vi.fn();
    replaceClinicOperations(service, { loadOperator });

    await expect(
      service.addClinicResponse(
        clinicAccess(false),
        incidentId,
        { expectedVersion: 1, message: 'The clinic has reviewed this incident.' },
        'incident-clinic-response-0004',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(loadOperator).not.toHaveBeenCalled();
  });

  it('requires the delegated clinic incident-response permission', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    replaceClinicOperations(service, {
      loadOperator: vi.fn().mockResolvedValue({ ...clinicOperator(), permissions: ['CASE_INBOX'] }),
    });

    await expect(
      service.addIncidentInternalNote(
        clinicAccess(),
        incidentId,
        { expectedVersion: 1, note: 'Assigned to the aftercare lead for same-day follow-up.' },
        'incident-internal-note-0002',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose a cross-clinic incident to the selected clinic operator', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    const addClinicIncidentEvent = vi.fn();
    replaceClinicOperations(service, {
      loadOperator: vi.fn().mockResolvedValue(clinicOperator()),
    });
    replaceTrust(service, {
      findClinicIncidentScoped: vi.fn().mockResolvedValue(null),
      addClinicIncidentEvent,
    });

    await expect(
      service.addClinicResponse(
        clinicAccess(),
        incidentId,
        { expectedVersion: 1, message: 'The clinic has reviewed this incident.' },
        'incident-clinic-response-0003',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(addClinicIncidentEvent).not.toHaveBeenCalled();
  });

  it('scopes provider incident reads to the selected clinic and organization', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    const listIncidentsScoped = vi.fn().mockResolvedValue([]);
    replaceClinicOperations(service, {
      loadOperator: vi.fn().mockResolvedValue(clinicOperator()),
    });
    replaceTrust(service, { listIncidentsScoped });

    await service.listIncidents(clinicAccess(), { limit: 25 });

    expect(listIncidentsScoped).toHaveBeenCalledWith(
      {
        userId: clinicAccess().userId,
        organizationIds: [organizationId],
        includeAll: false,
        clinicId,
      },
      { limit: 25 },
    );
  });

  it('separates clinic-internal notes from participant updates and never returns them to patients', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    const cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
    const base = incidentRecord(
      incidentId,
      cipher.encrypt(
        'A sufficiently detailed incident narrative for provider review.',
        `incident:${incidentId}:details`,
      ),
      'HIGH',
      new Date('2026-07-12T04:00:00.000Z'),
      clinicId,
    );
    const internalMessage = 'Assigned to the aftercare lead for same-day follow-up.';
    const record = {
      ...base,
      events: [
        ...base.events,
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e0c',
          eventType: 'INTERNAL_NOTE',
          visibility: 'STAFF_INTERNAL',
          details: { message: internalMessage },
          createdAt: new Date('2026-07-12T01:00:00.000Z'),
        },
      ],
    } as IncidentRecord;
    replaceClinicOperations(service, {
      loadOperator: vi.fn().mockResolvedValue(clinicOperator()),
    });
    replaceTrust(service, { listIncidentsScoped: vi.fn().mockResolvedValue([record]) });

    const providerResult = await service.listIncidents(clinicAccess(), { limit: 25 });
    expect(providerResult.data[0]?.updates.map((update) => update.message)).not.toContain(
      internalMessage,
    );
    const providerIncident = providerResult.data[0];
    if (!providerIncident || !('internalNotes' in providerIncident)) {
      throw new Error('Expected clinic incident notes in the provider response.');
    }
    expect(providerIncident.internalNotes.map((note) => note.message)).toContain(internalMessage);

    const patientResult = await service.listIncidents(patientAccess(), { limit: 25 });
    expect(patientResult.data[0]).not.toHaveProperty('internalNotes');
    expect(patientResult.data[0]?.updates.map((update) => update.message)).not.toContain(
      internalMessage,
    );
  });

  it('requires direct patient context for privacy request intake', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    await expect(
      service.createPrivacyRequest(
        { ...patientAccess(), roles: ['SUPPORT_AGENT'], mfaVerified: true },
        { type: 'EXPORT', reason: 'I need a copy of my records for continuity of care.' },
        'privacy-idempotency-0001',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes an explicit reason and encrypted patient message into privacy administration', async () => {
    const service = new TrustSafetyService({} as PrismaClient, environment);
    const cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
    const transitionPrivacyRequest = vi.fn((input) => ({
      id: privacyRequestId,
      requesterUserId: patientId,
      handledByUserId: input.handlerUserId,
      type: 'EXPORT',
      status: input.toStatus,
      encryptedReason: cipher.encrypt(
        'I need a portable copy of my records.',
        `privacy-request:${privacyRequestId}:reason`,
      ),
      encryptedPatientMessage: input.encryptedPatientMessage,
      dueAt: new Date('2026-08-11T00:00:00.000Z'),
      version: 3,
      completedAt: null,
      createdAt: new Date('2026-07-12T00:00:00.000Z'),
      updatedAt: new Date('2026-07-12T00:00:00.000Z'),
      requester: { privacyLegalHolds: [] },
      execution: null,
    }));
    Object.defineProperty(service, 'trust', {
      value: {
        findPrivacyRequestScoped: vi.fn().mockResolvedValue({
          id: privacyRequestId,
          status: 'IN_REVIEW',
          version: 2,
        }),
        transitionPrivacyRequest,
      },
    });
    await service.processPrivacyRequest(
      { ...patientAccess(), roles: ['PLATFORM_ADMIN'], mfaVerified: true },
      privacyRequestId,
      {
        toStatus: 'APPROVED',
        expectedVersion: 2,
        reason: 'Identity verification completed under DT-PRIV-9.',
        patientMessage: 'Your request was approved for secure processing.',
        confirmation: 'PROCESS PRIVACY REQUEST',
        verification: {
          method: 'ACCOUNT_MFA',
          reference: 'session-mfa-verification-DT-PRIV-9',
          verifiedAt: '2026-07-12T08:00:00.000Z',
        },
      },
      'privacy-idempotency-0002',
    );
    expect(transitionPrivacyRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Identity verification completed under DT-PRIV-9.',
        encryptedPatientMessage: expect.not.stringContaining(
          'Your request was approved for secure processing.',
        ),
      }),
    );
  });
});

function patientAccess(): AccessContext {
  return {
    userId: patientId,
    sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e07',
    roles: ['PATIENT'],
    memberships: [],
    mfaVerified: false,
    requestId: 'trust-safety-test',
  };
}

function clinicAccess(selected = true): AccessContext {
  const access: AccessContext = {
    userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e0c',
    sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e0d',
    roles: [],
    memberships: [{ organizationId, role: 'CLINIC_STAFF' }],
    mfaVerified: true,
    requestId: 'trust-safety-clinic-test',
  };
  return selected ? { ...access, selectedOrganizationId: organizationId } : access;
}

function clinicOperator() {
  return {
    clinicId,
    organizationId,
    role: 'CLINIC_STAFF' as const,
    permissions: ['INCIDENT_RESPONSE'] as const,
    locationIds: [],
  };
}

function replaceTrust(
  service: TrustSafetyService,
  trust: Partial<Record<keyof TrustSafetyRepository, unknown>>,
): void {
  Object.defineProperty(service, 'trust', { value: trust });
}

function replaceClinicOperations(
  service: TrustSafetyService,
  operations: Partial<Record<keyof ClinicOperationsRepository, unknown>>,
): void {
  Object.defineProperty(service, 'clinicOperations', { value: operations });
}

function incidentRecord(
  id: string,
  encryptedDetails: string,
  severity: string,
  slaDueAt: Date,
  incidentClinicId: string | null = null,
): IncidentRecord {
  const now = new Date('2026-07-12T00:00:00.000Z');
  return {
    id,
    caseId,
    clinicId: incidentClinicId,
    createdByUserId: patientId,
    ownerUserId: null,
    type: 'SAFETY_CONCERN',
    severity,
    status: 'OPEN',
    summary: 'Unexpected post-treatment bleeding',
    encryptedDetails,
    slaDueAt,
    version: 1,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    events: [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e08',
        eventType: 'INCIDENT_SUBMITTED',
        visibility: 'PARTICIPANTS',
        details: { message: 'Incident submitted for review.' },
        createdAt: now,
      },
    ],
    warrantyClaim: null,
  } as IncidentRecord;
}
