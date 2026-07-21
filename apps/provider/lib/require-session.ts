import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { bffClientContextHeaders } from './bff-client-context';

const providerRoles = new Set(['DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN']);

export interface ProviderSession {
  readonly token: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly mfaVerified: boolean;
  readonly mfaRequired: boolean;
}

export const readProviderSession = cache(
  async function readProviderSession(): Promise<ProviderSession | null> {
    const jar = await cookies();
    const token = jar.get('dt_session')?.value;
    const organizationId = jar.get('dt_organization')?.value;
    if (!token || !organizationId) return null;
    try {
      const clientContext = await bffClientContextHeaders();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/auth/me`,
        {
          headers: {
            ...clientContext,
            authorization: `Bearer ${token}`,
            'x-organization-id': organizationId,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(4_000),
        },
      );
      if (!response.ok) return null;
      const envelope = (await response.json()) as {
        data?: {
          id?: unknown;
          roles?: unknown[];
          memberships?: { role?: unknown; organizationId?: unknown }[];
          selectedOrganizationId?: unknown;
          mfaVerified?: unknown;
          mfaRequired?: unknown;
        };
      };
      const roles = (Array.isArray(envelope.data?.memberships) ? envelope.data.memberships : [])
        .filter((membership) => membership.organizationId === organizationId)
        .map(({ role }) => role)
        .filter((role): role is string => typeof role === 'string');
      if (
        typeof envelope.data?.id !== 'string' ||
        envelope.data.selectedOrganizationId !== organizationId ||
        !roles.some((role) => providerRoles.has(role))
      )
        return null;
      return {
        token,
        organizationId,
        userId: envelope.data.id,
        roles: [...new Set(roles)],
        mfaVerified: envelope.data.mfaVerified === true,
        mfaRequired: envelope.data.mfaRequired === true,
      };
    } catch {
      return null;
    }
  },
);

export async function requireProviderSession(): Promise<ProviderSession> {
  const session = await readProviderSession();
  if (!session) redirectToLogin();
  return session;
}

function redirectToLogin(): never {
  redirect(
    `${process.env.PUBLIC_APP_URL ?? 'http://localhost:3003'}/vi/auth/login?product=provider`,
  );
}
