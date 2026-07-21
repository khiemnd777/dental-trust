import { consumeLocalAbuseBudget } from '@/lib/local-abuse-budget';

describe('local telemetry abuse budget', () => {
  it('bounds a fixed route bucket and resets at the next window', () => {
    const start = 10_000;
    expect(consumeLocalAbuseBudget('client-error', 2, 60_000, start)).toEqual({ allowed: true });
    expect(consumeLocalAbuseBudget('client-error', 2, 60_000, start + 1)).toEqual({
      allowed: true,
    });
    expect(consumeLocalAbuseBudget('client-error', 2, 60_000, start + 2)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(consumeLocalAbuseBudget('client-error', 2, 60_000, start + 60_000)).toEqual({
      allowed: true,
    });
  });
});
