import { describe, expect, it } from 'vitest';

import { BoundedFixedWindowLimiter } from './health-network.guard.js';

describe('bounded health endpoint limiter', () => {
  it('rejects requests over the window budget and recovers after reset', () => {
    let now = 1_000;
    const limiter = new BoundedFixedWindowLimiter(10, () => now);

    expect(limiter.consume('live:client-a', 2, 1_000).allowed).toBe(true);
    expect(limiter.consume('live:client-a', 2, 1_000).allowed).toBe(true);
    expect(limiter.consume('live:client-a', 2, 1_000)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });

    now = 2_001;
    expect(limiter.consume('live:client-a', 2, 1_000).allowed).toBe(true);
  });

  it('keeps spoofed client cardinality bounded', () => {
    const limiter = new BoundedFixedWindowLimiter(2, () => 1_000);
    limiter.consume('live:client-a', 10);
    limiter.consume('live:client-b', 10);
    limiter.consume('live:client-c', 10);
    expect(limiter.size).toBe(2);
  });
});
