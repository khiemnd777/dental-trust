import type { AccountLifecycleTokenType, Prisma, PrismaClient } from '@prisma/client';

export class InvalidAccountLifecycleTokenError extends Error {
  constructor() {
    super('The account lifecycle token is invalid or expired.');
    this.name = 'InvalidAccountLifecycleTokenError';
  }
}

export interface LifecycleTokenIssue {
  readonly tokenHash: string;
  readonly encryptedToken: string;
  readonly expiresAt: Date;
  readonly requestId: string;
}

export class AccountLifecycleRepository {
  constructor(private readonly db: PrismaClient) {}

  async issueEmailVerification(email: string, issue: LifecycleTokenIssue): Promise<void> {
    await this.issueForEligibleUser(
      email,
      'EMAIL_VERIFICATION',
      issue,
      { emailVerifiedAt: null, accountStatus: { in: ['PENDING_VERIFICATION', 'ACTIVE'] } },
      'account.email-verification-requested',
    );
  }

  async issuePasswordReset(email: string, issue: LifecycleTokenIssue): Promise<void> {
    await this.issueForEligibleUser(
      email,
      'PASSWORD_RESET',
      issue,
      { accountStatus: 'ACTIVE' },
      'account.password-reset-requested',
    );
  }

  async isPasswordResetConsumable(tokenHash: string): Promise<boolean> {
    const token = await this.db.accountLifecycleToken.findFirst({
      where: {
        tokenHash,
        type: 'PASSWORD_RESET',
        consumedAt: null,
        expiresAt: { gt: new Date() },
        user: { accountStatus: 'ACTIVE', deletedAt: null },
      },
      select: { id: true },
    });
    return token !== null;
  }

  async consumeEmailVerification(tokenHash: string, requestId: string): Promise<string> {
    return this.db.$transaction(async (transaction) => {
      const token = await findConsumableToken(transaction, tokenHash, 'EMAIL_VERIFICATION');
      if (
        !token ||
        !['PENDING_VERIFICATION', 'ACTIVE'].includes(token.user.accountStatus) ||
        token.user.deletedAt
      ) {
        throw new InvalidAccountLifecycleTokenError();
      }
      await claimToken(transaction, token.id);
      await transaction.user.update({
        where: { id: token.userId },
        data: {
          emailVerifiedAt: token.user.emailVerifiedAt ?? new Date(),
          ...(token.user.accountStatus === 'PENDING_VERIFICATION'
            ? { accountStatus: 'ACTIVE' }
            : {}),
        },
      });
      await writeSecurityRecords(transaction, {
        userId: token.userId,
        action: 'account.email-verified',
        resourceType: 'user',
        resourceId: token.userId,
        requestId,
        eventType: 'account.email-verified',
        idempotencyKey: `account-email-verified:${token.id}`,
      });
      return token.userId;
    });
  }

  async consumePasswordReset(
    tokenHash: string,
    passwordHash: string,
    requestId: string,
  ): Promise<string> {
    return this.db.$transaction(async (transaction) => {
      const token = await findConsumableToken(transaction, tokenHash, 'PASSWORD_RESET');
      if (!token || token.user.accountStatus !== 'ACTIVE' || token.user.deletedAt) {
        throw new InvalidAccountLifecycleTokenError();
      }
      await claimToken(transaction, token.id);
      await transaction.user.update({
        where: { id: token.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      await transaction.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.accountLifecycleToken.updateMany({
        where: {
          userId: token.userId,
          type: 'PASSWORD_RESET',
          consumedAt: null,
          id: { not: token.id },
        },
        data: { consumedAt: new Date() },
      });
      await writeSecurityRecords(transaction, {
        userId: token.userId,
        action: 'account.password-reset',
        resourceType: 'user',
        resourceId: token.userId,
        requestId,
        eventType: 'account.password-reset-completed',
        idempotencyKey: `account-password-reset:${token.id}`,
      });
      return token.userId;
    });
  }

  private async issueForEligibleUser(
    email: string,
    type: AccountLifecycleTokenType,
    issue: LifecycleTokenIssue,
    eligibility: Prisma.UserWhereInput,
    eventType: string,
  ): Promise<void> {
    const user = await this.db.user.findFirst({
      where: { email, deletedAt: null, ...eligibility },
      select: { id: true },
    });
    if (!user) return;

    await this.db.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      await transaction.accountLifecycleToken.updateMany({
        where: { userId: user.id, type, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      const token = await transaction.accountLifecycleToken.create({
        data: {
          userId: user.id,
          type,
          tokenHash: issue.tokenHash,
          expiresAt: issue.expiresAt,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'user',
          aggregateId: user.id,
          eventType,
          payload: {
            userId: user.id,
            lifecycleTokenId: token.id,
            tokenHash: issue.tokenHash,
            encryptedToken: issue.encryptedToken,
            expiresAt: issue.expiresAt.toISOString(),
          },
          correlationId: issue.requestId,
          idempotencyKey: `account-lifecycle:${token.id}`,
        },
      });
    });
  }
}

async function findConsumableToken(
  transaction: Prisma.TransactionClient,
  tokenHash: string,
  type: AccountLifecycleTokenType,
) {
  return transaction.accountLifecycleToken.findFirst({
    where: { tokenHash, type, consumedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
}

async function claimToken(transaction: Prisma.TransactionClient, tokenId: string): Promise<void> {
  const claimed = await transaction.accountLifecycleToken.updateMany({
    where: { id: tokenId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) throw new InvalidAccountLifecycleTokenError();
}

async function writeSecurityRecords(
  transaction: Prisma.TransactionClient,
  input: {
    readonly userId: string;
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly requestId: string;
    readonly eventType: string;
    readonly idempotencyKey: string;
  },
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorUserId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: input.requestId,
      success: true,
    },
  });
  await transaction.outboxEvent.create({
    data: {
      aggregateType: input.resourceType,
      aggregateId: input.resourceId,
      eventType: input.eventType,
      payload: { userId: input.userId },
      correlationId: input.requestId,
      idempotencyKey: input.idempotencyKey,
    },
  });
}
