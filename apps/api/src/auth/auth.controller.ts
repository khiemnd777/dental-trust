import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';

import {
  emailVerificationConsumeSchema,
  type EmailVerificationConsume,
  emailVerificationRequestSchema,
  type EmailVerificationRequest,
  loginRequestSchema,
  type LoginRequest,
  mfaConfirmationRequestSchema,
  type MfaConfirmationRequest,
  mfaEnrollmentRequestSchema,
  type MfaEnrollmentRequest,
  mfaVerificationRequestSchema,
  type MfaVerificationRequest,
  passwordResetConsumeSchema,
  type PasswordResetConsume,
  passwordResetRequestSchema,
  type PasswordResetRequest,
  registerRequestSchema,
  type RegisterRequest,
} from '@dental-trust/contracts';
import type { ServerEnvironment } from '@dental-trust/config/server';
import type { AccessContext } from '@dental-trust/auth';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../common/http.js';
import { requestIdOf } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SERVER_ENV } from '../common/tokens.js';
import { CurrentAccess } from './current-access.decorator.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SERVER_ENV) private readonly environment: ServerEnvironment,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    return {
      data: await this.auth.register(body, requestIdOf(request)),
      requestId: requestIdOf(request),
    };
  }

  @Post('email-verification/request')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestEmailVerification(
    @Body(new ZodValidationPipe(emailVerificationRequestSchema)) body: EmailVerificationRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const requestId = requestIdOf(request);
    return {
      data: await this.auth.requestEmailVerification(body, requestId),
      requestId,
    };
  }

  @Post('email-verification/consume')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async consumeEmailVerification(
    @Body(new ZodValidationPipe(emailVerificationConsumeSchema)) body: EmailVerificationConsume,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const requestId = requestIdOf(request);
    return {
      data: await this.auth.consumeEmailVerification(body, requestId),
      requestId,
    };
  }

  @Post('password-reset/request')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestPasswordReset(
    @Body(new ZodValidationPipe(passwordResetRequestSchema)) body: PasswordResetRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const requestId = requestIdOf(request);
    return {
      data: await this.auth.requestPasswordReset(body, requestId),
      requestId,
    };
  }

  @Post('password-reset/consume')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async consumePasswordReset(
    @Body(new ZodValidationPipe(passwordResetConsumeSchema)) body: PasswordResetConsume,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const requestId = requestIdOf(request);
    return {
      data: await this.auth.consumePasswordReset(body, requestId),
      requestId,
    };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request & AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    const session = await this.auth.login(body, {
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    });
    response.cookie('dt_session', session.token, {
      httpOnly: true,
      secure: this.environment.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
    response.cookie('dt_csrf', session.csrfToken, {
      httpOnly: false,
      secure: this.environment.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
    return {
      data: {
        accessToken: session.token,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt.toISOString(),
        user: session.user,
      },
      requestId: requestIdOf(request),
    };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@CurrentAccess() access: AccessContext): Readonly<Record<string, unknown>> {
    return {
      data: {
        id: access.userId,
        roles: access.roles,
        mfaVerified: access.mfaVerified,
        mfaRequired: access.mfaRequired ?? false,
        memberships: access.memberships,
        availableMemberships: access.availableMemberships ?? [],
        selectedOrganizationId: access.selectedOrganizationId ?? null,
        impersonation: access.impersonation
          ? {
              active: true,
              elevationId: access.impersonation.elevationId,
              actorUserId: access.impersonation.actorUserId,
              reason: access.impersonation.reason,
              expiresAt: access.impersonation.expiresAt.toISOString(),
              capabilities: access.impersonation.capabilities,
            }
          : null,
      },
      requestId: access.requestId,
    };
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async logout(
    @CurrentAccess() access: AccessContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(access.sessionId, access.userId);
    response.clearCookie('dt_session', { httpOnly: true, sameSite: 'lax', path: '/' });
    response.clearCookie('dt_csrf', { httpOnly: false, sameSite: 'lax', path: '/' });
  }

  @Get('sessions')
  @UseGuards(SessionAuthGuard)
  async sessions(
    @CurrentAccess() access: AccessContext,
  ): Promise<Readonly<Record<string, unknown>>> {
    return {
      data: await this.auth.listSessions(access.userId, access.sessionId),
      requestId: access.requestId,
    };
  }

  @Post('mfa/totp/enroll')
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async beginMfaEnrollment(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(mfaEnrollmentRequestSchema)) body: MfaEnrollmentRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    return {
      data: await this.auth.beginMfaEnrollment(access.userId, body, access.requestId),
      requestId: access.requestId,
    };
  }

  @Post('mfa/totp/confirm')
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirmMfaEnrollment(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(mfaConfirmationRequestSchema)) body: MfaConfirmationRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    return {
      data: await this.auth.confirmMfaEnrollment(
        access.userId,
        access.sessionId,
        body,
        access.requestId,
      ),
      requestId: access.requestId,
    };
  }

  @Post('mfa/verify')
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyMfa(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(mfaVerificationRequestSchema)) body: MfaVerificationRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    return {
      data: await this.auth.verifyMfa(access.userId, access.sessionId, body, access.requestId),
      requestId: access.requestId,
    };
  }

  @Delete('sessions/:sessionId')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async revokeSession(
    @CurrentAccess() access: AccessContext,
    @Param('sessionId', new ZodValidationPipe(z.uuid())) sessionId: string,
  ): Promise<void> {
    await this.auth.revokeSession(access.userId, sessionId);
  }
}
