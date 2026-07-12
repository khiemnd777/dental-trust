import { Body, Controller, Get, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  aftercareCheckInRequestSchema,
  caregiverGrantRequestSchema,
  idempotencyKeySchema,
  treatmentPlanAcceptRequestSchema,
  treatmentPlanDraftRequestSchema,
  treatmentPlanPublishRequestSchema,
  type AftercareCheckInRequest,
  type CaregiverGrantRequest,
  type TreatmentPlanAcceptRequest,
  type TreatmentPlanDraftRequest,
  type TreatmentPlanPublishRequest,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ClinicalService } from './clinical.service.js';

const uuidSchema = z.uuid();

@Controller('cases/:caseId/caregivers')
@UseGuards(SessionAuthGuard)
export class CaregiversController {
  constructor(@Inject(ClinicalService) private readonly clinical: ClinicalService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return {
      data: { caregivers: await this.clinical.listCaregivers(access, caseId) },
      requestId: access.requestId,
    };
  }

  @Post()
  async invite(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(caregiverGrantRequestSchema)) body: CaregiverGrantRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.clinical.inviteCaregiver(access, caseId, body, key),
      requestId: access.requestId,
    };
  }

  @Post(':grantId/revoke')
  async revoke(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('grantId', new ZodValidationPipe(uuidSchema)) grantId: string,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.clinical.revokeCaregiver(access, caseId, grantId, key),
      requestId: access.requestId,
    };
  }
}

@Controller('cases/:caseId/treatment-plans')
@UseGuards(SessionAuthGuard)
export class TreatmentPlansController {
  constructor(@Inject(ClinicalService) private readonly clinical: ClinicalService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return {
      data: await this.clinical.listTreatmentPlans(access, caseId),
      requestId: access.requestId,
    };
  }

  @Get(':versionId')
  async detail(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidSchema)) versionId: string,
  ) {
    return {
      data: await this.clinical.getTreatmentPlan(access, caseId, versionId),
      requestId: access.requestId,
    };
  }

  @Post('drafts')
  async draft(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(treatmentPlanDraftRequestSchema)) body: TreatmentPlanDraftRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.clinical.createTreatmentPlanDraft(access, caseId, body, key),
      requestId: access.requestId,
    };
  }

  @Post(':versionId/publish')
  async publish(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidSchema)) versionId: string,
    @Body(new ZodValidationPipe(treatmentPlanPublishRequestSchema))
    body: TreatmentPlanPublishRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.clinical.publishTreatmentPlan(access, caseId, versionId, body, key),
      requestId: access.requestId,
    };
  }

  @Post(':versionId/accept')
  async accept(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidSchema)) versionId: string,
    @Body(new ZodValidationPipe(treatmentPlanAcceptRequestSchema)) body: TreatmentPlanAcceptRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.clinical.acceptTreatmentPlan(access, caseId, versionId, body, key),
      requestId: access.requestId,
    };
  }
}

@Controller('cases/:caseId/aftercare')
@UseGuards(SessionAuthGuard)
export class AftercareController {
  constructor(@Inject(ClinicalService) private readonly clinical: ClinicalService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return {
      data: { aftercarePlans: await this.clinical.listAftercare(access, caseId) },
      requestId: access.requestId,
    };
  }

  @Post('check-ins')
  async checkIn(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(aftercareCheckInRequestSchema)) body: AftercareCheckInRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.clinical.submitAftercareCheckIn(access, caseId, body, key),
      requestId: access.requestId,
    };
  }
}

@Controller('cases/:caseId/documents')
@UseGuards(SessionAuthGuard)
export class CaseDocumentsController {
  constructor(@Inject(ClinicalService) private readonly clinical: ClinicalService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return {
      data: { files: await this.clinical.listDocuments(access, caseId) },
      requestId: access.requestId,
    };
  }
}
