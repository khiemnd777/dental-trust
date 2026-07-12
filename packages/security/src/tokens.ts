import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f\d]+$/iu.test(left) || !/^[a-f\d]+$/iu.test(right) || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
