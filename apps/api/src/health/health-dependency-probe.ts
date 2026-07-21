import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import type { ServerEnvironment } from '@dental-trust/config/server';
import type { PrismaClient } from '@dental-trust/database';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';

const PROBE_CACHE_MILLISECONDS = 3_000;
const PROBE_DEADLINE_MILLISECONDS = 2_800;
const DEPENDENCY_TIMEOUT_MILLISECONDS = 2_500;
const DATABASE_STATEMENT_TIMEOUT_MILLISECONDS = 2_000;

type ProbeOutcome = { readonly ok: true } | { readonly ok: false; readonly error: unknown };

@Injectable()
export class HealthDependencyProbe implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly storage: S3Client;
  private cached: { readonly expiresAt: number; readonly outcome: ProbeOutcome } | undefined;
  private active: { readonly raw: Promise<void>; readonly publicResult: Promise<void> } | undefined;

  constructor(
    @Inject(PRISMA) private readonly database: PrismaClient,
    @Inject(SERVER_ENV) private readonly environment: ServerEnvironment,
  ) {
    this.redis = new Redis(environment.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 2_000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    // ioredis emits connection failures separately from rejected commands.
    this.redis.on('error', () => undefined);
    this.storage = new S3Client({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.S3_ACCESS_KEY,
        secretAccessKey: environment.S3_SECRET_KEY,
      },
    });
  }

  async check(): Promise<void> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      if (this.cached.outcome.ok) return;
      throw this.cached.outcome.error;
    }
    if (this.active) return this.active.publicResult;

    const abortController = new AbortController();
    const raw = this.probe(abortController.signal);
    const publicResult = withDeadline(raw, PROBE_DEADLINE_MILLISECONDS, () =>
      abortController.abort(new Error('Readiness dependency probe timed out.')),
    );
    this.active = { raw, publicResult };

    void raw.then(
      () => this.completeProbe(raw, { ok: true }),
      (error: unknown) => this.completeProbe(raw, { ok: false, error }),
    );
    return publicResult;
  }

  async onModuleDestroy(): Promise<void> {
    this.storage.destroy();
    if (this.redis.status === 'wait') return;
    await this.redis.quit().catch(() => this.redis.disconnect(false));
  }

  private async probe(signal: AbortSignal): Promise<void> {
    const results = await Promise.allSettled([
      this.probeDatabase(),
      this.probeRedis(),
      this.storage.send(new HeadBucketCommand({ Bucket: this.environment.S3_BUCKET }), {
        abortSignal: signal,
      }),
    ]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure) throw failure.reason;
  }

  private async probeDatabase(): Promise<void> {
    await withDeadline(
      this.database.$transaction(
        async (transaction) => {
          await transaction.$executeRawUnsafe(
            `SET LOCAL statement_timeout = '${DATABASE_STATEMENT_TIMEOUT_MILLISECONDS}ms'`,
          );
          await transaction.$queryRaw`SELECT 1`;
        },
        { timeout: DEPENDENCY_TIMEOUT_MILLISECONDS },
      ),
      DEPENDENCY_TIMEOUT_MILLISECONDS,
    );
  }

  private async probeRedis(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
    await withDeadline(this.redis.ping(), DEPENDENCY_TIMEOUT_MILLISECONDS, () =>
      this.redis.disconnect(false),
    );
  }

  private completeProbe(raw: Promise<void>, outcome: ProbeOutcome): void {
    if (this.active?.raw !== raw) return;
    this.active = undefined;
    this.cached = { expiresAt: Date.now() + PROBE_CACHE_MILLISECONDS, outcome };
  }
}

export function withDeadline<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`Operation exceeded its ${timeoutMilliseconds}ms deadline.`));
    }, timeoutMilliseconds);
    timer.unref();
    void operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
