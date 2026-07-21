import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, requestHeaders } = vi.hoisted(() => ({
  getSession: vi.fn(),
  requestHeaders: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession }));
vi.mock('next/headers', () => ({ headers: requestHeaders }));

import { POST } from '@/app/api/telemetry/product-event/route';

function productEventRequest(body: unknown, includeLength = true) {
  const serialized = JSON.stringify(body);
  return new Request('http://localhost:3000/api/telemetry/product-event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(includeLength ? { 'content-length': String(Buffer.byteLength(serialized)) } : {}),
    },
    body: serialized,
  });
}

describe('product event telemetry route', () => {
  beforeEach(() => {
    requestHeaders.mockResolvedValue(new Headers({ origin: 'http://localhost:3000' }));
    getSession.mockReset();
    getSession.mockResolvedValue({ id: 'session-1' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('accepts a bounded event for an authenticated same-origin session', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await POST(productEventRequest({ name: 'today_viewed', properties: {} }));

    expect(response.status).toBe(202);
    expect(log).toHaveBeenCalledOnce();
  });

  it('rejects a body without a declared bound before JSON parsing', async () => {
    const request = productEventRequest({ name: 'today_viewed' }, false);
    const json = vi.spyOn(request, 'json');

    expect((await POST(request)).status).toBe(411);
    expect(json).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
});
