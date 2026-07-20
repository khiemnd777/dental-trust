import { describe, expect, it } from 'vitest';

import { appointmentMutationsAt } from '@/lib/appointment-lifecycle';

const now = Date.parse('2026-07-20T06:00:00.000Z');

describe('appointmentMutationsAt', () => {
  it('allows only schedule changes before an appointment starts', () => {
    expect(
      appointmentMutationsAt(
        {
          status: 'CONFIRMED',
          startsAt: '2026-07-20T07:00:00.000Z',
          endsAt: '2026-07-20T08:00:00.000Z',
        },
        now,
      ),
    ).toEqual(['reschedule', 'cancel']);
  });

  it('allows attendance only after the appointment ends', () => {
    expect(
      appointmentMutationsAt(
        {
          status: 'CONFIRMED',
          startsAt: '2026-07-20T04:00:00.000Z',
          endsAt: '2026-07-20T05:00:00.000Z',
        },
        now,
      ),
    ).toEqual(['attendance']);
    expect(
      appointmentMutationsAt(
        {
          status: 'CONFIRMED',
          startsAt: '2026-07-20T05:30:00.000Z',
          endsAt: '2026-07-20T06:30:00.000Z',
        },
        now,
      ),
    ).toEqual([]);
  });

  it('does not expose lifecycle mutations for terminal statuses', () => {
    expect(
      appointmentMutationsAt(
        {
          status: 'CANCELLED',
          startsAt: '2026-07-20T07:00:00.000Z',
          endsAt: '2026-07-20T08:00:00.000Z',
        },
        now,
      ),
    ).toEqual([]);
  });
});
