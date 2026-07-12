import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';

import type {
  EmailVerificationConsume,
  EmailVerificationRequest,
  LoginRequest,
  MfaConfirmationRequest,
  MfaEnrollmentRequest,
  MfaVerificationRequest,
  PasswordResetConsume,
  PasswordResetRequest,
  RegisterRequest,
} from '@dental-trust/contracts';
import type { ServerEnvironment } from '@dental-trust/config/server';
import {
  AccountLifecycleRepository,
  IdentityRepository,
  InvalidAccountLifecycleTokenError,
  InvalidMfaCredentialError,
  MfaRepository,
  type PrismaClient,
} from '@dental-trust/database';
import { privilegedRoles } from '@dental-trust/domain';
import { createOpaqueToken, SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';
import {
  buildTotpUri,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyTotpCode,
} from './totp.js';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1_000;
const EMAIL_VERIFICATION_DURATION_MS = 24 * 60 * 60 * 1_000;
const PASSWORD_RESET_DURATION_MS = 60 * 60 * 1_000;

@Injectable()
export class AuthService {
  private readonly identities: IdentityRepository;
  private readonly lifecycle: AccountLifecycleRepository;
  private readonly mfa: MfaRepository;
  private readonly cipher: SensitiveFieldCipher;

  constructor(
    @Inject(PRISMA) db: PrismaClient,
    @Inject(SERVER_ENV) private readonly environment: ServerEnvironment,
  ) {
    this.identities = new IdentityRepository(db);
    this.lifecycle = new AccountLifecycleRepository(db);
    this.mfa = new MfaRepository(db);
    this.cipher = new SensitiveFieldCipher(this.environment.FIELD_ENCRYPTION_KEY);
  }

  async register(
    input: RegisterRequest,
    requestId: string,
  ): Promise<Readonly<Record<string, unknown>>> {
    const verification = this.createLifecycleIssue(
      'email-verification',
      EMAIL_VERIFICATION_DURATION_MS,
    );
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    const user = await this.identities.registerPatient({
      email: input.email,
      passwordHash,
      preferredLocale: input.preferredLocale,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
      requestId,
      verification,
    });
    return { id: user.userId, email: user.email, emailVerificationRequired: true };
  }

  async requestEmailVerification(
    input: EmailVerificationRequest,
    requestId: string,
  ): Promise<{ readonly accepted: true }> {
    const startedAt = Date.now();
    const issue = this.createLifecycleIssue('email-verification', EMAIL_VERIFICATION_DURATION_MS);
    try {
      await this.lifecycle.issueEmailVerification(input.email, { ...issue, requestId });
    } finally {
      await settleEnumerationSafeResponse(startedAt);
    }
    return { accepted: true };
  }

  async consumeEmailVerification(
    input: EmailVerificationConsume,
    requestId: string,
  ): Promise<{ readonly verified: true }> {
    try {
      await this.lifecycle.consumeEmailVerification(sha256(input.token), requestId);
    } catch (error) {
      if (error instanceof InvalidAccountLifecycleTokenError) {
        throw new BadRequestException('The verification link is invalid or expired.');
      }
      throw error;
    }
    return { verified: true };
  }

  async requestPasswordReset(
    input: PasswordResetRequest,
    requestId: string,
  ): Promise<{ readonly accepted: true }> {
    const startedAt = Date.now();
    const issue = this.createLifecycleIssue('password-reset', PASSWORD_RESET_DURATION_MS);
    try {
      await this.lifecycle.issuePasswordReset(input.email, { ...issue, requestId });
    } finally {
      await settleEnumerationSafeResponse(startedAt);
    }
    return { accepted: true };
  }

  async consumePasswordReset(
    input: PasswordResetConsume,
    requestId: string,
  ): Promise<{ readonly reset: true }> {
    const passwordHash = await hashPassword(input.newPassword);
    try {
      await this.lifecycle.consumePasswordReset(sha256(input.token), passwordHash, requestId);
    } catch (error) {
      if (error instanceof InvalidAccountLifecycleTokenError) {
        throw new BadRequestException('The password reset link is invalid or expired.');
      }
      throw error;
    }
    return { reset: true };
  }

  async login(
    input: LoginRequest,
    metadata: { readonly ipAddress?: string; readonly userAgent?: string },
  ): Promise<{
    readonly token: string;
    readonly csrfToken: string;
    readonly expiresAt: Date;
    readonly user: Readonly<Record<string, unknown>>;
  }> {
    const user = await this.identities.findByEmail(input.email);
    if (!user) {
      await constantTimePasswordCheck(input.password);
      throw new UnauthorizedException();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedException();

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      await this.identities.recordFailedLogin(user.userId);
      throw new UnauthorizedException();
    }
    if (user.accountStatus !== 'ACTIVE') throw new UnauthorizedException();

    await this.identities.recordSuccessfulLogin(user.userId);
    const token = `dts_${createOpaqueToken(48)}`;
    const csrfToken = createOpaqueToken(32);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const developmentSeedMfa =
      this.environment.NODE_ENV !== 'production' &&
      user.email.endsWith('.local') &&
      user.roles.some((role) => privilegedRoles.some((privileged) => privileged === role));
    await this.identities.createSession({
      userId: user.userId,
      tokenHash: sha256(token),
      expiresAt,
      ...(metadata.ipAddress
        ? { ipAddressHash: sha256(`${this.environment.AUTH_SECRET}:${metadata.ipAddress}`) }
        : {}),
      ...(metadata.userAgent ? { userAgent: metadata.userAgent.slice(0, 512) } : {}),
      ...(developmentSeedMfa ? { mfaVerifiedAt: new Date() } : {}),
    });
    return {
      token,
      csrfToken,
      expiresAt,
      user: {
        id: user.userId,
        email: user.email,
        emailVerified: user.emailVerified,
        preferredLocale: user.preferredLocale,
        roles: user.roles,
        mfaVerified: developmentSeedMfa,
        mfaRequired: user.mfaEnabled && !developmentSeedMfa,
      },
    };
  }

  async beginMfaEnrollment(
    userId: string,
    input: MfaEnrollmentRequest,
    requestId: string,
  ): Promise<Readonly<Record<string, unknown>>> {
    const user = await this.identities.findByUserId(userId);
    if (!user || user.accountStatus !== 'ACTIVE') throw new UnauthorizedException();
    const validPassword = await argon2.verify(user.passwordHash, input.password);
    if (!validPassword) throw new UnauthorizedException();

    const secret = generateTotpSecret();
    const encryptedSecret = this.cipher.encrypt(secret, `mfa:${userId}:totp`);
    const enrollmentId = await this.mfa.beginTotpEnrollment(userId, encryptedSecret, requestId);
    return {
      enrollmentId,
      method: 'totp',
      secret,
      otpauthUri: buildTotpUri({
        secret,
        issuer: this.environment.AUTH_ISSUER,
        accountName: user.email,
      }),
    };
  }

  async confirmMfaEnrollment(
    userId: string,
    sessionId: string,
    input: MfaConfirmationRequest,
    requestId: string,
  ): Promise<Readonly<Record<string, unknown>>> {
    const configuration = await this.mfa.findTotpConfiguration(userId, false);
    if (!configuration?.pendingEncryptedSecret) throw new UnauthorizedException();
    const secret = this.cipher.decrypt(configuration.pendingEncryptedSecret, `mfa:${userId}:totp`);
    if (!verifyTotpCode(secret, input.code)) throw new UnauthorizedException();

    const recoveryCodes = generateRecoveryCodes();
    try {
      await this.mfa.confirmTotpEnrollment(
        userId,
        recoveryCodes.map((code) => this.recoveryCodeHash(userId, code)),
        requestId,
      );
      await this.mfa.verifySessionWithTotp(userId, sessionId, requestId);
    } catch (error) {
      if (error instanceof InvalidMfaCredentialError) throw new UnauthorizedException();
      throw error;
    }
    return { enabled: true, recoveryCodes };
  }

  async verifyMfa(
    userId: string,
    sessionId: string,
    input: MfaVerificationRequest,
    requestId: string,
  ): Promise<{ readonly verified: true }> {
    if (input.method === 'recovery') {
      try {
        await this.mfa.consumeRecoveryCode(
          userId,
          sessionId,
          this.recoveryCodeHash(userId, input.code),
          requestId,
        );
      } catch (error) {
        if (error instanceof InvalidMfaCredentialError) throw new UnauthorizedException();
        throw error;
      }
      return { verified: true };
    }

    const configuration = await this.mfa.findTotpConfiguration(userId, true);
    if (!configuration?.encryptedSecret) throw new UnauthorizedException();
    const secret = this.cipher.decrypt(configuration.encryptedSecret, `mfa:${userId}:totp`);
    if (!verifyTotpCode(secret, input.code)) throw new UnauthorizedException();
    try {
      await this.mfa.verifySessionWithTotp(userId, sessionId, requestId);
    } catch (error) {
      if (error instanceof InvalidMfaCredentialError) throw new UnauthorizedException();
      throw error;
    }
    return { verified: true };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.identities.revokeSession(sessionId, userId);
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.identities.listSessions(userId);
    return sessions.map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      mfaVerified: session.mfaVerifiedAt !== null,
      userAgent: session.userAgent,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.identities.revokeSession(sessionId, userId);
    if (!revoked) throw new UnauthorizedException();
  }

  private createLifecycleIssue(kind: string, durationMilliseconds: number) {
    const token = createOpaqueToken(48);
    const tokenHash = sha256(token);
    return {
      tokenHash,
      encryptedToken: this.cipher.encrypt(token, `account-lifecycle:${kind}:${tokenHash}`),
      expiresAt: new Date(Date.now() + durationMilliseconds),
    };
  }

  private recoveryCodeHash(userId: string, code: string): string {
    return sha256(
      `${this.environment.AUTH_SECRET}:mfa-recovery:${userId}:${normalizeRecoveryCode(code)}`,
    );
  }
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
}

async function constantTimePasswordCheck(password: string): Promise<void> {
  const dummyHash =
    '$argon2id$v=19$m=65536,t=3,p=1$ZmFrZS1zYWx0LWZvci10aW1pbmc$2yP7NXMwLP9BUXvtVG5VTS6vZrd8S2Wkm+QhDPshGSc';
  try {
    await argon2.verify(dummyHash, password);
  } catch {
    // The hash is intentionally fixed and no error details leave this boundary.
  }
}

async function settleEnumerationSafeResponse(startedAt: number): Promise<void> {
  const remainingMilliseconds = 200 - (Date.now() - startedAt);
  if (remainingMilliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, remainingMilliseconds));
}
