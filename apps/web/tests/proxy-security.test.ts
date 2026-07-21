import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '@/proxy';

afterEach(() => vi.unstubAllEnvs());

describe('web security proxy', () => {
  it('marks private portal and API responses as non-cacheable and non-indexable', () => {
    const portal = proxy(new NextRequest('http://localhost:3000/en/app/cases'));
    const api = proxy(new NextRequest('http://localhost:3000/api/portal/data'));

    for (const response of [portal, api]) {
      expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
      expect(response.headers.get('content-security-policy')).toContain("object-src 'none'");
    }
  });

  it('allows public pages to retain their intended cache policy', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.dentaltrust.example');
    const response = proxy(new NextRequest('http://localhost:3000/vi/clinics'));

    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain(
      'https://api.dentaltrust.example',
    );
    expect(response.headers.get('content-security-policy')).toContain('https://js.stripe.com');
    expect(response.headers.get('content-security-policy')).toContain('https://api.stripe.com');
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    );
  });

  it.each([
    { contentLength: null, status: 411, code: 'LENGTH_REQUIRED' },
    { contentLength: 'invalid', status: 400, code: 'INVALID_CONTENT_LENGTH' },
    { contentLength: String(256 * 1024 + 1), status: 413, code: 'PAYLOAD_TOO_LARGE' },
  ])('rejects unsafe mutation body metadata: $code', async ({ contentLength, status, code }) => {
    const headers = new Headers();
    if (contentLength !== null) headers.set('content-length', contentLength);
    const response = proxy(
      new NextRequest('http://localhost:3000/api/portal/commands', {
        method: 'POST',
        headers,
      }),
    );

    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it('does not impose body headers on safe methods', () => {
    const response = proxy(new NextRequest('http://localhost:3000/api/portal/data'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
