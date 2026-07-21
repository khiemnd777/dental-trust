import {
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import type { ServerEnvironment } from '@dental-trust/config/server';
import { safeEqualHex, sha256 } from '@dental-trust/security';

import { SERVER_ENV } from '../common/tokens.js';

export const INTERNAL_HEALTH_HEADER = 'x-internal-health-token';

@Injectable()
export class InternalHealthGuard implements CanActivate {
  constructor(@Inject(SERVER_ENV) private readonly environment: ServerEnvironment) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.environment.INTERNAL_HEALTH_TOKEN;
    if (!expected && this.environment.NODE_ENV !== 'production') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const supplied = request.headers[INTERNAL_HEALTH_HEADER]?.toString();
    if (!expected || !supplied || !safeEqualHex(sha256(expected), sha256(supplied))) {
      // Conceal internal operational surfaces from unauthenticated callers.
      throw new NotFoundException();
    }
    return true;
  }
}
