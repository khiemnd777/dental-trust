import { describe, expect, it, vi } from 'vitest';

import { CaseRepository, type PrismaClient, TrustSafetyRepository } from '../src/index.js';

describe('CaseRepository query scoping', () => {
  it('includes only selected organizations and explicit caregiver summary grants', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new CaseRepository({ dentalCase: { findMany } } as unknown as PrismaClient);
    await repository.listScoped(
      { userId: 'user-a', organizationIds: ['clinic-a'], includeAll: false },
      { limit: 25 },
    );
    const call = findMany.mock.calls[0]?.[0] as { where: unknown };
    expect(JSON.stringify(call.where)).toContain('clinic-a');
    expect(JSON.stringify(call.where)).not.toContain('clinic-b');
    expect(JSON.stringify(call.where)).toContain('VIEW_CASE_SUMMARY');
  });

  it('does not add tenant predicates only for an explicitly elevated include-all scope', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new CaseRepository({ dentalCase: { findMany } } as unknown as PrismaClient);
    await repository.listScoped(
      { userId: 'admin-a', organizationIds: [], includeAll: true },
      { limit: 25 },
    );
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { AND: [{}, {}] } });
  });

  it('preserves non-idempotency transaction errors instead of masking them as replay conflicts', async () => {
    const original = new Error('database unavailable');
    const findUnique = vi.fn().mockResolvedValueOnce(null);
    const repository = new CaseRepository({
      patientProfile: { findUnique: vi.fn().mockResolvedValue({ id: 'patient-a' }) },
      idempotencyRecord: { findUnique },
      $transaction: vi.fn().mockRejectedValue(original),
    } as unknown as PrismaClient);

    await expect(
      repository.createForPatient(
        'user-a',
        {
          title: 'Implant consultation',
          desiredProcedureCode: 'DENTAL_IMPLANT',
          preferredCurrency: 'USD',
        },
        { userId: 'user-a' },
        'request-a',
        {
          userId: 'user-a',
          key: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e11',
          operation: 'case.create',
          requestHash: 'a'.repeat(64),
        },
      ),
    ).rejects.toBe(original);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('TrustSafetyRepository query scoping', () => {
  it('keeps clinic incident reads inside the caller tenant and selects event visibility for audience separation', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new TrustSafetyRepository({
      incident: { findMany },
    } as unknown as PrismaClient);

    await repository.listIncidentsScoped(
      {
        userId: 'staff-a',
        organizationIds: ['organization-a'],
        includeAll: false,
        clinicId: 'clinic-a',
      },
      { limit: 25 },
    );

    const call = findMany.mock.calls[0]?.[0] as { where: unknown; include: unknown };
    expect(JSON.stringify(call.where)).toContain('organization-a');
    expect(JSON.stringify(call.where)).toContain('clinic-a');
    expect(JSON.stringify(call.where)).not.toContain('organization-b');
    expect(JSON.stringify(call.where)).not.toContain('assignedUserId');
    expect(call.include).toMatchObject({ events: { select: { visibility: true } } });
    expect(call.include).not.toMatchObject({
      events: { where: { visibility: 'PARTICIPANTS' } },
    });
  });

  it('loads only patient-visible incident events outside clinic-operator scope', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new TrustSafetyRepository({
      incident: { findMany },
    } as unknown as PrismaClient);

    await repository.listIncidentsScoped(
      {
        userId: 'patient-a',
        organizationIds: [],
        includeAll: false,
      },
      { limit: 25 },
    );

    const call = findMany.mock.calls[0]?.[0] as { include: unknown };
    expect(call.include).toMatchObject({
      events: { where: { visibility: 'PARTICIPANTS' } },
    });
  });

  it('adds requester ownership to direct privacy-request reads', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new TrustSafetyRepository({
      privacyRequest: { findFirst },
    } as unknown as PrismaClient);

    await repository.findPrivacyRequestScoped('request-a', 'patient-a');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-a', requesterUserId: 'patient-a' },
      }),
    );
  });
});
