import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';
import {
  isJourneyPassportWorkspace,
  JourneyPassportWorkspace,
} from '@/components/journey-passport-workspace';

const messages = getMessages('en');
const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const milestoneId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const changeId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const passportId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';

beforeEach(() => vi.unstubAllGlobals());

describe('journey and passport workspace', () => {
  it('selects only the case-scoped patient and clinic surfaces', () => {
    expect(isJourneyPassportWorkspace('patient', 'journey')).toBe(true);
    expect(isJourneyPassportWorkspace('clinic', 'progress')).toBe(true);
    expect(isJourneyPassportWorkspace('patient', 'passport')).toBe(true);
    expect(isJourneyPassportWorkspace('admin', 'passport')).toBe(false);
  });

  it('renders immutable journey changes and sends a patient acknowledgement', async () => {
    const commands: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)) as Record<string, unknown>);
          return Response.json({ accepted: true });
        }
        return Response.json({
          data: {
            caseId,
            caseNumber: 'DT-2026-TEST',
            status: 'TREATMENT_IN_PROGRESS',
            milestones: [
              {
                id: milestoneId,
                code: 'FINAL_REVIEW',
                title: 'Final review / Kiểm tra cuối',
                status: 'IN_PROGRESS',
                scheduledAt: null,
                completedAt: null,
                version: 1,
              },
            ],
            instructions: [
              {
                id: milestoneId,
                type: 'DISCHARGE',
                locale: 'vi-VN',
                content: 'Provider-authored discharge instruction.',
                createdAt: '2026-07-12T00:00:00.000Z',
              },
            ],
            planChanges: [
              {
                id: changeId,
                fromPlanVersionId: passportId,
                kind: 'PRICE',
                reason: 'Provider-recorded adjustment',
                changes: [{ field: 'TOTAL_PRICE_MINOR', beforeValue: '100', afterValue: '120' }],
                createdAt: '2026-07-12T00:00:00.000Z',
                acknowledgedAt: null,
              },
            ],
          },
        });
      }),
    );
    render(
      <JourneyPassportWorkspace
        area="patient"
        pageKey="journey"
        locale="en"
        title="Treatment journey"
        description="Case journey"
        messages={messages}
        resourceId={caseId}
        development={false}
      />,
    );

    expect(await screen.findByText('Provider-recorded adjustment')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({
      command: 'acknowledge_plan_change',
      entityId: caseId,
      payload: { changeId },
    });
  });

  it('shows verified checksum metadata and sends clinic publication', async () => {
    const commands: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)) as Record<string, unknown>);
          return Response.json({ accepted: true });
        }
        return Response.json({
          data: {
            id: passportId,
            caseId,
            caseNumber: 'DT-2026-TEST',
            version: 1,
            status: 'DRAFT',
            clinic: { id: milestoneId, name: 'Verified Clinic' },
            treatingDentist: { id: changeId, fullName: 'Dr. Provider' },
            treatmentCompletedAt: '2026-07-12',
            treatmentSummary: 'Provider-authored summary.',
            dischargeInstructions: 'Provider-authored discharge.',
            followUpInstructions: 'Provider-authored follow-up.',
            materials: [{ procedureCode: 'IMPLANT', material: 'Titanium' }],
            integrity: {
              algorithm: 'SHA-256',
              contentChecksum: 'a'.repeat(64),
              previousVersionChecksum: null,
              verified: true,
            },
            downloadable: false,
          },
        });
      }),
    );
    render(
      <JourneyPassportWorkspace
        area="clinic"
        pageKey="passport"
        locale="en"
        title="Dental Passport editor"
        description="Provider editor"
        messages={messages}
        resourceId={caseId}
        development={false}
      />,
    );

    expect(await screen.findByText(/Integrity verified/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish passport' }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({
      command: 'publish_passport',
      payload: { versionId: passportId },
    });
  });
});
