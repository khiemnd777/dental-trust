import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getSession } from '@/lib/session';
import { consumeLocalAbuseBudget } from '@/lib/local-abuse-budget';

const eventNames = new Set([
  'today_viewed',
  'journey_action_opened',
  'case_hub_viewed',
  'mobile_more_opened',
  'notification_action_opened',
]);
const propertyKeys = new Set(['area', 'stage', 'action', 'urgency', 'target']);

export async function POST(request: Request) {
  const requestHeaders = await headers();
  if (!allowedOrigin(requestHeaders.get('origin')))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const rawContentLength = request.headers.get('content-length');
  if (!rawContentLength) return NextResponse.json({ error: 'length_required' }, { status: 411 });
  if (!/^\d+$/u.test(rawContentLength))
    return NextResponse.json({ error: 'invalid_content_length' }, { status: 400 });
  const contentLength = Number(rawContentLength);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0)
    return NextResponse.json({ error: 'invalid_content_length' }, { status: 400 });
  if (contentLength > 2_048)
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });

  const budget = consumeLocalAbuseBudget('product-event', 600, 60_000);
  if (!budget.allowed)
    return NextResponse.json(
      { error: 'rate_limited' },
      {
        status: 429,
        headers: {
          'cache-control': 'no-store',
          'retry-after': String(budget.retryAfterSeconds),
        },
      },
    );
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { name?: unknown; properties?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof body.name !== 'string' || !eventNames.has(body.name))
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 });
  const properties = sanitizeProperties(body.properties);
  if (!properties) return NextResponse.json({ error: 'invalid_properties' }, { status: 400 });

  // Deliberately excludes case IDs, names, email, clinical text, and other patient data.
  console.info(
    JSON.stringify({
      type: 'product_event',
      name: body.name,
      subject: createHash('sha256')
        .update(`${process.env.AUTH_SECRET ?? 'development'}:${session.id}`)
        .digest('hex')
        .slice(0, 20),
      properties,
      occurredAt: new Date().toISOString(),
    }),
  );
  return new NextResponse(null, { status: 202 });
}

function sanitizeProperties(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > propertyKeys.size) return null;
  const sanitized: Record<string, string> = {};
  for (const [key, candidate] of entries) {
    if (!propertyKeys.has(key) || typeof candidate !== 'string' || candidate.length > 64)
      return null;
    sanitized[key] = candidate;
  }
  return sanitized;
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
