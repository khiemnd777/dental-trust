export interface SecureShareFacts {
  readonly expiresAt: Date;
  readonly revokedAt?: Date;
  readonly maxAccessCount?: number;
  readonly accessCount: number;
}

export type SecureShareDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'EXPIRED' | 'REVOKED' | 'ACCESS_LIMIT_REACHED' };

export function authorizeSecureShareAccess(
  share: SecureShareFacts,
  now = new Date(),
): SecureShareDecision {
  if (share.revokedAt) return { allowed: false, reason: 'REVOKED' };
  if (share.expiresAt <= now) return { allowed: false, reason: 'EXPIRED' };
  if (share.maxAccessCount !== undefined && share.accessCount >= share.maxAccessCount) {
    return { allowed: false, reason: 'ACCESS_LIMIT_REACHED' };
  }
  return { allowed: true };
}
