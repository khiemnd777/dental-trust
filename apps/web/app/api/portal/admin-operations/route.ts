import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  adminNotificationRetryCommandSchema,
  adminRetryCommandSchema,
} from '@dental-trust/contracts';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';

const views = new Set(['dashboard', 'audit', 'jobs', 'notifications', 'webhooks', 'health']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get('view');
  if (!view || !views.has(view))
    return NextResponse.json({ error: 'invalid_view' }, { status: 400 });
  const cursor = url.searchParams.get('cursor');
  if (cursor && !uuidPattern.test(cursor))
    return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await authorizePortalRoute(session, 'admin', view)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.source === 'development')
    return NextResponse.json({ data: developmentData(view), page: { nextCursor: null } });
  const path = upstreamPath(view, cursor ?? undefined);
  return proxyRequest(path, session);
}

export async function POST(request: Request) {
  const requestHeaders = await headers();
  if (!allowedOrigin(requestHeaders.get('origin')))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: {
    view?: string;
    entityId?: string;
    reason?: string;
    confirmation?: string;
    expectedAttemptCount?: number;
    idempotencyKey?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (
    (body.view !== 'jobs' && body.view !== 'notifications') ||
    !body.entityId ||
    !uuidPattern.test(body.entityId) ||
    !body.idempotencyKey ||
    !uuidPattern.test(body.idempotencyKey)
  ) {
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  }
  if (!(await authorizePortalRoute(session, 'admin', body.view)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const command =
    body.view === 'jobs'
      ? adminRetryCommandSchema.safeParse({
          reason: body.reason,
          confirmation: body.confirmation,
          expectedAttemptCount: body.expectedAttemptCount,
        })
      : adminNotificationRetryCommandSchema.safeParse({
          reason: body.reason,
          confirmation: body.confirmation,
        });
  if (!command.success)
    return NextResponse.json({ error: 'invalid_confirmation' }, { status: 400 });
  if (session.source === 'development')
    return NextResponse.json({ data: { status: 'PENDING' }, adapter: 'development' });
  const path =
    body.view === 'jobs'
      ? `admin/operations/jobs/outbox/${body.entityId}/retry`
      : `admin/operations/jobs/notifications/${body.entityId}/retry`;
  return proxyRequest(path, session, {
    method: 'POST',
    idempotencyKey: body.idempotencyKey,
    payload: command.data,
  });
}

function upstreamPath(view: string, cursor?: string) {
  const suffix = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) }).toString();
  if (view === 'dashboard') return 'admin/operations/summary';
  if (view === 'audit') return `admin/operations/audit-logs?${suffix}`;
  if (view === 'jobs') return `admin/operations/jobs/outbox?${suffix}`;
  if (view === 'notifications') return `admin/operations/jobs/notifications?${suffix}`;
  if (view === 'webhooks') return `admin/operations/webhooks?${suffix}`;
  return 'health/ready';
}

async function proxyRequest(
  path: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  mutation?: {
    readonly method: 'POST';
    readonly idempotencyKey: string;
    readonly payload: object;
  },
) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  if (!api || !token) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const upstream = await fetch(`${api}/${path}`, {
      method: mutation?.method ?? 'GET',
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

function developmentData(view: string): unknown {
  if (view === 'dashboard')
    return {
      activeUsers: 128,
      openCases: 34,
      pendingVerifications: 7,
      unresolvedIncidents: 2,
      failedOutboxEvents: 1,
      failedNotifications: 2,
      failedWebhooks: 0,
      pendingPrivacyRequests: 3,
      generatedAt: '2026-07-12T10:00:00.000Z',
    };
  if (view === 'health')
    return {
      status: 'ready',
      service: 'dental-trust-api',
      dependencies: { database: 'available', objectStorage: 'available' },
    };
  if (view === 'jobs')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f11',
        eventType: 'notification.delivery-requested',
        aggregateType: 'Notification',
        status: 'DEAD_LETTER',
        attemptCount: 8,
        availableAt: '2026-07-12T09:00:00.000Z',
        processedAt: null,
        lastErrorCode: 'QUEUE_PUBLISH_FAILED',
        createdAt: '2026-07-12T08:00:00.000Z',
      },
    ];
  if (view === 'notifications')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f12',
        category: 'APPOINTMENTS',
        channel: 'EMAIL',
        templateKey: 'appointment.reminder',
        status: 'FAILED',
        scheduledAt: '2026-07-12T08:00:00.000Z',
        deliveredAt: null,
      },
    ];
  if (view === 'webhooks')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f13',
        provider: 'stripe',
        providerEventId: 'evt_development_redacted',
        type: 'payment_intent.succeeded',
        status: 'PROCESSED',
        attemptCount: 1,
        receivedAt: '2026-07-12T07:00:00.000Z',
        processedAt: '2026-07-12T07:00:01.000Z',
        lastErrorCode: null,
      },
    ];
  return [
    {
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f14',
      actorType: 'USER',
      actorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      organizationId: null,
      action: 'case.created',
      resourceType: 'DentalCase',
      resourceId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      requestId: 'development-request',
      reason: null,
      success: true,
      createdAt: '2026-07-12T06:00:00.000Z',
    },
  ];
}
