import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  adminGovernanceCommandEnvelopeSchema,
  adminGovernanceViewSchema,
  idempotencyKeySchema,
} from '@dental-trust/contracts';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedView = adminGovernanceViewSchema.safeParse(url.searchParams.get('view'));
  if (!parsedView.success) return NextResponse.json({ error: 'invalid_view' }, { status: 400 });
  const cursor = url.searchParams.get('cursor');
  if (cursor && !uuidPattern.test(cursor))
    return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await authorizePortalRoute(session, 'admin', routeKey(parsedView.data))))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.source === 'development')
    return NextResponse.json({
      data: developmentData(parsedView.data),
      page: { nextCursor: null },
    });
  const query = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) });
  return proxyRequest(`admin/governance/${parsedView.data}?${query}`, session);
}

export async function POST(request: Request) {
  if (!allowedOrigin((await headers()).get('origin')))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let untrusted: unknown;
  try {
    untrusted = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!untrusted || typeof untrusted !== 'object' || Array.isArray(untrusted))
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  const idempotencyKey = idempotencyKeySchema.safeParse(Reflect.get(untrusted, 'idempotencyKey'));
  const envelope = adminGovernanceCommandEnvelopeSchema.safeParse({
    view: Reflect.get(untrusted, 'view'),
    command: Reflect.get(untrusted, 'command'),
  });
  if (!idempotencyKey.success || !envelope.success)
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  if (!(await authorizePortalRoute(session, 'admin', routeKey(envelope.data.view))))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.source === 'development')
    return NextResponse.json({
      data: { resourceId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9eee', version: 1 },
      adapter: 'development',
    });
  return proxyRequest('admin/governance', session, {
    idempotencyKey: idempotencyKey.data,
    payload: envelope.data,
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

function routeKey(view: string) {
  if (view === 'templates') return 'notifications';
  if (view === 'feature-flags' || view === 'configuration' || view === 'locations') return 'flags';
  return view;
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

function developmentData(view: string): unknown[] {
  const id = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
  const createdAt = '2026-07-12T08:00:00.000Z';
  const names = { 'vi-VN': 'Nha khoa tổng quát', 'en-US': 'General dentistry' };
  if (view === 'content')
    return [
      {
        id,
        slug: 'patient-safety',
        locale: 'en-US',
        version: 2,
        title: 'Patient safety',
        summary: 'How Dental Trust protects patients.',
        publicationStatus: 'PUBLISHED',
        publishedAt: createdAt,
        archivedAt: null,
        createdAt,
      },
    ];
  if (view === 'taxonomy')
    return [
      {
        id,
        kind: 'service_category',
        parentId: null,
        code: 'general-dentistry',
        names,
        active: true,
        version: 1,
        updatedAt: createdAt,
      },
    ];
  if (view === 'templates')
    return [
      {
        id,
        key: 'case.updated',
        category: 'CASE_UPDATES',
        channel: 'EMAIL',
        locale: 'en-US',
        createdAt,
        latestVersion: {
          id,
          version: 3,
          subject: 'Your Dental Trust case was updated',
          publicationStatus: 'PUBLISHED',
          createdAt,
        },
      },
    ];
  if (view === 'feature-flags')
    return [
      {
        id,
        key: 'patient.passport-sharing',
        description: 'Allow patients to create time-limited Passport shares.',
        createdAt,
        latestVersion: {
          id,
          version: 4,
          enabled: true,
          environment: 'production',
          audiences: ['PATIENT'],
          createdAt,
        },
      },
    ];
  if (view === 'configuration')
    return [
      {
        id,
        key: 'booking.deposit-percent',
        description: 'Default booking deposit percentage.',
        valueType: 'INTEGER',
        createdAt,
        latestVersion: { id, version: 2, value: '20', createdAt },
      },
    ];
  return [
    {
      id,
      kind: 'country',
      code: 'VN',
      names: { 'vi-VN': 'Việt Nam', 'en-US': 'Vietnam' },
      currency: 'VND',
      callingCode: '+84',
      active: true,
      version: 1,
      updatedAt: createdAt,
    },
  ];
}
