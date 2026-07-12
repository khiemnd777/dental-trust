import { ForbiddenException, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import type { ServerEnvironment } from '@dental-trust/config/server';
import { safeEqualHex, sha256 } from '@dental-trust/security';

import { SERVER_ENV } from './tokens.js';

@Injectable()
export class NoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('cache-control', 'private, no-store, max-age=0');
    response.setHeader('pragma', 'no-cache');
    response.setHeader('expires', '0');
    next();
  }
}

@Injectable()
export class CsrfProtectionMiddleware implements NestMiddleware {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(@Inject(SERVER_ENV) environment: ServerEnvironment) {
    this.allowedOrigins = new Set(
      environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    );
  }

  use(request: Request, _response: Response, next: NextFunction): void {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.headers.authorization) {
      next();
      return;
    }
    const sessionCookie = cookieValue(request.headers.cookie, 'dt_session');
    if (!sessionCookie) {
      next();
      return;
    }
    const origin = request.headers.origin;
    const csrfCookie = cookieValue(request.headers.cookie, 'dt_csrf');
    const csrfHeader = request.headers['x-csrf-token']?.toString();
    if (
      !origin ||
      !this.allowedOrigins.has(origin) ||
      !csrfCookie ||
      !csrfHeader ||
      !safeEqualHex(sha256(csrfCookie), sha256(csrfHeader))
    ) {
      throw new ForbiddenException('CSRF validation failed.');
    }
    next();
  }
}

function cookieValue(rawCookie: string | undefined, name: string): string | undefined {
  if (!rawCookie) return undefined;
  for (const part of rawCookie.split(';')) {
    const [candidate, ...value] = part.trim().split('=');
    if (candidate === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
