import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookies, headers } = vi.hoisted(() => ({ cookies: vi.fn(), headers: vi.fn() }));

vi.mock('next/headers', () => ({ cookies, headers }));

import { forwardCareFormData } from './care-actions';

describe('care multipart forwarding', () => {
  beforeEach(() => {
    cookies.mockReset();
    headers.mockReset();
    headers.mockResolvedValue(new Headers({ 'x-real-ip': '203.0.113.8' }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('checks authentication before allocating or parsing the multipart body', async () => {
    cookies.mockResolvedValue({ get: () => undefined });
    const readBody = vi.fn().mockResolvedValue(new FormData());

    const response = await forwardCareFormData('/assistant/transcriptions', readBody);

    expect(response.status).toBe(401);
    expect(readBody).not.toHaveBeenCalled();
  });

  it('returns a bounded client error when multipart parsing fails', async () => {
    cookies.mockResolvedValue({ get: () => ({ value: 'session-token' }) });
    const readBody = vi.fn().mockRejectedValue(new TypeError('malformed multipart'));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { id: 'patient-1', roles: ['PATIENT'] } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await forwardCareFormData('/assistant/transcriptions', readBody);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_MULTIPART_FORM', retryable: false },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/me');
  });

  it('rejects a forged cookie before parsing multipart data', async () => {
    cookies.mockResolvedValue({ get: () => ({ value: 'forged-session-token' }) });
    const readBody = vi.fn().mockResolvedValue(new FormData());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const response = await forwardCareFormData('/assistant/transcriptions', readBody);

    expect(response.status).toBe(401);
    expect(readBody).not.toHaveBeenCalled();
  });

  it('bounds forged-cookie authentication checks without allocating multipart slots', async () => {
    vi.stubEnv('CARE_AUTH_VERIFY_CONCURRENCY', '1');
    cookies.mockResolvedValue({ get: () => ({ value: 'forged-session-token' }) });
    const readBody = vi.fn().mockResolvedValue(new FormData());
    let finishAuthentication!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finishAuthentication = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = forwardCareFormData('/assistant/transcriptions', readBody);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const second = await forwardCareFormData('/assistant/transcriptions', readBody);

    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBe('1');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(readBody).not.toHaveBeenCalled();
    finishAuthentication(new Response(null, { status: 401 }));
    await expect(first).resolves.toMatchObject({ status: 401 });
  });

  it('does not let a pending invalid session occupy the multipart budget', async () => {
    vi.stubEnv('CARE_AUTH_VERIFY_CONCURRENCY', '2');
    vi.stubEnv('CARE_MULTIPART_CONCURRENCY', '1');
    cookies
      .mockResolvedValueOnce({ get: () => ({ value: 'invalid-session' }) })
      .mockResolvedValueOnce({ get: () => ({ value: 'valid-session' }) });
    let finishInvalidAuthentication!: (response: Response) => void;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('authorization');
      if (String(input).endsWith('/auth/me') && authorization === 'Bearer invalid-session') {
        return new Promise<Response>((resolve) => {
          finishInvalidAuthentication = resolve;
        });
      }
      if (String(input).endsWith('/auth/me')) {
        return Promise.resolve(Response.json({ data: { id: 'patient-1', roles: ['PATIENT'] } }));
      }
      return Promise.resolve(new Response(null, { status: 202 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const invalidReadBody = vi.fn().mockResolvedValue(new FormData());
    const validReadBody = vi.fn().mockResolvedValue(new FormData());

    const invalid = forwardCareFormData('/assistant/transcriptions', invalidReadBody);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const valid = await forwardCareFormData('/assistant/transcriptions', validReadBody);

    expect(valid.status).toBe(202);
    expect(validReadBody).toHaveBeenCalledOnce();
    expect(invalidReadBody).not.toHaveBeenCalled();
    finishInvalidAuthentication(new Response(null, { status: 401 }));
    await expect(invalid).resolves.toMatchObject({ status: 401 });
  });
});
