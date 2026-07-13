import 'server-only';

import { requireOperationsSession, type OperationsSession } from './require-session';

export class OperationsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'OperationsApiError';
  }
}

interface ApiEnvelope<T> {
  readonly data?: T;
  readonly error?: string;
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
  if (!/^[a-z0-9][a-z0-9?&=/_-]*$/iu.test(path) || path.includes('..')) {
    throw new OperationsApiError(400, 'invalid_operations_api_path');
  }
  const organizationId = organizationForPath(session, path);
  const response = await fetch(`${apiBaseUrl()}/${path}`, {
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
  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new OperationsApiError(response.status, 'invalid_api_response');
  }
  if (!response.ok || envelope.data === undefined) {
    throw new OperationsApiError(
      response.status,
      envelope.error ?? 'operations_api_request_failed',
    );
  }
  return envelope.data;
}

function organizationForPath(session: OperationsSession, path: string): string | undefined {
  if (path.startsWith('concierge/')) {
    return session.availableMemberships.find(({ role }) => role === 'CONCIERGE_AGENT')
      ?.organizationId;
  }
  return undefined;
}

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/u, '');
}
