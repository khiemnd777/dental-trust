import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  consentLedgerQuerySchema,
  idempotencyKeySchema,
  withdrawConsentSchema,
} from '@dental-trust/contracts';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  if (cursor && !uuidPattern.test(cursor)) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const query = consentLedgerQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? '50',
    ...(cursor ? { cursor } : {}),
    ...(url.searchParams.get('status') ? { status: url.searchParams.get('status') } : {}),
  });
  if (!query.success) return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await authorizePortalRoute(session, 'patient', 'settings'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (session.source === 'development') {
    return NextResponse.json({ data: developmentConsents(), page: { nextCursor: null } });
  }
  const parameters = new URLSearchParams(
    Object.entries(query.data).map(([key, value]) => [key, String(value)]),
  );
  return proxyRequest(`patient/consents?${parameters}`, session);
}

export async function POST(request: Request) {
  if (!allowedOrigin((await headers()).get('origin'))) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { consentRecordId?: string; input?: unknown; idempotencyKey?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const idempotencyKey = idempotencyKeySchema.safeParse(body.idempotencyKey);
  const input = withdrawConsentSchema.safeParse(body.input);
  if (
    !body.consentRecordId ||
    !uuidPattern.test(body.consentRecordId) ||
    !idempotencyKey.success ||
    !input.success
  ) {
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  }
  if (!(await authorizePortalRoute(session, 'patient', 'settings'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (session.source === 'development') {
    const current = developmentConsents().find(({ id }) => id === body.consentRecordId);
    if (!current?.withdrawable) return NextResponse.json({ error: 'conflict' }, { status: 409 });
    return NextResponse.json({
      data: { ...current, withdrawnAt: '2026-07-12T10:00:00.000Z' },
      adapter: 'development',
    });
  }
  return proxyRequest(`patient/consents/${body.consentRecordId}/withdrawals`, session, {
    idempotencyKey: idempotencyKey.data,
    payload: input.data,
  });
}

async function proxyRequest(
  path: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  mutation?: { readonly idempotencyKey: string; readonly payload: object },
) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  if (!api || !token) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const upstream = await fetch(`${api}/${path}`, {
      method: mutation ? 'POST' : 'GET',
      headers: {
        ...sessionApiHeaders(session, token),
        ...(mutation
          ? { 'content-type': 'application/json', 'x-idempotency-key': mutation.idempotencyKey }
          : {}),
      },
      ...(mutation ? { body: JSON.stringify(mutation.payload) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

function allowedOrigin(origin: string | null) {
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

function developmentConsents() {
  return [
    {
      id: '818f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      purpose: 'INTAKE_HEALTH_INFORMATION',
      textVersion: '2026-07-12',
      locale: 'en-US',
      contentHash: 'a'.repeat(64),
      grantedAt: '2026-07-12T08:00:00.000Z',
      withdrawnAt: null,
      withdrawable: true,
    },
    {
      id: '818f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
      purpose: 'TERMS',
      textVersion: '2026-07-12',
      locale: 'en-US',
      contentHash: 'b'.repeat(64),
      grantedAt: '2026-07-12T07:00:00.000Z',
      withdrawnAt: null,
      withdrawable: false,
    },
  ];
}
