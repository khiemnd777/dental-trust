import { describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  storageSend: vi.fn<() => Promise<unknown>>(),
  storageDestroy: vi.fn(),
  redisPing: vi.fn(async () => 'PONG'),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  HeadBucketCommand: class {
    constructor(readonly input: unknown) {}
  },
  S3Client: class {
    send = dependencies.storageSend;
    destroy = dependencies.storageDestroy;
  },
}));

vi.mock('ioredis', () => ({
  Redis: class {
    status = 'ready';
    on() {
      return this;
    }
    connect = vi.fn(async () => undefined);
    ping = dependencies.redisPing;
    quit = vi.fn(async () => 'OK');
    disconnect = vi.fn();
  },
}));

import { HealthDependencyProbe, withDeadline } from './health-dependency-probe.js';

describe('health dependency probe deadlines', () => {
  it('rejects a hanging dependency within its absolute deadline', async () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    const operation = new Promise<void>(() => undefined);
    const result = withDeadline(operation, 100, timedOut);
    const rejection = expect(result).rejects.toThrow('100ms deadline');

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(timedOut).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('clears the deadline after the dependency settles', async () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    await expect(withDeadline(Promise.resolve('ok'), 100, timedOut)).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(100);
    expect(timedOut).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not overlap probes when a dependency ignores cancellation', async () => {
    vi.useFakeTimers();
    dependencies.storageSend.mockReset().mockImplementation(() => new Promise(() => undefined));
    const transaction = vi.fn(async (callback: (transaction: unknown) => Promise<void>) =>
      callback({ $executeRawUnsafe: vi.fn(), $queryRaw: vi.fn() }),
    );
    const probe = new HealthDependencyProbe(
      { $transaction: transaction } as never,
      {
        REDIS_URL: 'redis://unused',
        S3_ENDPOINT: 'http://storage.invalid',
        S3_REGION: 'test',
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY: 'test',
        S3_SECRET_KEY: 'test',
        S3_BUCKET: 'test',
      } as never,
    );

    const first = probe.check();
    const firstRejection = expect(first).rejects.toThrow('2800ms deadline');
    await vi.advanceTimersByTimeAsync(2_800);
    await firstRejection;
    await expect(probe.check()).rejects.toThrow('2800ms deadline');

    expect(dependencies.storageSend).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
    await probe.onModuleDestroy();
    vi.useRealTimers();
  });
});
