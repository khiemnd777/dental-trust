import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  emergencyContactUpdateSchema,
  consentLedgerQuerySchema,
  idempotencyKeySchema,
  intakeConsentQuerySchema,
  intakeDraftCreateSchema,
  intakeDraftUpdateSchema,
  intakeRevisionCreateSchema,
  intakeSubmitSchema,
  patientProfileUpdateSchema,
  withdrawConsentSchema,
  type ConsentLedgerQuery,
  type EmergencyContactUpdate,
  type IntakeConsentQuery,
  type IntakeDraftCreate,
  type IntakeDraftUpdate,
  type IntakeRevisionCreate,
  type IntakeSubmit,
  type PatientProfileUpdate,
  type WithdrawConsent,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { IntakeService } from './intake.service.js';

const uuidSchema = z.uuid();

@Controller()
@UseGuards(SessionAuthGuard)
export class IntakeController {
  constructor(@Inject(IntakeService) private readonly intake: IntakeService) {}

  @Get('patient/profile')
  async profile(@CurrentAccess() access: AccessContext) {
    return { data: await this.intake.profile(access), requestId: access.requestId };
  }

  @Put('patient/profile')
  async updateProfile(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(patientProfileUpdateSchema)) body: PatientProfileUpdate,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.intake.updateProfile(access, body, key),
      requestId: access.requestId,
    };
  }

  @Put('patient/emergency-contact')
  async updateEmergencyContact(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(emergencyContactUpdateSchema)) body: EmergencyContactUpdate,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.intake.updateEmergencyContact(access, body, key),
      requestId: access.requestId,
    };
  }

  @Get('patient/intake/consents')
  async consents(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(intakeConsentQuerySchema)) query: IntakeConsentQuery,
  ) {
    return {
      data: await this.intake.consentTexts(access, query.locale),
      requestId: access.requestId,
    };
  }

  @Get('patient/consents')
  async consentLedger(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(consentLedgerQuerySchema)) query: ConsentLedgerQuery,
  ) {
    const page = await this.intake.consentLedger(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Post('patient/consents/:consentRecordId/withdrawals')
  async withdrawConsent(
    @CurrentAccess() access: AccessContext,
    @Param('consentRecordId', new ZodValidationPipe(uuidSchema)) consentRecordId: string,
    @Body(new ZodValidationPipe(withdrawConsentSchema)) body: WithdrawConsent,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.intake.withdrawConsent(access, consentRecordId, body, key),
      requestId: access.requestId,
    };
  }

  @Get('cases/:caseId/intake')
  async questionnaire(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return { data: await this.intake.intake(access, caseId), requestId: access.requestId };
  }

  @Post('cases/:caseId/intake/drafts')
  async createDraft(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(intakeDraftCreateSchema)) body: IntakeDraftCreate,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.intake.createDraft(access, caseId, body, key),
      requestId: access.requestId,
    };
  }

  @Patch('cases/:caseId/intake/drafts/:versionId')
  async updateDraft(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidSchema)) versionId: string,
    @Body(new ZodValidationPipe(intakeDraftUpdateSchema)) body: IntakeDraftUpdate,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.intake.updateDraft(access, caseId, versionId, body, key),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/intake/drafts/:versionId/submit')
  async submit(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidSchema)) versionId: string,
    @Body(new ZodValidationPipe(intakeSubmitSchema)) body: IntakeSubmit,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.intake.submit(access, caseId, versionId, body, key),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/intake/versions/:versionId/revisions')
  async createRevision(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('versionId', new ZodValidationPipe(uuidSchema)) versionId: string,
    @Body(new ZodValidationPipe(intakeRevisionCreateSchema)) body: IntakeRevisionCreate,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.intake.createRevision(access, caseId, versionId, body, key),
      requestId: access.requestId,
    };
  }
}
