import { cookies } from 'next/headers';
import { bffClientContextHeaders, bffSessionContextHeaders } from './bff-client-context';

const apiBase = () =>
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function forwardCareAction(
  path: string,
  method: 'POST' | 'DELETE' | 'PUT' | 'PATCH',
  body?: unknown,
  timeoutMs = 8_000,
  idempotencyKey = crypto.randomUUID(),
) {
  const token = (await cookies()).get('dt_session')?.value;
  if (!token) return careProxyError(401, 'AUTHENTICATION_REQUIRED', false);
  try {
    const clientContext = await bffClientContextHeaders();
    const response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        ...clientContext,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-idempotency-key': idempotencyKey,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return proxiedResponse(response);
  } catch (error) {
    return proxyTransportError(error);
  }
}

export async function forwardPublicCareRead(path: string, timeoutMs = 8_000) {
  try {
    const clientContext = await bffClientContextHeaders();
    const response = await fetch(`${apiBase()}${path}`, {
      headers: clientContext,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return proxiedResponse(response);
  } catch (error) {
    return proxyTransportError(error);
  }
}

export async function forwardCareFormData(
  path: string,
  readBody: () => Promise<FormData>,
  timeoutMs = 30_000,
  idempotencyKey = crypto.randomUUID(),
) {
  const token = (await cookies()).get('dt_session')?.value;
  if (!token) return careProxyError(401, 'AUTHENTICATION_REQUIRED', false);

  const releaseAuthentication = tryAcquireAuthenticationSlot();
  if (!releaseAuthentication)
    return careProxyError(429, 'AUTHENTICATION_CONCURRENCY_LIMITED', true, {
      'retry-after': '1',
    });

  let identity: { id: string } | Response;
  try {
    const clientContext = await bffClientContextHeaders();
    identity = await authenticateCareUpload(token, clientContext);
  } finally {
    releaseAuthentication();
  }
  if (identity instanceof Response) return identity;

  const releaseMultipart = tryAcquireMultipartSlot();
  if (!releaseMultipart)
    return careProxyError(429, 'UPLOAD_CONCURRENCY_LIMITED', true, { 'retry-after': '1' });

  try {
    let body: FormData;
    try {
      body = await readBody();
    } catch {
      return careProxyError(400, 'INVALID_MULTIPART_FORM', false);
    }

    try {
      const response = await fetch(`${apiBase()}${path}`, {
        method: 'POST',
        headers: {
          ...bffSessionContextHeaders(identity.id),
          authorization: `Bearer ${token}`,
          'x-idempotency-key': idempotencyKey,
        },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return proxiedResponse(response);
    } catch (error) {
      return proxyTransportError(error);
    }
  } finally {
    releaseMultipart();
  }
}

let activeAuthenticationRequests = 0;
let activeMultipartRequests = 0;

function tryAcquireAuthenticationSlot(): (() => void) | null {
  const maximum = boundedConcurrency(process.env.CARE_AUTH_VERIFY_CONCURRENCY, 8, 32);
  if (activeAuthenticationRequests >= maximum) return null;
  activeAuthenticationRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeAuthenticationRequests -= 1;
  };
}

function tryAcquireMultipartSlot(): (() => void) | null {
  const maximum = boundedConcurrency(process.env.CARE_MULTIPART_CONCURRENCY, 2, 16);
  if (activeMultipartRequests >= maximum) return null;
  activeMultipartRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeMultipartRequests -= 1;
  };
}

function boundedConcurrency(rawValue: string | undefined, fallback: number, upperBound: number) {
  const configured = Number(rawValue ?? String(fallback));
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= upperBound
    ? configured
    : fallback;
}

async function authenticateCareUpload(
  token: string,
  clientContext: Record<string, string>,
): Promise<{ id: string } | Response> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/auth/me`, {
      headers: { ...clientContext, authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
  } catch (error) {
    return proxyTransportError(error);
  }
  if (response.status === 401) return careProxyError(401, 'AUTHENTICATION_REQUIRED', false);
  if (response.status === 403) return careProxyError(403, 'AUTHORIZATION_DENIED', false);
  if (!response.ok) return careProxyError(503, 'AUTHENTICATION_DEPENDENCY_UNAVAILABLE', true);
  const envelope = (await response.json().catch(() => null)) as {
    data?: { id?: unknown; roles?: unknown };
  } | null;
  const roles = envelope?.data?.roles;
  if (typeof envelope?.data?.id !== 'string' || !Array.isArray(roles)) {
    return careProxyError(503, 'AUTHENTICATION_DEPENDENCY_UNAVAILABLE', true);
  }
  if (!roles.some((role) => role === 'PATIENT' || role === 'CAREGIVER')) {
    return careProxyError(403, 'AUTHORIZATION_DENIED', false);
  }
  return { id: envelope.data.id };
}

export function careIdempotencyKey(request: Request): string {
  const value = request.headers.get('x-idempotency-key');
  return value && /^[A-Za-z0-9_-]{16,220}$/u.test(value) ? value : crypto.randomUUID();
}

function proxiedResponse(response: Response): Response {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'content-type': response.headers.get('content-type') ?? 'application/json',
  });
  const contentDisposition = response.headers.get('content-disposition');
  if (contentDisposition) headers.set('content-disposition', contentDisposition);
  return new Response(response.body, { status: response.status, headers });
}

function proxyTransportError(error: unknown): Response {
  const timedOut =
    error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
  return timedOut
    ? careProxyError(504, 'CARE_UPSTREAM_TIMEOUT', true)
    : careProxyError(502, 'CARE_UPSTREAM_UNAVAILABLE', true);
}

function careProxyError(
  status: number,
  code: string,
  retryable: boolean,
  extraHeaders: Record<string, string> = {},
): Response {
  const requestId = crypto.randomUUID();
  return Response.json(
    {
      error: {
        code,
        message:
          status === 401
            ? 'Authentication is required.'
            : status === 400
              ? 'The request body is invalid.'
              : 'The Care service is temporarily unavailable.',
        requestId,
        retryable,
      },
    },
    {
      status,
      headers: {
        ...extraHeaders,
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    },
  );
}
