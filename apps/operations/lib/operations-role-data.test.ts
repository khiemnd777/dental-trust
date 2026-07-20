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
    operationsApiPageForSession: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('./operations-api', () => api);

import { getRoleOperationsData } from './operations-role-data';
import type { OperationsSession } from './require-session';

const baseSession: OperationsSession = {
  token: 'session-token',
  userId: 'user-1',
  roles: [],
  availableMemberships: [],
  mfaVerified: true,
  mfaRequired: false,
};

function session(
  roles: readonly string[],
  mfa: { readonly required: boolean; readonly verified: boolean } = {
    required: false,
    verified: true,
  },
): OperationsSession {
  return {
    ...baseSession,
    roles,
    mfaRequired: mfa.required,
    mfaVerified: mfa.verified,
  };
}

beforeEach(() => {
  api.operationsApiPageForSession.mockReset();
  api.operationsApiPageForSession.mockImplementation(
    async (_session: OperationsSession, path: string) => ({
      data: [{ id: path }],
      page: { count: 1, nextCursor: `${path}:next` },
      requestId: 'request-12345678',
    }),
  );
});

describe('role-aware operations data', () => {
  it('limits a finance administrator to the payments surface', async () => {
    const result = await getRoleOperationsData(session(['FINANCE_ADMIN']));

    expect(api.operationsApiPageForSession).toHaveBeenCalledOnce();
    expect(api.operationsApiPageForSession).toHaveBeenCalledWith(
      expect.any(Object),
      'admin/directory/payments?limit=50',
    );
    expect(result.payments).toMatchObject({ error: null, page: { count: 1 } });
    expect(result.clinics.error).toBe('forbidden');
    expect(result.incidents.error).toBe('forbidden');
    expect(result.governance.content.error).toBe('forbidden');
  });

  it('allows content administrators to read only content-owned governance views', async () => {
    const result = await getRoleOperationsData(session(['CONTENT_ADMIN']));

    const paths = api.operationsApiPageForSession.mock.calls.map((call) => call[1]);
    expect(paths).toEqual([
      'trust/review-reports?limit=50',
      'admin/governance/content?limit=50',
      'admin/governance/taxonomy?limit=50',
      'admin/governance/templates?limit=50',
    ]);
    expect(result.governance.content.error).toBeNull();
    expect(result.governance.taxonomy.error).toBeNull();
    expect(result.governance.templates.error).toBeNull();
    expect(result.governance['feature-flags'].error).toBe('forbidden');
    expect(result.governance.configuration.error).toBe('forbidden');
    expect(result.governance.locations.error).toBe('forbidden');
  });

  it('loads only support-owned trust queues without exposing moderation or privacy data', async () => {
    const result = await getRoleOperationsData(session(['SUPPORT_AGENT']));

    const paths = api.operationsApiPageForSession.mock.calls.map((call) => call[1]);
    expect(paths).toEqual(['trust/incidents?limit=50', 'trust/support/elevations?limit=50']);
    expect(result.incidents.error).toBeNull();
    expect(result.reviewReports.error).toBe('forbidden');
    expect(result.privacy.error).toBe('forbidden');
    expect(result.elevations.error).toBeNull();
    expect(result.roles.error).toBe('forbidden');
    expect(result.payments.error).toBe('forbidden');
  });

  it('does not call privileged APIs until required MFA is verified', async () => {
    const result = await getRoleOperationsData(
      session(['SUPER_ADMIN'], { required: true, verified: false }),
    );

    expect(api.operationsApiPageForSession).not.toHaveBeenCalled();
    expect(result.clinics.error).toBe('mfa_required');
    expect(result.payments.error).toBe('mfa_required');
    expect(result.governance.content.error).toBe('mfa_required');
    expect(result.incidents.error).toBe('mfa_required');
  });

  it('requires a verified MFA session even when the account has no MFA challenge pending', async () => {
    const result = await getRoleOperationsData(
      session(['FINANCE_ADMIN'], { required: false, verified: false }),
    );

    expect(api.operationsApiPageForSession).not.toHaveBeenCalled();
    expect(result.payments.error).toBe('mfa_required');
  });

  it('preserves dependency failures separately from an authorized empty result', async () => {
    api.operationsApiPageForSession.mockRejectedValueOnce(
      new api.OperationsApiError(503, 'operations_api_unavailable', true),
    );

    const result = await getRoleOperationsData(session(['FINANCE_ADMIN']));

    expect(result.payments).toEqual({
      records: [],
      page: { count: 0, nextCursor: null },
      error: 'operations_api_unavailable',
    });
  });
});
