import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { DomainRuleError } from '@dental-trust/domain';
import { RequestValidationError } from '@dental-trust/validation';
import { MatchingConflictError, MatchingResourceNotFoundError } from '@dental-trust/database';

import { ApiExceptionFilter, normalizeException } from './http-exception.filter.js';
import { RateLimitExceededException } from './rate-limit.exception.js';
import { RateLimitStorageUnavailableException } from './redis-throttler.storage.js';

describe('canonical API error mapping', () => {
  it('exposes a stable retryable contract for rate-limit storage outages', () => {
    expect(normalizeException(new RateLimitStorageUnavailableException())).toEqual({
      status: 503,
      code: 'RATE_LIMIT_STORAGE_UNAVAILABLE',
      message: 'Request protection is temporarily unavailable.',
      retryable: true,
    });
  });

  it.each([
    [new UnauthorizedException(), 401, 'AUTHENTICATION_REQUIRED'],
    [new ForbiddenException(), 403, 'AUTHORIZATION_DENIED'],
    [new NotFoundException(), 404, 'RESOURCE_NOT_FOUND'],
    [new ConflictException(), 409, 'CONFLICT'],
    [new HttpException('Too many requests', 429), 429, 'RATE_LIMITED'],
  ] as const)('maps %s to a stable envelope code', (exception, status, code) => {
    expect(normalizeException(exception)).toMatchObject({ status, code });
  });

  it('maps field validation and domain rules without exposing internals', () => {
    const validation = z.object({ email: z.email() }).safeParse({ email: 'invalid' });
    if (validation.success) throw new Error('Test fixture must be invalid.');
    expect(normalizeException(new RequestValidationError(validation.error))).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors: { email: expect.any(Array) },
    });
    expect(normalizeException(new DomainRuleError('RULE_X', 'Rule rejected.'))).toMatchObject({
      status: 422,
      code: 'DOMAIN_RULE_VIOLATION',
      domainCode: 'RULE_X',
    });
  });

  it('preserves typed quota codes and retry guidance', () => {
    expect(
      normalizeException(
        new RateLimitExceededException('UPLOAD_QUOTA_EXCEEDED', 900, 'ACTIVE_UPLOADS'),
      ),
    ).toMatchObject({
      status: 429,
      code: 'UPLOAD_QUOTA_EXCEEDED',
      retryable: true,
      retryAfterSeconds: 900,
      reason: 'ACTIVE_UPLOADS',
    });
  });

  it('writes Retry-After and the quota details into the canonical response', () => {
    const setHeader = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const filter = new ApiExceptionFilter(
      { warn: vi.fn(), error: vi.fn() } as never,
      { increment: vi.fn() } as never,
      { capture: vi.fn() } as never,
    );
    filter.catch(new RateLimitExceededException('UPLOAD_QUOTA_EXCEEDED', 900, 'ACTIVE_UPLOADS'), {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, requestId: 'request-1', path: '/files' }),
        getResponse: () => ({ setHeader, status }),
      }),
    } as never);

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '900');
    expect(json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'UPLOAD_QUOTA_EXCEEDED',
        reason: 'ACTIVE_UPLOADS',
        retryAfterSeconds: 900,
      }),
    });
  });

  it('does not turn bounded health rejections into per-request log or report work', () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const metrics = { increment: vi.fn() };
    const reporter = { capture: vi.fn() };
    const filter = new ApiExceptionFilter(logger as never, metrics as never, reporter as never);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    filter.catch(new RateLimitExceededException('HEALTH_RATE_LIMITED', 30), {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          requestId: 'health-check',
          path: '/api/v1/health/live',
        }),
        getResponse: () => ({ setHeader: vi.fn(), status }),
      }),
    } as never);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(metrics.increment).not.toHaveBeenCalled();
    expect(reporter.capture).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(429);
  });

  it('returns a safe 500 response for unknown errors', () => {
    const result = normalizeException(new Error('database password leaked here'));
    expect(result).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    expect(result.message).not.toContain('database password');
  });

  it('maps a Prisma unique race to a sanitized conflict', () => {
    const result = normalizeException({ code: 'P2002', meta: { target: ['private_field'] } });
    expect(result).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(result.message).not.toContain('private_field');
  });

  it('maps matching scope misses and state conflicts without leaking details', () => {
    expect(normalizeException(new MatchingResourceNotFoundError())).toMatchObject({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
    const conflict = normalizeException(new MatchingConflictError('private workflow state'));
    expect(conflict).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(conflict.message).not.toContain('private workflow state');
  });
});
