import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JourneySummaryView } from '@dental-trust/contracts/journey';
import { getMessages } from '@dental-trust/i18n';
import { CaseHubWorkspace, TodayWorkspace } from '@/components/today-workspace';

const messages = getMessages('en');
const summary: JourneySummaryView = {
  caseId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  caseNumber: 'DT-001',
  title: 'Implant treatment coordination',
  status: 'CONSULTATION_SCHEDULED',
  perspective: 'PATIENT',
  stage: 'CONSULTATION',
  progress: 64,
  urgency: 'ROUTINE',
  primaryAction: { code: 'VIEW_APPOINTMENT' },
  blockers: [],
  owner: { type: 'CLINIC', displayName: 'Minh An Dental Center' },
  expectedAt: '2026-07-14T08:00:00.000Z',
  nextAppointment: {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
    kind: 'CONSULTATION',
    startsAt: '2026-07-14T08:00:00.000Z',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'CONFIRMED',
  },
  activeMilestone: null,
  timeline: [],
  updatedAt: '2026-07-12T08:00:00.000Z',
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: string | URL | Request) => {
      if (String(input).includes('/api/telemetry/'))
        return Promise.resolve(new Response(null, { status: 202 }));
      return Promise.resolve(Response.json({ data: [summary] }));
    }),
  );
});

describe('mobile-first care journey workspaces', () => {
  it('shows one primary next action on the patient Today view', async () => {
    render(
      <TodayWorkspace
        area="patient"
        description="Your next step"
        locale="en"
        messages={messages}
        title="Today"
      />,
    );

    expect(await screen.findByRole('heading', { name: summary.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View consultation/i })).toHaveAttribute(
      'href',
      `/en/app/cases/${summary.caseId}/consultations`,
    );
    expect(screen.getByText('Minh An Dental Center')).toBeInTheDocument();
  });

  it('groups clinic work by ownership and urgency', async () => {
    const clinicSummary: JourneySummaryView = {
      ...summary,
      perspective: 'CLINIC',
      urgency: 'URGENT',
      primaryAction: { code: 'PREPARE_PLAN' },
      owner: { type: 'CLINIC', displayName: 'Dr. Minh Nguyen' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: string | URL | Request) => {
        if (String(input).includes('/api/telemetry/'))
          return Promise.resolve(new Response(null, { status: 202 }));
        return Promise.resolve(Response.json({ data: [clinicSummary] }));
      }),
    );

    render(
      <TodayWorkspace
        area="clinic"
        description="Priority work"
        locale="en"
        messages={messages}
        title="Today"
      />,
    );

    expect(await screen.findByText('Clinic action needed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open and continue/i })).toHaveAttribute(
      'href',
      `/en/clinic/cases/${summary.caseId}/treatment-plans/new`,
    );
  });

  it('provides a case hub with direct care-section links', async () => {
    render(
      <CaseHubWorkspace
        area="patient"
        description="All case details"
        locale="en"
        messages={messages}
        resourceId={summary.caseId}
        title="Case"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Case hub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Records & imaging/i })).toHaveAttribute(
      'href',
      `/en/app/cases/${summary.caseId}/records`,
    );
  });
});
