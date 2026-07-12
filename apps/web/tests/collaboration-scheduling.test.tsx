import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '@dental-trust/i18n';
import {
  CollaborationWorkspace,
  isCollaborationWorkspace,
} from '@/components/collaboration-workspace';

const messages = getMessages('en');
const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const dentistId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const appointmentId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';
const threadId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05';
const messageId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06';

const appointment = {
  id: appointmentId,
  caseId,
  clinicId,
  dentistId,
  kind: 'CONSULTATION',
  startsAt: '2026-09-01T02:00:00.000Z',
  endsAt: '2026-09-01T02:30:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
  status: 'CONFIRMED',
  version: 2,
  meetingProvider: 'manual',
  meetingJoinUrl: 'https://meet.example.test/consultation',
  cancellationReason: null,
  cancelledAt: null,
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

const thread = {
  id: threadId,
  caseId,
  threadSubject: 'Treatment plan questions',
  closedAt: null,
  messageCount: 1,
  unreadCount: 1,
  lastMessageAt: '2026-07-12T01:00:00.000Z',
  createdAt: '2026-07-12T01:00:00.000Z',
  updatedAt: '2026-07-12T01:00:00.000Z',
};

const labelPattern = (value: string) =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'i');

function workspace(
  options: {
    area?: 'clinic' | 'patient';
    pageKey?: 'scheduling' | 'consultations' | 'messages';
    resourceId?: string | undefined;
    development?: boolean;
  } = {},
) {
  const { area = 'clinic', pageKey = 'scheduling', development = false } = options;
  const resourceId = Object.hasOwn(options, 'resourceId') ? options.resourceId : caseId;
  return (
    <CollaborationWorkspace
      area={area}
      pageKey={pageKey}
      locale="en"
      title="Care collaboration"
      description="Case-scoped collaboration"
      messages={messages}
      resourceId={resourceId}
      development={development}
    />
  );
}

function commandCapture(data: Record<string, unknown>) {
  const commands: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      commands.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json({ accepted: true }, { status: 202 });
    }
    return Response.json({ data });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { commands, fetchMock };
}

function formForButton(name: string): HTMLFormElement {
  const form = screen.getByRole('button', { name }).closest('form');
  if (!(form instanceof HTMLFormElement)) throw new Error('Expected a form-owned button.');
  return form;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('collaboration workspace selection and loading', () => {
  it('selects only appointment and messaging routes', () => {
    expect(isCollaborationWorkspace('patient', 'consultations')).toBe(true);
    expect(isCollaborationWorkspace('clinic', 'scheduling')).toBe(true);
    expect(isCollaborationWorkspace('clinic', 'messages')).toBe(true);
    expect(isCollaborationWorkspace('admin', 'messages')).toBe(false);
  });

  it('fails closed without a case resource and on invalid upstream data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(workspace({ resourceId: undefined }));
    expect(await screen.findByText(messages.common.errorTitle)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows empty appointment and missing clinic-context states', async () => {
    commandCapture({ appointments: [], schedulingContext: null });
    render(workspace());
    expect(await screen.findByText(messages.common.emptyTitle)).toBeInTheDocument();
    expect(
      screen.getByText('This case is not assigned to the selected clinic.'),
    ).toBeInTheDocument();
  });
});

describe('appointment scheduling', () => {
  it('renders status variants and patient-safe meeting management', async () => {
    const appointments = [
      appointment,
      { ...appointment, id: `${appointmentId.slice(0, -2)}10`, status: 'COMPLETED' },
      {
        ...appointment,
        id: `${appointmentId.slice(0, -2)}11`,
        status: 'CANCELLED',
        meetingJoinUrl: null,
      },
      { ...appointment, id: `${appointmentId.slice(0, -2)}12`, status: 'NO_SHOW' },
    ];
    commandCapture({ appointments });
    render(workspace({ area: 'patient', pageKey: 'consultations' }));

    expect(await screen.findByRole('link', { name: 'Open consultation room' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('CANCELLED')).toBeInTheDocument();
    expect(screen.getByText('NO_SHOW')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attended' })).toBeNull();
  });

  it('creates, reschedules, cancels, and records attendance with UTC payloads', async () => {
    const { commands } = commandCapture({
      appointments: [appointment],
      schedulingContext: {
        clinicId,
        clinicName: 'Verified Clinic',
        dentists: [{ id: dentistId, fullName: 'Dr. Verified' }],
      },
    });
    render(workspace({ development: true }));
    await screen.findByText('Verified Clinic');

    const dateInputs = screen.getAllByLabelText(/Start \(UTC\)|End \(UTC\)/i);
    const createStart = dateInputs.at(-2);
    const createEnd = dateInputs.at(-1);
    if (!createStart || !createEnd) throw new Error('Expected appointment UTC inputs.');
    fireEvent.change(createStart, { target: { value: '2026-09-02T02:00' } });
    fireEvent.change(createEnd, { target: { value: '2026-09-02T02:30' } });
    fireEvent.submit(formForButton('Create appointment'));
    await waitFor(() =>
      expect(commands.some(({ command }) => command === 'create_appointment')).toBe(true),
    );
    expect(JSON.stringify(commands)).toContain('2026-09-02T02:00:00.000Z');

    await screen.findByText('Verified Clinic');
    fireEvent.click(screen.getByText('Manage appointment'));
    const manage = screen.getByText('Manage appointment').closest('details');
    if (!(manage instanceof HTMLDetailsElement)) throw new Error('Expected appointment details.');
    const rescheduleForm = manage.querySelector('form');
    if (!(rescheduleForm instanceof HTMLFormElement)) throw new Error('Missing reschedule form.');
    const rescheduleInputs = rescheduleForm.querySelectorAll('input');
    fireEvent.change(rescheduleInputs[0] as HTMLInputElement, {
      target: { value: '2026-09-03T03:00' },
    });
    fireEvent.change(rescheduleInputs[1] as HTMLInputElement, {
      target: { value: '2026-09-03T03:30' },
    });
    fireEvent.submit(rescheduleForm);
    await waitFor(() =>
      expect(commands.some(({ command }) => command === 'reschedule_appointment')).toBe(true),
    );

    await screen.findByText('Verified Clinic');
    fireEvent.click(screen.getByText('Manage appointment'));
    const refreshedManage = screen.getByText('Manage appointment').closest('details');
    if (!(refreshedManage instanceof HTMLDetailsElement))
      throw new Error('Expected refreshed appointment details.');
    const cancelForm = refreshedManage.querySelectorAll('form')[1];
    if (!(cancelForm instanceof HTMLFormElement)) throw new Error('Missing cancellation form.');
    fireEvent.change(cancelForm.querySelector('input') as HTMLInputElement, {
      target: { value: 'Patient requested a different provider.' },
    });
    fireEvent.submit(cancelForm);
    await waitFor(() =>
      expect(commands.some(({ command }) => command === 'cancel_appointment')).toBe(true),
    );

    await screen.findByText('Verified Clinic');
    fireEvent.click(screen.getByText('Manage appointment'));
    fireEvent.click(screen.getByRole('button', { name: 'Attended' }));
    await waitFor(() =>
      expect(commands.filter(({ command }) => command === 'record_attendance')).toHaveLength(1),
    );

    await screen.findByText('Verified Clinic');
    fireEvent.click(screen.getByText('Manage appointment'));
    fireEvent.click(screen.getByRole('button', { name: 'No show' }));

    await waitFor(() => {
      expect(commands.filter(({ command }) => command === 'record_attendance')).toHaveLength(2);
    });
  });

  it('surfaces a command rejection without simulating success', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response('{}', { status: 409 })
        : Response.json({
            data: {
              appointments: [appointment],
              schedulingContext: {
                clinicId,
                clinicName: 'Verified Clinic',
                dentists: [{ id: dentistId, fullName: 'Dr. Verified' }],
              },
            },
          }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(workspace({ development: true }));
    await screen.findByText('Verified Clinic');
    fireEvent.click(screen.getByText('Manage appointment'));
    fireEvent.click(screen.getByRole('button', { name: 'Attended' }));
    expect(await screen.findByText(messages.common.errorTitle)).toBeInTheDocument();
    expect(screen.queryByText('The change was recorded securely.')).toBeNull();
  });
});

describe('message and internal-note commands', () => {
  it('marks unread participant messages, sends replies, and keeps clinic notes separate', async () => {
    const commands: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (init?.method === 'POST') {
        commands.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json({ accepted: true }, { status: 202 });
      }
      if (url.searchParams.get('view') === 'internal-notes')
        return Response.json({
          data: {
            internalNotes: [
              {
                id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e07',
                threadId,
                authorUserId: dentistId,
                internalNote: 'Staff-only coordination note.',
                createdAt: '2026-07-12T01:00:00.000Z',
              },
            ],
          },
        });
      if (url.searchParams.get('threadId'))
        return Response.json({
          data: {
            messages: [
              {
                id: messageId,
                threadId,
                authorUserId: dentistId,
                messageBody: 'Participant-visible message.',
                readByCurrentUser: false,
                attachments: [],
                createdAt: '2026-07-12T01:00:00.000Z',
                editedAt: null,
              },
            ],
          },
        });
      return Response.json({ data: { threads: [thread] } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(workspace({ pageKey: 'messages' }));

    expect(await screen.findByText('Participant-visible message.')).toBeInTheDocument();
    expect(screen.getByText('Staff-only coordination note.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() =>
      expect(commands.some(({ command }) => command === 'mark_message_read')).toBe(true),
    );

    await screen.findByText('Participant-visible message.');
    const messageFields = screen.getAllByLabelText(labelPattern(messages.forms.message));
    const replyField = messageFields.at(-1);
    if (!replyField) throw new Error('Missing reply field.');
    fireEvent.change(replyField, { target: { value: 'A participant-visible reply.' } });
    fireEvent.submit(formForButton(messages.forms.send));
    await waitFor(() =>
      expect(commands.some(({ command }) => command === 'send_message')).toBe(true),
    );

    await screen.findByText('Staff-only coordination note.');
    const internalNoteForm = formForButton('Save internal note');
    const internalNoteField = internalNoteForm.querySelector('textarea');
    if (!internalNoteField) throw new Error('Missing internal-note field.');
    fireEvent.change(internalNoteField, {
      target: { value: 'A new staff-only note.' },
    });
    fireEvent.submit(internalNoteForm);

    await waitFor(() => {
      expect(commands.some(({ command }) => command === 'create_internal_note')).toBe(true);
    });
  });
});
