import { Injectable, type OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

export interface RedisCommandClient {
  readonly status: string;
  connect(): Promise<void>;
  eval(script: string, numberOfKeys: number, ...arguments_: string[]): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(reconnect?: boolean): void;
}

export class RateLimitStorageUnavailableException extends ServiceUnavailableException {
  constructor() {
    super('Request protection is temporarily unavailable.');
    this.name = 'RateLimitStorageUnavailableException';
  }
}

const incrementScript = `
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block_duration = tonumber(ARGV[3])
local redis_time = redis.call('TIME')
local now = (tonumber(redis_time[1]) * 1000) + math.floor(tonumber(redis_time[2]) / 1000)

local count = tonumber(redis.call('HGET', KEYS[1], 'count')) or 0
local window_until = tonumber(redis.call('HGET', KEYS[1], 'window_until')) or 0
local block_until = tonumber(redis.call('HGET', KEYS[1], 'block_until')) or 0

if block_until > now then
  local retention_until = math.max(window_until, block_until)
  redis.call('PEXPIRE', KEYS[1], math.max(1, retention_until - now))
  return {
    count,
    math.ceil(math.max(0, window_until - now) / 1000),
    1,
    math.ceil((block_until - now) / 1000)
  }
end

if block_until > 0 or window_until <= now then
  count = 0
  block_until = 0
  window_until = now + ttl
end

count = count + 1
if count > limit then
  block_until = now + block_duration
end

redis.call(
  'HSET',
  KEYS[1],
  'count', count,
  'window_until', window_until,
  'block_until', block_until
)
local retention_until = math.max(window_until, block_until)
redis.call('PEXPIRE', KEYS[1], math.max(1, retention_until - now))

return {
  count,
  math.ceil(math.max(0, window_until - now) / 1000),
  block_until > now and 1 or 0,
  math.ceil(math.max(0, block_until - now) / 1000)
}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: RedisCommandClient;
  private connectionAttempt: Promise<void> | undefined;

  constructor(
    redisUrl: string,
    private readonly keyPrefix: string,
    client?: RedisCommandClient,
    private readonly operationTimeoutMilliseconds = 2_500,
  ) {
    if (client) {
      this.redis = client;
      return;
    }
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
    // Command failures are propagated to the request; this listener prevents
    // a separate connection-level event from becoming an uncaught exception.
    redis.on('error', () => undefined);
    this.redis = redis;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<{
    readonly totalHits: number;
    readonly timeToExpire: number;
    readonly isBlocked: boolean;
    readonly timeToBlockExpire: number;
  }> {
    try {
      const rawResult = await withRedisDeadline(
        (async () => {
          await this.ensureConnected();
          const storageKey = `${this.keyPrefix}:${throttlerName}:${key}`;
          return this.redis.eval(
            incrementScript,
            1,
            storageKey,
            String(ttl),
            String(limit),
            String(blockDuration),
          );
        })(),
        this.operationTimeoutMilliseconds,
        () => this.redis.disconnect(true),
      );
      if (!isStorageResult(rawResult))
        throw new Error('Redis returned an invalid rate-limit result');
      return {
        totalHits: Number(rawResult[0]),
        timeToExpire: Number(rawResult[1]),
        isBlocked: Number(rawResult[2]) === 1,
        timeToBlockExpire: Number(rawResult[3]),
      };
    } catch (error) {
      if (error instanceof RateLimitStorageUnavailableException) throw error;
      // Fail closed with a stable 503 contract. The global exception filter can
      // suppress external reporting for this known dependency state.
      throw new RateLimitStorageUnavailableException();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') return;
    await this.redis.quit().catch(() => this.redis.disconnect(false));
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'ready') return;
    if (this.connectionAttempt) {
      await this.connectionAttempt;
      if (String(this.redis.status) !== 'ready') {
        throw new Error('Rate-limit Redis failed to become ready');
      }
      return;
    }
    if (this.redis.status !== 'wait') {
      throw new Error(`Rate-limit Redis is unavailable (${this.redis.status})`);
    }
    this.connectionAttempt ??= this.redis.connect().finally(() => {
      this.connectionAttempt = undefined;
    });
    await this.connectionAttempt;
    if (String(this.redis.status) !== 'ready') {
      throw new Error('Rate-limit Redis failed to become ready');
    }
  }
}

function isStorageResult(value: unknown): value is readonly [unknown, unknown, unknown, unknown] {
  return Array.isArray(value) && value.length === 4 && value.every(isRedisNumber);
}

function isRedisNumber(value: unknown): boolean {
  return typeof value === 'number' || (typeof value === 'string' && /^\d+$/u.test(value));
}

function withRedisDeadline<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error('Rate-limit Redis operation timed out'));
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
