import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';
import {
  AdminOperationsWorkspace,
  isAdminOperationsWorkspace,
} from '@/components/admin-operations-workspace';

const jobId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f11';

function workspace(pageKey: string, locale: 'en' | 'vi' = 'en') {
  return (
    <AdminOperationsWorkspace
      description="Authorized operational control"
      development={false}
      locale={locale}
      messages={getMessages(locale)}
      pageKey={pageKey}
      title="Operations"
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

describe('admin operations routing', () => {
  it('selects only connected admin operations screens', () => {
    expect(isAdminOperationsWorkspace('admin', 'dashboard')).toBe(true);
    expect(isAdminOperationsWorkspace('admin', 'audit')).toBe(true);
    expect(isAdminOperationsWorkspace('admin', 'jobs')).toBe(true);
    expect(isAdminOperationsWorkspace('patient', 'dashboard')).toBe(false);
    expect(isAdminOperationsWorkspace('admin', 'users')).toBe(false);
  });
});

describe('admin operations views', () => {
  it('renders live summary metrics and resilient timestamp formatting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            activeUsers: 10,
            openCases: 4,
            pendingVerifications: 3,
            unresolvedIncidents: 2,
            failedOutboxEvents: 1,
            failedNotifications: 1,
            failedWebhooks: 0,
            pendingPrivacyRequests: 2,
            generatedAt: 'not-a-date',
          },
          page: { nextCursor: null },
        }),
      ),
    );
    render(workspace('dashboard'));
    expect(await screen.findByText('Active users')).toBeVisible();
    expect(screen.getByText(/not-a-date/u)).toBeVisible();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('renders dependency health without exposing configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            status: 'ready',
            service: 'dental-trust-api',
            dependencies: { database: 'available', objectStorage: 'available' },
          },
        }),
      ),
    );
    render(workspace('health'));
    expect(await screen.findByText('dental-trust-api')).toBeVisible();
    expect(screen.getByText('database')).toBeVisible();
    expect(screen.getAllByText('available')).toHaveLength(2);
  });

  it('paginates audit records without discarding the current page', async () => {
    const firstId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f21';
    const secondId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f22';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [auditRecord(firstId, 'case.created')],
          page: { nextCursor: firstId },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [auditRecord(secondId, 'case.assigned')],
          page: { nextCursor: null },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(workspace('audit'));
    expect(await screen.findByText(/case\.created/u)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(/case\.assigned/u)).toBeVisible();
    expect(screen.getByText(/case\.created/u)).toBeVisible();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`cursor=${firstId}`);
  });

  it('shows a safe empty state and a fail-closed loading error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: [], page: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const first = render(workspace('webhooks'));
    expect(await screen.findByText(getMessages('en').common.emptyTitle)).toBeVisible();
    first.unmount();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    render(workspace('webhooks'));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
  });
});

describe('manual delivery retry', () => {
  it('requires a reason and explicit confirmation before retrying an outbox job', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({ data: { status: 'PENDING' } });
        }
        return Response.json({ data: [outboxRecord()], page: { nextCursor: null } });
      }),
    );
    render(workspace('jobs'));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry safely' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Operational reason/u), {
      target: { value: 'Provider outage has been resolved.' },
    });
    fireEvent.click(
      within(dialog).getByLabelText('I confirm the failed delivery should be retried.'),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry safely' }));
    await screen.findByText('The delivery was returned to the durable queue.');
    expect(commands).toEqual([
      expect.objectContaining({
        view: 'jobs',
        entityId: jobId,
        expectedAttemptCount: 8,
        confirmation: 'RETRY FAILED DELIVERY',
        idempotencyKey: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f99',
      }),
    ]);
    expect(screen.getByText('PENDING')).toBeVisible();
  });

  it('keeps the retry dialog open and reports a rejected notification retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(null, { status: 409 })
          : Response.json({ data: [notificationRecord()], page: { nextCursor: null } }),
      ),
    );
    render(workspace('notifications', 'vi'));
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại an toàn' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Lý do vận hành/u), {
      target: { value: 'Nhà cung cấp đã hoạt động ổn định trở lại.' },
    });
    fireEvent.click(
      within(dialog).getByLabelText('Tôi xác nhận tác vụ thất bại này cần được thử lại.'),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại an toàn' }));
    expect(await screen.findByText(getMessages('vi').common.errorTitle)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  });
});

function outboxRecord() {
  return {
    id: jobId,
    eventType: 'notification.delivery-requested',
    aggregateType: 'Notification',
    status: 'DEAD_LETTER',
    attemptCount: 8,
    availableAt: '2026-07-12T09:00:00.000Z',
    processedAt: null,
    lastErrorCode: 'QUEUE_PUBLISH_FAILED',
    createdAt: '2026-07-12T08:00:00.000Z',
  };
}

function notificationRecord() {
  return {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f12',
    category: 'APPOINTMENTS',
    channel: 'EMAIL',
    templateKey: 'appointment.reminder',
    status: 'FAILED',
    scheduledAt: '2026-07-12T08:00:00.000Z',
    deliveredAt: null,
  };
}

function auditRecord(id: string, action: string) {
  return {
    id,
    actorType: 'USER',
    actorUserId: null,
    organizationId: null,
    action,
    resourceType: 'DentalCase',
    resourceId: id,
    requestId: 'request-id',
    reason: null,
    success: true,
    createdAt: '2026-07-12T08:00:00.000Z',
  };
}
