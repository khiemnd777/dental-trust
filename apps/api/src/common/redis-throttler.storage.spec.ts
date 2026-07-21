import { describe, expect, it, vi } from 'vitest';

import {
  RateLimitStorageUnavailableException,
  RedisThrottlerStorage,
  type RedisCommandClient,
} from './redis-throttler.storage.js';

interface Entry {
  count: number;
  windowUntil: number;
  blockUntil: number;
  expiresAt: number;
}

class SharedRedisState {
  now = 1_000;
  readonly entries = new Map<string, Entry>();

  advance(milliseconds: number): void {
    this.now += milliseconds;
    for (const [key, value] of this.entries) {
      if (value.expiresAt <= this.now) this.entries.delete(key);
    }
  }
}

class FakeRedisClient implements RedisCommandClient {
  status = 'ready';

  constructor(private readonly shared: SharedRedisState) {}

  async connect(): Promise<void> {
    this.status = 'ready';
  }

  async eval(
    _script: string,
    _numberOfKeys: number,
    key: string,
    rawTtl: string,
    rawLimit: string,
    rawBlockDuration: string,
  ): Promise<unknown> {
    const ttl = Number(rawTtl);
    const limit = Number(rawLimit);
    const blockDuration = Number(rawBlockDuration);
    const now = this.shared.now;
    let entry = this.shared.entries.get(key) ?? {
      count: 0,
      windowUntil: 0,
      blockUntil: 0,
      expiresAt: 0,
    };
    if (entry.expiresAt <= now) {
      entry = { count: 0, windowUntil: 0, blockUntil: 0, expiresAt: 0 };
    }
    if (entry.blockUntil > now) {
      return [entry.count, seconds(entry.windowUntil - now), 1, seconds(entry.blockUntil - now)];
    }
    if (entry.blockUntil > 0 || entry.windowUntil <= now) {
      entry.count = 0;
      entry.blockUntil = 0;
      entry.windowUntil = now + ttl;
    }
    entry.count += 1;
    if (entry.count > limit) entry.blockUntil = now + blockDuration;
    entry.expiresAt = Math.max(entry.windowUntil, entry.blockUntil);
    this.shared.entries.set(key, entry);
    return [
      entry.count,
      seconds(entry.windowUntil - now),
      entry.blockUntil > now ? 1 : 0,
      seconds(entry.blockUntil - now),
    ];
  }

  async quit(): Promise<unknown> {
    this.status = 'end';
    return 'OK';
  }

  disconnect(): void {
    this.status = 'end';
  }
}

class ConnectingRedisClient implements RedisCommandClient {
  status = 'wait';
  connectCalls = 0;
  private finishConnection!: () => void;

  connect(): Promise<void> {
    this.connectCalls += 1;
    this.status = 'connecting';
    return new Promise<void>((resolve) => {
      this.finishConnection = () => {
        this.status = 'ready';
        resolve();
      };
    });
  }

  completeConnection(): void {
    this.finishConnection();
  }

  async eval(): Promise<unknown> {
    return [1, 60, 0, 0];
  }

  async quit(): Promise<unknown> {
    this.status = 'end';
    return 'OK';
  }

  disconnect(): void {
    this.status = 'end';
  }
}

class HangingRedisClient implements RedisCommandClient {
  status = 'ready';
  disconnectCalls = 0;

  connect(): Promise<void> {
    return Promise.resolve();
  }

  eval(): Promise<unknown> {
    return new Promise(() => undefined);
  }

  async quit(): Promise<unknown> {
    return 'OK';
  }

  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

describe('RedisThrottlerStorage', () => {
  it('shares counters and blocks across application replicas', async () => {
    const shared = new SharedRedisState();
    const firstReplica = new RedisThrottlerStorage(
      'redis://unused',
      'test:rate-limit',
      new FakeRedisClient(shared),
    );
    const secondReplica = new RedisThrottlerStorage(
      'redis://unused',
      'test:rate-limit',
      new FakeRedisClient(shared),
    );

    await expect(
      firstReplica.increment('request-key', 60_000, 2, 60_000, 'default'),
    ).resolves.toEqual(expect.objectContaining({ totalHits: 1, isBlocked: false }));
    await expect(
      secondReplica.increment('request-key', 60_000, 2, 60_000, 'default'),
    ).resolves.toEqual(expect.objectContaining({ totalHits: 2, isBlocked: false }));
    await expect(
      firstReplica.increment('request-key', 60_000, 2, 60_000, 'default'),
    ).resolves.toEqual(
      expect.objectContaining({ totalHits: 3, isBlocked: true, timeToBlockExpire: 60 }),
    );
    expect([...shared.entries.keys()]).toEqual(['test:rate-limit:default:request-key']);
  });

  it('expires idle keys and starts a fresh window after the block duration', async () => {
    const shared = new SharedRedisState();
    const storage = new RedisThrottlerStorage(
      'redis://unused',
      'test:rate-limit',
      new FakeRedisClient(shared),
    );

    await storage.increment('request-key', 1_000, 1, 1_000, 'default');
    await expect(storage.increment('request-key', 1_000, 1, 1_000, 'default')).resolves.toEqual(
      expect.objectContaining({ isBlocked: true }),
    );
    shared.advance(1_001);
    expect(shared.entries.size).toBe(0);
    await expect(storage.increment('request-key', 1_000, 1, 1_000, 'default')).resolves.toEqual(
      expect.objectContaining({ totalHits: 1, isBlocked: false }),
    );
    expect(shared.entries.size).toBe(1);
  });

  it('shares the initial connection attempt across a request burst', async () => {
    const client = new ConnectingRedisClient();
    const storage = new RedisThrottlerStorage('redis://unused', 'test:rate-limit', client);

    const first = storage.increment('first', 60_000, 2, 60_000, 'default');
    const second = storage.increment('second', 60_000, 2, 60_000, 'default');
    await Promise.resolve();
    expect(client.connectCalls).toBe(1);

    client.completeConnection();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('fails closed with a typed retryable HTTP error when Redis is unavailable', async () => {
    const shared = new SharedRedisState();
    const client = new FakeRedisClient(shared);
    client.status = 'end';
    const storage = new RedisThrottlerStorage('redis://unused', 'test:rate-limit', client);

    await expect(
      storage.increment('request-key', 60_000, 2, 60_000, 'default'),
    ).rejects.toBeInstanceOf(RateLimitStorageUnavailableException);
    await expect(
      storage.increment('request-key', 60_000, 2, 60_000, 'default'),
    ).rejects.toMatchObject({
      status: 503,
    });
  });

  it('fails closed and reconnects when a ready Redis connection stops answering commands', async () => {
    vi.useFakeTimers();
    const client = new HangingRedisClient();
    const storage = new RedisThrottlerStorage('redis://unused', 'test:rate-limit', client, 100);
    const result = storage.increment('request-key', 60_000, 2, 60_000, 'default');
    const rejection = expect(result).rejects.toBeInstanceOf(RateLimitStorageUnavailableException);

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(client.disconnectCalls).toBe(1);
    vi.useRealTimers();
  });
});

function seconds(milliseconds: number): number {
  return Math.ceil(Math.max(0, milliseconds) / 1_000);
}
