import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';

import { VerificationWorkspace } from '@/components/verification-workspace';

const summary = {
  id: '118f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  subjectType: 'CLINIC',
  subjectId: '218f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  subjectName: 'Saigon Smiles',
  status: 'UNDER_REVIEW',
  riskLevel: 'HIGH',
  assignedReviewerUserId: null,
  version: 3,
  submittedAt: '2026-07-01T00:00:00.000Z',
  decidedAt: null,
  expiresAt: '2027-07-01T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
} as const;

const detail = {
  ...summary,
  methodologyVersion: '2026-01',
  requirements: [
    {
      id: '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      code: 'clinic.operating-license.v1',
      category: 'CLINIC_OPERATING_LICENSE',
      required: true,
      highRisk: true,
      status: 'PROVIDED',
      evidence: [
        {
          id: '418f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          requirementId: '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          category: 'CLINIC_OPERATING_LICENSE',
          fileAssetId: null,
          sourceReference: 'Registry',
          contentHash: null,
          issuedAt: null,
          expiresAt: '2027-07-01',
          approvedAt: null,
          revokedAt: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    },
  ],
  reviews: [],
  siteAudits: [],
  correctiveActions: [],
} as const;

beforeEach(() => vi.unstubAllGlobals());

describe('VerificationWorkspace', () => {
  it('renders a bilingual, bounded queue with risk and status signals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [summary] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    render(
      <VerificationWorkspace
        pageKey="dashboard"
        locale="vi"
        title="Hàng đợi xác minh"
        description="Hồ sơ cần xử lý"
        messages={getMessages('vi')}
      />,
    );

    expect(await screen.findByText('Saigon Smiles')).toBeInTheDocument();
    expect(screen.getByText('Tổng hồ sơ')).toBeInTheDocument();
    expect(screen.getByText('Under review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở hồ sơ' })).toHaveAttribute(
      'href',
      `/vi/verification-admin/clinics/${summary.id}`,
    );
  });

  it('reviews evidence through the BFF with optimistic version and idempotency', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST')
        return new Response(JSON.stringify({ data: detail }), { status: 200 });
      return new Response(JSON.stringify({ data: detail }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <VerificationWorkspace
        pageKey="clinic"
        locale="en"
        title="Clinic verification"
        description="Review evidence"
        messages={getMessages('en')}
        resourceId={detail.id}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/portal/commands',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(String(post?.[1]?.body)) as {
      command: string;
      entityId: string;
      idempotencyKey: string;
      payload: { evidenceId: string; expectedCaseVersion: number };
    };
    expect(body.command).toBe('verification_review_evidence');
    expect(body.entityId).toBe(detail.id);
    expect(body.payload).toEqual(
      expect.objectContaining({
        evidenceId: detail.requirements[0].evidence[0].id,
        expectedCaseVersion: detail.version,
      }),
    );
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/iu);
  });
});
