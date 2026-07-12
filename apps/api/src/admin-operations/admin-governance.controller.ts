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

import type { AccessContext } from '@dental-trust/auth';
import {
  adminGovernanceCommandEnvelopeSchema,
  adminGovernanceQuerySchema,
  adminGovernanceViewSchema,
  idempotencyKeySchema,
  type AdminGovernanceCommandEnvelope,
  type AdminGovernanceView,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminGovernanceService } from './admin-governance.service.js';

@Controller('admin/governance')
@UseGuards(SessionAuthGuard)
export class AdminGovernanceController {
  constructor(
    @Inject(AdminGovernanceService) private readonly governance: AdminGovernanceService,
  ) {}

  @Get(':view')
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('view', new ZodValidationPipe(adminGovernanceViewSchema)) view: AdminGovernanceView,
    @Query(new ZodValidationPipe(adminGovernanceQuerySchema))
    query: { readonly cursor?: string; readonly limit: number },
  ) {
    const result = await this.governance.list(access, view, query);
    return {
      data: result.records,
      page: { count: result.records.length, nextCursor: result.nextCursor },
      requestId: access.requestId,
    };
  }

  @Post()
  async mutate(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(adminGovernanceCommandEnvelopeSchema))
    envelope: AdminGovernanceCommandEnvelope,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.governance.mutate(access, envelope, key),
      requestId: access.requestId,
    };
  }
}
