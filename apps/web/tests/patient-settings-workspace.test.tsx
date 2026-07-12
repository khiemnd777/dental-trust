import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConsentLedgerRecordView } from '@dental-trust/contracts';
import { getConsentSettingsMessages, getMessages } from '@dental-trust/i18n';
import {
  isPatientSettingsWorkspace,
  PatientSettingsWorkspace,
} from '@/components/patient-settings-workspace';

const consentRecordId = '818f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';

function workspace(locale: 'en' | 'vi' = 'en') {
  return (
    <PatientSettingsWorkspace
      description="Account preferences and consent"
      development={false}
      locale={locale}
      messages={getMessages(locale)}
      title="Settings"
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('crypto', {
    randomUUID: () => '918f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('patient settings route selection', () => {
  it('selects only the patient settings page', () => {
    expect(isPatientSettingsWorkspace('patient', 'settings')).toBe(true);
    expect(isPatientSettingsWorkspace('clinic', 'settings')).toBe(false);
    expect(isPatientSettingsWorkspace('patient', 'privacy')).toBe(false);
  });
});

describe('patient consent settings', () => {
  it('shows localized security destinations and a bounded consent ledger', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [consentRecord()], page: {} })),
    );
    render(workspace('vi'));
    const text = getConsentSettingsMessages('vi');
    expect(await screen.findByText(text.purposes.INTAKE_HEALTH_INFORMATION)).toBeVisible();
    expect(screen.getByRole('link', { name: text.manageMfa })).toHaveAttribute(
      'href',
      '/vi/auth/mfa',
    );
    expect(screen.getByRole('link', { name: text.manageSessions })).toHaveAttribute(
      'href',
      '/vi/auth/sessions',
    );
  });

  it('records an explicit reason and confirmation, then updates immutable ledger state', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(JSON.parse(String(init.body)));
          return Response.json({
            data: { ...consentRecord(), withdrawnAt: '2026-07-12T10:00:00.000Z' },
          });
        }
        return Response.json({ data: [consentRecord()], page: {} });
      }),
    );
    render(workspace());
    const text = getConsentSettingsMessages('en');
    fireEvent.click(await screen.findByRole('button', { name: text.withdraw }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for withdrawal/u), {
      target: { value: 'I no longer authorize this ongoing use of my information.' },
    });
    fireEvent.click(within(dialog).getByLabelText(text.confirmation));
    fireEvent.click(within(dialog).getByRole('button', { name: text.confirmAction }));
    expect(await screen.findByText(text.success)).toBeVisible();
    expect(commands).toEqual([
      {
        consentRecordId,
        idempotencyKey: '918f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99',
        input: {
          expectedGrantedAt: '2026-07-12T08:00:00.000Z',
          reason: 'I no longer authorize this ongoing use of my information.',
          confirmation: 'WITHDRAW CONSENT',
        },
      },
    ]);
    expect(screen.getAllByText(text.withdrawn).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: text.withdraw })).toBeNull();
  });

  it('paginates without discarding the current ledger page', async () => {
    const second = {
      ...consentRecord(),
      id: '818f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
      purpose: 'PRIVACY',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: [consentRecord()], page: { nextCursor: consentRecordId } }),
      )
      .mockResolvedValueOnce(Response.json({ data: [second], page: { nextCursor: null } }));
    vi.stubGlobal('fetch', fetchMock);
    render(workspace());
    fireEvent.click(
      await screen.findByRole('button', { name: getConsentSettingsMessages('en').loadMore }),
    );
    await waitFor(() =>
      expect(screen.getAllByText(getConsentSettingsMessages('en').active)).toHaveLength(2),
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`cursor=${consentRecordId}`);
  });

  it('renders empty and invalid-response states without simulating success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [], page: {} }))
      .mockResolvedValueOnce(Response.json({ data: { invalid: true } }));
    vi.stubGlobal('fetch', fetchMock);
    const first = render(workspace());
    expect(await screen.findByText(getMessages('en').common.emptyTitle)).toBeVisible();
    first.unmount();
    render(workspace());
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
  });
});

function consentRecord(): ConsentLedgerRecordView {
  return {
    id: consentRecordId,
    purpose: 'INTAKE_HEALTH_INFORMATION',
    textVersion: '2026-07-12',
    locale: 'en-US',
    contentHash: 'a'.repeat(64),
    grantedAt: '2026-07-12T08:00:00.000Z',
    withdrawnAt: null,
    withdrawable: true,
  };
}
