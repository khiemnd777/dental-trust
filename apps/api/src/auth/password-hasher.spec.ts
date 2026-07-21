import { describe, expect, it, vi } from 'vitest';

import {
  BoundedConcurrencyGate,
  ConcurrencyQueueFullError,
} from '../common/bounded-concurrency-gate.js';

describe('authentication hash concurrency gate', () => {
  it('bounds active hashing and queue length while draining in FIFO order', async () => {
    const gate = new BoundedConcurrencyGate(2, 1);
    const first = deferred<undefined>();
    const second = deferred<undefined>();
    const third = deferred<undefined>();
    const started: number[] = [];

    const firstRun = gate.run(async () => {
      started.push(1);
      await first.promise;
      return 1;
    });
    const secondRun = gate.run(async () => {
      started.push(2);
      await second.promise;
      return 2;
    });
    const thirdRun = gate.run(async () => {
      started.push(3);
      await third.promise;
      return 3;
    });

    await vi.waitFor(() => expect(started).toEqual([1, 2]));
    expect(gate.activeCount).toBe(2);
    expect(gate.queuedCount).toBe(1);
    await expect(gate.run(async () => 4)).rejects.toBeInstanceOf(ConcurrencyQueueFullError);

    first.resolve(undefined);
    await expect(firstRun).resolves.toBe(1);
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3]));
    expect(gate.activeCount).toBe(2);
    expect(gate.queuedCount).toBe(0);

    second.resolve(undefined);
    third.resolve(undefined);
    await expect(Promise.all([secondRun, thirdRun])).resolves.toEqual([2, 3]);
    expect(gate.activeCount).toBe(0);
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
