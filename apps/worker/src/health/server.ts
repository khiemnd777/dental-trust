import { createServer, type Server } from 'node:http';

import type { PrismaClient } from '@dental-trust/database';
import { applicationMetrics } from '@dental-trust/observability';
import type { Worker } from 'bullmq';

export async function startHealthServer(
  database: PrismaClient,
  workers: readonly Worker[],
  port: number,
): Promise<Server> {
  instrumentWorkerMetrics(workers);
  const server = createServer(async (request, response) => {
    response.setHeader('cache-control', 'no-store');
    if (request.url === '/metrics') {
      response.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
      response.statusCode = 200;
      response.end(applicationMetrics.renderPrometheus());
      return;
    }
    response.setHeader('content-type', 'application/json');
    if (request.url === '/health/live') {
      response.statusCode = 200;
      response.end(JSON.stringify({ status: 'ok', service: 'dental-trust-worker' }));
      return;
    }
    if (request.url !== '/health/ready') {
      response.statusCode = 404;
      response.end(JSON.stringify({ status: 'not-found' }));
      return;
    }
    try {
      await Promise.all([
        database.$queryRaw`SELECT 1`,
        ...workers.map((worker) => worker.waitUntilReady()),
      ]);
      response.statusCode = 200;
      response.end(
        JSON.stringify({
          status: 'ready',
          service: 'dental-trust-worker',
          dependencies: { database: 'available', redis: 'available' },
        }),
      );
    } catch {
      response.statusCode = 503;
      response.end(
        JSON.stringify({
          status: 'degraded',
          service: 'dental-trust-worker',
          dependencies: { database: 'unavailable-or-degraded', redis: 'unavailable-or-degraded' },
        }),
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

export function instrumentWorkerMetrics(workers: readonly Worker[]): void {
  for (const worker of workers) {
    worker.on('active', () => {
      applicationMetrics.increment('queue_jobs_started_total', { queue: worker.name });
    });
    worker.on('completed', (job) => {
      applicationMetrics.increment('queue_jobs_completed_total', { queue: worker.name });
      if (job.processedOn && job.finishedOn && job.finishedOn >= job.processedOn) {
        applicationMetrics.observe(
          'queue_job_duration_milliseconds',
          job.finishedOn - job.processedOn,
          { queue: worker.name },
        );
      }
    });
    worker.on('failed', () => {
      applicationMetrics.increment('queue_jobs_failed_total', { queue: worker.name });
    });
  }
}

export async function stopHealthServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
