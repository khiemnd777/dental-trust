import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  let apiAvailable = false;

  if (apiUrl) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/u, '')}/health/ready`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2_500),
      });
      apiAvailable = response.ok;
    } catch {
      apiAvailable = false;
    }
  }

  const ready = Boolean(apiUrl && apiAvailable);
  return NextResponse.json(
    {
      status: ready ? 'ready' : 'degraded',
      service: 'operations',
      checks: {
        apiUrlConfigured: Boolean(apiUrl),
        api: apiAvailable ? 'available' : 'unavailable',
      },
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
