import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'web',
      version: process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'development',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
