import 'server-only';

import { requireProviderSession, type ProviderSession } from './require-session';

export class ProviderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ProviderApiError';
  }
}

interface ApiEnvelope<T> {
  readonly data?: T;
  readonly error?: string | { readonly code?: unknown };
  readonly requestId?: string;
  readonly page?: { readonly nextCursor?: unknown };
}

export interface ProviderApiPage<T> {
  readonly data: T;
  readonly nextCursor: string | null;
}

interface ProviderApiOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly timeoutMs?: number;
}

export async function providerApi<T>(path: string, options: ProviderApiOptions = {}): Promise<T> {
  const session = await requireProviderSession();
  return providerApiForSession<T>(session, path, options);
}

export async function providerApiPage<T>(path: string): Promise<ProviderApiPage<T>> {
  const session = await requireProviderSession();
  return providerApiPageForSession<T>(session, path);
}

export async function providerApiPageForSession<T>(
  session: ProviderSession,
  path: string,
): Promise<ProviderApiPage<T>> {
  const envelope = await providerApiEnvelopeForSession<T>(session, path);
  return {
    data: envelope.data,
    nextCursor: typeof envelope.page?.nextCursor === 'string' ? envelope.page.nextCursor : null,
  };
}

export async function providerApiForSession<T>(
  session: ProviderSession,
  path: string,
  options: ProviderApiOptions = {},
): Promise<T> {
  return (await providerApiEnvelopeForSession<T>(session, path, options)).data;
}

async function providerApiEnvelopeForSession<T>(
  session: ProviderSession,
  path: string,
  options: ProviderApiOptions = {},
): Promise<{ readonly data: T; readonly page?: ApiEnvelope<T>['page'] }> {
  if (!/^[a-z0-9][a-z0-9?&=/_-]*$/iu.test(path) || path.includes('..')) {
    throw new ProviderApiError(400, 'invalid_provider_api_path');
  }
  const method = options.method ?? 'GET';
  const response = await fetch(`${apiBaseUrl()}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${session.token}`,
      'x-organization-id': session.organizationId,
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
    throw new ProviderApiError(response.status, 'invalid_api_response');
  }
  if (!response.ok || envelope.data === undefined) {
    const code =
      typeof envelope.error === 'string'
        ? envelope.error
        : typeof envelope.error?.code === 'string'
          ? envelope.error.code
          : 'provider_api_request_failed';
    throw new ProviderApiError(response.status, code);
  }
  return { data: envelope.data, ...(envelope.page ? { page: envelope.page } : {}) };
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/u, '');
}
