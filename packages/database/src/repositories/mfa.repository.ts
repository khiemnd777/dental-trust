import type { Prisma, PrismaClient } from '@prisma/client';

export class InvalidMfaCredentialError extends Error {
  constructor() {
    super('The MFA credential is invalid.');
    this.name = 'InvalidMfaCredentialError';
  }
}

export class MfaRepository {
  constructor(private readonly db: PrismaClient) {}

  async beginTotpEnrollment(
    userId: string,
    encryptedSecret: string,
    requestId: string,
  ): Promise<string> {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.mfaConfiguration.findUnique({
        where: { userId_method: { userId, method: 'totp' } },
      });
      const configuration = existing
        ? await transaction.mfaConfiguration.update({
            where: { id: existing.id },
            data: {
              pendingEncryptedSecret: encryptedSecret,
              ...(existing.revokedAt
                ? { encryptedSecret: null, enabledAt: null, revokedAt: null }
                : {}),
            },
          })
        : await transaction.mfaConfiguration.create({
            data: { userId, method: 'totp', pendingEncryptedSecret: encryptedSecret },
          });
      if (existing?.revokedAt) {
        await transaction.mfaRecoveryCode.deleteMany({
          where: { mfaConfigurationId: configuration.id },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'account.mfa-enrollment-started',
          resourceType: 'mfa_configuration',
          resourceId: configuration.id,
          requestId,
          success: true,
        },
      });
      return configuration.id;
    });
  }

  async findTotpConfiguration(userId: string, enabledOnly: boolean) {
    return this.db.mfaConfiguration.findFirst({
      where: {
        userId,
        method: 'totp',
        revokedAt: null,
        ...(enabledOnly
          ? { enabledAt: { not: null }, encryptedSecret: { not: null } }
          : { pendingEncryptedSecret: { not: null } }),
      },
    });
  }

  async confirmTotpEnrollment(
    userId: string,
    recoveryCodeHashes: readonly string[],
    requestId: string,
  ): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const configuration = await transaction.mfaConfiguration.findUnique({
        where: { userId_method: { userId, method: 'totp' } },
      });
      if (!configuration?.pendingEncryptedSecret || configuration.revokedAt) {
        throw new InvalidMfaCredentialError();
      }
      const enabledAt = new Date();
      const confirmed = await transaction.mfaConfiguration.updateMany({
        where: {
          id: configuration.id,
          pendingEncryptedSecret: configuration.pendingEncryptedSecret,
          revokedAt: null,
        },
        data: {
          encryptedSecret: configuration.pendingEncryptedSecret,
          pendingEncryptedSecret: null,
          enabledAt,
        },
      });
      if (confirmed.count !== 1) throw new InvalidMfaCredentialError();
      await transaction.mfaRecoveryCode.deleteMany({
        where: { mfaConfigurationId: configuration.id },
      });
      await transaction.mfaRecoveryCode.createMany({
        data: recoveryCodeHashes.map((codeHash) => ({
          mfaConfigurationId: configuration.id,
          codeHash,
        })),
      });
      await writeMfaSecurityRecords(transaction, {
        userId,
        action: 'account.mfa-enabled',
        resourceId: configuration.id,
        requestId,
        eventType: 'account.mfa-enabled',
        idempotencyKey: `mfa-enabled:${configuration.id}:${enabledAt.toISOString()}`,
      });
    });
  }

  async verifySessionWithTotp(userId: string, sessionId: string, requestId: string): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      await markSessionVerified(transaction, userId, sessionId);
      await writeMfaSecurityRecords(transaction, {
        userId,
        action: 'account.mfa-session-verified',
        resourceId: sessionId,
        requestId,
        eventType: 'account.mfa-session-verified',
        idempotencyKey: `mfa-session-verified:${sessionId}:${requestId}`,
      });
    });
  }

  async consumeRecoveryCode(
    userId: string,
    sessionId: string,
    codeHash: string,
    requestId: string,
  ): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const code = await transaction.mfaRecoveryCode.findFirst({
        where: {
          codeHash,
          consumedAt: null,
          mfaConfiguration: {
            userId,
            method: 'totp',
            enabledAt: { not: null },
            revokedAt: null,
          },
        },
      });
      if (!code) throw new InvalidMfaCredentialError();
      const consumed = await transaction.mfaRecoveryCode.updateMany({
        where: { id: code.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new InvalidMfaCredentialError();
      await markSessionVerified(transaction, userId, sessionId);
      await writeMfaSecurityRecords(transaction, {
        userId,
        action: 'account.mfa-recovery-code-used',
        resourceId: sessionId,
        requestId,
        eventType: 'account.mfa-recovery-code-used',
        idempotencyKey: `mfa-recovery-used:${code.id}`,
      });
    });
  }
}

async function markSessionVerified(
  transaction: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
): Promise<void> {
  const result = await transaction.session.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { accountStatus: 'ACTIVE', deletedAt: null },
    },
    data: { mfaVerifiedAt: new Date(), lastSeenAt: new Date() },
  });
  if (result.count !== 1) throw new InvalidMfaCredentialError();
}

async function writeMfaSecurityRecords(
  transaction: Prisma.TransactionClient,
  input: {
    readonly userId: string;
    readonly action: string;
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
      resourceType: 'mfa_configuration',
      resourceId: input.resourceId,
      requestId: input.requestId,
      success: true,
    },
  });
  await transaction.outboxEvent.create({
    data: {
      aggregateType: 'user',
      aggregateId: input.userId,
      eventType: input.eventType,
      payload: { userId: input.userId },
      correlationId: input.requestId,
      idempotencyKey: input.idempotencyKey,
    },
  });
}
