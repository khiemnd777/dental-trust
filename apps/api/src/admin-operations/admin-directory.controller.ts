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
  adminAccountStatusCommandSchema,
  adminCaseDirectoryQuerySchema,
  adminClinicDirectoryQuerySchema,
  adminDentistDirectoryQuerySchema,
  adminOrganizationDirectoryQuerySchema,
  adminPaymentDirectoryQuerySchema,
  adminUserDirectoryQuerySchema,
  adminUserRoleCommandSchema,
  idempotencyKeySchema,
  type AdminAccountStatusCommand,
  type AdminCaseDirectoryQuery,
  type AdminClinicDirectoryQuery,
  type AdminDentistDirectoryQuery,
  type AdminOrganizationDirectoryQuery,
  type AdminPaymentDirectoryQuery,
  type AdminUserDirectoryQuery,
  type AdminUserRoleCommand,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminDirectoryService } from './admin-directory.service.js';

const uuidSchema = z.uuid();

@Controller('admin/directory')
@UseGuards(SessionAuthGuard)
export class AdminDirectoryController {
  constructor(@Inject(AdminDirectoryService) private readonly directory: AdminDirectoryService) {}

  @Get('users')
  async users(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminUserDirectoryQuerySchema)) query: AdminUserDirectoryQuery,
  ) {
    return pageEnvelope(await this.directory.listUsers(access, query), access.requestId);
  }

  @Get('organizations')
  async organizations(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminOrganizationDirectoryQuerySchema))
    query: AdminOrganizationDirectoryQuery,
  ) {
    return pageEnvelope(await this.directory.listOrganizations(access, query), access.requestId);
  }

  @Get('clinics')
  async clinics(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminClinicDirectoryQuerySchema))
    query: AdminClinicDirectoryQuery,
  ) {
    return pageEnvelope(await this.directory.listClinics(access, query), access.requestId);
  }

  @Get('dentists')
  async dentists(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminDentistDirectoryQuerySchema))
    query: AdminDentistDirectoryQuery,
  ) {
    return pageEnvelope(await this.directory.listDentists(access, query), access.requestId);
  }

  @Get('cases')
  async cases(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminCaseDirectoryQuerySchema)) query: AdminCaseDirectoryQuery,
  ) {
    return pageEnvelope(await this.directory.listCases(access, query), access.requestId);
  }

  @Get('payments')
  async payments(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(adminPaymentDirectoryQuerySchema))
    query: AdminPaymentDirectoryQuery,
  ) {
    return pageEnvelope(await this.directory.listPayments(access, query), access.requestId);
  }

  @Get('roles')
  async roles(@CurrentAccess() access: AccessContext) {
    const records = await this.directory.listRoles(access);
    return {
      data: records,
      page: { count: records.length, nextCursor: null },
      requestId: access.requestId,
    };
  }

  @Post('users/:userId/status')
  async changeStatus(
    @CurrentAccess() access: AccessContext,
    @Param('userId', new ZodValidationPipe(uuidSchema)) userId: string,
    @Body(new ZodValidationPipe(adminAccountStatusCommandSchema))
    command: AdminAccountStatusCommand,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.directory.changeAccountStatus(access, userId, command, key),
      requestId: access.requestId,
    };
  }

  @Post('users/:userId/roles')
  async changeRole(
    @CurrentAccess() access: AccessContext,
    @Param('userId', new ZodValidationPipe(uuidSchema)) userId: string,
    @Body(new ZodValidationPipe(adminUserRoleCommandSchema)) command: AdminUserRoleCommand,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.directory.changeRole(access, userId, command, key),
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
