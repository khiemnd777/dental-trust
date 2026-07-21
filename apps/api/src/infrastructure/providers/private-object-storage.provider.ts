import { randomUUID } from 'node:crypto';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ServerEnvironment } from '@dental-trust/config/server';

export class PrivateObjectStorageProvider {
  private readonly client: S3Client;

  constructor(private readonly environment: ServerEnvironment) {
    this.client = new S3Client({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.S3_ACCESS_KEY,
        secretAccessKey: environment.S3_SECRET_KEY,
      },
    });
  }

  async createQuarantinedUpload(input: {
    readonly ownerUserId: string;
    readonly detectedExtension: string;
    readonly contentType: string;
    readonly sizeBytes: number;
  }): Promise<{
    readonly objectKey: string;
    readonly signedUrl: string;
    readonly expiresAt: Date;
  }> {
    const safeExtension = input.detectedExtension.replace(/[^a-z0-9]/giu, '').slice(0, 12);
    const objectKey = `quarantine/${input.ownerUserId}/${randomUUID()}${safeExtension ? `.${safeExtension}` : ''}`;
    const expiresIn = 10 * 60;
    const command = new PutObjectCommand({
      Bucket: this.environment.S3_BUCKET,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      ServerSideEncryption: 'AES256',
      Tagging: 'state=quarantined',
      Metadata: { owner: input.ownerUserId, state: 'quarantined' },
    });
    return {
      objectKey,
      signedUrl: await getSignedUrl(this.client, command, { expiresIn }),
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
    };
  }

  async createPrivateDownload(
    objectKey: string,
  ): Promise<{ readonly signedUrl: string; readonly expiresAt: Date }> {
    const expiresIn = 5 * 60;
    const command = new GetObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: objectKey });
    return {
      signedUrl: await getSignedUrl(this.client, command, { expiresIn }),
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
    };
  }

  async putGeneratedObject(input: {
    readonly objectKey: string;
    readonly body: Buffer;
    readonly contentType: string;
    readonly checksumSha256: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.environment.S3_BUCKET,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.length,
        ServerSideEncryption: 'AES256',
        Metadata: { state: 'generated', checksum: input.checksumSha256 },
      }),
    );
  }

  async headPrivateObject(objectKey: string): Promise<{
    readonly sizeBytes: number;
    readonly contentType?: string;
  }> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: objectKey }),
    );
    if (result.ContentLength === undefined)
      throw new Error('Object storage omitted content length.');
    return {
      sizeBytes: result.ContentLength,
      ...(result.ContentType ? { contentType: result.ContentType } : {}),
    };
  }
}
