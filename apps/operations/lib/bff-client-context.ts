import {
  bffClientContextHeader,
  createBffClientContext,
  trustedClientIdentityFromHeaders,
} from '@dental-trust/security';
import { headers } from 'next/headers';

export async function bffClientContextHeaders(
  requestHeaders?: Pick<Headers, 'get'>,
): Promise<Record<string, string>> {
  const secret = configuredSecret();
  if (!secret) return {};
  const source = requestHeaders ?? (await headers());
  const identity = trustedClientIdentityFromHeaders(
    source,
    process.env.BFF_TRUSTED_CLIENT_IP_HEADER ?? 'x-real-ip',
  );
  return identity ? { [bffClientContextHeader]: createBffClientContext(secret, identity) } : {};
}

function configuredSecret(): string | null {
  const value =
    process.env.BFF_CLIENT_CONTEXT_SECRET ?? 'development-only-bff-context-secret-change-me';
  if (value.length >= 32 && !value.includes('development-only')) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BFF_CLIENT_CONTEXT_SECRET must be a unique production secret');
  }
  return value.length >= 32 ? value : null;
}
