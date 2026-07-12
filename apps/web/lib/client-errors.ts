export interface ClientErrorReport {
  readonly code: 'route_render_failure';
  readonly digest: string;
  readonly routeFamily: string;
}

const digestPattern = /^[A-Za-z0-9_-]{1,128}$/;
const localePattern = /^(vi|en)$/;

export function buildClientErrorReport(
  error: Error & { digest?: string },
  pathname: string,
): ClientErrorReport {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .slice(0, 2)
    .map((segment, index) => {
      if (index === 0) return localePattern.test(segment) ? segment : 'unknown-locale';
      return /^[a-z-]{1,40}$/.test(segment) ? segment : 'unknown-route';
    });
  return {
    code: 'route_render_failure',
    digest: error.digest && digestPattern.test(error.digest) ? error.digest : 'unavailable',
    routeFamily: `/${segments.join('/') || 'unknown-locale'}`,
  };
}

export async function reportClientError(
  error: Error & { digest?: string },
  pathname: string,
): Promise<void> {
  try {
    await fetch('/api/telemetry/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildClientErrorReport(error, pathname)),
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Telemetry must never prevent recovery from the original route failure.
  }
}
