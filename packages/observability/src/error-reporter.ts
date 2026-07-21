export interface ErrorReportContext {
  readonly requestId: string;
  readonly traceId?: string;
  readonly errorCode: string;
  readonly route?: string;
}

export interface ErrorReporter {
  capture(error: unknown, context: ErrorReportContext): Promise<void>;
}

export interface ErrorReporterOptions {
  readonly maxConcurrency?: number;
  readonly maxReportsPerMinute?: number;
}

export function createErrorReporter(
  endpoint?: string,
  options: ErrorReporterOptions = {},
): ErrorReporter {
  if (!endpoint) return { capture: async () => undefined };
  const url = new URL(endpoint);
  const maxConcurrency = boundedPositiveInteger(options.maxConcurrency, 4);
  const maxReportsPerMinute = boundedPositiveInteger(options.maxReportsPerMinute, 60);
  let inFlight = 0;
  let windowStartedAt = Date.now();
  let reportsInWindow = 0;
  return {
    async capture(error, context) {
      const now = Date.now();
      if (now - windowStartedAt >= 60_000) {
        windowStartedAt = now;
        reportsInWindow = 0;
      }
      if (inFlight >= maxConcurrency || reportsInWindow >= maxReportsPerMinute) return;
      inFlight += 1;
      reportsInWindow += 1;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            occurredAt: new Date(now).toISOString(),
            errorType: error instanceof Error ? error.name : 'UnknownError',
            message: safeErrorMessage(error),
            context,
          }),
          signal: AbortSignal.timeout(2_000),
        });
        if (!response.ok) throw new Error(`ERROR_REPORT_FAILED_${response.status}`);
      } finally {
        inFlight -= 1;
      }
    },
  };
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || (value ?? 0) < 1) return fallback;
  return value as number;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown application error';
  return /^[A-Z][A-Z0-9_.:-]{2,119}$/u.test(error.message)
    ? error.message
    : 'Application error details are available only in redacted local logs.';
}
