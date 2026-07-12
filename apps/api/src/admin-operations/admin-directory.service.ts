import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AccessContext } from '@dental-trust/auth';
import type {
  AdminAccountStatusCommand,
  AdminCaseDirectoryQuery,
  AdminClinicDirectoryQuery,
  AdminDentistDirectoryQuery,
  AdminOrganizationDirectoryQuery,
  AdminPaymentDirectoryQuery,
  AdminUserDirectoryQuery,
  AdminUserRoleCommand,
} from '@dental-trust/contracts';
import {
  AdminDirectoryRepository,
  AdminUserRepository,
  type AdminUserMutationResult,
  type PrismaClient,
} from '@dental-trust/database';

import { PRISMA } from '../common/tokens.js';
import {
  assertAdministrator,
  assertDangerousOperation,
  assertFinanceOrAdministrator,
  isSuperAdministrator,
} from './admin.policy.js';

@Injectable()
export class AdminDirectoryService {
  private readonly directory: AdminDirectoryRepository;
  private readonly users: AdminUserRepository;

  constructor(@Inject(PRISMA) database: PrismaClient) {
    this.directory = new AdminDirectoryRepository(database);
    this.users = new AdminUserRepository(database);
  }

  listUsers(access: AccessContext, query: AdminUserDirectoryQuery) {
    assertAdministrator(access);
    return this.directory.users({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  listOrganizations(access: AccessContext, query: AdminOrganizationDirectoryQuery) {
    assertAdministrator(access);
    return this.directory.organizations({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  listClinics(access: AccessContext, query: AdminClinicDirectoryQuery) {
    assertAdministrator(access);
    return this.directory.clinics({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  listDentists(access: AccessContext, query: AdminDentistDirectoryQuery) {
    assertAdministrator(access);
    return this.directory.dentists({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  listCases(access: AccessContext, query: AdminCaseDirectoryQuery) {
    assertAdministrator(access);
    return this.directory.cases({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  listPayments(access: AccessContext, query: AdminPaymentDirectoryQuery) {
    assertFinanceOrAdministrator(access);
    return this.directory.payments({
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  listRoles(access: AccessContext) {
    assertAdministrator(access);
    return this.directory.roles();
  }

  async changeAccountStatus(
    access: AccessContext,
    userId: string,
    command: AdminAccountStatusCommand,
    idempotencyKey: string,
  ) {
    assertDangerousOperation(access);
    return resultOrThrow(
      await this.users.changeAccountStatus(
        actor(access),
        userId,
        command.expectedStatus,
        command.toStatus,
        command.reason,
        idempotencyKey,
      ),
    );
  }

  async changeRole(
    access: AccessContext,
    userId: string,
    command: AdminUserRoleCommand,
    idempotencyKey: string,
  ) {
    assertDangerousOperation(access);
    return resultOrThrow(
      await this.users.changeRole(
        actor(access),
        userId,
        command.role,
        command.action,
        command.expectedRolePresent,
        command.reason,
        idempotencyKey,
      ),
    );
  }
}

function actor(access: AccessContext) {
  return {
    userId: access.userId,
    requestId: access.requestId,
    superAdministrator: isSuperAdministrator(access),
  };
}

function resultOrThrow(result: AdminUserMutationResult) {
  if (result.outcome === 'NOT_FOUND') throw new NotFoundException();
  if (result.outcome === 'CONFLICT') throw new ConflictException();
  if (result.outcome === 'PROTECTED') throw new ForbiddenException();
  return result;
}
