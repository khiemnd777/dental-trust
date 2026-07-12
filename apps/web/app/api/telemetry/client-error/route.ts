import { NextResponse } from 'next/server';

const digestPattern = /^(?:[A-Za-z0-9_-]{1,128}|unavailable)$/;
const routeFamilyPattern = /^\/(?:vi|en|unknown-locale)(?:\/[a-z-]{1,40})?$/;

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin || (fetchSite && fetchSite !== 'same-origin')) return false;
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').origin;
    return new URL(origin).origin === configured;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength > 2_048)
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { code?: unknown }).code !== 'route_render_failure' ||
    typeof (body as { digest?: unknown }).digest !== 'string' ||
    !digestPattern.test((body as { digest: string }).digest) ||
    typeof (body as { routeFamily?: unknown }).routeFamily !== 'string' ||
    !routeFamilyPattern.test((body as { routeFamily: string }).routeFamily)
  )
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const eventId = crypto.randomUUID();
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'client_route_error',
      eventId,
      code: 'route_render_failure',
      digest: (body as { digest: string }).digest,
      routeFamily: (body as { routeFamily: string }).routeFamily,
      occurredAt: new Date().toISOString(),
    }),
  );
  await reportExternally({
    eventId,
    digest: (body as { digest: string }).digest,
    routeFamily: (body as { routeFamily: string }).routeFamily,
  });
  return NextResponse.json(
    { accepted: true, eventId },
    { status: 202, headers: { 'cache-control': 'no-store' } },
  );
}

async function reportExternally(event: {
  readonly eventId: string;
  readonly digest: string;
  readonly routeFamily: string;
}) {
  const endpoint = process.env.ERROR_TRACKING_DSN;
  if (!endpoint) return;
  try {
    const url = new URL(endpoint);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return;
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        errorType: 'ClientRouteRenderFailure',
        message: 'A client route error boundary was activated.',
        context: event,
      }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'client_error_reporting_failed',
        eventId: event.eventId,
      }),
    );
  }
}
