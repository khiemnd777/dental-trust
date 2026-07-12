export const OUTBOX_MAX_ATTEMPTS = 8;
export const OUTBOX_LEASE_MILLISECONDS = 60_000;

export interface OutboxLeaseFacts {
  readonly status: 'PENDING' | 'FAILED' | 'PROCESSING' | 'PUBLISHED' | 'DEAD_LETTER';
  readonly availableAt: Date;
  readonly lockedAt: Date | null;
}

export function isOutboxReclaimable(
  event: OutboxLeaseFacts,
  now: Date,
  leaseMilliseconds = OUTBOX_LEASE_MILLISECONDS,
): boolean {
  if ((event.status === 'PENDING' || event.status === 'FAILED') && event.availableAt <= now) {
    return true;
  }
  return (
    event.status === 'PROCESSING' &&
    event.lockedAt !== null &&
    event.lockedAt <= new Date(now.getTime() - leaseMilliseconds)
  );
}

export function outboxFailureDisposition(
  attemptCountAfterClaim: number,
  now: Date,
): { readonly status: 'FAILED' | 'DEAD_LETTER'; readonly availableAt: Date } {
  const deadLetter = attemptCountAfterClaim >= OUTBOX_MAX_ATTEMPTS;
  return {
    status: deadLetter ? 'DEAD_LETTER' : 'FAILED',
    availableAt: new Date(now.getTime() + 2 ** Math.min(attemptCountAfterClaim, 10) * 1_000),
  };
}
