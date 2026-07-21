import { beforeEach, describe, expect, it, vi } from 'vitest';

const bull = vi.hoisted(() => ({
  processor: undefined as ((job: unknown) => Promise<void>) | undefined,
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  workerClose: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: class {
    add = bull.queueAdd;
    close = bull.queueClose;
  },
  Worker: class {
    constructor(_name: string, processor: (job: unknown) => Promise<void>) {
      bull.processor = processor;
    }

    on() {
      return this;
    }

    close = bull.workerClose;
  },
}));

import { createDomainEventWorker } from '../src/processors/domain-event.processor.js';

describe('domain event runtime', () => {
  beforeEach(() => {
    bull.processor = undefined;
    bull.queueAdd.mockReset().mockResolvedValue(undefined);
    bull.queueClose.mockReset().mockResolvedValue(undefined);
    bull.workerClose.mockReset().mockResolvedValue(undefined);
  });

  it('forwards legacy scan jobs idempotently and closes the forwarding queue', async () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const runtime = createDomainEventWorker({} as never, {} as never, logger as never);
    const job = {
      id: 'job-1',
      name: 'file.scan-requested',
      data: {
        outboxEventId: 'outbox-1',
        eventType: 'file.scan-requested',
        aggregateType: 'FileAsset',
        aggregateId: 'file-1',
        payload: { fileAssetId: 'file-1' },
        correlationId: 'request-1',
      },
    };

    await bull.processor?.(job);

    expect(bull.queueAdd).toHaveBeenCalledWith(job.name, job.data, { jobId: 'outbox-1' });
    expect(logger.warn).toHaveBeenCalledOnce();

    await runtime.close();

    expect(bull.workerClose).toHaveBeenCalledOnce();
    expect(bull.queueClose).toHaveBeenCalledOnce();
    expect(bull.workerClose.mock.invocationCallOrder[0]).toBeLessThan(
      bull.queueClose.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
