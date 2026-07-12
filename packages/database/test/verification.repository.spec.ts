import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@prisma/client';

import { VerificationRepository } from '../src/repositories/verification.repository.js';

describe('VerificationRepository', () => {
  it('bounds queue queries and applies clinic/dentist tenant scope before filters', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new VerificationRepository({
      verificationCase: { findMany },
    } as unknown as PrismaClient);

    await repository.listCases(
      { userId: 'user-1', organizationIds: ['organization-1'], includeAll: false },
      {
        limit: 25,
        status: 'SUBMITTED',
        assignedReviewerUserId: 'reviewer-1',
      },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 26,
        orderBy: { id: 'desc' },
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { clinic: { organizationId: { in: ['organization-1'] } } },
                { dentist: { userId: 'user-1' } },
              ]),
            }),
            { status: 'SUBMITTED' },
            { assignedReviewerUserId: 'reviewer-1' },
          ]),
        },
      }),
    );
  });

  it('materializes the active checklist inside an idempotent audited transaction', async () => {
    const idempotencyCreate = vi.fn().mockResolvedValue({});
    const idempotencyUpdate = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const outboxCreate = vi.fn().mockResolvedValue({});
    const caseCreate = vi.fn().mockResolvedValue({
      id: 'case-1',
      subjectType: 'CLINIC',
      status: 'DRAFT',
    });
    const transaction = {
      idempotencyRecord: { create: idempotencyCreate, update: idempotencyUpdate },
      verificationCase: { findFirst: vi.fn().mockResolvedValue(null), create: caseCreate },
      verificationRequirementTemplate: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'template-1',
            code: 'clinic.operating-license.v1',
            required: true,
            highRisk: true,
          },
        ]),
      },
      auditLog: { create: auditCreate },
      outboxEvent: { create: outboxCreate },
    };
    const db = {
      idempotencyRecord: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (work) => work(transaction)),
    } as unknown as PrismaClient;
    const repository = new VerificationRepository(db);

    await repository.ensureCase(
      { subjectType: 'CLINIC', subjectId: 'clinic-1', submitterUserId: 'user-1' },
      {
        actor: { userId: 'user-1', sessionId: 'session-1', organizationId: 'organization-1' },
        requestId: 'request-1',
        command: {
          userId: 'user-1',
          key: 'idempotency-1',
          operation: 'verification.case.ensure',
          requestHash: 'a'.repeat(64),
        },
      },
    );

    expect(caseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinicId: 'clinic-1',
          riskLevel: 'HIGH',
          requirements: {
            create: [{ templateId: 'template-1', required: true, highRisk: true }],
          },
        }),
      }),
    );
    expect(idempotencyCreate).toHaveBeenCalledOnce();
    expect(idempotencyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resourceId: 'case-1' }) }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'verification.case.created',
          resourceId: 'case-1',
        }),
      }),
    );
    expect(outboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aggregateId: 'case-1',
          payload: {
            verificationCaseId: 'case-1',
            resourceType: 'VerificationCase',
            resourceId: 'case-1',
          },
        }),
      }),
    );
  });
});
