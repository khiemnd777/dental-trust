import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { bffClientContextHeaders } from '@/lib/bff-client-context';
import { getSession, useDevelopmentAuthAdapter } from '@/lib/session';

type FlowKind = 'reset' | 'mfa' | 'sessions';
const endpoints: Record<FlowKind, string> = {
  reset: 'auth/password-reset/request',
  mfa: 'auth/mfa/verify',
  sessions: 'auth/logout',
};

function sameOrigin(origin: string | null) {
  if (!origin) return false;
  try {
    return (
      new URL(origin).origin ===
      new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').origin
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin((await headers()).get('origin')))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  let body: {
    kind?: FlowKind;
    email?: string;
    code?: string;
    token?: string;
    newPassword?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.kind || !(body.kind in endpoints))
    return NextResponse.json({ error: 'invalid_flow' }, { status: 400 });
  if (
    body.kind === 'reset' &&
    body.token &&
    (body.token.length < 32 || !body.newPassword || body.newPassword.length < 12)
  )
    return NextResponse.json({ error: 'invalid_reset' }, { status: 400 });
  if (body.kind === 'reset' && !body.token && !body.email?.includes('@'))
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  if (body.kind === 'mfa' && !/^[0-9]{6}$/.test(body.code ?? ''))
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  if (body.kind !== 'reset' && !(await getSession()))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (useDevelopmentAuthAdapter())
    return NextResponse.json({ accepted: true, adapter: 'development' }, { status: 202 });
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const token = (await cookies()).get('dt_session')?.value;
  try {
    const clientContext = await bffClientContextHeaders(request.headers);
    const endpoint =
      body.kind === 'reset' && body.token ? 'auth/password-reset/consume' : endpoints[body.kind];
    const upstream = await fetch(`${api}/${endpoint}`, {
      method: 'POST',
      headers: {
        ...clientContext,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(
        body.kind === 'reset' && body.token
          ? { token: body.token, newPassword: body.newPassword }
          : body.kind === 'mfa'
            ? { method: 'totp', code: body.code }
            : { email: body.email, code: body.code },
      ),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!upstream.ok)
      return NextResponse.json({ error: 'upstream_rejected' }, { status: upstream.status });
    if (body.kind === 'sessions') {
      const cookieStore = await cookies();
      cookieStore.delete('dt_session');
      cookieStore.delete('dt_csrf');
      cookieStore.delete('dt_organization');
    }
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
