import { describe, expect, it, vi } from 'vitest';

import { markOutboxDelivered, markOutboxDeliveryFailed } from '../src/jobs/outbox-delivery.js';

describe('durable outbox delivery checkpoints', () => {
  it('marks a published job processed without changing its durable status', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await markOutboxDelivered({ outboxEvent: { updateMany } } as never, 'event-1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', status: 'PUBLISHED', processedAt: null },
      data: { processedAt: expect.any(Date), lastErrorCode: null },
    });
  });

  it('returns an exhausted delivery to durable retry with backoff', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      outboxEvent: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'PUBLISHED',
          attemptCount: 2,
          processedAt: null,
        }),
        updateMany,
      },
    };
    const now = new Date('2026-07-20T00:00:00.000Z');
    await markOutboxDeliveryFailed(db as never, 'event-2', false, now);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-2', status: 'PUBLISHED', processedAt: null },
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'DELIVERY_RETRIES_EXHAUSTED',
        }),
      }),
    );
  });

  it('dead-letters a terminal file delivery instead of retrying it forever', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      outboxEvent: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'PUBLISHED',
          attemptCount: 1,
          processedAt: null,
        }),
        updateMany,
      },
    };
    await markOutboxDeliveryFailed(db as never, 'event-3', true, new Date());
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DEAD_LETTER',
          lastErrorCode: 'DELIVERY_TERMINAL_FAILURE',
        }),
      }),
    );
  });
});
