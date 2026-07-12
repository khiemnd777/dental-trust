import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '@dental-trust/i18n';

const navigation = vi.hoisted(() => ({
  pathname: '/en/admin/users',
  push: vi.fn(),
  notFound: vi.fn((): never => {
    throw new Error('NOT_FOUND');
  }),
}));
const sessionMocks = vi.hoisted(() => ({
  requireAreaSession: vi.fn(),
  loadAuthorizedCaseIds: vi.fn(),
  canAccessPortalRoute: vi.fn(),
  requirePortalRouteSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  notFound: navigation.notFound,
}));
vi.mock('@/lib/session', async (loadOriginal) => {
  const original = (await loadOriginal()) as Record<string, unknown>;
  return { ...original, ...sessionMocks };
});
vi.mock('@/app/[locale]/auth/actions', () => ({ logoutAction: vi.fn() }));

import { PortalAreaLayout } from '@/components/portal-area-layout';
import { PortalPageServer } from '@/components/portal-page-server';
import { PortalShell } from '@/components/portal-shell';
import { PortalWorkspace } from '@/components/portal-workspace';

const messages = getMessages('en');
const resourceId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';

function first<T>(items: T[]): T {
  const item = items[0];
  if (!item) throw new Error('Expected at least one matching element.');
  return item;
}

beforeEach(() => {
  navigation.pathname = '/en/admin/users';
  navigation.push.mockReset();
  navigation.notFound.mockClear();
  sessionMocks.requireAreaSession.mockReset();
  sessionMocks.loadAuthorizedCaseIds.mockReset();
  sessionMocks.canAccessPortalRoute.mockReset();
  sessionMocks.requirePortalRouteSession.mockReset();
  vi.unstubAllGlobals();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 202 })));
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:export'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

function workspace(pageKey: string, development = true) {
  return (
    <PortalWorkspace
      area="admin"
      pageKey={pageKey}
      title="Workspace title"
      description="Workspace description"
      messages={messages}
      development={development}
      locale="en"
    />
  );
}

describe('portal shell and server composition', () => {
  it('filters shell navigation, routes the first match, and renders responsive actions', () => {
    const navItems = [
      { key: 'dashboard', href: '/en/admin', icon: 'home' as const, label: 'Dashboard' },
      { key: 'users', href: '/en/admin/users', icon: 'team' as const, label: 'Users' },
      { key: 'payments', href: '/en/admin/payments', icon: 'wallet' as const, label: 'Payments' },
      {
        key: 'notifications',
        href: '/en/admin/notifications',
        icon: 'mail' as const,
        label: 'Notifications',
      },
      { key: 'health', href: '/en/admin/health', icon: 'activity' as const, label: 'Health' },
    ];
    render(
      <PortalShell
        locale="en"
        messages={messages}
        area="admin"
        user={{ name: 'Admin User', email: 'admin@example.test' }}
        navItems={navItems}
        organizationMembershipCount={2}
        logout={vi.fn()}
      >
        <p>Protected content</p>
      </PortalShell>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(first(screen.getAllByRole('link', { name: 'Users' }))).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByRole('link', { name: messages.portal.notifications })).toHaveAttribute(
      'href',
      '/en/admin/notifications',
    );
    expect(screen.getByText(messages.auth.organizationSwitch).closest('a')).toHaveAttribute(
      'href',
      expect.stringContaining('/en/auth/organization'),
    );
    const search = screen.getByRole('search');
    fireEvent.change(within(search).getByRole('textbox'), { target: { value: 'pay' } });
    fireEvent.submit(search);
    expect(navigation.push).toHaveBeenCalledWith('/en/admin/payments');
  });

  it('composes area navigation from authorized routes and available case scope', async () => {
    sessionMocks.requireAreaSession.mockResolvedValue({
      name: 'Patient',
      email: 'patient@example.test',
      roles: ['PATIENT'],
      availableMemberships: [],
      source: 'development',
    });
    sessionMocks.loadAuthorizedCaseIds.mockResolvedValue([resourceId]);
    sessionMocks.canAccessPortalRoute.mockReturnValue(true);

    render(
      await PortalAreaLayout({
        area: 'patient',
        locale: 'en',
        children: <p>Area child</p>,
      }),
    );
    expect(screen.getByText('Area child')).toBeInTheDocument();
    expect(
      first(screen.getAllByRole('link', { name: messages.portal.pages.patient.case[0] })),
    ).toHaveAttribute('href', `/en/app/cases/${resourceId}`);
  });

  it('resolves a portal page and rejects unknown routes', async () => {
    sessionMocks.requirePortalRouteSession.mockResolvedValue({ source: 'development' });
    render(await PortalPageServer({ area: 'admin', locale: 'en', segments: ['users'] }));
    expect(
      await screen.findByRole('heading', { name: messages.portal.pages.admin.users[0] }),
    ).toBeInTheDocument();
    expect(await screen.findByText(messages.common.errorTitle)).toBeInTheDocument();
    await expect(
      PortalPageServer({ area: 'admin', locale: 'en', segments: ['not-a-route'] }),
    ).rejects.toThrow('NOT_FOUND');
  });
});

describe('generic development workspace', () => {
  it('supports table filtering, detail, completion, export, and add actions', async () => {
    render(workspace('planDetail'));
    expect(screen.getByRole('heading', { name: messages.portal.tableTitle })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: messages.portal.filterAttention }));
    fireEvent.click(screen.getByRole('button', { name: messages.portal.filterProgress }));
    fireEvent.click(screen.getByRole('button', { name: messages.portal.filterAll }));

    fireEvent.click(first(screen.getAllByRole('button', { name: messages.portal.open })));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.common.close }));

    fireEvent.click(first(screen.getAllByRole('button', { name: messages.portal.complete })));
    await screen.findByText(messages.auth.success);
    expect(screen.getAllByText(messages.portal.done).length).toBeGreaterThan(0);

    fireEvent.click(first(screen.getAllByRole('button', { name: messages.portal.export })));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');

    fireEvent.click(first(screen.getAllByRole('button', { name: messages.portal.add })));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.common.continue }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows safe command errors', async () => {
    render(workspace('planDetail'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    fireEvent.click(first(screen.getAllByRole('button', { name: messages.portal.complete })));
    expect(await screen.findByText(messages.common.errorTitle)).toBeInTheDocument();
  });

  it('submits form, timeline, message, and upload interactions', async () => {
    const { rerender } = render(workspace('settings'));
    fireEvent.click(screen.getByRole('button', { name: messages.common.save }));
    expect(await screen.findByText(messages.auth.success)).toBeInTheDocument();

    rerender(workspace('corrective'));
    fireEvent.click(first(screen.getAllByRole('button', { name: messages.common.continue })));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    rerender(workspace('messages'));
    const composer = screen.getByLabelText(/Message/i);
    fireEvent.change(composer, { target: { value: 'A new secure coordination message.' } });
    fireEvent.click(screen.getByRole('button', { name: messages.forms.send }));
    expect(await screen.findByText('A new secure coordination message.')).toBeInTheDocument();

    rerender(workspace('records'));
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    if (input) {
      fireEvent.change(input, {
        target: { files: [new File(['safe'], 'record.pdf', { type: 'application/pdf' })] },
      });
    }
    expect(screen.getByText(`${messages.forms.selected}: record.pdf`)).toBeInTheDocument();
  });

  it('does not simulate unsupported generic workflows in production', () => {
    render(workspace('planDetail', false));
    expect(screen.getByText(messages.auth.productionUnavailable)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages.common.save })).toBeNull();
  });
});
