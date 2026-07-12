import { EventEmitter } from 'node:events';

import type { Worker } from 'bullmq';
import { beforeEach, describe, expect, it } from 'vitest';

import { applicationMetrics } from '@dental-trust/observability';

import { instrumentWorkerMetrics } from '../src/health/server.js';

describe('worker metrics instrumentation', () => {
  beforeEach(() => applicationMetrics.reset());

  it('records bounded queue starts, outcomes, and processing duration', () => {
    const worker = Object.assign(new EventEmitter(), { name: 'privacy-exports' });
    instrumentWorkerMetrics([worker as unknown as Worker]);
    worker.emit('active', { id: 'job-1' });
    worker.emit('completed', { id: 'job-1', processedOn: 1_000, finishedOn: 1_125 });
    worker.emit('failed', { id: 'job-2' }, new Error('provider unavailable'));
    const metrics = applicationMetrics.renderPrometheus();
    expect(metrics).toContain('queue_jobs_started_total{queue="privacy-exports"} 1');
    expect(metrics).toContain('queue_jobs_completed_total{queue="privacy-exports"} 1');
    expect(metrics).toContain('queue_jobs_failed_total{queue="privacy-exports"} 1');
    expect(metrics).toContain('queue_job_duration_milliseconds_sum{queue="privacy-exports"} 125');
    expect(metrics).not.toContain('job-1');
    expect(metrics).not.toContain('provider unavailable');
  });
});
