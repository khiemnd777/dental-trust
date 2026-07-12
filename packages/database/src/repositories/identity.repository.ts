import type { PrismaClient, SystemRole } from '@prisma/client';

export interface IdentityRecord {
  readonly userId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly preferredLocale: string;
  readonly emailVerified: boolean;
  readonly accountStatus: string;
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
  readonly roles: readonly SystemRole[];
  readonly mfaEnabled: boolean;
}

export interface SessionIdentity {
  readonly sessionId: string;
  readonly expiresAt: Date;
  readonly mfaVerifiedAt: Date | null;
  readonly userId: string;
  readonly email: string;
  readonly preferredLocale: string;
  readonly accountStatus: string;
  readonly roles: readonly SystemRole[];
  readonly mfaEnabled: boolean;
  readonly memberships: readonly {
    organizationId: string;
    role: SystemRole;
  }[];
}

export class DuplicateIdentityError extends Error {
  constructor() {
    super('An account already exists for this email address.');
    this.name = 'DuplicateIdentityError';
  }
}

export class IdentityRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmail(email: string): Promise<IdentityRecord | null> {
    const user = await this.db.user.findUnique({
      where: { email },
      include: {
        roles: { include: { role: true } },
        mfaConfigurations: {
          where: { method: 'totp', enabledAt: { not: null }, revokedAt: null },
          select: { id: true },
        },
      },
    });
    if (!user) return null;
    return {
      userId: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      preferredLocale: user.preferredLocale,
      emailVerified: user.emailVerifiedAt !== null,
      accountStatus: user.accountStatus,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
      roles: user.roles.map(({ role }) => role.code),
      mfaEnabled: user.mfaConfigurations.length > 0,
    };
  }

  async findByUserId(userId: string): Promise<IdentityRecord | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        mfaConfigurations: {
          where: { method: 'totp', enabledAt: { not: null }, revokedAt: null },
          select: { id: true },
        },
      },
    });
    if (!user) return null;
    return {
      userId: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      preferredLocale: user.preferredLocale,
      emailVerified: user.emailVerifiedAt !== null,
      accountStatus: user.accountStatus,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
      roles: user.roles.map(({ role }) => role.code),
      mfaEnabled: user.mfaConfigurations.length > 0,
    };
  }

  async registerPatient(input: {
    readonly email: string;
    readonly passwordHash: string;
    readonly preferredLocale: string;
    readonly termsVersion: string;
    readonly privacyVersion: string;
    readonly requestId: string;
    readonly verification: {
      readonly tokenHash: string;
      readonly encryptedToken: string;
      readonly expiresAt: Date;
    };
  }): Promise<IdentityRecord> {
    const existing = await this.db.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw new DuplicateIdentityError();

    const [patientRole, terms, privacy] = await Promise.all([
      this.db.roleDefinition.findUniqueOrThrow({ where: { code: 'PATIENT' } }),
      this.db.consentTextVersion.findFirstOrThrow({
        where: { purpose: 'TERMS', version: input.termsVersion, locale: input.preferredLocale },
      }),
      this.db.consentTextVersion.findFirstOrThrow({
        where: { purpose: 'PRIVACY', version: input.privacyVersion, locale: input.preferredLocale },
      }),
    ]);

    const user = await this.db.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          preferredLocale: input.preferredLocale,
          roles: { create: { roleId: patientRole.id } },
          patientProfile: { create: {} },
          consentRecords: {
            create: [
              { consentTextVersionId: terms.id, requestId: input.requestId },
              { consentTextVersionId: privacy.id, requestId: input.requestId },
            ],
          },
        },
      });
      const lifecycleToken = await transaction.accountLifecycleToken.create({
        data: {
          userId: created.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: input.verification.tokenHash,
          expiresAt: input.verification.expiresAt,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'user',
          aggregateId: created.id,
          eventType: 'account.email-verification-requested',
          payload: {
            userId: created.id,
            lifecycleTokenId: lifecycleToken.id,
            tokenHash: input.verification.tokenHash,
            encryptedToken: input.verification.encryptedToken,
            expiresAt: input.verification.expiresAt.toISOString(),
          },
          correlationId: input.requestId,
          idempotencyKey: `account-lifecycle:${lifecycleToken.id}`,
        },
      });
      return created;
    });

    return {
      userId: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      preferredLocale: user.preferredLocale,
      emailVerified: false,
      accountStatus: user.accountStatus,
      failedLoginCount: 0,
      lockedUntil: null,
      roles: ['PATIENT'],
      mfaEnabled: false,
    };
  }

  async createSession(input: {
    readonly userId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly ipAddressHash?: string;
    readonly userAgent?: string;
    readonly mfaVerifiedAt?: Date;
  }): Promise<{ readonly id: string; readonly expiresAt: Date }> {
    return this.db.session.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ...(input.ipAddressHash ? { ipAddressHash: input.ipAddressHash } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        ...(input.mfaVerifiedAt ? { mfaVerifiedAt: input.mfaVerifiedAt } : {}),
      },
      select: { id: true, expiresAt: true },
    });
  }

  async findActiveSessionByHash(
    tokenHash: string,
    now = new Date(),
  ): Promise<SessionIdentity | null> {
    const session = await this.db.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
            mfaConfigurations: {
              where: { method: 'totp', enabledAt: { not: null }, revokedAt: null },
              select: { id: true },
            },
            memberships: {
              where: { status: 'ACTIVE' },
              include: { role: true },
            },
          },
        },
      },
    });
    if (!session || session.user.accountStatus !== 'ACTIVE') return null;
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      mfaVerifiedAt: session.mfaVerifiedAt,
      userId: session.user.id,
      email: session.user.email,
      preferredLocale: session.user.preferredLocale,
      accountStatus: session.user.accountStatus,
      roles: session.user.roles.map(({ role }) => role.code),
      mfaEnabled: session.user.mfaConfigurations.length > 0,
      memberships: session.user.memberships.map(({ organizationId, role }) => ({
        organizationId,
        role: role.code,
      })),
    };
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  async recordFailedLogin(userId: string, lockAfterAttempts = 5): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: userId },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      if (user.failedLoginCount >= lockAfterAttempts) {
        await transaction.user.update({
          where: { id: userId },
          data: { lockedUntil: new Date(Date.now() + 15 * 60_000) },
        });
      }
    });
  }

  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const result = await this.db.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count === 1;
  }

  async listSessions(userId: string): Promise<
    readonly {
      readonly id: string;
      readonly createdAt: Date;
      readonly lastSeenAt: Date;
      readonly expiresAt: Date;
      readonly revokedAt: Date | null;
      readonly mfaVerifiedAt: Date | null;
      readonly userAgent: string | null;
    }[]
  > {
    return this.db.session.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        mfaVerifiedAt: true,
        userAgent: true,
      },
    });
  }
}
