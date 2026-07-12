import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  clinicSignedUploadRequestSchema,
  type ClinicSignedUploadRequest,
  fileDownloadQuerySchema,
  type FileDownloadQuery,
  finalizeUploadRequestSchema,
  type FinalizeUploadRequest,
  signedUploadRequestSchema,
  type SignedUploadRequest,
} from '@dental-trust/contracts';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FilesService } from './files.service.js';

const uuidSchema = z.uuid();

@Controller('files')
@UseGuards(SessionAuthGuard)
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Post('uploads')
  async initiate(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(signedUploadRequestSchema)) body: SignedUploadRequest,
  ) {
    return { data: await this.files.initiate(access, body), requestId: access.requestId };
  }

  @Post('clinic-uploads')
  async initiateClinicUpload(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(clinicSignedUploadRequestSchema)) body: ClinicSignedUploadRequest,
  ) {
    return { data: await this.files.initiateClinic(access, body), requestId: access.requestId };
  }

  @Post('clinic-uploads/:fileAssetId/finalize')
  async finalizeClinicUpload(
    @CurrentAccess() access: AccessContext,
    @Param('fileAssetId', new ZodValidationPipe(uuidSchema)) fileAssetId: string,
  ) {
    return {
      data: await this.files.finalizeClinic(access, fileAssetId),
      requestId: access.requestId,
    };
  }

  @Get('clinic-uploads/:fileAssetId/status')
  async clinicUploadStatus(
    @CurrentAccess() access: AccessContext,
    @Param('fileAssetId', new ZodValidationPipe(uuidSchema)) fileAssetId: string,
  ) {
    return {
      data: await this.files.clinicStatus(access, fileAssetId),
      requestId: access.requestId,
    };
  }

  @Get('clinic-uploads/:fileAssetId/download')
  async clinicDownload(
    @CurrentAccess() access: AccessContext,
    @Param('fileAssetId', new ZodValidationPipe(uuidSchema)) fileAssetId: string,
  ) {
    return {
      data: await this.files.clinicDownload(access, fileAssetId),
      requestId: access.requestId,
    };
  }

  @Post(':fileAssetId/finalize')
  async finalize(
    @CurrentAccess() access: AccessContext,
    @Param('fileAssetId', new ZodValidationPipe(uuidSchema)) fileAssetId: string,
    @Body(new ZodValidationPipe(finalizeUploadRequestSchema)) body: FinalizeUploadRequest,
  ) {
    return {
      data: await this.files.finalize(access, body.caseId, fileAssetId),
      requestId: access.requestId,
    };
  }

  @Get(':fileAssetId/download')
  async download(
    @CurrentAccess() access: AccessContext,
    @Param('fileAssetId', new ZodValidationPipe(uuidSchema)) fileAssetId: string,
    @Query(new ZodValidationPipe(fileDownloadQuerySchema)) query: FileDownloadQuery,
  ) {
    return {
      data: await this.files.download(access, query.caseId, fileAssetId),
      requestId: access.requestId,
    };
  }

  @Get(':fileAssetId/status')
  async status(
    @CurrentAccess() access: AccessContext,
    @Param('fileAssetId', new ZodValidationPipe(uuidSchema)) fileAssetId: string,
    @Query(new ZodValidationPipe(fileDownloadQuerySchema)) query: FileDownloadQuery,
  ) {
    return {
      data: await this.files.status(access, query.caseId, fileAssetId),
      requestId: access.requestId,
    };
  }
}
