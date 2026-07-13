function firstForwardedValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

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
