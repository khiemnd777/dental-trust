import { evaluateRequestBodyPolicy } from '@dental-trust/security';
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const bodyPolicy = evaluateRequestBodyPolicy({
    method: request.method,
    pathname: request.nextUrl.pathname,
    contentLength: request.headers.get('content-length'),
  });
  if (bodyPolicy.allowed) return NextResponse.next();

  return NextResponse.json(
    { error: { code: bodyPolicy.code, message: 'The request body was rejected.' } },
    {
      status: bodyPolicy.status,
      headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
    },
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
