import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  idempotencyKeySchema,
  paginationQuerySchema,
  updateNotificationPreferenceSchema,
  type UpdateNotificationPreference,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NotificationsService } from './notifications.service.js';

const uuidSchema = z.uuid();
const notificationPageQuerySchema = paginationQuerySchema.extend({ cursor: z.uuid().optional() });

@Controller('notifications')
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(notificationPageQuerySchema))
    query: { readonly cursor?: string; readonly limit: number },
  ) {
    const page = await this.notifications.listNotifications(access, query);
    return {
      data: page.notifications,
      page: { count: page.notifications.length, nextCursor: page.nextCursor },
      requestId: access.requestId,
    };
  }

  @Post(':notificationId/read')
  async read(
    @CurrentAccess() access: AccessContext,
    @Param('notificationId', new ZodValidationPipe(uuidSchema)) notificationId: string,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.notifications.markRead(access, notificationId, key),
      requestId: access.requestId,
    };
  }
}

@Controller('notification-preferences')
@UseGuards(SessionAuthGuard)
export class NotificationPreferencesController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentAccess() access: AccessContext) {
    return {
      data: await this.notifications.listPreferences(access),
      requestId: access.requestId,
    };
  }

  @Put()
  async update(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(updateNotificationPreferenceSchema))
    body: UpdateNotificationPreference,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.notifications.updatePreference(access, body, key),
      requestId: access.requestId,
    };
  }
}
