import type { JourneySummaryRecord, PrismaClient } from '@dental-trust/database';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';

import { CasesService } from './cases.service.js';

const platformAccess: AccessContext = {
  userId: 'admin-user',
  sessionId: 'session-id',
  roles: ['PLATFORM_ADMIN'],
  memberships: [],
  mfaVerified: false,
  requestId: 'request-id',
};

describe('CasesService authorization boundary', () => {
  it('rejects an un-MFA platform administrator before enumerating cases', async () => {
    const service = new CasesService({} as PrismaClient);
    await expect(service.list(platformAccess, { limit: 25 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('conceals an out-of-scope case before loading unscoped policy data', async () => {
    const service = new CasesService({} as PrismaClient);
    const loadAccessResource = vi.fn();
    Object.defineProperty(service, 'cases', {
      value: { findScoped: vi.fn().mockResolvedValue(null), loadAccessResource },
    });
    const patient: AccessContext = {
      ...platformAccess,
      userId: 'patient-user',
      roles: ['PATIENT'],
    };
    await expect(
      service.get(patient, '00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(loadAccessResource).not.toHaveBeenCalled();
  });

  it('projects a patient Today card from the shared case state', async () => {
    const service = new CasesService({} as PrismaClient);
    const patient: AccessContext = {
      ...platformAccess,
      userId: 'patient-user',
      roles: ['PATIENT'],
    };
    const record = {
      id: '00000000-0000-4000-8000-000000000001',
      caseNumber: 'DT-001',
      title: 'Implant care',
      status: 'CONSULTATION_SCHEDULED',
      updatedAt: new Date('2026-07-12T08:00:00.000Z'),
      patientProfile: { userId: 'patient-user' },
      assignments: [
        {
          kind: 'CLINIC',
          assignedUser: null,
          organization: { name: 'Minh An Dental Center' },
        },
      ],
      appointments: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          kind: 'CONSULTATION',
          startsAt: new Date('2026-07-14T08:00:00.000Z'),
          timezone: 'Asia/Ho_Chi_Minh',
          status: 'CONFIRMED',
        },
      ],
      treatmentMilestones: [],
      incidents: [],
      statusHistory: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          toStatus: 'CONSULTATION_SCHEDULED',
          createdAt: new Date('2026-07-12T08:00:00.000Z'),
        },
      ],
    } as unknown as JourneySummaryRecord;
    Object.defineProperty(service, 'cases', {
      value: { listJourneySummaries: vi.fn().mockResolvedValue([record]) },
    });

    const summaries = await service.today(patient, { limit: 25 });

    expect(summaries[0]).toMatchObject({
      perspective: 'PATIENT',
      stage: 'CONSULTATION',
      primaryAction: { code: 'VIEW_APPOINTMENT' },
      owner: { type: 'CLINIC', displayName: 'Minh An Dental Center' },
    });
  });

  it('keeps closed journeys behind actionable care on Today', async () => {
    const service = new CasesService({} as PrismaClient);
    const patient: AccessContext = {
      ...platformAccess,
      userId: 'patient-user',
      roles: ['PATIENT'],
    };
    const base = {
      id: '00000000-0000-4000-8000-000000000001',
      caseNumber: 'DT-001',
      title: 'Care case',
      updatedAt: new Date('2026-07-12T08:00:00.000Z'),
      patientProfile: { userId: 'patient-user' },
      assignments: [],
      appointments: [],
      treatmentMilestones: [],
      incidents: [],
      statusHistory: [],
    };
    Object.defineProperty(service, 'cases', {
      value: {
        listJourneySummaries: vi.fn().mockResolvedValue([
          { ...base, status: 'CLOSED' },
          { ...base, id: '00000000-0000-4000-8000-000000000002', status: 'DRAFT' },
        ] as unknown as JourneySummaryRecord[]),
      },
    });

    const summaries = await service.today(patient, { limit: 25 });

    expect(summaries.map(({ stage }) => stage)).toEqual(['INTAKE', 'CLOSED']);
  });
});
