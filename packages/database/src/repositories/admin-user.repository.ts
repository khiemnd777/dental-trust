import { Prisma, type AccountStatus, type PrismaClient, type SystemRole } from '@prisma/client';

export interface AdminUserActor {
  readonly userId: string;
  readonly requestId: string;
  readonly superAdministrator: boolean;
}

export type AdminUserMutationResult =
  | { readonly outcome: 'NOT_FOUND' | 'CONFLICT' | 'PROTECTED' }
  | { readonly outcome: 'UPDATED'; readonly userId: string; readonly accountStatus: AccountStatus };

export class AdminUserRepository {
  constructor(private readonly db: PrismaClient) {}

  async changeAccountStatus(
    actor: AdminUserActor,
    userId: string,
    expectedStatus: AccountStatus,
    toStatus: Extract<AccountStatus, 'ACTIVE' | 'LOCKED' | 'SUSPENDED'>,
    reason: string,
    idempotencyKey: string,
  ): Promise<AdminUserMutationResult> {
    return this.db.$transaction(
      async (transaction) => {
        await lockUser(transaction, userId);
        const target = await userFacts(transaction, userId);
        if (!target || target.deletedAt) return { outcome: 'NOT_FOUND' };
        if (target.accountStatus !== expectedStatus) return { outcome: 'CONFLICT' };
        const targetRoles = target.roles.map(({ role }) => role.code);
        if (actor.userId === userId && toStatus !== 'ACTIVE') return { outcome: 'PROTECTED' };
        if (targetRoles.includes('SUPER_ADMIN')) {
          if (!actor.superAdministrator) return { outcome: 'PROTECTED' };
          if (toStatus !== 'ACTIVE' && (await activeSuperAdministratorCount(transaction)) <= 1)
            return { outcome: 'PROTECTED' };
        }
        if (expectedStatus === toStatus)
          return { outcome: 'UPDATED', userId, accountStatus: toStatus };
        const changed = await transaction.user.updateMany({
          where: { id: userId, accountStatus: expectedStatus, deletedAt: null },
          data: {
            accountStatus: toStatus,
            ...(toStatus === 'ACTIVE'
              ? { failedLoginCount: 0, lockedUntil: null }
              : { lockedUntil: null }),
          },
        });
        if (changed.count !== 1) return { outcome: 'CONFLICT' };
        if (toStatus !== 'ACTIVE') {
          await transaction.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await recordUserAdministration(transaction, actor, {
          action: 'admin.user-status-changed',
          userId,
          reason,
          idempotencyKey,
          beforeMetadata: { accountStatus: expectedStatus },
          afterMetadata: { accountStatus: toStatus },
        });
        return { outcome: 'UPDATED', userId, accountStatus: toStatus };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async changeRole(
    actor: AdminUserActor,
    userId: string,
    role: Exclude<SystemRole, 'DENTIST' | 'CLINIC_STAFF' | 'CLINIC_ADMIN' | 'CONCIERGE_AGENT'>,
    action: 'GRANT' | 'REVOKE',
    expectedRolePresent: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<AdminUserMutationResult> {
    return this.db.$transaction(
      async (transaction) => {
        await lockUser(transaction, userId);
        const [target, roleDefinition] = await Promise.all([
          userFacts(transaction, userId),
          transaction.roleDefinition.findUnique({ where: { code: role } }),
        ]);
        if (!target || target.deletedAt || !roleDefinition) return { outcome: 'NOT_FOUND' };
        const existing = target.roles.find((assignment) => assignment.role.code === role);
        if (Boolean(existing) !== expectedRolePresent) return { outcome: 'CONFLICT' };
        if (role === 'SUPER_ADMIN' && !actor.superAdministrator) return { outcome: 'PROTECTED' };
        if (
          action === 'REVOKE' &&
          actor.userId === userId &&
          (role === 'SUPER_ADMIN' || role === 'PLATFORM_ADMIN')
        ) {
          return { outcome: 'PROTECTED' };
        }
        if (
          action === 'REVOKE' &&
          role === 'SUPER_ADMIN' &&
          (await activeSuperAdministratorCount(transaction)) <= 1
        ) {
          return { outcome: 'PROTECTED' };
        }
        if ((action === 'GRANT' && existing) || (action === 'REVOKE' && !existing)) {
          return { outcome: 'UPDATED', userId, accountStatus: target.accountStatus };
        }
        if (action === 'GRANT') {
          await transaction.userRole.create({ data: { userId, roleId: roleDefinition.id } });
        } else {
          await transaction.userRole.delete({
            where: { userId_roleId: { userId, roleId: roleDefinition.id } },
          });
        }
        await recordUserAdministration(transaction, actor, {
          action: `admin.user-role-${action.toLowerCase()}`,
          userId,
          reason,
          idempotencyKey,
          beforeMetadata: { role, present: expectedRolePresent },
          afterMetadata: { role, present: action === 'GRANT' },
        });
        return { outcome: 'UPDATED', userId, accountStatus: target.accountStatus };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

async function lockUser(transaction: Prisma.TransactionClient, userId: string): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
}

function userFacts(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      accountStatus: true,
      deletedAt: true,
      roles: { select: { role: { select: { code: true } } } },
    },
  });
}

function activeSuperAdministratorCount(transaction: Prisma.TransactionClient) {
  return transaction.user.count({
    where: {
      accountStatus: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { code: 'SUPER_ADMIN' } } },
    },
  });
}

async function recordUserAdministration(
  transaction: Prisma.TransactionClient,
  actor: AdminUserActor,
  input: {
    readonly action: string;
    readonly userId: string;
    readonly reason: string;
    readonly idempotencyKey: string;
    readonly beforeMetadata: Prisma.InputJsonObject;
    readonly afterMetadata: Prisma.InputJsonObject;
  },
) {
  await transaction.auditLog.create({
    data: {
      actorUserId: actor.userId,
      action: input.action,
      resourceType: 'User',
      resourceId: input.userId,
      requestId: actor.requestId,
      reason: input.reason,
      success: true,
      beforeMetadata: input.beforeMetadata,
      afterMetadata: { ...input.afterMetadata, idempotencyKey: input.idempotencyKey },
    },
  });
  await transaction.outboxEvent.create({
    data: {
      aggregateType: 'User',
      aggregateId: input.userId,
      eventType: input.action,
      payload: { userId: input.userId },
      correlationId: actor.requestId,
      idempotencyKey: `${input.action}:${input.userId}:${input.idempotencyKey}`,
    },
  });
}
