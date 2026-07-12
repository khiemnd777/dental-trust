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
import {
  adminAuditQuerySchema,
  adminNotificationQuerySchema,
  adminNotificationRetryCommandSchema,
  adminOutboxQuerySchema,
  adminRetryCommandSchema,
  adminWebhookQuerySchema,
  idempotencyKeySchema,
  type AdminAuditQuery,
  type AdminNotificationQuery,
  type AdminNotificationRetryCommand,
  type AdminOutboxQuery,
  type AdminRetryCommand,
  type AdminWebhookQuery,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminOperationsService } from './admin-operations.service.js';

const uuidSchema = z.uuid();

@Controller('admin/operations')
@UseGuards(SessionAuthGuard)
export class AdminOperationsController {
  constructor(
    @Inject(AdminOperationsService) private readonly operations: AdminOperationsService,
  ) {}

  @Get('summary')
  async summary(@CurrentAccess() access: AccessContext) {
    return { data: await this.operations.summary(access), requestId: access.requestId };
  }

  @Get('audit-logs')
  async auditLogs(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminAuditQuerySchema)) query: AdminAuditQuery,
  ) {
    return pageEnvelope(await this.operations.auditLogs(access, query), access.requestId);
  }

  @Get('jobs/outbox')
  async outboxJobs(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminOutboxQuerySchema)) query: AdminOutboxQuery,
  ) {
    return pageEnvelope(await this.operations.outboxJobs(access, query), access.requestId);
  }

  @Get('jobs/notifications')
  async notificationJobs(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminNotificationQuerySchema)) query: AdminNotificationQuery,
  ) {
    return pageEnvelope(await this.operations.notificationJobs(access, query), access.requestId);
  }

  @Get('webhooks')
  async webhooks(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminWebhookQuerySchema)) query: AdminWebhookQuery,
  ) {
    return pageEnvelope(await this.operations.webhooks(access, query), access.requestId);
  }

  @Post('jobs/outbox/:eventId/retry')
  async retryOutbox(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', new ZodValidationPipe(uuidSchema)) eventId: string,
    @Body(new ZodValidationPipe(adminRetryCommandSchema)) input: AdminRetryCommand,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.operations.retryOutbox(access, eventId, input, key),
      requestId: access.requestId,
    };
  }

  @Post('jobs/notifications/:notificationId/retry')
  async retryNotification(
    @CurrentAccess() access: AccessContext,
    @Param('notificationId', new ZodValidationPipe(uuidSchema)) notificationId: string,
    @Body(new ZodValidationPipe(adminNotificationRetryCommandSchema))
    input: AdminNotificationRetryCommand,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.operations.retryNotification(access, notificationId, input, key),
      requestId: access.requestId,
    };
  }
}

function pageEnvelope<T>(
  page: { readonly records: readonly T[]; readonly nextCursor: string | null },
  requestId: string,
) {
  return {
    data: page.records,
    page: { count: page.records.length, nextCursor: page.nextCursor },
    requestId,
  };
}
