import {
  Catch,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Logger } from 'pino';
import type { Response } from 'express';

import { DomainRuleError } from '@dental-trust/domain';
import {
  type ErrorReporter,
  getRequestContext,
  type MetricsRegistry,
} from '@dental-trust/observability';
import {
  CaseNotFoundError,
  BookingConflictError,
  BookingNotFoundError,
  DuplicateIdentityError,
  IdempotencyConflictError,
  IntakeConflictError,
  IntakeResourceNotFoundError,
  JourneyConflictError,
  JourneyNotFoundError,
  MatchingConflictError,
  MatchingResourceNotFoundError,
  OptimisticConcurrencyError,
  PaymentConflictError,
  PaymentNotFoundError,
  TrustConflictError,
  TrustIdempotencyConflictError,
  TrustResourceNotFoundError,
  VerificationIdempotencyConflictError,
  VerificationOptimisticConcurrencyError,
  VerificationResourceNotFoundError,
} from '@dental-trust/database';
import { RequestValidationError } from '@dental-trust/validation';

import type { AuthenticatedRequest } from './http.js';
import { requestIdOf } from './http.js';
import { ERROR_REPORTER, LOGGER, METRICS } from './tokens.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(METRICS) private readonly metrics: MetricsRegistry,
    @Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const requestId = requestIdOf(request);
    const normalized = normalizeException(exception);

    if (normalized.status >= 500) {
      this.logger.error(
        {
          errorType: exception instanceof Error ? exception.name : 'UnknownError',
          requestId,
          errorCode: normalized.code,
        },
        'request failed',
      );
      this.metrics.increment('application_errors_total', {
        code: normalized.code,
        route: request.route?.path?.toString() ?? 'unknown',
      });
      const traceId = getRequestContext()?.traceId;
      void this.reporter
        .capture(exception, {
          requestId,
          ...(traceId ? { traceId } : {}),
          errorCode: normalized.code,
          route: request.route?.path?.toString() ?? request.path,
        })
        .catch((error: unknown) => {
          this.logger.warn({ err: error, requestId }, 'external error reporting failed');
        });
    } else {
      this.logger.warn({ requestId, errorCode: normalized.code }, 'request rejected');
    }

    response.status(normalized.status).json({
      error: {
        code: normalized.code,
        message: normalized.message,
        requestId,
        retryable: normalized.retryable,
        ...(normalized.domainCode ? { domainCode: normalized.domainCode } : {}),
        ...(normalized.fieldErrors ? { fieldErrors: normalized.fieldErrors } : {}),
      },
    });
  }
}

interface NormalizedError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly domainCode?: string;
}

export function normalizeException(exception: unknown): NormalizedError {
  if (exception instanceof RequestValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_ERROR',
      message: exception.message,
      retryable: false,
      fieldErrors: exception.failure.fieldErrors,
    };
  }
  if (
    exception instanceof CaseNotFoundError ||
    exception instanceof JourneyNotFoundError ||
    exception instanceof PaymentNotFoundError ||
    exception instanceof BookingNotFoundError ||
    exception instanceof MatchingResourceNotFoundError ||
    exception instanceof IntakeResourceNotFoundError ||
    exception instanceof TrustResourceNotFoundError ||
    exception instanceof VerificationResourceNotFoundError
  ) {
    return {
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Resource not found.',
      retryable: false,
    };
  }
  if (
    exception instanceof OptimisticConcurrencyError ||
    exception instanceof VerificationOptimisticConcurrencyError
  ) {
    return {
      status: 409,
      code: 'OPTIMISTIC_CONCURRENCY_FAILURE',
      message: 'The resource changed. Refresh it before retrying.',
      retryable: true,
    };
  }
  if (
    exception instanceof DuplicateIdentityError ||
    exception instanceof IdempotencyConflictError ||
    exception instanceof IntakeConflictError ||
    exception instanceof JourneyConflictError ||
    exception instanceof MatchingConflictError ||
    exception instanceof PaymentConflictError ||
    exception instanceof BookingConflictError ||
    exception instanceof TrustConflictError ||
    exception instanceof TrustIdempotencyConflictError ||
    exception instanceof VerificationIdempotencyConflictError ||
    isPrismaUniqueConstraint(exception) ||
    exception instanceof ConflictException
  ) {
    return {
      status: 409,
      code: 'CONFLICT',
      message: 'The request conflicts with existing data.',
      retryable: false,
    };
  }
  if (exception instanceof DomainRuleError) {
    return {
      status: 422,
      code: 'DOMAIN_RULE_VIOLATION',
      domainCode: exception.code,
      message: exception.message,
      retryable: false,
    };
  }
  if (exception instanceof UnauthorizedException) {
    return {
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication is required.',
      retryable: false,
    };
  }
  if (exception instanceof ForbiddenException) {
    return {
      status: 403,
      code: 'AUTHORIZATION_DENIED',
      message: 'Access is not permitted.',
      retryable: false,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code =
      status === 404
        ? 'RESOURCE_NOT_FOUND'
        : status === 409
          ? 'CONFLICT'
          : status === 503
            ? 'PROVIDER_UNAVAILABLE'
            : status === 429
              ? 'RATE_LIMITED'
              : 'REQUEST_REJECTED';
    return {
      status,
      code,
      message: exception.message,
      retryable: status === 429 || status === 503,
    };
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Use the request ID when contacting support.',
    retryable: false,
  };
}

function isPrismaUniqueConstraint(exception: unknown): boolean {
  return (
    exception !== null &&
    typeof exception === 'object' &&
    'code' in exception &&
    exception.code === 'P2002'
  );
}
