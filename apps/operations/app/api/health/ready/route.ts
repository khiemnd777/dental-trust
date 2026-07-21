import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const ready = Boolean(apiUrl);
  return NextResponse.json(
    {
      status: ready ? 'ready' : 'degraded',
      service: 'operations',
      checks: {
        apiUrlConfigured: Boolean(apiUrl),
      },
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
