import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  createPrivacyRequestSchema,
  idempotencyKeySchema,
  processPrivacyRequestSchema,
} from '@dental-trust/contracts';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get('view');
  if (view !== 'patient' && view !== 'queue')
    return NextResponse.json({ error: 'invalid_view' }, { status: 400 });
  const cursor = url.searchParams.get('cursor');
  if (cursor && !uuidPattern.test(cursor))
    return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await authorized(session, view)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.source === 'development')
    return NextResponse.json({ data: [developmentRecord(view)], page: { nextCursor: null } });
  const query = new URLSearchParams({
    limit: '50',
    queue: view === 'queue' ? 'true' : 'false',
    ...(cursor ? { cursor } : {}),
  });
  return proxyRequest(`trust/privacy/requests?${query}`, session);
}

export async function POST(request: Request) {
  if (!allowedOrigin((await headers()).get('origin')))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: {
    command?: string;
    privacyRequestId?: string;
    input?: unknown;
    idempotencyKey?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const idempotencyKey = idempotencyKeySchema.safeParse(body.idempotencyKey);
  if (!idempotencyKey.success)
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  if (body.command === 'create') {
    const parsed = createPrivacyRequestSchema.safeParse(body.input);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
    if (!(await authorized(session, 'patient')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (session.source === 'development')
      return NextResponse.json({
        data: {
          ...developmentRecord('patient'),
          id: crypto.randomUUID(),
          type: parsed.data.type,
          reason: parsed.data.reason,
        },
        adapter: 'development',
      });
    return proxyRequest('trust/privacy/requests', session, {
      idempotencyKey: idempotencyKey.data,
      payload: parsed.data,
    });
  }
  if (
    body.command === 'transition' &&
    body.privacyRequestId &&
    uuidPattern.test(body.privacyRequestId)
  ) {
    const parsed = processPrivacyRequestSchema.safeParse(body.input);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
    if (!(await authorized(session, 'queue')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (session.source === 'development')
      return NextResponse.json({
        data: {
          ...developmentRecord('queue'),
          status: parsed.data.toStatus,
          patientMessage: parsed.data.patientMessage,
          version: parsed.data.expectedVersion + 1,
        },
        adapter: 'development',
      });
    return proxyRequest(`trust/privacy/requests/${body.privacyRequestId}/transitions`, session, {
      idempotencyKey: idempotencyKey.data,
      payload: parsed.data,
    });
  }
  return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
}

async function authorized(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  view: 'patient' | 'queue',
) {
  return view === 'patient'
    ? authorizePortalRoute(session, 'patient', 'privacy')
    : authorizePortalRoute(session, 'admin', 'privacy');
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

function developmentRecord(view: string) {
  const createdAt = '2026-07-12T08:00:00.000Z';
  return {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    type: view === 'queue' ? 'DELETE' : 'EXPORT',
    status: view === 'queue' ? 'IN_REVIEW' : 'SUBMITTED',
    reason:
      view === 'queue'
        ? 'Patient requested closure after the active treatment record retention review.'
        : 'I need a portable copy of my Dental Trust records.',
    patientMessage: null,
    dueAt: '2026-08-11T08:00:00.000Z',
    version: view === 'queue' ? 2 : 1,
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}
