import { describe, expect, it, vi } from 'vitest';

import {
  TrustResourceNotFoundError,
  TrustSafetyRepository,
  type PrismaClient,
} from '../src/index.js';

const incidentId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const organizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';
const userId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05';

describe('TrustSafetyRepository clinic incident events', () => {
  it.each([
    ['CLINIC_RESPONSE', 'PARTICIPANTS', 'incident.clinic-response-added'],
    ['INTERNAL_NOTE', 'STAFF_INTERNAL', 'incident.internal-note-added'],
  ] as const)(
    'persists %s with CAS, clinic scope, audience separation, audit, and outbox',
    async (kind, visibility, action) => {
      const transaction = transactionMock();
      const database = databaseMock(transaction);
      const repository = new TrustSafetyRepository(database as unknown as PrismaClient);

      await repository.addClinicIncidentEvent({
        incidentId,
        clinicId,
        organizationId,
        expectedVersion: 3,
        kind,
        message: 'Restricted incident response body',
        actor: {
          userId,
          sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
          organizationId,
        },
        requestId: 'trust-repository-test',
        command: {
          userId,
          key: `incident-${kind.toLowerCase()}-0001`,
          operation: `incident.${kind.toLowerCase()}`,
          requestHash: 'a'.repeat(64),
        },
      });

      expect(transaction.incident.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: incidentId,
            clinicId,
            clinic: { organizationId, deletedAt: null },
            dentalCase: {
              assignments: { some: { organizationId, endedAt: null } },
            },
          }),
        }),
      );
      expect(transaction.incident.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: incidentId, clinicId, version: 3 }),
        data: { version: { increment: 1 } },
      });
      expect(transaction.incidentEvent.create).toHaveBeenCalledWith({
        data: {
          incidentId,
          actorUserId: userId,
          eventType: kind,
          visibility,
          details: { message: 'Restricted incident response body' },
        },
      });
      expect(transaction.idempotencyRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            operation: `incident.${kind.toLowerCase()}`,
          }),
        }),
      );
      expect(transaction.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action,
            organizationId,
            afterMetadata: { version: 4, audience: visibility },
          }),
        }),
      );
      expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: action,
            payload: { incidentId, caseId, clinicId, audience: visibility },
          }),
        }),
      );
      const sideEffects = JSON.stringify([
        transaction.auditLog.create.mock.calls,
        transaction.outboxEvent.create.mock.calls,
        transaction.idempotencyRecord.update.mock.calls,
      ]);
      expect(sideEffects).not.toContain('Restricted incident response body');
    },
  );

  it('rejects an incident outside the selected clinic before attempting a write', async () => {
    const transaction = transactionMock({ scopedIncident: null });
    const database = databaseMock(transaction);
    const repository = new TrustSafetyRepository(database as unknown as PrismaClient);

    await expect(
      repository.addClinicIncidentEvent({
        incidentId,
        clinicId,
        organizationId,
        expectedVersion: 3,
        kind: 'CLINIC_RESPONSE',
        message: 'Restricted incident response body',
        actor: {
          userId,
          sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
          organizationId,
        },
        requestId: 'trust-repository-test',
        command: {
          userId,
          key: 'incident-clinic-response-0002',
          operation: 'incident.clinic-response',
          requestHash: 'b'.repeat(64),
        },
      }),
    ).rejects.toBeInstanceOf(TrustResourceNotFoundError);
    expect(transaction.incident.updateMany).not.toHaveBeenCalled();
    expect(transaction.incidentEvent.create).not.toHaveBeenCalled();
  });
});

function transactionMock(options: { readonly scopedIncident?: object | null } = {}) {
  const now = new Date('2026-07-12T00:00:00.000Z');
  const incident = {
    id: incidentId,
    caseId,
    clinicId,
    createdByUserId: userId,
    ownerUserId: null,
    type: 'SERVICE_COMPLAINT',
    severity: 'MEDIUM',
    status: 'OPEN',
    summary: 'A sufficiently long incident summary',
    encryptedDetails: 'v1.encrypted-incident-details',
    slaDueAt: new Date('2026-07-13T00:00:00.000Z'),
    version: 4,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    events: [],
    warrantyClaim: null,
  };
  return {
    idempotencyRecord: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    incident: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options.scopedIncident === undefined
            ? { id: incidentId, caseId, status: 'OPEN', version: 3 }
            : options.scopedIncident,
        ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(incident),
    },
    incidentEvent: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

function databaseMock(transaction: ReturnType<typeof transactionMock>) {
  return {
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    incident: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
}
