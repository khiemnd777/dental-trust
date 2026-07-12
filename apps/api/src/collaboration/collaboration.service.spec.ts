import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext, CaseAccessResource } from '@dental-trust/auth';
import type { ServerEnvironment } from '@dental-trust/config/server';
import type { PrismaClient } from '@dental-trust/database';

import type { MeetingProvider } from '../infrastructure/providers/meeting.provider.js';
import { CollaborationService } from './collaboration.service.js';

const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const patientId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const dentistId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';
const organizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05';
const clinicLocationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e10';

const resource: CaseAccessResource = {
  caseId,
  patientUserId: patientId,
  caregiverGrants: [],
  assignments: [{ organizationId, active: true }],
};

const environment = {
  FIELD_ENCRYPTION_KEY: 'unit-test-field-encryption-key-with-ample-entropy',
} as ServerEnvironment;

describe('CollaborationService security boundary', () => {
  it('encrypts thread subjects and message bodies before repository persistence', async () => {
    const service = new CollaborationService({} as PrismaClient, developmentMeeting(), environment);
    let captured:
      | {
          readonly encryptedSubject: string;
          readonly encryptedBody: string;
          readonly threadId: string;
          readonly messageId: string;
        }
      | undefined;
    Object.defineProperty(service, 'workflows', {
      value: {
        loadCaseAccessResource: vi.fn().mockResolvedValue(resource),
        createThread: vi.fn(
          (
            _caseId: string,
            input: {
              encryptedSubject: string;
              encryptedBody: string;
              threadId: string;
              messageId: string;
            },
          ) => {
            captured = input;
            return {
              id: input.messageId,
              threadId: input.threadId,
              authorUserId: patientId,
              encryptedBody: input.encryptedBody,
              readByCurrentUser: true,
              attachments: [],
              createdAt: new Date('2026-07-12T00:00:00.000Z'),
              editedAt: null,
            };
          },
        ),
      },
    });

    const result = await service.createThread(
      patientAccess(),
      caseId,
      {
        threadSubject: 'Treatment plan question',
        messageBody: 'Please clarify the expected visits.',
        fileAssetIds: [],
      },
      'message-thread-idempotency-0001',
    );

    expect(captured?.encryptedSubject).not.toContain('Treatment plan question');
    expect(captured?.encryptedBody).not.toContain('Please clarify');
    expect(result.messageBody).toBe('Please clarify the expected visits.');
  });

  it('fails closed without persisting when meeting provisioning rejects the link', async () => {
    const createAppointment = vi.fn();
    const provider: MeetingProvider = {
      name: 'manual',
      resolveJoinLink: vi.fn().mockRejectedValue(new Error('unsafe URL')),
    };
    const service = new CollaborationService({} as PrismaClient, provider, environment);
    Object.defineProperty(service, 'workflows', {
      value: {
        loadCaseAccessResource: vi.fn().mockResolvedValue(resource),
        createAppointment,
      },
    });

    await expect(
      service.createAppointment(
        clinicAccess(),
        caseId,
        {
          clinicId,
          dentistId,
          kind: 'CONSULTATION',
          startsAt: '2026-12-01T02:00:00.000Z',
          endsAt: '2026-12-01T03:00:00.000Z',
          timezone: 'Asia/Ho_Chi_Minh',
          meetingJoinUrl: 'https://unapproved.example/room',
        },
        'appointment-idempotency-0001',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it('persists a clinical visit without provisioning or storing a meeting link', async () => {
    const provider = developmentMeeting();
    const service = new CollaborationService({} as PrismaClient, provider, environment);
    const createAppointment = vi.fn(
      (_caseId: string, input: { id: string; meetingProvider: string | null }) => ({
        id: input.id,
        caseId,
        clinicId,
        clinicLocationId,
        dentistId,
        kind: 'CLINICAL_VISIT' as const,
        startsAt: new Date('2026-12-01T02:00:00.000Z'),
        endsAt: new Date('2026-12-01T03:00:00.000Z'),
        timezone: 'Asia/Ho_Chi_Minh',
        status: 'TENTATIVE' as const,
        version: 1,
        meetingProvider: input.meetingProvider,
        encryptedJoinUrl: null,
        encryptedCancellationReason: null,
        cancelledAt: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        updatedAt: new Date('2026-07-12T00:00:00.000Z'),
      }),
    );
    Object.defineProperty(service, 'workflows', {
      value: {
        loadCaseAccessResource: vi.fn().mockResolvedValue(resource),
        createAppointment,
      },
    });

    const result = await service.createAppointment(
      clinicAccess(),
      caseId,
      {
        clinicId,
        clinicLocationId,
        dentistId,
        kind: 'CLINICAL_VISIT',
        startsAt: '2026-12-01T02:00:00.000Z',
        endsAt: '2026-12-01T03:00:00.000Z',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      'appointment-idempotency-0002',
    );

    expect(provider.resolveJoinLink).not.toHaveBeenCalled();
    expect(createAppointment).toHaveBeenCalledWith(
      caseId,
      expect.objectContaining({
        clinicLocationId,
        meetingProvider: null,
        encryptedJoinUrl: null,
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(result.meetingJoinUrl).toBeNull();
  });

  it('scopes clinic appointment and internal-note reads to the selected organization', async () => {
    const service = new CollaborationService({} as PrismaClient, developmentMeeting(), environment);
    const listAppointments = vi.fn().mockResolvedValue([]);
    const listInternalNotes = vi.fn().mockResolvedValue([]);
    Object.defineProperty(service, 'workflows', {
      value: {
        loadCaseAccessResource: vi.fn().mockResolvedValue(resource),
        loadSchedulingContext: vi.fn().mockResolvedValue(null),
        listAppointments,
        listInternalNotes,
      },
    });

    await service.listAppointments(clinicAccess(), caseId);
    await service.listInternalNotes(clinicAccess(), caseId, '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e09');

    expect(listAppointments).toHaveBeenCalledWith(caseId, organizationId);
    expect(listInternalNotes).toHaveBeenCalledWith(
      caseId,
      '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e09',
      organizationId,
    );
  });
});

function developmentMeeting(): MeetingProvider {
  return {
    name: 'development',
    resolveJoinLink: vi.fn().mockResolvedValue({
      provider: 'development',
      joinUrl: 'http://localhost:3000/dev-meetings/example',
    }),
  };
}

function patientAccess(): AccessContext {
  return {
    userId: patientId,
    sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
    roles: ['PATIENT'],
    memberships: [],
    mfaVerified: false,
    requestId: 'collaboration-service-test',
  };
}

function clinicAccess(): AccessContext {
  return {
    userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e07',
    sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e08',
    roles: [],
    memberships: [{ organizationId, role: 'CLINIC_STAFF' }],
    selectedOrganizationId: organizationId,
    mfaVerified: true,
    requestId: 'collaboration-service-test',
  };
}
