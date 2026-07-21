'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { bffClientContextHeaders } from './bff-client-context';

export async function logoutCareAction() {
  const jar = await cookies();
  const token = jar.get('dt_session')?.value;
  if (token) {
    try {
      const api =
        process.env.API_INTERNAL_URL ??
        process.env.NEXT_PUBLIC_API_URL ??
        'http://localhost:4000/api/v1';
      const clientContext = await bffClientContextHeaders();
      await fetch(`${api}/auth/logout`, {
        method: 'POST',
        headers: { ...clientContext, authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // The local session must still be cleared if remote revocation is temporarily unavailable.
    }
  }
  jar.delete('dt_session');
  jar.delete('dt_csrf');
  redirect(`${process.env.PUBLIC_APP_URL ?? 'http://localhost:3003'}/vi/auth/login?product=care`);
}
