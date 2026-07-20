import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => {
  class MockOperationsApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      readonly retryable = status >= 500,
    ) {
      super(code);
    }
  }
  return {
    OperationsApiError: MockOperationsApiError,
    operationsApi: vi.fn(),
    operationsApiPage: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('./operations-api', () => api);

import { getCoordinationData, getVerificationData } from './operations-data';

beforeEach(() => {
  api.operationsApi.mockReset();
  api.operationsApiPage.mockReset();
});

describe('operations data availability', () => {
  it('treats a successful empty verification page as available', async () => {
    api.operationsApiPage.mockResolvedValue({
      data: [],
      page: { count: 0, nextCursor: null },
      requestId: 'request-12345678',
    });

    await expect(getVerificationData()).resolves.toEqual({
      cases: [],
      page: { count: 0, nextCursor: null },
      availability: 'available',
      issues: [],
      available: true,
    });
  });

  it('records an outage separately from an empty page', async () => {
    api.operationsApiPage.mockRejectedValue(
      new api.OperationsApiError(503, 'operations_api_unavailable', true),
    );

    const result = await getVerificationData();
    expect(result.cases).toEqual([]);
    expect(result.page).toBeNull();
    expect(result.available).toBe(false);
    expect(result.availability).toBe('unavailable');
    expect(result.issues).toEqual([
      {
        resource: 'verification-cases',
        kind: 'unavailable',
        status: 503,
        code: 'operations_api_unavailable',
        retryable: true,
      },
    ]);
  });

  it('falls back from supervisor scope to the current agent without losing pagination', async () => {
    api.operationsApi.mockResolvedValue({
      total: 1,
      overdue: 0,
      unassigned: 0,
      urgent: 0,
      workload: [],
    });
    api.operationsApiPage
      .mockRejectedValueOnce(new api.OperationsApiError(403, 'AUTHORIZATION_DENIED', false))
      .mockResolvedValueOnce({
        data: [{ id: 'workspace-1' }],
        page: { count: 1, nextCursor: 'workspace-1' },
        requestId: 'request-12345678',
      });

    const result = await getCoordinationData();
    expect(result.available).toBe(true);
    expect(result.page).toEqual({ count: 1, nextCursor: 'workspace-1' });
    expect(api.operationsApiPage).toHaveBeenNthCalledWith(
      1,
      'concierge/queue?assignment=ALL&limit=50',
    );
    expect(api.operationsApiPage).toHaveBeenNthCalledWith(
      2,
      'concierge/queue?assignment=MINE&limit=50',
    );
  });
});
