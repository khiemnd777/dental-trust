import { createHash } from 'node:crypto';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';

import type { ServerEnvironment } from '@dental-trust/config/server';

const PART_BYTES = 8 * 1024 * 1024;

export class MultipartPrivateObjectStorage {
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

  async uploadArchive(input: {
    readonly objectKey: string;
    readonly body: AsyncIterable<Uint8Array>;
    readonly manifestChecksumSha256: string;
    readonly maximumBytes: number;
  }): Promise<{ readonly checksumSha256: string; readonly sizeBytes: bigint }> {
    const created = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.environment.S3_BUCKET,
        Key: input.objectKey,
        ContentType: 'application/zip',
        ServerSideEncryption: 'AES256',
        ChecksumAlgorithm: 'SHA256',
        Metadata: {
          state: 'generated-privacy-export',
          manifest: input.manifestChecksumSha256,
        },
      }),
    );
    if (!created.UploadId) throw new Error('PRIVACY_MULTIPART_UPLOAD_ID_MISSING');
    const uploadId = created.UploadId;
    const completedParts: { ETag: string; PartNumber: number; ChecksumSHA256: string }[] = [];
    const archiveDigest = createHash('sha256');
    let totalBytes = 0;
    let pending = Buffer.alloc(0);
    let partNumber = 1;
    let completed = false;
    try {
      for await (const rawChunk of input.body) {
        const chunk = Buffer.from(rawChunk);
        totalBytes += chunk.length;
        if (!Number.isSafeInteger(totalBytes) || totalBytes > input.maximumBytes) {
          throw new Error('PRIVACY_EXPORT_SIZE_LIMIT_EXCEEDED');
        }
        archiveDigest.update(chunk);
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
        while (pending.length >= PART_BYTES) {
          const part = pending.subarray(0, PART_BYTES);
          pending = Buffer.from(pending.subarray(PART_BYTES));
          completedParts.push(await this.uploadPart(input.objectKey, uploadId, partNumber, part));
          partNumber += 1;
        }
      }
      if (pending.length > 0 || completedParts.length === 0) {
        completedParts.push(await this.uploadPart(input.objectKey, uploadId, partNumber, pending));
      }
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.environment.S3_BUCKET,
          Key: input.objectKey,
          UploadId: uploadId,
          MultipartUpload: { Parts: completedParts },
        }),
      );
      completed = true;
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: input.objectKey }),
      );
      if (head.ContentLength !== totalBytes) {
        await this.deleteObject(input.objectKey);
        throw new Error('PRIVACY_EXPORT_OBJECT_SIZE_MISMATCH');
      }
      return {
        checksumSha256: archiveDigest.digest('hex'),
        sizeBytes: BigInt(totalBytes),
      };
    } catch (error) {
      if (!completed) {
        await this.client
          .send(
            new AbortMultipartUploadCommand({
              Bucket: this.environment.S3_BUCKET,
              Key: input.objectKey,
              UploadId: uploadId,
            }),
          )
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async objectBody(objectKey: string): Promise<AsyncIterable<Uint8Array>> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: objectKey }),
    );
    if (!object.Body || !(Symbol.asyncIterator in object.Body)) {
      throw new Error('PRIVACY_EXPORT_SOURCE_BODY_MISSING');
    }
    return object.Body as AsyncIterable<Uint8Array>;
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: objectKey }),
    );
  }

  private async uploadPart(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<{ ETag: string; PartNumber: number; ChecksumSHA256: string }> {
    const checksum = createHash('sha256').update(body).digest('base64');
    const uploaded = await this.client.send(
      new UploadPartCommand({
        Bucket: this.environment.S3_BUCKET,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: body.length,
        ChecksumSHA256: checksum,
      }),
    );
    if (!uploaded.ETag) throw new Error('PRIVACY_MULTIPART_ETAG_MISSING');
    if (uploaded.ChecksumSHA256 && uploaded.ChecksumSHA256 !== checksum) {
      throw new Error('PRIVACY_MULTIPART_CHECKSUM_MISMATCH');
    }
    return { ETag: uploaded.ETag, PartNumber: partNumber, ChecksumSHA256: checksum };
  }
}
