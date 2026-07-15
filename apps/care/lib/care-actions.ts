import { cookies } from 'next/headers';

const apiBase = () =>
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function forwardCareAction(
  path: string,
  method: 'POST' | 'DELETE' | 'PUT' | 'PATCH',
  body?: unknown,
  timeoutMs = 8_000,
) {
  const token = (await cookies()).get('dt_session')?.value;
  if (!token) return careProxyError(401, 'AUTHENTICATION_REQUIRED', false);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-idempotency-key': crypto.randomUUID(),
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

export async function forwardCareFormData(path: string, body: FormData, timeoutMs = 30_000) {
  const token = (await cookies()).get('dt_session')?.value;
  if (!token) return careProxyError(401, 'AUTHENTICATION_REQUIRED', false);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-idempotency-key': crypto.randomUUID(),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return proxiedResponse(response);
  } catch (error) {
    return proxyTransportError(error);
  }
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

function careProxyError(status: number, code: string, retryable: boolean): Response {
  const requestId = crypto.randomUUID();
  return Response.json(
    {
      error: {
        code,
        message:
          status === 401
            ? 'Authentication is required.'
            : 'The Care service is temporarily unavailable.',
        requestId,
        retryable,
      },
    },
    {
      status,
      headers: {
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    },
  );
}
