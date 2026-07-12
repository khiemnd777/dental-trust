import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getSession, sessionApiHeaders } from '@/lib/session';

export async function GET(request: Request) {
  const locale = new URL(request.url).searchParams.get('locale') === 'en' ? 'en-US' : 'vi-VN';
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!session.roles.includes('PATIENT'))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.source === 'development')
    return NextResponse.json({
      data: {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9eef',
        purpose: 'CLINIC_INTRODUCTION',
        version: '2026-07',
        locale,
        contentHash: 'f'.repeat(64),
        publishedAt: '2026-07-01T00:00:00.000Z',
      },
      adapter: 'development',
    });
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  if (!api || !token) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const upstream = await fetch(`${api}/matching/introduction-consent?locale=${locale}`, {
      headers: sessionApiHeaders(session, token),
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
