import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@dental-trust/database';

import {
  authorizeCaseAction,
  hasPermission,
  requiresMfa,
  type AccessContext,
} from '@dental-trust/auth';
import type { ClinicSignedUploadRequest, SignedUploadRequest } from '@dental-trust/contracts';
import type { ServerEnvironment } from '@dental-trust/config/server';
import { CaseRepository } from '@dental-trust/database';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';
import { RateLimitExceededException } from '../common/rate-limit.exception.js';
import { PrivateObjectStorageProvider } from '../infrastructure/providers/private-object-storage.provider.js';
import {
  readUploadQuotaPolicy,
  uploadQuotaViolation,
  type UploadQuotaPolicy,
} from './upload-quota.policy.js';

@Injectable()
export class FilesService {
  private readonly cases: CaseRepository;
  private readonly storage: PrivateObjectStorageProvider;
  private readonly uploadQuotaPolicy: UploadQuotaPolicy;

  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(SERVER_ENV) environment: ServerEnvironment,
  ) {
    this.cases = new CaseRepository(db);
    this.storage = new PrivateObjectStorageProvider(environment);
    this.uploadQuotaPolicy = readUploadQuotaPolicy();
  }

  async initiate(access: AccessContext, input: SignedUploadRequest) {
    const decision = await this.authorize(access, input.caseId, 'UPLOAD_DOCUMENTS');
    const extension = input.fileName.split('.').at(-1) ?? '';
    const upload = await this.storage.createQuarantinedUpload({
      ownerUserId: access.userId,
      detectedExtension: extension,
      contentType: input.declaredMediaType,
      sizeBytes: input.sizeBytes,
    });
    const asset = await this.db.$transaction(async (transaction) => {
      await this.assertUploadQuota(transaction, access.userId, input.sizeBytes);
      const created = await transaction.fileAsset.create({
        data: {
          ownerUserId: access.userId,
          objectKey: upload.objectKey,
          originalFileName: input.fileName,
          declaredMediaType: input.declaredMediaType,
          sizeBytes: BigInt(input.sizeBytes),
          status: 'QUARANTINED',
          scanStatus: 'PENDING',
          documents: {
            create: { caseId: input.caseId, category: input.category },
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: access.userId,
          ...(decision.organizationId ? { organizationId: decision.organizationId } : {}),
          action: 'file.upload-initiated',
          resourceType: 'FileAsset',
          resourceId: created.id,
          requestId: access.requestId,
          success: true,
          afterMetadata: { caseId: input.caseId, category: input.category, status: created.status },
        },
      });
      return created;
    });
    return {
      fileAssetId: asset.id,
      uploadUrl: upload.signedUrl,
      expiresAt: upload.expiresAt.toISOString(),
      requiredHeaders: {
        'content-type': input.declaredMediaType,
        'x-amz-tagging': 'state=quarantined',
      },
    };
  }

  async initiateClinic(access: AccessContext, input: ClinicSignedUploadRequest) {
    const clinic = await this.authorizeClinicFiles(access);
    const extension = input.fileName.split('.').at(-1) ?? '';
    const upload = await this.storage.createQuarantinedUpload({
      ownerUserId: access.userId,
      detectedExtension: extension,
      contentType: input.declaredMediaType,
      sizeBytes: input.sizeBytes,
    });
    const asset = await this.db.$transaction(async (transaction) => {
      await this.assertUploadQuota(transaction, access.userId, input.sizeBytes);
      const created = await transaction.fileAsset.create({
        data: {
          ownerUserId: access.userId,
          objectKey: upload.objectKey,
          originalFileName: input.fileName,
          declaredMediaType: input.declaredMediaType,
          sizeBytes: BigInt(input.sizeBytes),
          status: 'QUARANTINED',
          scanStatus: 'PENDING',
        },
      });
      await transaction.clinicFileAsset.create({
        data: { fileAssetId: created.id, clinicId: clinic.id, category: input.category },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: access.userId,
          organizationId: clinic.organizationId,
          action: 'clinic-file.upload-initiated',
          resourceType: 'FileAsset',
          resourceId: created.id,
          requestId: access.requestId,
          success: true,
          afterMetadata: { clinicId: clinic.id, category: input.category, status: created.status },
        },
      });
      return created;
    });
    return {
      fileAssetId: asset.id,
      uploadUrl: upload.signedUrl,
      expiresAt: upload.expiresAt.toISOString(),
      requiredHeaders: {
        'content-type': input.declaredMediaType,
        'x-amz-tagging': 'state=quarantined',
      },
    };
  }

  async finalizeClinic(access: AccessContext, fileAssetId: string) {
    const clinic = await this.authorizeClinicFiles(access);
    const clinicFile = await this.db.clinicFileAsset.findFirst({
      where: { fileAssetId, clinicId: clinic.id },
      select: { fileAssetId: true },
    });
    const asset = await this.db.fileAsset.findFirst({
      where: { id: fileAssetId, ownerUserId: access.userId },
    });
    if (!clinicFile || !asset) throw new NotFoundException();
    if (asset.status === 'AVAILABLE' || asset.status === 'SCANNING') {
      return { fileAssetId, status: asset.status, scanStatus: asset.scanStatus };
    }
    if (asset.status !== 'QUARANTINED') throw new ConflictException();
    const object = await this.storage.headPrivateObject(asset.objectKey);
    if (BigInt(object.sizeBytes) !== asset.sizeBytes) {
      await this.db.fileAsset.update({
        where: { id: fileAssetId },
        data: { status: 'REJECTED', scanStatus: 'ERROR' },
      });
      throw new ConflictException('Uploaded object size does not match the declared size.');
    }
    await this.db.$transaction(async (transaction) => {
      const changed = await transaction.fileAsset.updateMany({
        where: { id: fileAssetId, status: 'QUARANTINED', scanStatus: 'PENDING' },
        data: { status: 'SCANNING' },
      });
      if (!changed.count) return;
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'FileAsset',
          aggregateId: fileAssetId,
          eventType: 'file.scan-requested',
          payload: { fileAssetId },
          correlationId: access.requestId,
          idempotencyKey: `file.scan-requested:${fileAssetId}`,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: access.userId,
          organizationId: clinic.organizationId,
          action: 'clinic-file.upload-finalized',
          resourceType: 'FileAsset',
          resourceId: fileAssetId,
          requestId: access.requestId,
          success: true,
          afterMetadata: { clinicId: clinic.id, status: 'SCANNING' },
        },
      });
    });
    return { fileAssetId, status: 'SCANNING', scanStatus: 'PENDING' };
  }

  async clinicStatus(access: AccessContext, fileAssetId: string) {
    const clinic = await this.authorizeClinicFiles(access);
    const [clinicFile, asset] = await Promise.all([
      this.db.clinicFileAsset.findFirst({
        where: { fileAssetId, clinicId: clinic.id },
        select: { fileAssetId: true },
      }),
      this.db.fileAsset.findUnique({ where: { id: fileAssetId } }),
    ]);
    if (!clinicFile || !asset) throw new NotFoundException();
    return {
      fileAssetId,
      status: asset.status,
      scanStatus: asset.scanStatus,
      detectedMediaType: asset.detectedMediaType,
      originalFileName: asset.originalFileName,
      sizeBytes: asset.sizeBytes.toString(),
    };
  }

  async clinicDownload(access: AccessContext, fileAssetId: string) {
    const clinic = await this.authorizeClinicFiles(access);
    const [clinicFile, asset] = await Promise.all([
      this.db.clinicFileAsset.findFirst({
        where: { fileAssetId, clinicId: clinic.id },
        select: { fileAssetId: true },
      }),
      this.db.fileAsset.findUnique({ where: { id: fileAssetId } }),
    ]);
    if (!clinicFile || !asset) throw new NotFoundException();
    if (asset.status !== 'AVAILABLE' || asset.scanStatus !== 'CLEAN') {
      throw new ConflictException('The file is not available for download.');
    }
    const download = await this.storage.createPrivateDownload(asset.objectKey);
    await this.db.auditLog.create({
      data: {
        actorUserId: access.userId,
        organizationId: clinic.organizationId,
        action: 'clinic-file.download-authorized',
        resourceType: 'FileAsset',
        resourceId: fileAssetId,
        requestId: access.requestId,
        success: true,
        afterMetadata: { clinicId: clinic.id },
      },
    });
    return {
      fileAssetId,
      downloadUrl: download.signedUrl,
      expiresAt: download.expiresAt.toISOString(),
      mediaType: asset.detectedMediaType,
    };
  }

  async finalize(access: AccessContext, caseId: string, fileAssetId: string) {
    const decision = await this.authorize(access, caseId, 'UPLOAD_DOCUMENTS');
    const document = await this.db.caseDocument.findFirst({
      where: { caseId, fileAssetId },
      include: { fileAsset: true },
    });
    if (!document || document.fileAsset.ownerUserId !== access.userId)
      throw new NotFoundException();
    if (document.fileAsset.status === 'AVAILABLE' || document.fileAsset.status === 'SCANNING') {
      return {
        fileAssetId,
        status: document.fileAsset.status,
        scanStatus: document.fileAsset.scanStatus,
      };
    }
    if (document.fileAsset.status !== 'QUARANTINED') throw new ConflictException();

    const object = await this.storage.headPrivateObject(document.fileAsset.objectKey);
    if (BigInt(object.sizeBytes) !== document.fileAsset.sizeBytes) {
      await this.db.fileAsset.update({
        where: { id: fileAssetId },
        data: { status: 'REJECTED', scanStatus: 'ERROR' },
      });
      throw new ConflictException('Uploaded object size does not match the declared size.');
    }

    await this.db.$transaction(async (transaction) => {
      const changed = await transaction.fileAsset.updateMany({
        where: { id: fileAssetId, status: 'QUARANTINED', scanStatus: 'PENDING' },
        data: { status: 'SCANNING' },
      });
      if (changed.count === 0) return;
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'FileAsset',
          aggregateId: fileAssetId,
          eventType: 'file.scan-requested',
          payload: { fileAssetId },
          correlationId: access.requestId,
          idempotencyKey: `file.scan-requested:${fileAssetId}`,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: access.userId,
          ...(decision.organizationId ? { organizationId: decision.organizationId } : {}),
          action: 'file.upload-finalized',
          resourceType: 'FileAsset',
          resourceId: fileAssetId,
          requestId: access.requestId,
          success: true,
          afterMetadata: { caseId, status: 'SCANNING' },
        },
      });
    });
    return { fileAssetId, status: 'SCANNING', scanStatus: 'PENDING' };
  }

  async download(access: AccessContext, caseId: string, fileAssetId: string) {
    const decision = await this.authorize(access, caseId, 'READ_DOCUMENTS');
    const document = await this.db.caseDocument.findFirst({
      where: { caseId, fileAssetId },
      include: { fileAsset: true },
    });
    if (!document) throw new NotFoundException();
    if (document.fileAsset.status !== 'AVAILABLE' || document.fileAsset.scanStatus !== 'CLEAN') {
      throw new ConflictException('The file is not available for download.');
    }
    const download = await this.storage.createPrivateDownload(document.fileAsset.objectKey);
    await this.db.auditLog.create({
      data: {
        actorUserId: access.userId,
        ...(decision.organizationId ? { organizationId: decision.organizationId } : {}),
        action: 'file.download-authorized',
        resourceType: 'FileAsset',
        resourceId: fileAssetId,
        requestId: access.requestId,
        success: true,
        afterMetadata: { caseId },
      },
    });
    return {
      fileAssetId,
      downloadUrl: download.signedUrl,
      expiresAt: download.expiresAt.toISOString(),
      mediaType: document.fileAsset.detectedMediaType,
    };
  }

  async status(access: AccessContext, caseId: string, fileAssetId: string) {
    await this.authorize(access, caseId, 'READ_DOCUMENTS');
    const document = await this.db.caseDocument.findFirst({
      where: { caseId, fileAssetId },
      include: { fileAsset: true },
    });
    if (!document) throw new NotFoundException();
    return {
      fileAssetId,
      status: document.fileAsset.status,
      scanStatus: document.fileAsset.scanStatus,
      detectedMediaType: document.fileAsset.detectedMediaType,
      originalFileName: document.fileAsset.originalFileName,
      sizeBytes: document.fileAsset.sizeBytes.toString(),
    };
  }

  private async authorize(
    access: AccessContext,
    caseId: string,
    action: 'UPLOAD_DOCUMENTS' | 'READ_DOCUMENTS',
  ) {
    const scoped = await this.cases.findScoped(
      {
        userId: access.userId,
        organizationIds: access.memberships.map(({ organizationId }) => organizationId),
        includeAll: hasPermission(access, 'case:read:any'),
      },
      caseId,
    );
    if (!scoped) throw new NotFoundException();
    const resource = await this.cases.loadAccessResource(caseId);
    if (!resource) throw new NotFoundException();
    const decision = authorizeCaseAction(access, resource, action);
    if (!decision.allowed) throw new ForbiddenException();
    return decision;
  }

  private async authorizeClinicFiles(access: AccessContext) {
    if (
      access.impersonation ||
      requiresMfa(access) ||
      !access.selectedOrganizationId ||
      !hasPermission(access, 'clinic:manage:onboarding')
    ) {
      throw new ForbiddenException();
    }
    const clinic = await this.db.clinic.findFirst({
      where: {
        organizationId: access.selectedOrganizationId,
        deletedAt: null,
        organization: {
          deletedAt: null,
          memberships: {
            some: { userId: access.userId, status: 'ACTIVE', role: { code: 'CLINIC_ADMIN' } },
          },
        },
      },
      select: { id: true, organizationId: true },
    });
    if (!clinic) throw new NotFoundException();
    return clinic;
  }

  private async assertUploadQuota(
    transaction: Prisma.TransactionClient,
    userId: string,
    requestedBytes: number,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    const now = Date.now();
    const objectKeyPrefix = `quarantine/${userId}/`;
    const activeQuarantineCutoff = new Date(
      now - this.uploadQuotaPolicy.activeQuarantineSeconds * 1_000,
    );
    const recentCutoff = new Date(now - this.uploadQuotaPolicy.windowSeconds * 1_000);
    const activeUploads = await transaction.fileAsset.count({
      where: {
        ownerUserId: userId,
        objectKey: { startsWith: objectKeyPrefix },
        deletedAt: null,
        OR: [
          { status: 'SCANNING' },
          { status: 'QUARANTINED', createdAt: { gte: activeQuarantineCutoff } },
        ],
      },
    });
    const recent = await transaction.fileAsset.aggregate({
      where: {
        ownerUserId: userId,
        objectKey: { startsWith: objectKeyPrefix },
        createdAt: { gte: recentCutoff },
      },
      _sum: { sizeBytes: true },
    });
    const violation = uploadQuotaViolation(
      {
        activeUploads,
        recentBytes: recent._sum.sizeBytes ?? 0n,
        requestedBytes,
      },
      this.uploadQuotaPolicy,
    );
    if (!violation) return;
    throw new RateLimitExceededException(
      'UPLOAD_QUOTA_EXCEEDED',
      violation === 'ACTIVE_UPLOADS'
        ? this.uploadQuotaPolicy.activeQuarantineSeconds
        : this.uploadQuotaPolicy.windowSeconds,
      violation,
    );
  }
}
