import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  adminAccountStatusCommandSchema,
  adminUserRoleCommandSchema,
} from '@dental-trust/contracts';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';

const views = new Set([
  'users',
  'organizations',
  'clinics',
  'dentists',
  'cases',
  'payments',
  'roles',
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get('view');
  if (!view || !views.has(view))
    return NextResponse.json({ error: 'invalid_view' }, { status: 400 });
  const cursor = url.searchParams.get('cursor');
  const search = url.searchParams.get('search')?.trim();
  const status = url.searchParams.get('status')?.trim();
  if (cursor && !uuidPattern.test(cursor))
    return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 });
  if (search && (search.length < 2 || search.length > 120))
    return NextResponse.json({ error: 'invalid_search' }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await authorizePortalRoute(session, 'admin', view)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.source === 'development')
    return NextResponse.json({ data: developmentData(view), page: { nextCursor: null } });
  const query = new URLSearchParams({
    limit: '50',
    ...(cursor ? { cursor } : {}),
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  });
  return proxyRequest(`admin/directory/${view}?${query}`, session);
}

export async function POST(request: Request) {
  if (!allowedOrigin((await headers()).get('origin')))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: {
    view?: string;
    kind?: string;
    userId?: string;
    command?: unknown;
    idempotencyKey?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (
    body.view !== 'users' ||
    (body.kind !== 'status' && body.kind !== 'role') ||
    !body.userId ||
    !uuidPattern.test(body.userId) ||
    !body.idempotencyKey ||
    !uuidPattern.test(body.idempotencyKey)
  ) {
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  }
  if (!(await authorizePortalRoute(session, 'admin', 'users')))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const parsed =
    body.kind === 'status'
      ? adminAccountStatusCommandSchema.safeParse(body.command)
      : adminUserRoleCommandSchema.safeParse(body.command);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_confirmation' }, { status: 400 });
  if (session.source === 'development')
    return NextResponse.json({ data: { outcome: 'UPDATED' }, adapter: 'development' });
  const path = `admin/directory/users/${body.userId}/${body.kind === 'status' ? 'status' : 'roles'}`;
  return proxyRequest(path, session, {
    idempotencyKey: body.idempotencyKey,
    payload: parsed.data,
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

function developmentData(view: string): unknown[] {
  const createdAt = '2026-07-12T08:00:00.000Z';
  if (view === 'users')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        email: 'admin@example.test',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        roles: ['PLATFORM_ADMIN'],
        mfaEnabled: true,
        activeSessionCount: 1,
        createdAt,
      },
    ];
  if (view === 'organizations')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
        type: 'CLINIC',
        name: 'Minh An Dental Center',
        slug: 'minh-an-dental-center',
        active: true,
        memberCount: 4,
        createdAt,
      },
    ];
  if (view === 'clinics')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
        organizationId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
        name: 'Minh An Dental Center',
        slug: 'minh-an-dental-center',
        verificationStatus: 'VERIFIED',
        activeLocationCount: 1,
        activeDentistCount: 2,
        createdAt,
      },
    ];
  if (view === 'dentists')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04',
        fullName: 'Dr. Minh Nguyen',
        slug: 'dr-minh-nguyen',
        licenseStatus: 'VERIFIED',
        activeClinicCount: 1,
        createdAt,
      },
    ];
  if (view === 'cases')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
        caseNumber: 'DT-2026-A1B2C3D4E5',
        status: 'MATCHING_IN_PROGRESS',
        preferredLocation: 'Ho Chi Minh City',
        activeAssignmentCount: 1,
        createdAt,
        updatedAt: createdAt,
      },
    ];
  if (view === 'payments')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
        bookingId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e07',
        provider: 'stripe',
        status: 'SUCCEEDED',
        amountMinor: '25000000',
        currency: 'VND',
        refundCount: 0,
        createdAt,
      },
    ];
  return [
    {
      code: 'PLATFORM_ADMIN',
      displayName: 'Platform administrator',
      privileged: true,
      permissions: ['audit:read', 'privacy:manage'],
      userCount: 2,
      membershipCount: 0,
    },
  ];
}
