import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const production = process.env.NODE_ENV === 'production';
  const apiOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin;
    } catch {
      return '';
    }
  })();
  const objectStorageOrigin = (() => {
    try {
      return new URL(process.env.S3_ENDPOINT ?? '').origin;
    } catch {
      return '';
    }
  })();
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com${production ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://api.stripe.com${apiOrigin ? ` ${apiOrigin}` : ''}${objectStorageOrigin ? ` ${objectStorageOrigin}` : ''}${production ? '' : ' ws: wss:'}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  const locale = request.nextUrl.pathname.match(/^\/(vi|en)(?:\/|$)/)?.[1] ?? 'vi';
  requestHeaders.set('x-dental-trust-locale', locale);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  const privatePath =
    /^\/(?:vi|en)\/(?:app|clinic|concierge|verification-admin|admin|auth)(?:\/|$)/.test(
      request.nextUrl.pathname,
    ) || request.nextUrl.pathname.startsWith('/api/');
  if (privatePath) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)'],
};
