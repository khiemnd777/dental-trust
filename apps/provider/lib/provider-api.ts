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
  readonly error?: string;
  readonly requestId?: string;
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

export async function providerApiForSession<T>(
  session: ProviderSession,
  path: string,
  options: ProviderApiOptions = {},
): Promise<T> {
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
    throw new ProviderApiError(response.status, envelope.error ?? 'provider_api_request_failed');
  }
  return envelope.data;
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/u, '');
}
