import { describe, expect, it } from 'vitest';

import { isSameOriginRequest } from './request-origin';

function request(
  url: string,
  headers: Record<string, string>,
): Request {
  return new Request(url, { headers, method: 'POST' });
}

describe('isSameOriginRequest', () => {
  it('accepts a public localhost origin when Next runs on an internal container host', () => {
    expect(
      isSameOriginRequest(
        request('http://0.0.0.0:3001/api/provider/commands', {
          host: 'localhost:3001',
          origin: 'http://localhost:3001',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(true);
  });

  it('uses trusted edge headers for an HTTPS deployment', () => {
    expect(
      isSameOriginRequest(
        request('http://provider:3001/api/provider/commands', {
          host: 'provider:3001',
          origin: 'https://provider.dentaltrust.vn',
          'sec-fetch-site': 'same-origin',
          'x-forwarded-host': 'provider.dentaltrust.vn',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe(true);
  });

  it('rejects cross-site, missing, and mismatched origins', () => {
    expect(
      isSameOriginRequest(
        request('http://0.0.0.0:3001/api/provider/commands', {
          host: 'localhost:3001',
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        request('http://0.0.0.0:3001/api/provider/commands', {
          host: 'localhost:3001',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        request('http://0.0.0.0:3001/api/provider/commands', {
          host: 'localhost:3001',
          origin: 'http://localhost:3002',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(false);
  });
});
