import { describe, expect, it, vi } from 'vitest';

import type { Prisma, PrismaClient } from '@dental-trust/database';

import { processPatientReminders } from '../src/processors/patient-reminders.processor.js';

const now = new Date('2026-07-12T08:00:00.000Z');

describe('patient reminder maintenance', () => {
  it('creates bounded idempotent in-app and email reminders without sensitive content', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 6 });
    const db = database({
      appointments: [
        {
          id: 'appointment-1',
          startsAt: new Date('2026-07-12T09:30:00.000Z'),
          timezone: 'Asia/Ho_Chi_Minh',
          kind: 'CONSULTATION',
          dentalCase: patient('patient-1', 'en-US'),
        },
      ],
      aftercarePlans: [
        {
          id: 'aftercare-1',
          startsAt: new Date('2026-07-11T08:00:00.000Z'),
          dentalCase: patient('patient-1', 'en-US'),
          checkIns: [],
        },
      ],
      failedPayments: [
        {
          id: 'payment-1',
          version: 2,
          updatedAt: new Date('2026-07-12T07:00:00.000Z'),
          booking: { id: 'booking-1', dentalCase: patient('patient-1', 'en-US') },
        },
      ],
      createMany,
    });

    await expect(processPatientReminders(db, now)).resolves.toEqual({
      appointments: 1,
      aftercare: 1,
      payments: 1,
      notificationsCreated: 6,
    });
    const input = createMany.mock.calls[0]?.[0] as
      { data: Prisma.NotificationCreateManyInput[]; skipDuplicates: boolean } | undefined;
    expect(input?.skipDuplicates).toBe(true);
    expect(input?.data).toHaveLength(6);
    expect(input?.data.map(({ category }) => category)).toEqual([
      'APPOINTMENTS',
      'APPOINTMENTS',
      'AFTERCARE',
      'AFTERCARE',
      'PAYMENTS',
      'PAYMENTS',
    ]);
    expect(input?.data.map(({ channel }) => channel)).toEqual([
      'IN_APP',
      'EMAIL',
      'IN_APP',
      'EMAIL',
      'IN_APP',
      'EMAIL',
    ]);
    expect(
      new Set(input?.data.map(({ idempotencyKey }) => idempotencyKey).filter(Boolean)).size,
    ).toBe(6);
    const serializedPayloads = JSON.stringify(input?.data.map(({ payload }) => payload));
    expect(serializedPayloads).not.toMatch(/email|medical|notes|card|joinUrl/iu);
    expect(serializedPayloads).toContain('"milestone":"2h"');
  });

  it('skips a same-day aftercare check-in and does not enqueue an empty batch', async () => {
    const createMany = vi.fn();
    const db = database({
      appointments: [],
      aftercarePlans: [
        {
          id: 'aftercare-1',
          startsAt: new Date('2026-07-10T08:00:00.000Z'),
          dentalCase: patient('patient-1', 'vi-VN'),
          checkIns: [{ submittedAt: new Date('2026-07-12T07:45:00.000Z') }],
        },
      ],
      failedPayments: [],
      createMany,
    });
    await expect(processPatientReminders(db, now)).resolves.toEqual({
      appointments: 0,
      aftercare: 0,
      payments: 0,
      notificationsCreated: 0,
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('queries only actionable time windows with deterministic volume limits', async () => {
    const db = database({
      appointments: [],
      aftercarePlans: [],
      failedPayments: [],
      createMany: vi.fn(),
    });
    await processPatientReminders(db, now);
    expect(db.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: {
          status: 'CONFIRMED',
          startsAt: {
            gt: now,
            lte: new Date('2026-07-13T08:00:00.000Z'),
          },
        },
      }),
    );
    expect(db.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: {
          status: 'FAILED',
          updatedAt: { gte: new Date('2026-07-05T08:00:00.000Z') },
        },
      }),
    );
  });
});

function patient(userId: string, preferredLocale: string) {
  return { patientProfile: { user: { id: userId, preferredLocale } } };
}

function database(input: {
  readonly appointments: unknown[];
  readonly aftercarePlans: unknown[];
  readonly failedPayments: unknown[];
  readonly createMany: ReturnType<typeof vi.fn>;
}) {
  return {
    appointment: { findMany: vi.fn().mockResolvedValue(input.appointments) },
    aftercarePlan: { findMany: vi.fn().mockResolvedValue(input.aftercarePlans) },
    payment: { findMany: vi.fn().mockResolvedValue(input.failedPayments) },
    notification: { createMany: input.createMany },
  } as unknown as PrismaClient;
}
