import 'server-only';

import { apiErrorSchema } from '@dental-trust/contracts';

import { requireOperationsSession, type OperationsSession } from './require-session';

export class OperationsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable = status >= 500,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'OperationsApiError';
  }
}

interface ApiEnvelope<T> {
  readonly data?: T;
  readonly page?: OperationsPageMetadata;
  readonly requestId?: string;
  readonly error?: unknown;
}

export interface OperationsPageMetadata {
  readonly count: number;
  readonly nextCursor: string | null;
}

export interface OperationsPage<T> {
  readonly data: readonly T[];
  readonly page: OperationsPageMetadata;
  readonly requestId: string | null;
}

interface OperationsApiOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly timeoutMs?: number;
}

export async function operationsApi<T>(
  path: string,
  options: OperationsApiOptions = {},
): Promise<T> {
  return operationsApiForSession(await requireOperationsSession(), path, options);
}

export async function operationsApiForSession<T>(
  session: OperationsSession,
  path: string,
  options: OperationsApiOptions = {},
): Promise<T> {
  const envelope = await requestOperationsEnvelope<T>(session, path, options);
  return envelope.data as T;
}

export async function operationsApiPage<T>(path: string): Promise<OperationsPage<T>> {
  return operationsApiPageForSession(await requireOperationsSession(), path);
}

export async function operationsApiPageForSession<T>(
  session: OperationsSession,
  path: string,
): Promise<OperationsPage<T>> {
  const envelope = await requestOperationsEnvelope<readonly T[]>(session, path);
  if (!Array.isArray(envelope.data) || !isPageMetadata(envelope.page)) {
    throw new OperationsApiError(502, 'invalid_api_page_response', false);
  }
  return {
    data: envelope.data as readonly T[],
    page: envelope.page,
    requestId: typeof envelope.requestId === 'string' ? envelope.requestId : null,
  };
}

async function requestOperationsEnvelope<T>(
  session: OperationsSession,
  path: string,
  options: OperationsApiOptions = {},
): Promise<ApiEnvelope<T>> {
  if (!/^[a-z0-9][a-z0-9?&=/_-]*$/iu.test(path) || path.includes('..')) {
    throw new OperationsApiError(400, 'invalid_operations_api_path', false);
  }
  const organizationId = organizationForPath(session, path);
  let response: Response;
  try {
    response = await fetch(`${operationsApiBaseUrl()}/${path}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${session.token}`,
        ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.idempotencyKey ? { 'x-idempotency-key': options.idempotencyKey } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
  } catch (cause) {
    throw new OperationsApiError(503, 'operations_api_unavailable', true, { cause });
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OperationsApiError(response.ok ? 502 : response.status, 'invalid_api_response');
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new OperationsApiError(
      response.ok ? 502 : response.status,
      'invalid_api_response',
      false,
    );
  }
  const envelope = payload as ApiEnvelope<T>;
  if (response.ok && envelope.data === undefined) {
    throw new OperationsApiError(502, 'invalid_api_response', false);
  }
  if (!response.ok || envelope.data === undefined) {
    throw apiError(response.status, envelope.error);
  }
  return envelope;
}

function organizationForPath(session: OperationsSession, path: string): string | undefined {
  if (path.startsWith('concierge/')) {
    return session.availableMemberships.find(({ role }) => role === 'CONCIERGE_AGENT')
      ?.organizationId;
  }
  return undefined;
}

export function operationsApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/u, '');
}

function apiError(status: number, payload: unknown): OperationsApiError {
  const parsed = apiErrorSchema.safeParse({ error: payload });
  if (parsed.success) {
    return new OperationsApiError(status, parsed.data.error.code, parsed.data.error.retryable);
  }
  if (typeof payload === 'string' && payload.length > 0) {
    return new OperationsApiError(status, payload);
  }
  return new OperationsApiError(status || 502, 'operations_api_request_failed');
}

function isPageMetadata(value: unknown): value is OperationsPageMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    'count' in value &&
    typeof value.count === 'number' &&
    Number.isInteger(value.count) &&
    value.count >= 0 &&
    'nextCursor' in value &&
    (typeof value.nextCursor === 'string' || value.nextCursor === null)
  );
}
