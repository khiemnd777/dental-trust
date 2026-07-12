import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import { once } from 'node:events';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fileTypeFromBuffer } from 'file-type';

import type { ServerEnvironment } from '@dental-trust/config/server';
import type { PrismaClient } from '@dental-trust/database';

const SNIFF_BYTES = 8_192;
const allowedMediaTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/dicom',
]);

export class FileScanProcessor {
  private readonly storage: S3Client;

  constructor(
    private readonly db: PrismaClient,
    private readonly environment: ServerEnvironment,
  ) {
    this.storage = new S3Client({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.S3_ACCESS_KEY,
        secretAccessKey: environment.S3_SECRET_KEY,
      },
    });
  }

  async process(fileAssetId: string): Promise<void> {
    const asset = await this.db.fileAsset.findUniqueOrThrow({ where: { id: fileAssetId } });
    if (asset.status === 'AVAILABLE' && asset.scanStatus === 'CLEAN') return;
    if (asset.status !== 'SCANNING') throw new Error('File asset is not in the scanning state.');

    const object = await this.storage.send(
      new GetObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: asset.objectKey }),
    );
    if (!object.Body || !(Symbol.asyncIterator in object.Body)) {
      throw new Error('Object storage did not return a streaming body.');
    }

    const result = await inspectAndScan(
      object.Body as AsyncIterable<Uint8Array>,
      this.environment.CLAMAV_HOST,
      this.environment.CLAMAV_PORT,
    );
    if (result.infected) {
      await this.db.fileAsset.update({
        where: { id: fileAssetId },
        data: {
          status: 'REJECTED',
          scanStatus: 'INFECTED',
          checksumSha256: result.checksumSha256,
          ...(result.mediaType ? { detectedMediaType: result.mediaType } : {}),
        },
      });
      return;
    }
    if (!result.mediaType || !isAllowedDetectedMediaType(result.mediaType)) {
      await this.db.fileAsset.update({
        where: { id: fileAssetId },
        data: {
          status: 'REJECTED',
          scanStatus: 'CLEAN',
          checksumSha256: result.checksumSha256,
          ...(result.mediaType ? { detectedMediaType: result.mediaType } : {}),
        },
      });
      return;
    }
    if (!declaredTypeMatches(asset.declaredMediaType, result.mediaType)) {
      await this.db.fileAsset.update({
        where: { id: fileAssetId },
        data: {
          status: 'REJECTED',
          scanStatus: 'CLEAN',
          checksumSha256: result.checksumSha256,
          detectedMediaType: result.mediaType,
        },
      });
      return;
    }
    await this.db.fileAsset.update({
      where: { id: fileAssetId },
      data: {
        status: 'AVAILABLE',
        scanStatus: 'CLEAN',
        checksumSha256: result.checksumSha256,
        detectedMediaType: result.mediaType,
      },
    });
  }
}

async function inspectAndScan(
  body: AsyncIterable<Uint8Array>,
  host: string,
  port: number,
): Promise<{
  readonly checksumSha256: string;
  readonly mediaType?: string;
  readonly infected: boolean;
}> {
  const socket = connect({ host, port });
  socket.setTimeout(30_000, () => socket.destroy(new Error('ClamAV scan timed out.')));
  await once(socket, 'connect');
  socket.write('zINSTREAM\0');

  const digest = createHash('sha256');
  const sniffChunks: Buffer[] = [];
  let sniffLength = 0;
  for await (const rawChunk of body) {
    const chunk = Buffer.from(rawChunk);
    digest.update(chunk);
    if (sniffLength < SNIFF_BYTES) {
      const remaining = SNIFF_BYTES - sniffLength;
      const sample = chunk.subarray(0, remaining);
      sniffChunks.push(sample);
      sniffLength += sample.length;
    }
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(chunk.length, 0);
    if (!socket.write(length)) await once(socket, 'drain');
    if (!socket.write(chunk)) await once(socket, 'drain');
  }
  socket.write(Buffer.alloc(4));
  const response = await readClamResponse(socket);
  socket.end();
  const header = Buffer.concat(sniffChunks);
  const detected = await fileTypeFromBuffer(header);
  const mediaType = detected?.mime ?? (isDicom(header) ? 'application/dicom' : undefined);
  if (!response.endsWith('OK')) {
    if (response.includes('FOUND')) {
      return {
        checksumSha256: digest.digest('hex'),
        ...(mediaType ? { mediaType } : {}),
        infected: true,
      };
    }
    throw new Error('ClamAV returned an indeterminate scan response.');
  }
  return {
    checksumSha256: digest.digest('hex'),
    ...(mediaType ? { mediaType } : {}),
    infected: false,
  };
}

async function readClamResponse(socket: ReturnType<typeof connect>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const rawChunk of socket) {
    const chunk = Buffer.from(rawChunk);
    chunks.push(chunk);
    if (chunk.includes(0)) break;
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\0+$/u, '').trim();
}

function isDicom(header: Buffer): boolean {
  return header.length >= 132 && header.subarray(128, 132).toString('ascii') === 'DICM';
}

function declaredTypeMatches(declared: string, detected: string): boolean {
  const normalized = declared.toLowerCase().split(';', 1)[0]?.trim();
  if (detected === 'application/dicom') {
    return normalized === 'application/dicom' || normalized === 'application/octet-stream';
  }
  return normalized === detected;
}

export function isAllowedDetectedMediaType(mediaType: string): boolean {
  return allowedMediaTypes.has(mediaType);
}
