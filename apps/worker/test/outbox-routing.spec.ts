import { describe, expect, it } from 'vitest';

import { outboxJobId, outboxQueueName } from '../src/jobs/outbox-routing.js';
import { defaultJobOptions, fileProcessingJobOptions, queueNames } from '../src/jobs/queues.js';

describe('outbox queue routing', () => {
  it('isolates expensive file scans from latency-sensitive domain events', () => {
    expect(outboxQueueName('file.scan-requested')).toBe(queueNames.fileProcessing);
    expect(outboxQueueName('account.password-reset-requested')).toBe(queueNames.domainEvents);
    expect(outboxQueueName('case.status-transitioned')).toBe(queueNames.domainEvents);
    expect(outboxQueueName('privacy-request.execution-requested')).toBe(queueNames.privacyExports);
  });

  it('preserves outbox idempotency when events move to a dedicated queue', () => {
    expect(outboxJobId({ outboxEventId: 'event-123' })).toBe('event-123');
  });

  it('uses finite retention and fewer attempts for costly file jobs', () => {
    expect(defaultJobOptions.removeOnFail).toEqual({ age: 7 * 24 * 60 * 60, count: 10_000 });
    expect(fileProcessingJobOptions.attempts).toBe(3);
    expect(fileProcessingJobOptions.removeOnFail).toEqual({
      age: 3 * 24 * 60 * 60,
      count: 2_000,
    });
  });
});
