import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { AccessContext } from '@dental-trust/auth';
import type {
  AdminAuditQuery,
  AdminNotificationQuery,
  AdminNotificationRetryCommand,
  AdminOutboxQuery,
  AdminRetryCommand,
  AdminWebhookQuery,
} from '@dental-trust/contracts';
import { AdminOperationsRepository, type PrismaClient } from '@dental-trust/database';

import { PRISMA } from '../common/tokens.js';
import { assertAdministrator, assertDangerousOperation } from './admin.policy.js';

@Injectable()
export class AdminOperationsService {
  private readonly operations: AdminOperationsRepository;

  constructor(@Inject(PRISMA) database: PrismaClient) {
    this.operations = new AdminOperationsRepository(database);
  }

  summary(access: AccessContext) {
    assertAdministrator(access);
    return this.operations.summary();
  }

  auditLogs(access: AccessContext, query: AdminAuditQuery) {
    assertAdministrator(access);
    return this.operations.auditLogs({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
    });
  }

  outboxJobs(access: AccessContext, query: AdminOutboxQuery) {
    assertAdministrator(access);
    return this.operations.outboxJobs({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  notificationJobs(access: AccessContext, query: AdminNotificationQuery) {
    assertAdministrator(access);
    return this.operations.notificationJobs({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  webhooks(access: AccessContext, query: AdminWebhookQuery) {
    assertAdministrator(access);
    return this.operations.webhooks({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
    });
  }

  async retryOutbox(
    access: AccessContext,
    eventId: string,
    input: AdminRetryCommand,
    idempotencyKey: string,
  ) {
    assertDangerousOperation(access);
    const result = await this.operations.retryOutbox(
      actorFrom(access),
      eventId,
      input.expectedAttemptCount,
      input.reason,
      idempotencyKey,
    );
    if (!result) throw new NotFoundException();
    if (result.conflict) throw new ConflictException();
    return result;
  }

  async retryNotification(
    access: AccessContext,
    notificationId: string,
    input: AdminNotificationRetryCommand,
    idempotencyKey: string,
  ) {
    assertDangerousOperation(access);
    const result = await this.operations.retryNotification(
      actorFrom(access),
      notificationId,
      input.reason,
      idempotencyKey,
    );
    if (!result) throw new NotFoundException();
    if (result.conflict) throw new ConflictException();
    return result;
  }
}

function actorFrom(access: AccessContext) {
  return {
    userId: access.userId,
    requestId: access.requestId,
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}
