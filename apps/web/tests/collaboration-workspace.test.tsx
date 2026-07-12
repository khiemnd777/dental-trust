import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';
import { CollaborationWorkspace } from '@/components/collaboration-workspace';
import { developmentCaseId } from '@/lib/routing';

const threadId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e71';
const messageId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e72';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CollaborationWorkspace', () => {
  it('renders participant messages without ever requesting internal notes for a patient', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.searchParams.get('threadId')) {
        return Promise.resolve(
          Response.json({
            data: {
              messages: [
                {
                  id: messageId,
                  threadId,
                  authorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e73',
                  messageBody: 'A case-scoped participant message.',
                  readByCurrentUser: true,
                  attachments: [],
                  createdAt: '2026-07-12T01:00:00.000Z',
                  editedAt: null,
                },
              ],
            },
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          data: {
            threads: [
              {
                id: threadId,
                caseId: developmentCaseId,
                threadSubject: 'Consultation questions',
                closedAt: null,
                messageCount: 1,
                unreadCount: 0,
                lastMessageAt: '2026-07-12T01:00:00.000Z',
                createdAt: '2026-07-12T01:00:00.000Z',
                updatedAt: '2026-07-12T01:00:00.000Z',
              },
            ],
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CollaborationWorkspace
        area="patient"
        description="Secure case messages"
        development={false}
        locale="en"
        messages={getMessages('en')}
        pageKey="messages"
        resourceId={developmentCaseId}
        title="Secure messages"
      />,
    );

    expect(await screen.findByText('A case-scoped participant message.')).toBeVisible();
    expect(screen.queryByText('Internal notes')).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('internal-notes'))).toBe(
      false,
    );
  });

  it('keeps clinic internal notes in a visibly separate staff-only section', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.searchParams.get('view') === 'internal-notes') {
        return Promise.resolve(
          Response.json({
            data: {
              internalNotes: [
                {
                  id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e74',
                  threadId,
                  authorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e75',
                  internalNote: 'Assigned staff only.',
                  createdAt: '2026-07-12T01:30:00.000Z',
                },
              ],
            },
          }),
        );
      }
      if (url.searchParams.get('threadId'))
        return Promise.resolve(Response.json({ data: { messages: [] } }));
      return Promise.resolve(
        Response.json({
          data: {
            threads: [
              {
                id: threadId,
                caseId: developmentCaseId,
                threadSubject: 'Consultation questions',
                closedAt: null,
                messageCount: 0,
                unreadCount: 0,
                lastMessageAt: null,
                createdAt: '2026-07-12T01:00:00.000Z',
                updatedAt: '2026-07-12T01:00:00.000Z',
              },
            ],
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CollaborationWorkspace
        area="clinic"
        description="Secure case messages"
        development={false}
        locale="en"
        messages={getMessages('en')}
        pageKey="messages"
        resourceId={developmentCaseId}
        title="Case messages"
      />,
    );

    expect(await screen.findByText('Assigned staff only.')).toBeVisible();
    expect(screen.getByText('Only assigned staff can see internal notes.')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('view=internal-notes')),
    ).toBe(true);
  });

  it('submits a new encrypted-thread command through the case-scoped BFF', async () => {
    const submitted: unknown[] = [];
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        submitted.push(JSON.parse(String(init.body)));
        return Promise.resolve(Response.json({ accepted: true }, { status: 202 }));
      }
      return Promise.resolve(Response.json({ data: { threads: [] } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99' });

    render(
      <CollaborationWorkspace
        area="patient"
        description="Secure case messages"
        development={false}
        locale="en"
        messages={getMessages('en')}
        pageKey="messages"
        resourceId={developmentCaseId}
        title="Secure messages"
      />,
    );

    fireEvent.change(await screen.findByLabelText(/^Subject/u), {
      target: { value: 'Treatment plan question' },
    });
    const messageField = screen.getAllByLabelText(/^Message/u)[0];
    if (!messageField) throw new Error('Expected a new-thread message field.');
    fireEvent.change(messageField, {
      target: { value: 'Please clarify the expected number of visits.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start thread' }));

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toMatchObject({
      area: 'patient',
      pageKey: 'messages',
      command: 'create_message_thread',
      entityId: developmentCaseId,
      payload: {
        threadSubject: 'Treatment plan question',
        messageBody: 'Please clarify the expected number of visits.',
        fileAssetIds: [],
      },
    });
  });
});
