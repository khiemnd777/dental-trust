import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';
import {
  ClinicOperationsWorkspace,
  isClinicOperationsWorkspace,
} from '@/components/clinic-operations-workspace';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('clinic operations workspace', () => {
  it('selects every connected clinic operations page before the generic workspace', () => {
    expect(isClinicOperationsWorkspace('clinic', 'dashboard')).toBe(true);
    expect(isClinicOperationsWorkspace('clinic', 'availability')).toBe(true);
    expect(isClinicOperationsWorkspace('clinic', 'pricing')).toBe(true);
    expect(isClinicOperationsWorkspace('patient', 'dashboard')).toBe(false);
    expect(isClinicOperationsWorkspace('clinic', 'scheduling')).toBe(false);
  });

  it('validates and renders live clinic overview metrics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
            newCases: 7,
            activeAppointments: 12,
            activeTeam: 8,
            openIncidents: 1,
            activeServices: 6,
            onboarding: null,
          },
        }),
      ),
    );
    render(workspace('dashboard'));
    expect(await screen.findByText('New cases / Hồ sơ mới')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('6')).toBeVisible();
  });

  it('submits dentist onboarding through the same-origin BFF with idempotency', async () => {
    const commands: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        commands.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json({ accepted: true });
      }
      return Response.json({
        data: [
          {
            id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
            fullName: 'Dr. Existing',
            slug: 'dr-existing',
            licenseNumber: 'LICENSE-1',
            licenseStatus: 'VERIFIED',
            active: true,
            startedAt: '2026-01-01T00:00:00.000Z',
            endedAt: null,
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(workspace('dentists'));
    expect(await screen.findByText('Dr. Existing')).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Full name/u), { target: { value: 'Dr. New' } });
    fireEvent.change(screen.getByLabelText(/Public profile slug/u), {
      target: { value: 'dr-new' },
    });
    fireEvent.change(screen.getByLabelText(/License number/u), {
      target: { value: 'LICENSE-2' },
    });
    fireEvent.change(screen.getByLabelText(/Licensing authority/u), {
      target: { value: 'Department of Health' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add dentist' }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual(
      expect.objectContaining({
        area: 'clinic',
        pageKey: 'dentists',
        command: 'clinic_add_dentist',
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it('fails closed when the BFF returns invalid or unavailable clinic data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    render(workspace('billing'));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
    expect(screen.getByText(/No changes were simulated/i)).toBeVisible();
  });
});

function workspace(pageKey: string) {
  return (
    <ClinicOperationsWorkspace
      description="Connected clinic operations"
      development={false}
      locale="en"
      messages={getMessages('en')}
      pageKey={pageKey}
      title="Clinic operations"
    />
  );
}
