import { Controller, Get, Header, Inject, ServiceUnavailableException } from '@nestjs/common';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Redis } from 'ioredis';
import type { PrismaClient } from '@dental-trust/database';

import type { ServerEnvironment } from '@dental-trust/config/server';
import type { MetricsRegistry } from '@dental-trust/observability';

import { METRICS, PRISMA, SERVER_ENV } from '../common/tokens.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(SERVER_ENV) private readonly environment: ServerEnvironment,
    @Inject(METRICS) private readonly metricsRegistry: MetricsRegistry,
  ) {}

  @Get('live')
  live(): Readonly<Record<string, unknown>> {
    return {
      status: 'ok',
      service: 'dental-trust-api',
      version: process.env.BUILD_VERSION ?? 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('ready')
  async ready(): Promise<Readonly<Record<string, unknown>>> {
    const checks = await Promise.allSettled([
      this.db.$queryRaw`SELECT 1`,
      probeRedis(this.environment.REDIS_URL),
      probeObjectStorage(this.environment),
    ]);
    if (checks.some(({ status }) => status === 'rejected')) {
      throw new ServiceUnavailableException('A required readiness dependency is unavailable.');
    }
    return {
      status: 'ready',
      dependencies: { database: 'available', redis: 'available', objectStorage: 'available' },
      environment: this.environment.NODE_ENV,
    };
  }

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): string {
    return this.metricsRegistry.renderPrometheus();
  }
}

async function probeRedis(url: string): Promise<void> {
  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  });
  try {
    await redis.connect();
    await redis.ping();
  } finally {
    redis.disconnect(false);
  }
}

async function probeObjectStorage(environment: ServerEnvironment): Promise<void> {
  const client = new S3Client({
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: environment.S3_ACCESS_KEY,
      secretAccessKey: environment.S3_SECRET_KEY,
    },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: environment.S3_BUCKET }), {
      abortSignal: AbortSignal.timeout(2_500),
    });
  } finally {
    client.destroy();
  }
}
