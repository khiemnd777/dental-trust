import { describe, expect, it } from 'vitest';

import { isOutboxReclaimable, outboxFailureDisposition } from '../src/jobs/outbox-policy.js';

describe('outbox delivery policy', () => {
  const now = new Date('2026-07-12T12:00:00Z');

  it('reclaims a processing event only after its lease expires', () => {
    expect(
      isOutboxReclaimable(
        {
          status: 'PROCESSING',
          availableAt: now,
          lockedAt: new Date('2026-07-12T11:58:00Z'),
        },
        now,
      ),
    ).toBe(true);
    expect(
      isOutboxReclaimable(
        {
          status: 'PROCESSING',
          availableAt: now,
          lockedAt: new Date('2026-07-12T11:59:30Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('uses bounded exponential retry and dead-letters the eighth failure', () => {
    expect(outboxFailureDisposition(3, now)).toEqual({
      status: 'FAILED',
      availableAt: new Date('2026-07-12T12:00:08Z'),
    });
    expect(outboxFailureDisposition(8, now).status).toBe('DEAD_LETTER');
  });

  it('never reclaims published or dead-lettered events', () => {
    for (const status of ['PUBLISHED', 'DEAD_LETTER'] as const) {
      expect(
        isOutboxReclaimable(
          { status, availableAt: new Date('2020-01-01T00:00:00Z'), lockedAt: null },
          now,
        ),
      ).toBe(false);
    }
  });
});
