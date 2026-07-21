import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { bffClientContextHeaders } from '@/lib/bff-client-context';
import { useDevelopmentAuthAdapter } from '@/lib/session';

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
  let body: { name?: string; email?: string; topic?: string; message?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (
    !body.name ||
    body.name.trim().length < 2 ||
    !body.email?.includes('@') ||
    !body.topic ||
    !body.message ||
    body.message.trim().length < 20
  )
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (useDevelopmentAuthAdapter())
    return NextResponse.json(
      {
        accepted: true,
        reference: `DT-SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        adapter: 'development',
      },
      { status: 202 },
    );
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const clientContext = await bffClientContextHeaders(request.headers);
    const upstream = await fetch(`${api}/contact`, {
      method: 'POST',
      headers: {
        ...clientContext,
        'content-type': 'application/json',
        'x-idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    return NextResponse.json(upstream.ok ? { accepted: true } : { error: 'upstream_rejected' }, {
      status: upstream.status,
    });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
