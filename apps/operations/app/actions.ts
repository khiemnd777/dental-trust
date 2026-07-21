'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { bffClientContextHeaders } from '@/lib/bff-client-context';

export async function logoutOperationsAction(): Promise<never> {
  const jar = await cookies();
  const token = jar.get('dt_session')?.value;
  const organizationId = jar.get('dt_organization')?.value;
  let remoteRevoked = !token;

  if (token) {
    try {
      const clientContext = await bffClientContextHeaders();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/auth/logout`,
        {
          method: 'POST',
          headers: {
            ...clientContext,
            authorization: `Bearer ${token}`,
            ...(organizationId ? { 'x-organization-id': organizationId } : {}),
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(5_000),
        },
      );
      remoteRevoked = response.ok;
    } catch {
      remoteRevoked = false;
    }
  }

  jar.delete('dt_session');
  jar.delete('dt_csrf');
  jar.delete('dt_organization');

  const gateway = process.env.PUBLIC_APP_URL ?? 'http://localhost:3003';
  const notice = remoteRevoked ? '' : '&notice=session-revocation-unavailable';
  redirect(`${gateway}/vi/auth/login?product=operations${notice}`);
}
