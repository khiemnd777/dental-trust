import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IncidentView, ReviewAbuseReportView, ReviewView } from '@dental-trust/contracts';
import { getMessages } from '@dental-trust/i18n';
import { isTrustSafetyWorkspace, TrustSafetyWorkspace } from '@/components/trust-safety-workspace';

const incidentId = '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const reviewId = '518f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const reportId = '618f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const createdAt = '2026-07-12T08:00:00.000Z';

function workspace(
  area: 'patient' | 'clinic' | 'admin',
  pageKey: 'incidents' | 'reviews',
  locale: 'en' | 'vi' = 'en',
) {
  return (
    <TrustSafetyWorkspace
      area={area}
      description="Audited trust and safety operations"
      development={false}
      locale={locale}
      messages={getMessages(locale)}
      pageKey={pageKey}
      title={pageKey === 'incidents' ? 'Incidents' : 'Reviews'}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('crypto', {
    randomUUID: () => '918f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('trust and safety workspace routing', () => {
  it('selects only the implemented incident and review surfaces', () => {
    expect(isTrustSafetyWorkspace('patient', 'incidents')).toBe(true);
    expect(isTrustSafetyWorkspace('clinic', 'incidents')).toBe(true);
    expect(isTrustSafetyWorkspace('admin', 'reviews')).toBe(true);
    expect(isTrustSafetyWorkspace('patient', 'reviews')).toBe(false);
    expect(isTrustSafetyWorkspace('concierge', 'incidents')).toBe(false);
  });
});

describe('patient incident and review intake', () => {
  it('submits structured incident evidence and keeps the returned timeline', async () => {
    const commands: unknown[] = [];
    const created = {
      ...incidentRecord(),
      id: '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e12',
      summary: 'Unexpected pain following treatment',
      details: 'I have experienced unexpected pain since yesterday and need a review.',
      status: 'OPEN' as const,
      version: 1,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/trust-safety') && init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({ data: created });
        }
        return Response.json({ data: [incidentRecord()], page: { nextCursor: null } });
      }),
    );
    render(workspace('patient', 'incidents'));
    await screen.findByText('IN_PROGRESS');
    const heading = screen.getByRole('heading', { name: 'Report an incident' });
    const card = heading.parentElement;
    expect(card).not.toBeNull();
    if (!card) return;
    fireEvent.change(within(card).getByLabelText(/Summary/u), {
      target: { value: 'Unexpected pain following treatment' },
    });
    fireEvent.change(within(card).getByLabelText(/Detailed account/u), {
      target: { value: 'I have experienced unexpected pain since yesterday and need a review.' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Submit securely' }));
    expect(await screen.findByText('The record was submitted securely.')).toBeVisible();
    expect(commands).toEqual([
      expect.objectContaining({
        area: 'patient',
        command: 'create_incident',
        input: expect.objectContaining({
          type: 'CLINICAL_CONCERN',
          reportedSeverity: 'LOW',
          summary: 'Unexpected pain following treatment',
          attachmentFileAssetIds: [],
        }),
      }),
    ]);
    expect(screen.getByText('Unexpected pain following treatment')).toBeVisible();
  });

  it('shows a safe failure when the API response is not a valid list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { unsafe: true } })));
    render(workspace('patient', 'incidents', 'vi'));
    expect(await screen.findByText(getMessages('vi').common.errorTitle)).toBeVisible();
  });
});

describe('incident operations', () => {
  it('records administrator triage with OCC evidence and a patient-visible message', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({
            data: { ...incidentRecord(), status: 'TRIAGED', severity: 'CRITICAL', version: 3 },
          });
        }
        return Response.json({ data: [incidentRecord()], page: {} });
      }),
    );
    render(workspace('admin', 'incidents'));
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }));
    const actions = screen.getAllByLabelText('Next status');
    const action = actions.at(0);
    const toStatus = actions.at(1);
    expect(action).toBeDefined();
    expect(toStatus).toBeDefined();
    if (!action || !toStatus) return;
    fireEvent.change(action, { target: { value: 'triage_incident' } });
    fireEvent.change(toStatus, { target: { value: 'TRIAGED' } });
    fireEvent.change(screen.getByLabelText('Reported severity'), { target: { value: 'CRITICAL' } });
    fireEvent.change(screen.getByLabelText(/Message visible to the patient/u), {
      target: { value: 'A coordinator completed the initial safety triage.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit securely' }));
    expect(await screen.findByText('The audited update was recorded.')).toBeVisible();
    expect(commands).toEqual([
      expect.objectContaining({
        area: 'admin',
        command: 'triage_incident',
        entityId: incidentId,
        input: expect.objectContaining({
          expectedVersion: 2,
          severity: 'CRITICAL',
          toStatus: 'TRIAGED',
        }),
      }),
    ]);
    expect(screen.getByText('TRIAGED')).toBeVisible();
  });

  it('keeps clinic incident access read-only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [incidentRecord()], page: {} })),
    );
    render(workspace('clinic', 'incidents'));
    await screen.findByText('IN_PROGRESS');
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
  });
});

describe('verified reviews and moderation', () => {
  it('lets a clinic add a response without editing patient review content', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({
            data: {
              ...reviewRecord(),
              clinicResponse: {
                id: '518f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
                content: 'Thank you for trusting our care team and sharing this follow-up.',
                moderationStatus: 'PENDING',
                createdAt,
              },
            },
          });
        }
        return Response.json({ data: [reviewRecord()], page: {} });
      }),
    );
    render(workspace('clinic', 'reviews'));
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }));
    fireEvent.change(screen.getByLabelText('Review'), {
      target: { value: 'Thank you for trusting our care team and sharing this follow-up.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit securely' }));
    expect(
      await screen.findByText('Thank you for trusting our care team and sharing this follow-up.'),
    ).toBeVisible();
    expect(commands).toEqual([
      expect.objectContaining({
        command: 'respond_review',
        entityId: reviewId,
        input: { content: 'Thank you for trusting our care team and sharing this follow-up.' },
      }),
    ]);
  });

  it('moderates reviews and decides abuse reports through separate audited commands', async () => {
    const commands: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          commands.push(body);
          return body.command === 'moderate_review'
            ? Response.json({ data: { ...reviewRecord(), moderationStatus: 'HIDDEN' } })
            : Response.json({ data: { ...reportRecord(), status: 'ACTIONED' } });
        }
        return String(input).includes('review-reports')
          ? Response.json({ data: [reportRecord()], page: {} })
          : Response.json({ data: [reviewRecord()], page: {} });
      }),
    );
    render(workspace('admin', 'reviews'));
    const manage = await screen.findByRole('button', { name: 'Manage' });
    fireEvent.click(manage);
    fireEvent.change(screen.getByLabelText('Manage'), { target: { value: 'moderate_review' } });
    fireEvent.change(screen.getByLabelText('Moderation decision'), { target: { value: 'HIDDEN' } });
    fireEvent.change(screen.getByLabelText(/Reason for decision/u), {
      target: { value: 'Personal contact information requires a documented moderator review.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit securely' }));
    await waitFor(() => expect(commands).toHaveLength(1));
    const openDecision = screen.getAllByRole('button', { name: 'Record decision' }).at(-1);
    expect(openDecision).toBeDefined();
    if (!openDecision) return;
    fireEvent.click(openDecision);
    fireEvent.change(screen.getByLabelText(/Reason for decision/u), {
      target: { value: 'The report was substantiated and the affected content was hidden.' },
    });
    const saveDecision = screen.getAllByRole('button', { name: 'Record decision' }).at(-1);
    expect(saveDecision).toBeDefined();
    if (!saveDecision) return;
    fireEvent.click(saveDecision);
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands.map(({ command }) => command)).toEqual([
      'moderate_review',
      'decide_review_report',
    ]);
    expect(screen.getByText('ACTIONED')).toBeVisible();
  });
});

function incidentRecord(): IncidentView {
  return {
    id: incidentId,
    caseId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    clinicId: '418f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    type: 'CLINICAL_CONCERN',
    severity: 'HIGH',
    status: 'IN_PROGRESS',
    summary: 'Persistent discomfort after treatment',
    details: 'The patient reported persistent discomfort and requested a clinical review.',
    ownerAssigned: true,
    slaDueAt: '2026-07-12T12:00:00.000Z',
    version: 2,
    closedAt: null,
    createdAt,
    updatedAt: createdAt,
    updates: [
      {
        id: '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
        eventType: 'PATIENT_VISIBLE_UPDATE',
        message: 'A coordinator has assigned this report for review.',
        createdAt,
      },
    ],
    warrantyClaim: null,
  };
}

function reviewRecord(): ReviewView {
  return {
    id: reviewId,
    caseId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    clinicId: '418f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    overallRating: 5,
    dimensionRatings: {
      clinicalOutcome: 5,
      communication: 5,
      facilities: 4,
      value: 4,
      aftercare: 5,
    },
    content: 'The care team communicated clearly and followed up after treatment.',
    treatmentDate: '2026-06-20',
    followUpDays: 22,
    verified: true,
    moderationStatus: 'PUBLISHED',
    createdAt,
    clinicResponse: null,
  };
}

function reportRecord(): ReviewAbuseReportView {
  return {
    id: reportId,
    reviewId,
    reasonCode: 'PERSONAL_DATA',
    details: 'The response may contain personal contact information.',
    status: 'OPEN',
    createdAt,
    updatedAt: createdAt,
  };
}
