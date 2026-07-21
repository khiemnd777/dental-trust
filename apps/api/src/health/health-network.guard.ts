import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

import { RateLimitExceededException } from '../common/rate-limit.exception.js';

const WINDOW_MILLISECONDS = 60_000;
const MAX_TRACKED_CLIENTS = 10_000;
const LIVE_REQUESTS_PER_WINDOW = 120;
const INTERNAL_REQUESTS_PER_WINDOW = 30;

interface WindowEntry {
  count: number;
  readonly resetsAt: number;
}

export class BoundedFixedWindowLimiter {
  private readonly windows = new Map<string, WindowEntry>();

  constructor(
    private readonly maximumEntries = MAX_TRACKED_CLIENTS,
    private readonly now: () => number = Date.now,
  ) {}

  consume(
    key: string,
    limit: number,
    windowMilliseconds = WINDOW_MILLISECONDS,
  ): { readonly allowed: boolean; readonly retryAfterSeconds: number } {
    const now = this.now();
    let entry = this.windows.get(key);
    if (!entry || entry.resetsAt <= now) {
      if (!entry && this.windows.size >= this.maximumEntries) {
        const oldest = this.windows.keys().next().value as string | undefined;
        if (oldest) this.windows.delete(oldest);
      }
      entry = { count: 0, resetsAt: now + windowMilliseconds };
      this.windows.delete(key);
      this.windows.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetsAt - now) / 1_000)),
    };
  }

  get size(): number {
    return this.windows.size;
  }
}

@Injectable()
export class HealthNetworkGuard implements CanActivate {
  private readonly limiter = new BoundedFixedWindowLimiter();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const path = request.path || request.originalUrl.split('?', 1)[0] || '/health';
    const clientAddress = request.ip || request.socket.remoteAddress || 'unknown';
    const isLive = path.endsWith('/live');
    const result = this.limiter.consume(
      `${isLive ? 'live' : 'internal'}:${clientAddress}`,
      isLive ? LIVE_REQUESTS_PER_WINDOW : INTERNAL_REQUESTS_PER_WINDOW,
    );
    if (result.allowed) return true;
    response.setHeader('Retry-After', result.retryAfterSeconds.toString());
    throw new RateLimitExceededException('HEALTH_RATE_LIMITED', result.retryAfterSeconds);
  }
}
