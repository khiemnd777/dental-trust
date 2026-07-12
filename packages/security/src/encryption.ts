import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

export class SensitiveFieldCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32)
      throw new Error('Field encryption secret must contain at least 32 characters.');
    this.key = createHash('sha256').update(secret, 'utf8').digest();
  }

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      VERSION,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(ciphertext: string, context: string): string {
    const [version, encodedIv, encodedTag, encodedPayload] = ciphertext.split('.');
    if (version !== VERSION || !encodedIv || !encodedTag || !encodedPayload) {
      throw new Error('Encrypted field envelope is invalid or unsupported.');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(encodedIv, 'base64url'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedPayload, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
