interface BudgetWindow {
  startedAt: number;
  count: number;
}

const windows = new Map<string, BudgetWindow>();

export type LocalBudgetResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * A fixed-size, per-process backstop for low-value endpoints. The caller controls
 * the bucket name, so request data can never grow this map. Edge limits remain
 * authoritative across replicas.
 */
export function consumeLocalAbuseBudget(
  bucket: 'client-error' | 'product-event',
  limit: number,
  windowMs: number,
  now = Date.now(),
): LocalBudgetResult {
  const current = windows.get(bucket);
  if (!current || now < current.startedAt || now - current.startedAt >= windowMs) {
    windows.set(bucket, { startedAt: now, count: 1 });
    return { allowed: true };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1_000)),
    };
  }
  current.count += 1;
  return { allowed: true };
}
