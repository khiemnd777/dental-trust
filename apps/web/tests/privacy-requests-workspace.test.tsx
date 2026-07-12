import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrivacyRequestView } from '@dental-trust/contracts';
import { getMessages } from '@dental-trust/i18n';
import {
  isPrivacyRequestsWorkspace,
  PrivacyRequestsWorkspace,
} from '@/components/privacy-requests-workspace';

const privacyRequestId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const createdAt = '2026-07-12T08:00:00.000Z';

function workspace(area: 'patient' | 'admin', locale: 'en' | 'vi' = 'en') {
  return (
    <PrivacyRequestsWorkspace
      area={area}
      description="Authorized privacy workflow"
      development={false}
      locale={locale}
      messages={getMessages(locale)}
      pageKey="privacy"
      title="Privacy"
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('crypto', {
    randomUUID: () => '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f99',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('privacy workspace routing', () => {
  it('selects only patient and administrator privacy routes', () => {
    expect(isPrivacyRequestsWorkspace('patient', 'privacy')).toBe(true);
    expect(isPrivacyRequestsWorkspace('admin', 'privacy')).toBe(true);
    expect(isPrivacyRequestsWorkspace('clinic', 'privacy')).toBe(false);
    expect(isPrivacyRequestsWorkspace('admin', 'users')).toBe(false);
  });
});

describe('patient privacy requests', () => {
  it('submits a validated deletion request and adds the returned record', async () => {
    const commands: unknown[] = [];
    const created = {
      ...privacyRecord(),
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e12',
      type: 'DELETE',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({ data: created });
        }
        return Response.json({ data: [privacyRecord()], page: { nextCursor: null } });
      }),
    );
    render(workspace('patient'));
    await screen.findByText('SUBMITTED');
    fireEvent.change(screen.getByLabelText('Request type'), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByLabelText(/Why you are making this request/u), {
      target: { value: 'I am closing my account after receiving a portable export.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit privacy request' }));
    expect(await screen.findByText('Your privacy request was submitted securely.')).toBeVisible();
    expect(commands).toEqual([
      {
        command: 'create',
        input: {
          type: 'DELETE',
          reason: 'I am closing my account after receiving a portable export.',
        },
        idempotencyKey: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f99',
      },
    ]);
    expect(screen.getByText('DELETE')).toBeVisible();
  });

  it('paginates owned requests without discarding the current page', async () => {
    const second = { ...privacyRecord(), id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: [privacyRecord()], page: { nextCursor: privacyRequestId } }),
      )
      .mockResolvedValueOnce(Response.json({ data: [second], page: { nextCursor: null } }));
    vi.stubGlobal('fetch', fetchMock);
    render(workspace('patient'));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByText('SUBMITTED')).toHaveLength(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`cursor=${privacyRequestId}`);
  });
});

describe('administrative privacy queue', () => {
  it('records a reasoned, confirmed transition and updates optimistic state', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({
            data: { ...privacyRecord('IN_REVIEW'), status: 'APPROVED', version: 3 },
          });
        }
        return Response.json({ data: [privacyRecord('IN_REVIEW')], page: {} });
      }),
    );
    render(workspace('admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Process' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Next status'), {
      target: { value: 'APPROVED' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Administrative reason/u), {
      target: { value: 'Identity verification completed under ticket DT-PRIV-9.' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Message visible to the patient/u), {
      target: { value: 'Your request was approved and is ready for secure processing.' },
    });
    fireEvent.click(
      within(dialog).getByLabelText('I confirm this authorized privacy-request transition.'),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record transition' }));
    expect(
      await screen.findByText('The privacy request transition was recorded and audited.'),
    ).toBeVisible();
    expect(commands).toEqual([
      expect.objectContaining({
        command: 'transition',
        privacyRequestId,
        input: {
          toStatus: 'APPROVED',
          expectedVersion: 2,
          reason: 'Identity verification completed under ticket DT-PRIV-9.',
          patientMessage: 'Your request was approved and is ready for secure processing.',
          confirmation: 'PROCESS PRIVACY REQUEST',
        },
      }),
    ]);
    expect(screen.getByText('APPROVED')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
  });

  it('does not offer actions for a terminal request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: [privacyRecord('COMPLETED')], page: { nextCursor: null } }),
        ),
    );
    render(workspace('admin', 'vi'));
    expect(await screen.findByText('COMPLETED')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Xử lý' })).toBeNull();
  });

  it('keeps the dialog open when the server rejects stale evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(null, { status: 409 })
          : Response.json({ data: [privacyRecord('IN_REVIEW')], page: {} }),
      ),
    );
    render(workspace('admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Process' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Administrative reason/u), {
      target: { value: 'Identity verification completed under ticket DT-PRIV-9.' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Message visible to the patient/u), {
      target: { value: 'We are reviewing the request under the documented retention policy.' },
    });
    fireEvent.click(
      within(dialog).getByLabelText('I confirm this authorized privacy-request transition.'),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record transition' }));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('renders empty and invalid-response failures safely', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [], page: {} }))
      .mockResolvedValueOnce(Response.json({ data: { invalid: true } }));
    vi.stubGlobal('fetch', fetchMock);
    const first = render(workspace('admin'));
    expect(await screen.findByText(getMessages('en').common.emptyTitle)).toBeVisible();
    first.unmount();
    render(workspace('admin'));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
  });
});

function privacyRecord(status: PrivacyRequestView['status'] = 'SUBMITTED') {
  return {
    id: privacyRequestId,
    type: 'EXPORT' as const,
    status,
    reason: 'I need a portable copy of my Dental Trust records.',
    patientMessage: null,
    dueAt: '2026-08-11T08:00:00.000Z',
    version: status === 'SUBMITTED' ? 1 : 2,
    completedAt: status === 'COMPLETED' ? createdAt : null,
    createdAt,
    updatedAt: createdAt,
  };
}
