import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '@dental-trust/i18n';
import { isSpecializedWorkspace, SpecializedWorkspace } from '@/components/specialized-workspace';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const messages = getMessages('en');
const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const fileAssetId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const uploadedFileAssetId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e19';
const planId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const treatmentPlanId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';
const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05';
const dentistId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06';
const consentId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e07';
const caregiverId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e08';
const aftercareId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e09';

const labelPattern = (value: string) =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'i');

const plan = {
  id: planId,
  treatmentPlanId,
  caseId,
  clinicId,
  clinicName: 'Verified Clinic',
  authoringDentistId: dentistId,
  authoringDentistName: 'Dr. Verified',
  version: 2,
  status: 'PUBLISHED',
  preliminaryAssessment: 'Provider assessment',
  diagnosisStatement: 'Provider diagnosis',
  risks: 'Provider explained risks',
  limitations: 'Provider explained limitations',
  warrantyTerms: 'Five-year limited clinic warranty',
  exclusions: 'Travel and unrelated procedures',
  currency: 'VND',
  totalMinor: 120_000_000,
  expiresAt: '2999-01-01T00:00:00.000Z',
  publishedAt: '2026-07-12T00:00:00.000Z',
  contentChecksum: 'a'.repeat(64),
  acceptedAt: null,
  acceptanceConsentTextVersionId: consentId,
  items: [
    {
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e10',
      procedureCode: 'DENTAL_IMPLANT',
      toothNumbers: [11],
      quantity: 1,
      material: 'Titanium',
      brand: null,
      unitPriceMinor: 120_000_000,
      totalPriceMinor: 120_000_000,
      sortOrder: 0,
    },
  ],
  createdAt: '2026-07-12T00:00:00.000Z',
};

function dataFor(pageKey: string) {
  const shared = { caseId, caseNumber: 'DT-2026-TEST', status: 'COORDINATING', progress: 60 };
  if (pageKey === 'records')
    return {
      ...shared,
      files: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e11',
          caseId,
          fileAssetId,
          category: 'RADIOGRAPH',
          description: null,
          originalFileName: 'clean-record.pdf',
          declaredMediaType: 'application/pdf',
          detectedMediaType: 'application/pdf',
          sizeBytes: 2_000_000,
          status: 'AVAILABLE',
          scanStatus: 'CLEAN',
          createdAt: '2026-07-12T00:00:00.000Z',
        },
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e12',
          caseId,
          fileAssetId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e13',
          category: 'OTHER',
          description: null,
          originalFileName: 'rejected.exe',
          declaredMediaType: 'application/octet-stream',
          detectedMediaType: null,
          sizeBytes: 10,
          status: 'REJECTED',
          scanStatus: 'INFECTED',
          createdAt: '2026-07-12T00:00:00.000Z',
        },
      ],
    };
  if (pageKey === 'plans')
    return {
      ...shared,
      plans: [plan, { ...plan, id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e14', status: 'DRAFT' }],
    };
  if (pageKey === 'aftercare')
    return {
      ...shared,
      aftercarePlans: [
        {
          id: aftercareId,
          caseId,
          active: true,
          startsAt: '2026-07-01T00:00:00.000Z',
          completedAt: null,
          checkIns: [
            {
              id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e15',
              submittedAt: '2026-07-12T00:00:00.000Z',
            },
          ],
        },
      ],
    };
  if (pageKey === 'caregivers')
    return {
      ...shared,
      caregivers: [
        {
          id: caregiverId,
          caseId,
          caregiverUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e16',
          caregiverEmail: 'family@example.test',
          permissions: ['VIEW_CASE_SUMMARY'],
          grantedAt: '2026-07-01T00:00:00.000Z',
          expiresAt: null,
          revokedAt: null,
          lastAccessedAt: null,
        },
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e17',
          caseId,
          caregiverUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e18',
          caregiverEmail: 'revoked@example.test',
          permissions: ['VIEW_CASE_SUMMARY'],
          grantedAt: '2026-06-01T00:00:00.000Z',
          expiresAt: null,
          revokedAt: '2026-07-01T00:00:00.000Z',
          lastAccessedAt: null,
        },
      ],
    };
  if (pageKey === 'planBuilder')
    return {
      ...shared,
      plans: [],
      authoringContext: {
        clinicId,
        clinicName: 'Verified Clinic',
        dentistOptions: [{ id: dentistId, fullName: 'Dr. Verified', isCurrentUser: true }],
      },
    };
  return shared;
}

function installFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/portal/data')) {
      const pageKey = new URL(url, 'http://localhost').searchParams.get('pageKey') ?? '';
      return Response.json({ data: dataFor(pageKey) });
    }
    if (url === '/api/portal/commands') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { command?: string };
      if (body.command === 'create_case') return Response.json({ data: { id: caseId } });
      if (body.command === 'save_treatment_plan')
        return Response.json({ data: { id: planId, version: 3, contentChecksum: 'b'.repeat(64) } });
      return Response.json({ accepted: true, commandId: crypto.randomUUID() });
    }
    if (url === '/api/portal/uploads') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
      return body.action === 'initiate'
        ? Response.json({ data: { fileAssetId: uploadedFileAssetId }, adapter: 'development' })
        : Response.json({ data: { status: 'AVAILABLE', scanStatus: 'CLEAN' } });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function workspace(pageKey: string, area: 'patient' | 'clinic' = 'patient', withResource = true) {
  return (
    <SpecializedWorkspace
      area={area}
      pageKey={pageKey}
      locale="en"
      title="Clinical workflow"
      description="Connected clinical workflow"
      messages={messages}
      resourceId={withResource ? caseId : undefined}
      development
    />
  );
}

function field(label: string) {
  return screen.getByLabelText(labelPattern(label));
}

function exactField(label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return screen.getByLabelText(new RegExp(`^${escaped}(?: \\*)?$`, 'i'));
}

async function waitForCaseNumber() {
  expect((await screen.findAllByText('DT-2026-TEST')).length).toBeGreaterThan(0);
}

function first<T>(items: T[]): T {
  const item = items[0];
  if (!item) throw new Error('Expected at least one matching element.');
  return item;
}

function formForButton(name: string | RegExp): HTMLFormElement {
  const form = screen.getByRole('button', { name }).closest('form');
  if (!(form instanceof HTMLFormElement)) throw new Error('Expected button to belong to a form.');
  return form;
}

function stubUploadFormData(file: File) {
  const NativeFormData = FormData;
  class UploadFormData extends NativeFormData {
    override getAll(name: string): FormDataEntryValue[] {
      return name === 'file' ? [file] : super.getAll(name);
    }
  }
  vi.stubGlobal('FormData', UploadFormData);
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.refresh.mockReset();
  vi.unstubAllGlobals();
  installFetchMock();
});

describe('specialized workspace routing', () => {
  it('recognizes only connected clinical workflow keys', () => {
    expect(isSpecializedWorkspace('patient', 'newCase')).toBe(true);
    expect(isSpecializedWorkspace('clinic', 'planBuilder')).toBe(true);
    expect(isSpecializedWorkspace('admin', 'users')).toBe(false);
  });

  it('creates a complete case and routes to the returned resource', async () => {
    render(workspace('newCase', 'patient', false));
    fireEvent.change(field(messages.workflows.caseTitle), { target: { value: 'Implant care' } });
    fireEvent.change(field(messages.workflows.procedure), {
      target: { value: 'DENTAL_IMPLANT' },
    });
    fireEvent.change(field(messages.workflows.location), { target: { value: 'Ho Chi Minh City' } });
    fireEvent.change(field(messages.workflows.arrival), { target: { value: '2026-09-01' } });
    fireEvent.change(field(messages.workflows.departure), { target: { value: '2026-09-20' } });
    fireEvent.submit(formForButton(messages.workflows.createCase));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/en/app/cases/${caseId}`));
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('fails safely when case creation returns no valid resource', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { id: 'not-a-uuid' } })),
    );
    render(workspace('newCase', 'patient', false));
    fireEvent.change(field(messages.workflows.caseTitle), { target: { value: 'Implant care' } });
    fireEvent.change(field(messages.workflows.procedure), {
      target: { value: 'DENTAL_IMPLANT' },
    });
    fireEvent.change(field(messages.workflows.location), { target: { value: 'HCMC' } });
    fireEvent.change(field(messages.workflows.arrival), { target: { value: '2026-09-01' } });
    fireEvent.change(field(messages.workflows.departure), { target: { value: '2026-09-20' } });
    fireEvent.submit(formForButton(messages.workflows.createCase));
    expect(await screen.findByText(messages.workflows.unavailable)).toBeInTheDocument();
  });
});

describe('connected patient clinical workflows', () => {
  it('loads the current case summary and timeline', async () => {
    render(workspace('case'));
    expect(screen.getByText(messages.workflows.loading)).toBeInTheDocument();
    await waitForCaseNumber();
    expect(screen.getByText(messages.workflows.statusValues.coordinating)).toBeInTheDocument();
    expect(screen.getAllByText(messages.home.steps[0][1]).length).toBeGreaterThan(0);
  });

  it('lists scan states and completes a development signed-upload lifecycle', async () => {
    const fetchMock = installFetchMock();
    render(workspace('records'));
    expect(await screen.findByText('clean-record.pdf')).toBeInTheDocument();
    expect(screen.getByText('REJECTED · INFECTED')).toBeInTheDocument();
    const upload = field(messages.forms.upload);
    const uploadFile = new File(['record'], 'new-record.pdf', { type: 'application/pdf' });
    stubUploadFormData(uploadFile);
    fireEvent.change(upload, {
      target: { files: [uploadFile] },
    });
    const uploadForm = formForButton(messages.workflows.uploadNow);
    fireEvent.submit(uploadForm);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/portal/uploads')).toBe(
        true,
      ),
    );
    expect(await screen.findByText('new-record.pdf')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/uploads',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses a constrained production object upload and renders terminal scan status', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/portal/data')) return Response.json({ data: dataFor('records') });
      if (url === '/api/portal/uploads') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
        if (body.action === 'initiate')
          return Response.json({
            data: {
              fileAssetId: uploadedFileAssetId,
              uploadUrl: 'https://objects.example.test/quarantine/object',
              requiredHeaders: {
                'content-type': 'application/pdf',
                'x-amz-meta-upload': 'safe',
                authorization: 'must-not-forward',
              },
            },
          });
        return Response.json({ data: { status: 'REJECTED', scanStatus: 'INFECTED' } });
      }
      if (url.startsWith('https://objects.example.test'))
        return new Response(null, { status: 200 });
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(workspace('records'));
    await screen.findByText('clean-record.pdf');
    const uploadFile = new File(['record'], 'unsafe.pdf', { type: 'application/pdf' });
    stubUploadFormData(uploadFile);
    fireEvent.change(field(messages.forms.upload), {
      target: { files: [uploadFile] },
    });
    fireEvent.submit(formForButton(messages.workflows.uploadNow));
    expect(await screen.findByText('unsafe.pdf')).toBeInTheDocument();
    const objectCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith('https://objects'),
    );
    expect(objectCall?.[1]?.headers).toEqual({
      'content-type': 'application/pdf',
      'x-amz-meta-upload': 'safe',
    });
  });

  it('compares immutable published plans and accepts a consent-bound version', async () => {
    render(workspace('plans'));
    expect(
      (await screen.findAllByRole('heading', { name: 'Verified Clinic' })).length,
    ).toBeGreaterThan(0);
    const actions = screen.getAllByRole('button', { name: messages.workflows.acceptPlan });
    expect(actions).toHaveLength(2);
    expect(actions[1]).toBeDisabled();
    fireEvent.click(first(actions));
    expect(await screen.findByText(messages.workflows.selectedPlan)).toBeInTheDocument();
  });

  it('submits red-flag aftercare answers and refreshes the plan', async () => {
    const fetchMock = installFetchMock();
    render(workspace('aftercare'));
    await waitForCaseNumber();
    fireEvent.change(field(messages.workflows.pain), { target: { value: '7' } });
    fireEvent.change(field(messages.workflows.swelling), { target: { value: 'yes' } });
    fireEvent.change(field(messages.workflows.fever), { target: { value: 'yes' } });
    fireEvent.change(field(messages.workflows.notes), {
      target: { value: 'Symptoms require a licensed-provider review.' },
    });
    fireEvent.submit(formForButton(messages.workflows.sendCheckIn));
    expect(await screen.findByText(messages.auth.success)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/portal/data')).length,
      ).toBeGreaterThan(1),
    );
  });

  it('requires an active aftercare plan before accepting a check-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ data: { ...dataFor('case'), aftercarePlans: [] } })),
    );
    render(workspace('aftercare'));
    await waitForCaseNumber();
    fireEvent.change(field(messages.workflows.pain), { target: { value: '2' } });
    fireEvent.submit(formForButton(messages.workflows.sendCheckIn));
    expect(await screen.findByText(messages.workflows.unavailable)).toBeInTheDocument();
  });

  it('requires granular caregiver scope and revokes an existing grant', async () => {
    render(workspace('caregivers'));
    expect(await screen.findByText('family@example.test')).toBeInTheDocument();
    expect(screen.getByText('REVOKED')).toBeInTheDocument();
    fireEvent.change(field(messages.workflows.caregiverEmail), {
      target: { value: 'new-family@example.test' },
    });
    fireEvent.submit(formForButton(messages.workflows.inviteCaregiver));
    expect(await screen.findByText(messages.workflows.unavailable)).toBeInTheDocument();

    fireEvent.click(field(messages.workflows.accessOptions[0]));
    fireEvent.submit(formForButton(messages.workflows.inviteCaregiver));
    expect(await screen.findByText(messages.workflows.invited)).toBeInTheDocument();
    fireEvent.click(
      first(screen.getAllByRole('button', { name: messages.workflows.revokeCaregiver })),
    );
    expect(await screen.findByText(messages.workflows.revoked)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('family@example.test')).toBeNull());
  });
});

describe('clinic treatment-plan authoring', () => {
  it('saves and publishes a versioned plan using the current dentist context', async () => {
    const fetchMock = installFetchMock();
    render(workspace('planBuilder', 'clinic'));
    await waitForCaseNumber();
    fireEvent.change(exactField(messages.workflows.clinicalSummary), {
      target: { value: 'Provider-authored clinical summary for this patient.' },
    });
    fireEvent.change(field(messages.workflows.treatmentItem), {
      target: { value: 'DENTAL_IMPLANT' },
    });
    fireEvent.change(field(messages.workflows.costVnd), { target: { value: '120000000' } });
    fireEvent.change(field(messages.workflows.risks), {
      target: { value: 'Provider explained risks and reasonable alternatives.' },
    });
    fireEvent.change(
      field(`${messages.workflows.clinicalSummary} · ${messages.workflows.inclusions}`),
      {
        target: { value: 'Clinical limitations' },
      },
    );
    fireEvent.change(field(messages.workflows.warranty), {
      target: { value: 'Clinic warranty terms' },
    });
    fireEvent.change(field(messages.workflows.planExclusions), {
      target: { value: 'Travel is excluded' },
    });
    fireEvent.submit(formForButton(messages.workflows.saveDraft));
    const publish = await screen.findByRole('button', { name: 'Publish plan' });
    fireEvent.click(publish);
    expect(await screen.findByText('Treatment plan published.')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) =>
        String(init?.body).includes('publish_treatment_plan'),
      ),
    ).toBe(true);
  });

  it('fails safely when no permitted authoring dentist exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: { ...dataFor('case'), authoringContext: { dentistOptions: [] } } }),
        ),
    );
    render(workspace('planBuilder', 'clinic'));
    await waitForCaseNumber();
    const form = screen.getByRole('button', { name: messages.workflows.saveDraft }).closest('form');
    expect(form).not.toBeNull();
    if (form) {
      for (const element of Array.from(form.querySelectorAll('input, textarea'))) {
        fireEvent.change(element, {
          target: {
            value: element.getAttribute('name') === 'cost' ? '1000' : 'Valid long enough content',
          },
        });
      }
      fireEvent.submit(form);
    }
    expect(await screen.findByText(messages.workflows.unavailable)).toBeInTheDocument();
  });
});

describe('specialized data failures', () => {
  it('surfaces invalid data and retries the exact scoped request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ data: dataFor('case') }));
    vi.stubGlobal('fetch', fetchMock);
    render(workspace('case'));
    expect(await screen.findByText(messages.workflows.unavailable)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.workflows.retry }));
    await waitForCaseNumber();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`resourceId=${caseId}`);
  });
});
