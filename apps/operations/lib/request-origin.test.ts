import { describe, expect, it } from 'vitest';

import { isSameOriginRequest } from './request-origin';

function request(input: {
  readonly url?: string;
  readonly origin?: string;
  readonly host?: string;
  readonly forwardedHost?: string;
  readonly forwardedProto?: string;
  readonly fetchSite?: string;
}): Request {
  const headers = new Headers();
  if (input.origin) headers.set('origin', input.origin);
  if (input.host) headers.set('host', input.host);
  if (input.forwardedHost) headers.set('x-forwarded-host', input.forwardedHost);
  if (input.forwardedProto) headers.set('x-forwarded-proto', input.forwardedProto);
  if (input.fetchSite) headers.set('sec-fetch-site', input.fetchSite);
  return new Request(input.url ?? 'http://operations.internal/api/operations/commands', {
    headers,
  });
}

describe('same-origin command boundary', () => {
  it('accepts a browser request whose origin matches the effective host', () => {
    expect(
      isSameOriginRequest(
        request({
          origin: 'https://operations.example.com',
          host: 'operations.example.com',
          forwardedProto: 'https',
          fetchSite: 'same-origin',
        }),
      ),
    ).toBe(true);
  });

  it('uses the first proxy hop when forwarded headers contain a chain', () => {
    expect(
      isSameOriginRequest(
        request({
          origin: 'https://operations.example.com',
          host: 'operations.internal',
          forwardedHost: 'operations.example.com, edge.internal',
          forwardedProto: 'https, http',
          fetchSite: 'same-origin',
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['missing origin', { host: 'operations.example.com', forwardedProto: 'https' }],
    [
      'cross-origin Origin header',
      {
        origin: 'https://attacker.example',
        host: 'operations.example.com',
        forwardedProto: 'https',
      },
    ],
    [
      'cross-site fetch metadata',
      {
        origin: 'https://operations.example.com',
        host: 'operations.example.com',
        forwardedProto: 'https',
        fetchSite: 'cross-site',
      },
    ],
    [
      'non-HTTP forwarded protocol',
      {
        origin: 'https://operations.example.com',
        host: 'operations.example.com',
        forwardedProto: 'javascript',
      },
    ],
  ])('rejects %s', (_label, input) => {
    expect(isSameOriginRequest(request(input))).toBe(false);
  });
});
