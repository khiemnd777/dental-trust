import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  notificationChannelSchema,
  notificationCategorySchema,
  updateNotificationPreferenceSchema,
} from '@dental-trust/contracts';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const developmentNotifications = [
  {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f01',
    category: 'APPOINTMENTS',
    channel: 'IN_APP',
    templateKey: 'appointment.confirmed',
    status: 'DELIVERED',
    scheduledAt: '2026-07-12T08:00:00.000Z',
    deliveredAt: '2026-07-12T08:00:01.000Z',
    readAt: null,
  },
  {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f02',
    category: 'AFTERCARE',
    channel: 'IN_APP',
    templateKey: 'aftercare.check-in-due',
    status: 'DELIVERED',
    scheduledAt: '2026-07-11T08:00:00.000Z',
    deliveredAt: '2026-07-11T08:00:01.000Z',
    readAt: '2026-07-11T09:00:00.000Z',
  },
];

function developmentPreferences() {
  return notificationCategorySchema.options.flatMap((category) =>
    notificationChannelSchema.options.map((channel) => ({
      category,
      channel,
      enabled: true,
      locked: category === 'ACCOUNT_SECURITY',
    })),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get('view');
  if (view !== 'notifications' && view !== 'preferences')
    return NextResponse.json({ error: 'invalid_view' }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const pageKey = view === 'notifications' ? 'notifications' : 'settings';
  if (!(await authorizePortalRoute(session, 'patient', pageKey)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.source === 'development') {
    return NextResponse.json({
      data: view === 'notifications' ? developmentNotifications : developmentPreferences(),
      adapter: 'development',
    });
  }
  return proxyRequest(
    view === 'notifications' ? 'notifications?limit=50' : 'notification-preferences',
  );
}

export async function POST(request: Request) {
  const requestHeaders = await headers();
  if (!allowedOrigin(requestHeaders.get('origin')))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: {
    command?: string;
    notificationId?: string;
    preference?: unknown;
    idempotencyKey?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.idempotencyKey || !uuidPattern.test(body.idempotencyKey))
    return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 });
  if (body.command === 'mark_read') {
    if (!body.notificationId || !uuidPattern.test(body.notificationId))
      return NextResponse.json({ error: 'invalid_notification_id' }, { status: 400 });
    if (!(await authorizePortalRoute(session, 'patient', 'notifications')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (session.source === 'development')
      return NextResponse.json({ accepted: true, adapter: 'development' }, { status: 202 });
    return proxyRequest(`notifications/${body.notificationId}/read`, {
      method: 'POST',
      idempotencyKey: body.idempotencyKey,
      payload: {},
    });
  }
  if (body.command === 'update_preference') {
    const parsed = updateNotificationPreferenceSchema.safeParse(body.preference);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_preference' }, { status: 400 });
    if (!(await authorizePortalRoute(session, 'patient', 'settings')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (session.source === 'development')
      return NextResponse.json({ data: { ...parsed.data, locked: false }, adapter: 'development' });
    return proxyRequest('notification-preferences', {
      method: 'PUT',
      idempotencyKey: body.idempotencyKey,
      payload: parsed.data,
    });
  }
  return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
}

async function proxyRequest(
  path: string,
  mutation?: {
    readonly method: 'POST' | 'PUT';
    readonly idempotencyKey: string;
    readonly payload: object;
  },
) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  const session = await getSession();
  if (!api || !token || !session)
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
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
