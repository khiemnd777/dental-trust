import { afterEach, describe, expect, it, vi } from 'vitest';

import { careMutation, careMutationErrorMessage } from './client-mutation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('careMutation', () => {
  it('retries a transport failure once with the same idempotency key', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(Response.json({ data: { id: 'case-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await careMutation<{ id: string }>('/api/care/cases', {
      method: 'POST',
      body: '{}',
    });

    expect(result).toEqual({ ok: true, data: { id: 'case-1' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get('x-idempotency-key')).toMatch(/^[0-9a-f-]{36}$/u);
    expect(secondHeaders.get('x-idempotency-key')).toBe(firstHeaders.get('x-idempotency-key'));
  });

  it('returns field-aware validation failures without retrying', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            retryable: false,
            fieldErrors: { preferredLocation: ['Too short'] },
          },
        },
        { status: 400 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await careMutation('/api/care/cases', { method: 'POST' });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'validation',
        code: 'VALIDATION_ERROR',
        fieldErrors: { preferredLocation: ['Too short'] },
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('distinguishes authentication, permission, timeout, and unavailable messages', () => {
    expect(
      careMutationErrorMessage(
        { kind: 'authentication', status: 401, code: 'AUTHENTICATION_REQUIRED' },
        'fallback',
      ),
    ).toContain('hết hạn');
    expect(
      careMutationErrorMessage(
        { kind: 'permission', status: 403, code: 'AUTHORIZATION_DENIED' },
        'fallback',
      ),
    ).toContain('quyền');
    expect(
      careMutationErrorMessage(
        { kind: 'timeout', status: 504, code: 'CARE_UPSTREAM_TIMEOUT' },
        'fallback',
      ),
    ).toContain('mất quá nhiều thời gian');
    expect(
      careMutationErrorMessage(
        { kind: 'unavailable', status: 502, code: 'CARE_UPSTREAM_UNAVAILABLE' },
        'fallback',
      ),
    ).toContain('gián đoạn');
  });
});
