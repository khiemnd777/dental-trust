import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';
import type { PortalArea } from '@/lib/routing';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') as PortalArea | null;
  const caseId = url.searchParams.get('caseId');
  const versionId = url.searchParams.get('versionId');
  if (
    (area !== 'patient' && area !== 'clinic') ||
    !caseId ||
    !versionId ||
    !uuidPattern.test(caseId) ||
    !uuidPattern.test(versionId)
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await authorizePortalRoute(session, area, 'passport', caseId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (session.source === 'development') {
    return NextResponse.json({
      data: { url: '/icons/icon.svg', expiresAt: '2026-07-12T08:05:00.000Z' },
      adapter: 'development',
    });
  }
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  if (!api || !token) {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${api}/cases/${caseId}/passport/versions/${versionId}/download`, {
      headers: sessionApiHeaders(session, token),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
