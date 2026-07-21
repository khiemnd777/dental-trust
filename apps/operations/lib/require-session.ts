import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { bffClientContextHeaders } from './bff-client-context';

const operationsRoles = new Set([
  'CONCIERGE_AGENT',
  'SUPPORT_AGENT',
  'VERIFICATION_OFFICER',
  'FINANCE_ADMIN',
  'CONTENT_ADMIN',
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
]);

export interface OperationsMembership {
  readonly organizationId: string;
  readonly role: string;
}

export interface OperationsSession {
  readonly token: string;
  readonly organizationId?: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly availableMemberships: readonly OperationsMembership[];
  readonly mfaVerified: boolean;
  readonly mfaRequired: boolean;
}

export const readOperationsSession = cache(
  async function readOperationsSession(): Promise<OperationsSession | null> {
    const jar = await cookies();
    const token = jar.get('dt_session')?.value;
    const organizationId = jar.get('dt_organization')?.value;
    if (!token) return null;
    try {
      const clientContext = await bffClientContextHeaders();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/auth/me`,
        {
          headers: {
            ...clientContext,
            authorization: `Bearer ${token}`,
            ...(organizationId ? { 'x-organization-id': organizationId } : {}),
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
          availableMemberships?: { role?: unknown; organizationId?: unknown }[];
          selectedOrganizationId?: unknown;
          mfaVerified?: unknown;
          mfaRequired?: unknown;
        };
      };
      const memberships = normalizeMemberships(envelope.data?.memberships);
      const availableMemberships = normalizeMemberships(envelope.data?.availableMemberships);
      const roles = [
        ...(Array.isArray(envelope.data?.roles) ? envelope.data.roles : []),
        ...memberships.map(({ role }) => role),
        ...availableMemberships.map(({ role }) => role),
      ].filter((role): role is string => typeof role === 'string');
      if (typeof envelope.data?.id !== 'string' || !roles.some((role) => operationsRoles.has(role)))
        return null;
      return {
        token,
        ...(typeof envelope.data.selectedOrganizationId === 'string'
          ? { organizationId: envelope.data.selectedOrganizationId }
          : {}),
        userId: envelope.data.id,
        roles: [...new Set(roles)],
        availableMemberships,
        mfaVerified: envelope.data.mfaVerified === true,
        mfaRequired: envelope.data.mfaRequired === true,
      };
    } catch {
      return null;
    }
  },
);

export async function requireOperationsSession(): Promise<OperationsSession> {
  const session = await readOperationsSession();
  if (!session) redirectToLogin();
  return session;
}

function normalizeMemberships(value: unknown): OperationsMembership[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('organizationId' in item) ||
      !('role' in item) ||
      typeof item.organizationId !== 'string' ||
      typeof item.role !== 'string'
    )
      return [];
    return [{ organizationId: item.organizationId, role: item.role }];
  });
}

function redirectToLogin(): never {
  redirect(
    `${process.env.PUBLIC_APP_URL ?? 'http://localhost:3003'}/vi/auth/login?product=operations`,
  );
}
