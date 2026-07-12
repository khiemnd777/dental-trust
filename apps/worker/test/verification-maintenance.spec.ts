import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@dental-trust/database';

import { processVerificationMaintenance } from '../src/processors/verification-maintenance.processor.js';

describe('verification expiry maintenance', () => {
  it('moves a current case into the expiring state and emits idempotent bilingual reminders', async () => {
    const now = new Date('2026-07-12T00:00:00.000Z');
    const expiry = new Date('2026-08-01T00:00:00.000Z');
    const caseUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const clinicUpdate = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const outboxUpsert = vi.fn().mockResolvedValue({});
    const notificationUpsert = vi.fn().mockResolvedValue({});
    const transaction = {
      verificationCase: { updateMany: caseUpdate },
      clinic: { update: clinicUpdate },
      dentist: { update: vi.fn() },
      auditLog: { create: auditCreate },
      outboxEvent: { upsert: outboxUpsert },
    };
    const db = {
      verificationCase: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'case-1',
            clinicId: 'clinic-1',
            dentistId: null,
            status: 'VERIFIED',
            version: 4,
            expiresAt: new Date('2027-01-01T00:00:00.000Z'),
            submittedBy: { id: 'user-1', preferredLocale: 'vi-VN' },
            requirements: [
              {
                id: 'requirement-1',
                template: {
                  code: 'clinic.operating-license.v1',
                  category: 'CLINIC_OPERATING_LICENSE',
                },
                evidence: [{ id: 'evidence-1', expiresAt: expiry }],
              },
            ],
          },
        ]),
      },
      notification: { upsert: notificationUpsert },
      $transaction: vi.fn(async (work) => work(transaction)),
    } as unknown as PrismaClient;

    const result = await processVerificationMaintenance(db, now);

    expect(result).toEqual({ processed: 1, transitioned: 1, reminders: 2 });
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'VERIFIED', version: 4 }),
        data: { status: 'VERIFICATION_EXPIRING', version: { increment: 1 } },
      }),
    );
    expect(clinicUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { verificationStatus: 'VERIFICATION_EXPIRING' } }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorType: 'SYSTEM' }) }),
    );
    expect(outboxUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ eventType: 'verification.case.expiring' }),
      }),
    );
    expect(notificationUpsert).toHaveBeenCalledTimes(2);
    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          category: 'VERIFICATION_EXPIRY',
          templateLocale: 'vi-VN',
          payload: expect.objectContaining({ milestoneDays: 30 }),
        }),
      }),
    );
  });

  it('is bounded and becomes a no-op when no evidence is near expiry', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { verificationCase: { findMany } } as unknown as PrismaClient;

    await expect(
      processVerificationMaintenance(db, new Date('2026-07-12T00:00:00.000Z')),
    ).resolves.toEqual({ processed: 0, transitioned: 0, reminders: 0 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });
});
