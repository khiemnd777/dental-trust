import { randomBytes } from 'node:crypto';

const traceparentPattern = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/iu;

export interface TraceSpanRecord {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: 'SERVER' | 'CONSUMER' | 'INTERNAL';
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMilliseconds: number;
  readonly status: 'OK' | 'ERROR';
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

export interface TraceExporter {
  export(span: TraceSpanRecord): Promise<void>;
}

export interface ActiveTraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceparent: string;
  end(
    status: 'OK' | 'ERROR',
    attributes?: Readonly<Record<string, string | number | boolean>>,
  ): TraceSpanRecord;
}

export function startTraceSpan(input: {
  readonly name: string;
  readonly kind: TraceSpanRecord['kind'];
  readonly incomingTraceparent?: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  readonly now?: Date;
}): ActiveTraceSpan {
  const parent = parseTraceparent(input.incomingTraceparent);
  const traceId = parent?.traceId ?? randomHex(16);
  const spanId = randomHex(8);
  const startedAt = input.now ?? new Date();
  const started = process.hrtime.bigint();
  let ended = false;
  return {
    traceId,
    spanId,
    traceparent: `00-${traceId}-${spanId}-01`,
    end(status, attributes = {}) {
      if (ended) throw new Error('TRACE_SPAN_ALREADY_ENDED');
      ended = true;
      const endedAt = new Date();
      return {
        traceId,
        spanId,
        ...(parent ? { parentSpanId: parent.spanId } : {}),
        name: input.name,
        kind: input.kind,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMilliseconds: Number(process.hrtime.bigint() - started) / 1_000_000,
        status,
        attributes: { ...input.attributes, ...attributes },
      };
    },
  };
}

export function createTraceExporter(endpoint?: string): TraceExporter {
  if (!endpoint) return { export: async () => undefined };
  const url = new URL(endpoint);
  if (!url.pathname.endsWith('/v1/traces')) {
    url.pathname = `${url.pathname.replace(/\/$/u, '')}/v1/traces`;
  }
  return {
    async export(span) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(otlpEnvelope(span)),
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) throw new Error(`TRACE_EXPORT_FAILED_${response.status}`);
    },
  };
}

function parseTraceparent(value?: string) {
  const match = value?.match(traceparentPattern);
  const traceId = match?.[1];
  const spanId = match?.[2];
  if (!traceId || !spanId || /^0+$/u.test(traceId) || /^0+$/u.test(spanId)) return null;
  return { traceId: traceId.toLowerCase(), spanId: spanId.toLowerCase() };
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function otlpEnvelope(span: TraceSpanRecord) {
  const started = BigInt(new Date(span.startedAt).getTime()) * 1_000_000n;
  const ended = BigInt(new Date(span.endedAt).getTime()) * 1_000_000n;
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'dental-trust' } }],
        },
        scopeSpans: [
          {
            scope: { name: '@dental-trust/observability' },
            spans: [
              {
                traceId: span.traceId,
                spanId: span.spanId,
                ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
                name: span.name,
                kind: span.kind === 'SERVER' ? 2 : span.kind === 'CONSUMER' ? 5 : 1,
                startTimeUnixNano: started.toString(),
                endTimeUnixNano: ended.toString(),
                attributes: Object.entries(span.attributes).map(([key, value]) => ({
                  key,
                  value:
                    typeof value === 'boolean'
                      ? { boolValue: value }
                      : typeof value === 'number'
                        ? { doubleValue: value }
                        : { stringValue: value },
                })),
                status: { code: span.status === 'OK' ? 1 : 2 },
              },
            ],
          },
        ],
      },
    ],
  };
}
