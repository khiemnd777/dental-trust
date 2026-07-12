import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';
import { CaseListWorkspace } from '../components/case-list-workspace';

afterEach(() => vi.unstubAllGlobals());

describe('CaseListWorkspace', () => {
  it('renders only the scoped cases returned by the portal boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
                caseNumber: 'DT-2026-TRUSTED',
                patientUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
                title: 'Implant consultation',
                desiredProcedureCode: 'DENTAL_IMPLANT',
                preferredLocation: 'Ho Chi Minh City',
                expectedArrivalDate: null,
                expectedDepartureDate: null,
                preferredCurrency: 'USD',
                status: 'DRAFT',
                version: 1,
                createdAt: '2026-07-12T00:00:00.000Z',
                updatedAt: '2026-07-12T01:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    render(
      <CaseListWorkspace
        area="patient"
        description="Your cases"
        locale="en"
        messages={getMessages('en')}
        pageKey="dashboard"
        title="Overview"
      />,
    );

    expect(await screen.findByText('DT-2026-TRUSTED')).toBeVisible();
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute(
      'href',
      '/en/app/cases/018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    );
  });

  it('shows a safe error state when the scoped API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));

    render(
      <CaseListWorkspace
        area="clinic"
        description="Assigned cases"
        locale="en"
        messages={getMessages('en')}
        pageKey="cases"
        title="Cases"
      />,
    );

    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
  });
});
