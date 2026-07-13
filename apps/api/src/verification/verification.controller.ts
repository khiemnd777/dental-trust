import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  addVerificationEvidenceSchema,
  type AddVerificationEvidence,
  assignVerificationCaseSchema,
  type AssignVerificationCase,
  completeSiteAuditSchema,
  type CompleteSiteAudit,
  createCorrectiveActionSchema,
  type CreateCorrectiveAction,
  createSiteAuditSchema,
  type CreateSiteAudit,
  createVerificationCaseSchema,
  type CreateVerificationCase,
  decideCorrectiveActionSchema,
  type DecideCorrectiveAction,
  decideVerificationCaseSchema,
  type DecideVerificationCase,
  idempotencyKeySchema,
  respondCorrectiveActionSchema,
  type RespondCorrectiveAction,
  reviewVerificationEvidenceSchema,
  type ReviewVerificationEvidence,
  secondApprovalSchema,
  type SecondApproval,
  submitVerificationCaseSchema,
  type SubmitVerificationCase,
  verificationCaseListQuerySchema,
  type VerificationCaseListQuery,
  verificationSubjectTypeSchema,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { VerificationService } from './verification.service.js';

const uuidParameterSchema = z.uuid();
const templateQuerySchema = z.object({ subjectType: verificationSubjectTypeSchema.optional() });

@Controller('verification')
@UseGuards(SessionAuthGuard)
export class VerificationController {
  constructor(@Inject(VerificationService) private readonly verification: VerificationService) {}

  @Get('templates')
  async listTemplates(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(templateQuerySchema))
    query: z.infer<typeof templateQuerySchema>,
  ) {
    return {
      data: await this.verification.listTemplates(access, query.subjectType),
      requestId: access.requestId,
    };
  }

  @Get('cases')
  async listCases(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(verificationCaseListQuerySchema))
    query: VerificationCaseListQuery,
  ) {
    const page = await this.verification.listCases(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Post('cases')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createCase(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createVerificationCaseSchema)) body: CreateVerificationCase,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.createCase(access, body, idempotencyKey(rawIdempotencyKey)),
      requestId: access.requestId,
    };
  }

  @Get('cases/:caseId')
  async getCase(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
  ) {
    return { data: await this.verification.getCase(access, caseId), requestId: access.requestId };
  }

  @Get('cases/:caseId/evidence/:evidenceId/access')
  async accessEvidence(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Param('evidenceId', new ZodValidationPipe(uuidParameterSchema)) evidenceId: string,
  ) {
    return {
      data: await this.verification.accessEvidence(access, caseId, evidenceId),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/assign')
  async assignCase(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(assignVerificationCaseSchema)) body: AssignVerificationCase,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.assignCase(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/evidence')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async addEvidence(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(addVerificationEvidenceSchema)) body: AddVerificationEvidence,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.addEvidence(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/submit')
  async submitCase(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(submitVerificationCaseSchema)) body: SubmitVerificationCase,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.submitCase(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/evidence/:evidenceId/review')
  async reviewEvidence(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Param('evidenceId', new ZodValidationPipe(uuidParameterSchema)) evidenceId: string,
    @Body(new ZodValidationPipe(reviewVerificationEvidenceSchema))
    body: ReviewVerificationEvidence,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.reviewEvidence(
        access,
        caseId,
        evidenceId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/decisions')
  async decideCase(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(decideVerificationCaseSchema)) body: DecideVerificationCase,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.decideCase(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('reviews/:reviewId/second-approval')
  async secondApprove(
    @CurrentAccess() access: AccessContext,
    @Param('reviewId', new ZodValidationPipe(uuidParameterSchema)) reviewId: string,
    @Body(new ZodValidationPipe(secondApprovalSchema)) body: SecondApproval,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.secondApprove(
        access,
        reviewId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/site-audits')
  async createSiteAudit(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(createSiteAuditSchema)) body: CreateSiteAudit,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.createSiteAudit(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('site-audits/:siteAuditId/complete')
  async completeSiteAudit(
    @CurrentAccess() access: AccessContext,
    @Param('siteAuditId', new ZodValidationPipe(uuidParameterSchema)) siteAuditId: string,
    @Body(new ZodValidationPipe(completeSiteAuditSchema)) body: CompleteSiteAudit,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.completeSiteAudit(
        access,
        siteAuditId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Get('site-audits/:siteAuditId')
  async getSiteAuditCase(
    @CurrentAccess() access: AccessContext,
    @Param('siteAuditId', new ZodValidationPipe(uuidParameterSchema)) siteAuditId: string,
  ) {
    return {
      data: await this.verification.getSiteAuditCase(access, siteAuditId),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/corrective-actions')
  async createCorrectiveAction(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(createCorrectiveActionSchema)) body: CreateCorrectiveAction,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.createCorrectiveAction(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('corrective-actions/:actionId/respond')
  async respondCorrectiveAction(
    @CurrentAccess() access: AccessContext,
    @Param('actionId', new ZodValidationPipe(uuidParameterSchema)) actionId: string,
    @Body(new ZodValidationPipe(respondCorrectiveActionSchema)) body: RespondCorrectiveAction,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.respondCorrectiveAction(
        access,
        actionId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Get('corrective-actions/:actionId')
  async getCorrectiveActionCase(
    @CurrentAccess() access: AccessContext,
    @Param('actionId', new ZodValidationPipe(uuidParameterSchema)) actionId: string,
  ) {
    return {
      data: await this.verification.getCorrectiveActionCase(access, actionId),
      requestId: access.requestId,
    };
  }

  @Post('corrective-actions/:actionId/decision')
  async decideCorrectiveAction(
    @CurrentAccess() access: AccessContext,
    @Param('actionId', new ZodValidationPipe(uuidParameterSchema)) actionId: string,
    @Body(new ZodValidationPipe(decideCorrectiveActionSchema)) body: DecideCorrectiveAction,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.verification.decideCorrectiveAction(
        access,
        actionId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }
}

function idempotencyKey(value: string | undefined): string {
  return parseWithSchema(idempotencyKeySchema, value);
}
