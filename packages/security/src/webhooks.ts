import { createHmac } from 'node:crypto';

import { safeEqualHex } from './tokens.js';

export function verifyHmacSha256(
  rawPayload: string | Buffer,
  providedSignature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(rawPayload).digest('hex');
  const normalized = providedSignature.replace(/^sha256=/u, '');
  return safeEqualHex(expected, normalized);
}
