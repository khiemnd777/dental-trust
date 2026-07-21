import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { bffClientContextHeader, createBffClientContext } from '@dental-trust/security';

import {
  createRateLimitTracker,
  globalNetworkRateLimitKey,
  networkRateLimitTracker,
} from './rate-limit-tracker.js';

describe('rate-limit tracker', () => {
  const secret = 'a-test-secret-with-at-least-32-characters';
  const tracker = createRateLimitTracker(secret);
  const firstToken = `dts_${'a'.repeat(64)}`;
  const secondToken = `dts_${'b'.repeat(64)}`;

  it('separates signed BFF clients behind the same proxy without exposing IP addresses', () => {
    const firstContext = createBffClientContext(secret, '198.51.100.1');
    const secondContext = createBffClientContext(secret, '198.51.100.2');
    const first = tracker(
      request('/cases', '203.0.113.8', { [bffClientContextHeader]: firstContext }),
    );
    const second = tracker(
      request('/cases', '203.0.113.8', { [bffClientContextHeader]: secondContext }),
    );

    expect(first).toMatch(/^client:[A-Za-z0-9_-]{43}$/u);
    expect(second).toMatch(/^client:[A-Za-z0-9_-]{43}$/u);
    expect(first).not.toBe(second);
    expect(first).not.toContain('198.51.100.1');
  });

  it('uses the same signed identity across public, auth, and protected routes', () => {
    const context = createBffClientContext(secret, '198.51.100.1');
    const headers = { [bffClientContextHeader]: context };
    expect(tracker(request('/auth/login', '203.0.113.8', headers))).toBe(
      tracker(request('/public/clinics', '203.0.113.8', headers)),
    );
    expect(tracker(request('/public/clinics', '203.0.113.8', headers))).toBe(
      tracker(request('/cases', '203.0.113.8', headers)),
    );
  });

  it('does not let session-looking values mint buckets on unauthenticated routes', () => {
    expect(
      tracker(request('/auth/login', '203.0.113.8', { authorization: `Bearer ${firstToken}` })),
    ).toBe('ip:203.0.113.8');
    expect(
      tracker(request('/public/clinics', '203.0.113.8', { cookie: `dt_session=${secondToken}` })),
    ).toBe('ip:203.0.113.8');
    expect(
      tracker(request('/auth/login', '203.0.113.8', { [bffClientContextHeader]: 'forged' })),
    ).toBe('ip:203.0.113.8');
  });

  it('keeps protected legacy BFF sessions fair behind the global network ceiling', () => {
    const first = tracker(
      request('/cases', '203.0.113.8', { authorization: `Bearer ${firstToken}` }),
    );
    const second = tracker(
      request('/cases', '203.0.113.8', { authorization: `Bearer ${secondToken}` }),
    );
    expect(first).toMatch(/^session:[a-f\d]{64}$/u);
    expect(second).not.toBe(first);
  });

  it('falls back to the trusted request IP for malformed or absent sessions', () => {
    expect(tracker(request('/cases', '203.0.113.9', { authorization: 'Bearer made-up' }))).toBe(
      'ip:203.0.113.9',
    );
    expect(tracker(request('/cases', '203.0.113.10', { cookie: 'dt_session=%E0%A4%A' }))).toBe(
      'ip:203.0.113.10',
    );
    expect(networkRateLimitTracker(request('/cases', '', {}))).toBe('ip:10.0.0.1');
  });

  it('uses one network ceiling key across controller routes', () => {
    const cases = networkRateLimitTracker(request('/cases', '203.0.113.9', {}));
    const auth = networkRateLimitTracker(request('/auth/login', '203.0.113.9', {}));
    expect(globalNetworkRateLimitKey(cases, 'network')).toBe(
      globalNetworkRateLimitKey(auth, 'network'),
    );
    expect(globalNetworkRateLimitKey(cases, 'network')).not.toContain('/cases');
  });
});

function request(path: string, ip: string, headers: Record<string, string>): Request {
  return {
    path,
    ip,
    headers,
    socket: { remoteAddress: '10.0.0.1' },
  } as unknown as Request;
}
