export interface ErrorReportContext {
  readonly requestId: string;
  readonly traceId?: string;
  readonly errorCode: string;
  readonly route?: string;
}

export interface ErrorReporter {
  capture(error: unknown, context: ErrorReportContext): Promise<void>;
}

export function createErrorReporter(endpoint?: string): ErrorReporter {
  if (!endpoint) return { capture: async () => undefined };
  const url = new URL(endpoint);
  return {
    async capture(error, context) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          occurredAt: new Date().toISOString(),
          errorType: error instanceof Error ? error.name : 'UnknownError',
          message: safeErrorMessage(error),
          context,
        }),
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) throw new Error(`ERROR_REPORT_FAILED_${response.status}`);
    },
  };
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown application error';
  return /^[A-Z][A-Z0-9_.:-]{2,119}$/u.test(error.message)
    ? error.message
    : 'Application error details are available only in redacted local logs.';
}
