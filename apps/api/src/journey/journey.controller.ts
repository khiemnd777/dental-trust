import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  idempotencyKeySchema,
  milestoneCompleteRequestSchema,
  passportDraftRequestSchema,
  passportShareRequestSchema,
  planChangeRequestSchema,
  shareTokenParameterSchema,
  treatmentInstructionRequestSchema,
  type MilestoneCompleteRequest,
  type PassportDraftRequest,
  type PassportShareRequest,
  type PlanChangeRequestInput,
  type TreatmentInstructionRequest,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { JourneyService } from './journey.service.js';

const uuidParameterSchema = z.uuid();
const passportQuerySchema = z.object({ versionId: z.uuid().optional() });

@Controller('cases/:caseId')
@UseGuards(SessionAuthGuard)
export class JourneyController {
  constructor(@Inject(JourneyService) private readonly journey: JourneyService) {}

  @Get('journey')
  async read(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
  ) {
    return { data: await this.journey.read(access, caseId), requestId: access.requestId };
  }

  @Post('journey/milestones/:milestoneId/complete')
  async completeMilestone(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Param('milestoneId', new ZodValidationPipe(uuidParameterSchema)) milestoneId: string,
    @Body(new ZodValidationPipe(milestoneCompleteRequestSchema)) body: MilestoneCompleteRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.journey.completeMilestone(
        access,
        caseId,
        milestoneId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('journey/instructions')
  async createInstruction(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(treatmentInstructionRequestSchema))
    body: TreatmentInstructionRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.journey.createInstruction(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('journey/changes')
  async createPlanChange(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(planChangeRequestSchema)) body: PlanChangeRequestInput,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.journey.createPlanChange(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('journey/changes/:changeId/acknowledge')
  async acknowledgePlanChange(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Param('changeId', new ZodValidationPipe(uuidParameterSchema)) changeId: string,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.journey.acknowledgePlanChange(
        access,
        caseId,
        changeId,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Get('passport')
  async getPassport(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Query(new ZodValidationPipe(passportQuerySchema)) query: z.infer<typeof passportQuerySchema>,
  ) {
    return {
      data: await this.journey.getPassport(access, caseId, query.versionId),
      requestId: access.requestId,
    };
  }

  @Post('passport/drafts')
  async createPassportDraft(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(passportDraftRequestSchema)) body: PassportDraftRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.journey.createPassportDraft(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('passport/versions/:versionId/publish')
  async publishPassport(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidParameterSchema)) versionId: string,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.journey.publishPassport(
        access,
        caseId,
        versionId,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Get('passport/versions/:versionId/download')
  async downloadPassport(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidParameterSchema)) versionId: string,
  ) {
    return {
      data: await this.journey.downloadPassport(access, caseId, versionId),
      requestId: access.requestId,
    };
  }

  @Post('passport/versions/:versionId/shares')
  async createShare(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidParameterSchema)) versionId: string,
    @Body(new ZodValidationPipe(passportShareRequestSchema)) body: PassportShareRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.journey.createShare(
        access,
        caseId,
        versionId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Delete('passport/shares/:shareId')
  async revokeShare(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Param('shareId', new ZodValidationPipe(uuidParameterSchema)) shareId: string,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.journey.revokeShare(
        access,
        caseId,
        shareId,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }
}

@Controller('passport-shares')
export class PassportShareController {
  constructor(@Inject(JourneyService) private readonly journey: JourneyService) {}

  @Get(':token')
  async access(
    @Param('token', new ZodValidationPipe(shareTokenParameterSchema)) token: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const download = await this.journey.accessShare(token, {
      ...(request.ip ? { ip: request.ip } : {}),
      ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    });
    response.redirect(302, download.signedUrl);
  }
}

function idempotencyKey(raw: string | undefined): string {
  return parseWithSchema(idempotencyKeySchema, raw);
}
