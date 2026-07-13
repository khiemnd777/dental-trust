function firstForwardedValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

/**
 * Validate browser mutations against the public request origin.
 *
 * Next.js can expose an internal container URL (for example 0.0.0.0) in
 * `request.url`, while the browser correctly sends the public host in Origin.
 * Host/forwarded headers describe that public edge and are therefore the
 * correct comparison target for same-origin BFF commands.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin || (fetchSite && fetchSite !== 'same-origin')) return false;

  try {
    const internalUrl = new URL(request.url);
    const host =
      firstForwardedValue(request.headers.get('x-forwarded-host')) ??
      request.headers.get('host') ??
      internalUrl.host;
    const protocol =
      firstForwardedValue(request.headers.get('x-forwarded-proto')) ??
      internalUrl.protocol.replace(/:$/u, '');
    if (!host || (protocol !== 'http' && protocol !== 'https')) return false;

    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
