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
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import { parseWithSchema } from '@dental-trust/validation';
import {
  caseListQuerySchema,
  type CaseListQuery,
  createCaseRequestSchema,
  type CreateCaseRequest,
  transitionCaseRequestSchema,
  idempotencyKeySchema,
  type TransitionCaseRequest,
} from '@dental-trust/contracts';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CasesService } from './cases.service.js';

const uuidParameterSchema = z.uuid();

@Controller('cases')
@UseGuards(SessionAuthGuard)
export class CasesController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @Post()
  async create(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createCaseRequestSchema)) body: CreateCaseRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ): Promise<Readonly<Record<string, unknown>>> {
    const idempotencyKey = parseWithSchema(idempotencyKeySchema, rawIdempotencyKey);
    return {
      data: await this.cases.create(access, body, idempotencyKey),
      requestId: access.requestId,
    };
  }

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(caseListQuerySchema)) query: CaseListQuery,
  ): Promise<Readonly<Record<string, unknown>>> {
    const page = await this.cases.list(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Get(':caseId')
  async get(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
  ): Promise<Readonly<Record<string, unknown>>> {
    return { data: await this.cases.get(access, caseId), requestId: access.requestId };
  }

  @Post(':caseId/transitions')
  async transition(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(transitionCaseRequestSchema)) body: TransitionCaseRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ): Promise<Readonly<Record<string, unknown>>> {
    const idempotencyKey = parseWithSchema(idempotencyKeySchema, rawIdempotencyKey);
    return {
      data: await this.cases.transition(access, caseId, body, idempotencyKey),
      requestId: access.requestId,
    };
  }
}
