import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function requireCareSession() {
  const token = (await cookies()).get('dt_session')?.value;
  if (!token) redirectToLogin();
  const identity = await loadIdentity(token);
  if (!identity?.roles.some((role) => role === 'PATIENT' || role === 'CAREGIVER'))
    redirectToLogin();
  return identity;
}

async function loadIdentity(token: string) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/auth/me`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) return null;
    const envelope = (await response.json()) as { data?: { id?: string; roles?: unknown[] } };
    if (!envelope.data?.id || !Array.isArray(envelope.data.roles)) return null;
    return {
      id: envelope.data.id,
      roles: envelope.data.roles.filter((role): role is string => typeof role === 'string'),
    };
  } catch {
    return null;
  }
}

function redirectToLogin(): never {
  redirect(`${process.env.PUBLIC_APP_URL ?? 'http://localhost:3003'}/vi/auth/login?product=care`);
}
