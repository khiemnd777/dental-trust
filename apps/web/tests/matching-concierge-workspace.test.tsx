import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';

import {
  isMatchingConciergeWorkspace,
  MatchingConciergeWorkspace,
} from '@/components/matching-concierge-workspace';

const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const entryId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const matchId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';

beforeEach(() => vi.restoreAllMocks());

describe('matching and concierge workspaces', () => {
  it('renders explainable patient shortlist data and submits interest through the BFF', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/portal/data'))
        return Response.json({
          data: [
            {
              id: entryId,
              clinicId,
              clinicName: 'Verified Clinic',
              clinicSlug: 'verified-clinic',
              fitScore: 92,
              organicRank: 1,
              displayedRank: 1,
              overrideReason: null,
              status: 'SHARED',
              reasons: ['VERIFIED_PROCEDURE_CAPABILITY'],
              limitations: ['AVAILABILITY_DATA_UNAVAILABLE'],
              evidenceIds: ['evidence-1'],
              patientInterestedAt: null,
              introductionRequest: null,
            },
          ],
        });
      if (url.startsWith('/api/portal/matching-consent'))
        return Response.json({
          data: { id: matchId, version: '2026-07', contentHash: 'f'.repeat(64) },
        });
      if (url === '/api/portal/commands') return Response.json({ accepted: true });
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MatchingConciergeWorkspace
        area="patient"
        pageKey="shortlist"
        locale="en"
        title="Saved clinics"
        description="Evidence-backed shortlist"
        messages={getMessages('en')}
        resourceId={caseId}
        development
      />,
    );

    expect(await screen.findByText('Verified Clinic')).toBeInTheDocument();
    expect(screen.getByText(/Verified procedure capability/i)).toBeInTheDocument();
    expect(screen.getByText(/Availability data unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/private note/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /interested/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/portal/commands',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('shortlist_interest'),
        }),
      ),
    );
  });

  it('recognizes every dedicated concierge case workspace and shows private notes only there', async () => {
    expect(isMatchingConciergeWorkspace('concierge', 'matching')).toBe(true);
    expect(isMatchingConciergeWorkspace('concierge', 'scheduling')).toBe(true);
    expect(isMatchingConciergeWorkspace('patient', 'plans')).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: {
            id: 'workspace-1',
            caseId,
            priority: 'HIGH',
            status: 'IN_PROGRESS',
            version: 2,
            slaDueAt: '2026-07-13T00:00:00.000Z',
            patientSummary: 'Coordination summary',
            missingDocumentCategories: ['CBCT'],
            patient: { currentCity: 'Melbourne', currentCountry: 'Australia' },
            case: {
              caseNumber: 'DT-TEST',
              title: 'Implant case',
              status: 'COORDINATING',
              desiredProcedureCode: 'DENTAL_IMPLANT',
              preferredLocation: 'Ho Chi Minh City',
              expectedArrivalDate: null,
              expectedDepartureDate: null,
            },
            documents: [],
            matchingCriteria: [],
            matchingResults: [],
            shortlist: [],
            appointments: [],
            aftercarePlans: [],
            incidents: [],
            internalNotes: [{ id: 'note-1', body: 'Never patient-visible', createdAt: '' }],
            travelNotes: [],
            communications: [],
            tasks: [],
            handoffs: [],
            supervisorReviews: [],
          },
        }),
      ),
    );
    render(
      <MatchingConciergeWorkspace
        area="concierge"
        pageKey="cases"
        locale="en"
        title="Concierge case"
        description="Assigned case"
        messages={getMessages('en')}
        resourceId={caseId}
        development
      />,
    );
    expect(await screen.findByText('Never patient-visible')).toBeInTheDocument();
    expect(screen.getAllByText(/never patient-visible/i)).toHaveLength(2);
  });
});
