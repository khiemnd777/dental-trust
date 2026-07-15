import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantRequestError, fetchAssistant } from './assistant-request';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('assistant request handling', () => {
  it('classifies an expired Care session', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'AUTHENTICATION_REQUIRED', requestId: 'request-401' } },
            { status: 401 },
          ),
        ),
    );

    await expect(fetchAssistant('/assistant', { method: 'POST' }, 1_000)).rejects.toMatchObject({
      kind: 'SESSION_EXPIRED',
      requestId: 'request-401',
      status: 401,
    });
  });

  it('preserves provider-unavailable diagnostics', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'PROVIDER_UNAVAILABLE', requestId: 'request-503' } },
            { status: 503 },
          ),
        ),
    );

    await expect(fetchAssistant('/assistant', { method: 'POST' }, 1_000)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      requestId: 'request-503',
      status: 503,
    });
  });

  it('aborts a request instead of waiting forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Request aborted', 'AbortError')),
            );
          }),
      ),
    );

    const request = fetchAssistant('/assistant', { method: 'POST' }, 500);
    const rejection = expect(request).rejects.toMatchObject({
      kind: 'TIMEOUT',
      name: AssistantRequestError.name,
    });
    await vi.advanceTimersByTimeAsync(500);

    await rejection;
  });
});
