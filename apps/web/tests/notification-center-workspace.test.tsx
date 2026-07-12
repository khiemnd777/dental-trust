import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';
import {
  isNotificationCenterWorkspace,
  NotificationCenterWorkspace,
} from '@/components/notification-center-workspace';

const notificationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f01';

function workspace(pageKey = 'notifications', locale: 'en' | 'vi' = 'en') {
  return (
    <NotificationCenterWorkspace
      description="Your secure updates"
      development={false}
      locale={locale}
      messages={getMessages(locale)}
      pageKey={pageKey}
      title={pageKey === 'settings' ? 'Settings' : 'Notifications'}
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

describe('notification center routing', () => {
  it('selects only the patient notification and settings routes', () => {
    expect(isNotificationCenterWorkspace('patient', 'notifications')).toBe(true);
    expect(isNotificationCenterWorkspace('patient', 'settings')).toBe(true);
    expect(isNotificationCenterWorkspace('clinic', 'settings')).toBe(false);
  });
});

describe('notification inbox', () => {
  it('renders unread and read updates and marks an owned update as read', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({ accepted: true }, { status: 202 });
        }
        return Response.json({
          data: [
            {
              id: notificationId,
              category: 'APPOINTMENTS',
              channel: 'IN_APP',
              templateKey: 'appointment.confirmed',
              status: 'DELIVERED',
              scheduledAt: '2026-07-12T08:00:00.000Z',
              deliveredAt: '2026-07-12T08:00:01.000Z',
              readAt: null,
            },
            {
              id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f02',
              category: 'AFTERCARE',
              channel: 'IN_APP',
              templateKey: 'aftercare.check-in-due',
              status: 'DELIVERED',
              scheduledAt: 'not-a-date',
              deliveredAt: null,
              readAt: '2026-07-12T09:00:00.000Z',
            },
          ],
        });
      }),
    );

    render(workspace());
    expect(await screen.findByText('Appointments')).toBeVisible();
    expect(screen.getByText('Aftercare')).toBeVisible();
    expect(screen.getByText('not-a-date')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    await screen.findByText('The notification was marked as read.');
    expect(commands).toEqual([
      expect.objectContaining({
        command: 'mark_read',
        notificationId,
        idempotencyKey: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f99',
      }),
    ]);
    expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull();
  });

  it('shows empty and fail-closed states', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const firstRender = render(workspace());
    expect(await screen.findByText(getMessages('en').common.emptyTitle)).toBeVisible();
    firstRender.unmount();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    render(workspace());
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
  });
});

describe('notification preferences', () => {
  it('keeps security choices locked and saves optional bilingual preferences', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({ accepted: true });
        }
        return Response.json({
          data: [
            { category: 'ACCOUNT_SECURITY', channel: 'EMAIL', enabled: true, locked: true },
            { category: 'AFTERCARE', channel: 'EMAIL', enabled: true, locked: false },
            { category: 'AFTERCARE', channel: 'IN_APP', enabled: true, locked: false },
          ],
        });
      }),
    );

    render(workspace('settings', 'vi'));
    const security = (await screen.findByText('Bảo mật tài khoản')).closest('section');
    const aftercare = screen.getByText('Chăm sóc sau điều trị').closest('section');
    if (!security || !aftercare) throw new Error('Expected preference category sections.');
    expect(within(security).getByLabelText('Email')).toBeDisabled();
    fireEvent.click(within(aftercare).getByLabelText('Email'));
    await screen.findByText('Đã lưu tùy chọn thông báo.');
    expect(commands).toEqual([
      expect.objectContaining({
        command: 'update_preference',
        preference: { category: 'AFTERCARE', channel: 'EMAIL', enabled: false },
      }),
    ]);
    await waitFor(() => expect(within(aftercare).getByLabelText('Email')).not.toBeChecked());
  });

  it('retains state and exposes an error when a preference command is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(null, { status: 409 })
          : Response.json({
              data: [{ category: 'PAYMENTS', channel: 'EMAIL', enabled: true, locked: false }],
            }),
      ),
    );
    render(workspace('settings'));
    fireEvent.click(await screen.findByLabelText('Email'));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
    expect(screen.getByLabelText('Email')).toBeChecked();
  });
});
