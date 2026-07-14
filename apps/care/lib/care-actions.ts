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
  if (!token) return new Response('Unauthorized', { status: 401 });
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
  const payload = await response.text();
  return new Response(payload, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
