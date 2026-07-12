import { randomUUID } from 'node:crypto';

import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { Logger } from 'pino';

import {
  type MetricsRegistry,
  runWithRequestContext,
  startTraceSpan,
  type TraceExporter,
} from '@dental-trust/observability';

import type { AuthenticatedRequest } from './http.js';
import { LOGGER, METRICS, TRACE_EXPORTER } from './tokens.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(METRICS) private readonly metrics: MetricsRegistry,
    @Inject(TRACE_EXPORTER) private readonly traces: TraceExporter,
  ) {}

  use(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
    const incoming = request.headers['x-request-id']?.toString();
    const requestId =
      incoming && /^[A-Za-z0-9._:-]{8,128}$/u.test(incoming) ? incoming : randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    const route = normalizedRoute(request.originalUrl || request.url);
    const incomingTraceparent = Array.isArray(request.headers.traceparent)
      ? request.headers.traceparent[0]
      : request.headers.traceparent;
    const span = startTraceSpan({
      name: `HTTP ${request.method} ${route}`,
      kind: 'SERVER',
      ...(incomingTraceparent ? { incomingTraceparent } : {}),
      attributes: { 'http.request.method': request.method, 'http.route': route },
    });
    response.setHeader('traceparent', span.traceparent);
    response.once('finish', () => {
      const status = response.statusCode >= 500 ? 'ERROR' : 'OK';
      const record = span.end(status, { 'http.response.status_code': response.statusCode });
      this.metrics.increment('http_server_requests_total', {
        method: request.method,
        route,
        status: response.statusCode,
      });
      this.metrics.observe(
        'http_server_request_duration_milliseconds',
        record.durationMilliseconds,
        {
          method: request.method,
          route,
        },
      );
      this.logger.info(
        {
          requestId,
          traceId: record.traceId,
          method: request.method,
          route,
          statusCode: response.statusCode,
          durationMilliseconds: record.durationMilliseconds,
        },
        'request completed',
      );
      void this.traces.export(record).catch((error: unknown) => {
        this.logger.warn({ err: error, traceId: record.traceId }, 'trace export failed');
      });
    });
    runWithRequestContext({ requestId, traceId: span.traceId, spanId: span.spanId }, next);
  }
}

export function normalizedRoute(rawUrl: string): string {
  let pathname: string;
  try {
    pathname = new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    pathname = '/invalid';
  }
  return pathname
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
      ':id',
    )
    .replace(/\/[0-9]+(?=\/|$)/gu, '/:number')
    .slice(0, 240);
}
