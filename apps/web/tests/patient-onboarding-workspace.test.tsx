import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';

import {
  isPatientOnboardingWorkspace,
  PatientOnboardingWorkspace,
} from '@/components/patient-onboarding-workspace';

const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const versionId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';

beforeEach(() => vi.unstubAllGlobals());

describe('patient onboarding and intake workspace', () => {
  it('recognizes only the dedicated patient routes and saves profile data through the BFF', async () => {
    expect(isPatientOnboardingWorkspace('patient', 'onboarding')).toBe(true);
    expect(isPatientOnboardingWorkspace('patient', 'intake')).toBe(true);
    expect(isPatientOnboardingWorkspace('clinic', 'onboarding')).toBe(false);
    const profile = {
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
      email: 'patient@example.com',
      preferredLocale: 'en-US',
      preferredCurrency: 'USD',
      currentCountry: 'Australia',
      currentCity: 'Melbourne',
      timezone: 'Australia/Melbourne',
      identity: { fullName: 'Linh Nguyen', dateOfBirth: '1988-04-18' },
      contact: { phoneE164: '+61412345678' },
      preferences: {
        contactChannel: 'MESSAGE',
        travelCoordination: true,
        appointmentReminders: true,
      },
      emergencyContact: null,
      onboardingCompletedAt: null,
      version: 1,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/portal/data')) return Response.json({ data: profile });
      return Response.json({ data: { ...profile, version: 2 } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PatientOnboardingWorkspace
        area="patient"
        pageKey="onboarding"
        locale="en"
        title="Patient profile"
        description="Secure profile"
        messages={getMessages('en')}
        development
      />,
    );
    expect(await screen.findByDisplayValue('Linh Nguyen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/portal/commands',
        expect.objectContaining({ body: expect.stringContaining('patient_profile') }),
      ),
    );
  });

  it('moves a valid draft from step five to explicit two-part consent', async () => {
    const version = {
      id: versionId,
      version: 2,
      status: 'DRAFT',
      smokingStatus: 'NEVER',
      pregnancyStatus: 'NOT_APPLICABLE',
      accessibilityNeeds: [],
      currentStep: 5,
      draftRevision: 4,
      updatedAt: '2026-07-12T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/portal/data'))
        return Response.json({
          data: {
            id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04',
            caseId,
            current: version,
            history: [version],
            progress: { completedSteps: 4, totalSteps: 6, percent: 67, nextStep: 5 },
          },
        });
      if (url.startsWith('/api/portal/intake-consents'))
        return Response.json({
          data: [
            {
              id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
              purpose: 'INTAKE_HEALTH_INFORMATION',
              version: '2026-07',
              locale: 'en-US',
              contentHash: 'a'.repeat(64),
              publishedAt: '2026-07-01T00:00:00.000Z',
            },
            {
              id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
              purpose: 'INTAKE_MEDICAL_DISCLAIMER',
              version: '2026-07',
              locale: 'en-US',
              contentHash: 'b'.repeat(64),
              publishedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        });
      const request = JSON.parse(String(init?.body)) as { payload: Record<string, unknown> };
      return Response.json({
        data: { ...version, currentStep: 6, draftRevision: 5, ...request.payload },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PatientOnboardingWorkspace
        area="patient"
        pageKey="intake"
        locale="en"
        title="Pre-consultation intake"
        description="Secure intake"
        messages={getMessages('en')}
        resourceId={caseId}
        development
      />,
    );
    expect(await screen.findByText('Step 5/6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));
    expect(await screen.findByText('Step 6/6')).toBeInTheDocument();
    expect(screen.getAllByText(/share health information/i)).toHaveLength(2);
    expect(screen.getAllByText(/not a diagnosis/i)).toHaveLength(2);
  });
});
