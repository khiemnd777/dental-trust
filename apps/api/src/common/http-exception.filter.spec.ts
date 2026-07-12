import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DomainRuleError } from '@dental-trust/domain';
import { RequestValidationError } from '@dental-trust/validation';
import { MatchingConflictError, MatchingResourceNotFoundError } from '@dental-trust/database';

import { normalizeException } from './http-exception.filter.js';

describe('canonical API error mapping', () => {
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
