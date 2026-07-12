import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';
import {
  AdminDirectoryWorkspace,
  isAdminDirectoryWorkspace,
} from '@/components/admin-directory-workspace';

const userId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const createdAt = '2026-07-12T08:00:00.000Z';

function workspace(pageKey: string, locale: 'en' | 'vi' = 'en') {
  return (
    <AdminDirectoryWorkspace
      description="Authorized directory"
      development={false}
      locale={locale}
      messages={getMessages(locale)}
      pageKey={pageKey}
      title="Directory"
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

describe('admin directory routing', () => {
  it('selects connected directory screens only', () => {
    for (const key of [
      'users',
      'organizations',
      'roles',
      'clinics',
      'dentists',
      'cases',
      'payments',
    ])
      expect(isAdminDirectoryWorkspace('admin', key)).toBe(true);
    expect(isAdminDirectoryWorkspace('admin', 'jobs')).toBe(false);
    expect(isAdminDirectoryWorkspace('clinic', 'users')).toBe(false);
  });
});

describe('admin user management', () => {
  it('requires reasoned confirmation and updates account status after acceptance', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({ data: { outcome: 'UPDATED' } });
        }
        return Response.json({ data: [userRecord()], page: { nextCursor: null } });
      }),
    );
    render(workspace('users'));
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }));
    const dialog = screen.getByRole('dialog');
    const statusForm = within(dialog)
      .getByRole('heading', { name: 'Account status' })
      .closest('form');
    if (!statusForm) throw new Error('Expected account status form.');
    fireEvent.change(within(statusForm).getByLabelText('Account status'), {
      target: { value: 'SUSPENDED' },
    });
    fireEvent.change(within(statusForm).getByLabelText(/Reason for privileged change/u), {
      target: { value: 'Confirmed security investigation ticket DT-42.' },
    });
    fireEvent.click(within(statusForm).getByLabelText('I confirm this account-status change.'));
    fireEvent.click(within(statusForm).getByRole('button', { name: 'Change account status' }));
    await screen.findByText('The authorized user change was recorded and audited.');
    expect(commands).toEqual([
      expect.objectContaining({
        view: 'users',
        kind: 'status',
        userId,
        idempotencyKey: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f99',
        command: {
          toStatus: 'SUSPENDED',
          expectedStatus: 'ACTIVE',
          reason: 'Confirmed security investigation ticket DT-42.',
          confirmation: 'CHANGE ACCOUNT STATUS',
        },
      }),
    ]);
    expect(screen.getByText('SUSPENDED')).toBeVisible();
  });

  it('grants and locally reflects an approved system role', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({ data: { outcome: 'UPDATED' } });
        }
        return Response.json({ data: [userRecord()], page: { nextCursor: null } });
      }),
    );
    render(workspace('users', 'vi'));
    fireEvent.click(await screen.findByRole('button', { name: 'Quản lý' }));
    const dialog = screen.getByRole('dialog');
    const roleForm = within(dialog)
      .getByRole('heading', { name: 'Vai trò hệ thống' })
      .closest('form');
    if (!roleForm) throw new Error('Expected role form.');
    fireEvent.change(within(roleForm).getByLabelText('Vai trò hệ thống'), {
      target: { value: 'VERIFICATION_OFFICER' },
    });
    fireEvent.change(within(roleForm).getByLabelText(/Lý do thay đổi đặc quyền/u), {
      target: { value: 'Phân công đã được phê duyệt theo yêu cầu DT-99.' },
    });
    fireEvent.click(within(roleForm).getByLabelText('Tôi xác nhận thay đổi vai trò hệ thống này.'));
    fireEvent.click(within(roleForm).getByRole('button', { name: 'Đổi vai trò người dùng' }));
    await screen.findByText('Thay đổi người dùng đã được ghi nhận và kiểm toán.');
    expect(commands).toEqual([
      expect.objectContaining({
        kind: 'role',
        command: expect.objectContaining({
          role: 'VERIFICATION_OFFICER',
          action: 'GRANT',
          expectedRolePresent: false,
          confirmation: 'CHANGE USER ROLE',
        }),
      }),
    ]);
    expect(screen.getByText(/VERIFICATION_OFFICER/u)).toBeVisible();
  });

  it('keeps the dialog and original state when an upstream command rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(null, { status: 409 })
          : Response.json({ data: [userRecord()], page: { nextCursor: null } }),
      ),
    );
    render(workspace('users'));
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }));
    const statusForm = screen.getByRole('heading', { name: 'Account status' }).closest('form');
    if (!statusForm) throw new Error('Expected account status form.');
    fireEvent.change(within(statusForm).getByLabelText(/Reason for privileged change/u), {
      target: { value: 'Confirmed security investigation ticket DT-42.' },
    });
    fireEvent.click(within(statusForm).getByLabelText('I confirm this account-status change.'));
    fireEvent.click(within(statusForm).getByRole('button', { name: 'Change account status' }));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});

describe('admin directory records', () => {
  it.each([
    ['organizations', organizationRecord(), 'Minh An Dental Center', '4 members'],
    ['clinics', clinicRecord(), 'Minh An Dental Center', '1 locations · 2 dentists'],
    ['dentists', dentistRecord(), 'Dr. Minh Nguyen', '1 clinics'],
    ['cases', caseRecord(), 'DT-2026-A1B2C3D4E5', '1 assignments · Ho Chi Minh City'],
    ['payments', paymentRecord(), /984\.25|984,25/u, 'stripe · 0 refunds'],
    ['roles', roleRecord(), 'Platform administrator', '2 permissions'],
  ])(
    'renders %s view data without generic placeholders',
    async (pageKey, record, subject, details) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ data: [record], page: { nextCursor: null } })),
      );
      const rendered = render(workspace(String(pageKey)));
      expect(await screen.findByText(subject)).toBeVisible();
      expect(screen.getByText(details)).toBeVisible();
      rendered.unmount();
    },
  );

  it('searches, clears, and appends cursor pages', async () => {
    const secondId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e12';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.searchParams.get('cursor'))
        return Response.json({
          data: [{ ...organizationRecord(), id: secondId, name: 'Second Clinic Group' }],
          page: { nextCursor: null },
        });
      return Response.json({ data: [organizationRecord()], page: { nextCursor: userId } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(workspace('organizations'));
    await screen.findByText('Minh An Dental Center');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search by reference or name' }), {
      target: { value: 'Minh' },
    });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('search=Minh'))).toBe(
        true,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second Clinic Group')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull());
  });

  it('uses safe fallbacks for invalid dates and oversized money values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: [{ ...paymentRecord(), amountMinor: '99999999999999999999', createdAt: 'unknown' }],
          page: {},
        }),
      ),
    );
    render(workspace('payments'));
    expect(await screen.findByText('USD 99999999999999999999')).toBeVisible();
    expect(screen.getByText('unknown')).toBeVisible();
  });

  it('renders empty and fail-closed invalid-response states', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [], page: {} }))
      .mockResolvedValueOnce(Response.json({ data: { unexpected: true } }));
    vi.stubGlobal('fetch', fetchMock);
    const first = render(workspace('clinics'));
    expect(await screen.findByText(getMessages('en').common.emptyTitle)).toBeVisible();
    first.unmount();
    render(workspace('clinics'));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
  });
});

function userRecord() {
  return {
    id: userId,
    email: 'admin@example.test',
    accountStatus: 'ACTIVE',
    emailVerified: true,
    roles: ['PLATFORM_ADMIN'],
    mfaEnabled: true,
    activeSessionCount: 1,
    createdAt,
  };
}

function organizationRecord() {
  return {
    id: userId,
    type: 'CLINIC',
    name: 'Minh An Dental Center',
    slug: 'minh-an',
    active: true,
    memberCount: 4,
    createdAt,
  };
}

function clinicRecord() {
  return {
    id: userId,
    organizationId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
    name: 'Minh An Dental Center',
    slug: 'minh-an',
    verificationStatus: 'VERIFIED',
    activeLocationCount: 1,
    activeDentistCount: 2,
    createdAt,
  };
}

function dentistRecord() {
  return {
    id: userId,
    fullName: 'Dr. Minh Nguyen',
    slug: 'dr-minh',
    licenseStatus: 'VERIFIED',
    activeClinicCount: 1,
    createdAt,
  };
}

function caseRecord() {
  return {
    id: userId,
    caseNumber: 'DT-2026-A1B2C3D4E5',
    status: 'MATCHING_IN_PROGRESS',
    preferredLocation: 'Ho Chi Minh City',
    activeAssignmentCount: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

function paymentRecord() {
  return {
    id: userId,
    bookingId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
    provider: 'stripe',
    status: 'SUCCEEDED',
    amountMinor: '98425',
    currency: 'USD',
    refundCount: 0,
    createdAt,
  };
}

function roleRecord() {
  return {
    code: 'PLATFORM_ADMIN',
    displayName: 'Platform administrator',
    privileged: true,
    permissions: ['audit:read', 'privacy:manage'],
    userCount: 2,
    membershipCount: 0,
  };
}
