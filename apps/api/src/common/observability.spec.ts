import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createErrorReporter,
  createTraceExporter,
  MetricsRegistry,
  startTraceSpan,
} from '@dental-trust/observability';

import { isOperationalHealthRoute, normalizedRoute } from './request-context.middleware.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('bounded application metrics', () => {
  it('renders stable Prometheus counters and summaries with escaped labels', () => {
    const metrics = new MetricsRegistry();
    metrics.increment('http.server.requests', { route: '/cases/:id', method: 'GET' });
    metrics.increment('http.server.requests', { method: 'GET', route: '/cases/:id' }, 2);
    metrics.observe('http.server.duration', 12.5, { method: 'GET' });
    metrics.observe('http.server.duration', 7.5, { method: 'GET' });
    expect(metrics.renderPrometheus()).toBe(
      [
        'http_server_requests{method="GET",route="/cases/:id"} 3',
        'http_server_duration_count{method="GET"} 2',
        'http_server_duration_sum{method="GET"} 20',
        '',
      ].join('\n'),
    );
  });
});

describe('W3C-compatible tracing adapter', () => {
  it('continues a valid trace while issuing a distinct server span', () => {
    const traceId = 'a'.repeat(32);
    const parentSpanId = 'b'.repeat(16);
    const span = startTraceSpan({
      name: 'HTTP GET /cases/:id',
      kind: 'SERVER',
      incomingTraceparent: `00-${traceId}-${parentSpanId}-01`,
      attributes: { 'http.request.method': 'GET' },
    });
    expect(span.traceId).toBe(traceId);
    expect(span.spanId).toMatch(/^[a-f0-9]{16}$/u);
    expect(span.spanId).not.toBe(parentSpanId);
    const record = span.end('OK', { 'http.response.status_code': 200 });
    expect(record).toMatchObject({ traceId, parentSpanId, status: 'OK' });
    expect(record.durationMilliseconds).toBeGreaterThanOrEqual(0);
  });

  it('exports an OTLP JSON envelope to the standard traces endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const span = startTraceSpan({ name: 'queue consume', kind: 'CONSUMER' });
    await createTraceExporter('https://telemetry.example/otlp').export(span.end('ERROR'));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://telemetry.example/otlp/v1/traces'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      resourceSpans: unknown[];
    };
    expect(body.resourceSpans).toHaveLength(1);
  });

  it('samples deterministically and caps concurrent trace exports', async () => {
    let release: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 202 }));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const exporter = createTraceExporter('https://telemetry.example', {
      sampleRate: 1,
      maxConcurrency: 1,
    });
    const first = exporter.export(startTraceSpan({ name: 'first', kind: 'SERVER' }).end('OK'));
    await exporter.export(startTraceSpan({ name: 'dropped', kind: 'SERVER' }).end('OK'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release?.();
    await first;

    fetchMock.mockClear();
    const disabled = createTraceExporter('https://telemetry.example', { sampleRate: 0 });
    await disabled.export(startTraceSpan({ name: 'unsampled', kind: 'SERVER' }).end('OK'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('external error reporting adapter', () => {
  it('redacts email and credential-like values before delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await createErrorReporter('https://errors.example/events').capture(
      new Error('Failure for patient@example.com token abcdefghijklmnopqrstuvwxyz012345'),
      { requestId: 'request-12345678', errorCode: 'INTERNAL_ERROR' },
    );
    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).not.toContain('patient@example.com');
    expect(body).not.toContain('abcdefghijklmnopqrstuvwxyz012345');
    expect(body).toContain('Application error details are available only in redacted local logs.');
  });

  it('drops reports when the reporter concurrency budget is exhausted', async () => {
    let release: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 202 }));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const reporter = createErrorReporter('https://errors.example/events', {
      maxConcurrency: 1,
      maxReportsPerMinute: 10,
    });
    const first = reporter.capture(new Error('INTERNAL_ERROR'), {
      requestId: 'request-12345678',
      errorCode: 'INTERNAL_ERROR',
    });
    await reporter.capture(new Error('DROPPED_ERROR'), {
      requestId: 'request-87654321',
      errorCode: 'INTERNAL_ERROR',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release?.();
    await first;
  });
});

describe('metric route cardinality', () => {
  it('removes query strings and normalizes public identifiers and numbers', () => {
    expect(
      normalizedRoute('/api/v1/cases/018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01/plans/42?token=secret'),
    ).toBe('/api/v1/cases/:id/plans/:number');
  });

  it('recognizes only the bounded operational health hot paths', () => {
    expect(isOperationalHealthRoute('/api/v1/health/live')).toBe(true);
    expect(isOperationalHealthRoute('/health/metrics')).toBe(true);
    expect(isOperationalHealthRoute('/api/v1/health/other')).toBe(false);
  });
});
