import { describe, expect, it, vi } from 'vitest';
import { buildClientErrorReport, reportClientError } from '@/lib/client-errors';

describe('client error telemetry', () => {
  it('retains only a validated digest and coarse route family', () => {
    const error = Object.assign(new Error('patient private detail'), {
      digest: 'next_digest-123',
      stack: 'private stack',
    });

    const report = buildClientErrorReport(
      error,
      '/en/app/cases/018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e11?secret=value',
    );

    expect(report).toEqual({
      code: 'route_render_failure',
      digest: 'next_digest-123',
      routeFamily: '/en/app',
    });
    expect(JSON.stringify(report)).not.toContain('patient private detail');
    expect(JSON.stringify(report)).not.toContain('018f0c6a');
  });

  it('rejects attacker-controlled digest and route segments', () => {
    expect(
      buildClientErrorReport(
        Object.assign(new Error('failure'), { digest: '<script>secret</script>' }),
        '/not-a-locale/Patient.Email@example.com/cases',
      ),
    ).toEqual({
      code: 'route_render_failure',
      digest: 'unavailable',
      routeFamily: '/unknown-locale/unknown-route',
    });
    expect(buildClientErrorReport(new Error('failure'), '/').routeFamily).toBe('/unknown-locale');
  });

  it('never rethrows a telemetry transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(reportClientError(new Error('failure'), '/vi/app')).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });
});
