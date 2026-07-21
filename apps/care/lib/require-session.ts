import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { bffClientContextHeaders } from './bff-client-context';

export const requireCareSession = cache(async function requireCareSession() {
  const token = (await cookies()).get('dt_session')?.value;
  if (!token) redirectToLogin();
  const result = await loadIdentity(token);
  if (result.kind === 'unavailable') return null;
  if (result.kind === 'unauthorized') redirectToLogin();
  if (
    result.kind === 'forbidden' ||
    !result.identity.roles.some((role) => role === 'PATIENT' || role === 'CAREGIVER')
  )
    redirectToLogin('permission');
  return result.identity;
});

async function loadIdentity(token: string) {
  let response: Response;
  try {
    const clientContext = await bffClientContextHeaders();
    response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/auth/me`,
      {
        headers: { ...clientContext, authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(4_000),
      },
    );
  } catch {
    return { kind: 'unavailable' as const };
  }
  if (response.status === 401) return { kind: 'unauthorized' as const };
  if (response.status === 403) return { kind: 'forbidden' as const };
  if (!response.ok) return { kind: 'unavailable' as const };
  const envelope = (await response.json().catch(() => null)) as {
    data?: { id?: string; roles?: unknown[] };
  } | null;
  if (!envelope?.data?.id || !Array.isArray(envelope.data.roles))
    return { kind: 'unavailable' as const };
  return {
    kind: 'ok' as const,
    identity: {
      id: envelope.data.id,
      roles: envelope.data.roles.filter((role): role is string => typeof role === 'string'),
    },
  };
}

function redirectToLogin(error?: 'permission'): never {
  const query = new URLSearchParams({ product: 'care', ...(error ? { error } : {}) });
  redirect(
    `${process.env.PUBLIC_APP_URL ?? 'http://localhost:3003'}/vi/auth/login?${query.toString()}`,
  );
}
