import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';
import {
  AdminGovernanceWorkspace,
  isAdminGovernanceWorkspace,
  NotificationTemplateGovernancePanel,
} from '@/components/admin-governance-workspace';

const recordId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const categoryId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const createdAt = '2026-07-12T08:00:00.000Z';

function workspace(pageKey: string, locale: 'en' | 'vi' = 'en') {
  return (
    <AdminGovernanceWorkspace
      description="Governed administration"
      development={false}
      locale={locale}
      messages={getMessages(locale)}
      pageKey={pageKey}
      title="Governance"
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

describe('admin governance routing', () => {
  it('selects only connected governance screens', () => {
    expect(isAdminGovernanceWorkspace('admin', 'content')).toBe(true);
    expect(isAdminGovernanceWorkspace('admin', 'taxonomy')).toBe(true);
    expect(isAdminGovernanceWorkspace('admin', 'flags')).toBe(true);
    expect(isAdminGovernanceWorkspace('admin', 'jobs')).toBe(false);
    expect(isAdminGovernanceWorkspace('clinic', 'content')).toBe(false);
  });
});

describe('content and taxonomy governance', () => {
  it('creates the next immutable content version with reason and confirmation', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal('fetch', governanceFetch([contentRecord()], commands));
    render(workspace('content'));
    fireEvent.click(await screen.findByRole('button', { name: 'Create next version' }));
    fireEvent.change(screen.getByLabelText(/Body/u), {
      target: { value: 'New approved patient-safety content for the secure care journey.' },
    });
    fireEvent.change(screen.getByLabelText(/Reason and evidence/u), {
      target: { value: 'Approved content ticket DT-CONTENT-42.' },
    });
    fireEvent.click(screen.getByLabelText('I confirm this governed administrative change.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save immutable version' }));
    expect(
      await screen.findByText(
        'The governed version was saved, audited, and queued for downstream processing.',
      ),
    ).toBeVisible();
    expect(commands).toEqual([
      expect.objectContaining({
        view: 'content',
        idempotencyKey: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9f99',
        command: expect.objectContaining({
          slug: 'patient-safety',
          expectedVersion: 2,
          publicationStatus: 'PUBLISHED',
          confirmation: 'SAVE CONTENT VERSION',
        }),
      }),
    ]);
  });

  it('builds a bilingual procedure command against an explicit category', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal('fetch', governanceFetch([categoryRecord()], commands));
    render(workspace('taxonomy'));
    fireEvent.click(await screen.findByRole('button', { name: 'Create version' }));
    fireEvent.change(screen.getByLabelText('Record type'), { target: { value: 'procedure' } });
    fill('Code', 'implant-placement');
    fill('Vietnamese name', 'Cấy ghép implant');
    fill('English name', 'Implant placement');
    fill('Service category ID', categoryId);
    fill('Vietnamese description', 'Quy trình cấy ghép implant có kiểm soát.');
    fill('English description', 'Controlled dental implant placement procedure.');
    fill('Reason and evidence', 'Approved clinical taxonomy ticket DT-TAX-8.');
    fireEvent.click(screen.getByLabelText('I confirm this governed administrative change.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save immutable version' }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual(
      expect.objectContaining({
        view: 'taxonomy',
        command: expect.objectContaining({
          kind: 'procedure',
          expectedVersion: 0,
          serviceCategoryId: categoryId,
          names: { 'vi-VN': 'Cấy ghép implant', 'en-US': 'Implant placement' },
          confirmation: 'CHANGE TAXONOMY',
        }),
      }),
    );
  });
});

describe('notification template governance', () => {
  it('publishes localized template copy without accepting payload interpolation fields', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal('fetch', governanceFetch([templateRecord()], commands));
    render(<NotificationTemplateGovernancePanel locale="vi" messages={getMessages('vi')} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo phiên bản tiếp theo' }));
    fireEvent.change(screen.getByLabelText(/Nội dung/u), {
      target: { value: 'Một cập nhật hồ sơ mới đang chờ trong cổng Dental Trust bảo mật.' },
    });
    fireEvent.change(screen.getByLabelText(/Lý do và bằng chứng/u), {
      target: { value: 'Nội dung đã duyệt theo yêu cầu DT-MAIL-11.' },
    });
    fireEvent.click(screen.getByLabelText('Tôi xác nhận thay đổi quản trị có kiểm soát này.'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phiên bản bất biến' }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual(
      expect.objectContaining({
        view: 'templates',
        command: expect.objectContaining({
          key: 'case.updated',
          expectedVersion: 3,
          locale: 'vi-VN',
          confirmation: 'SAVE NOTIFICATION TEMPLATE',
        }),
      }),
    );
    expect(JSON.stringify(commands[0])).not.toContain('payload');
  });
});

describe('feature and configuration governance', () => {
  it('switches among flag, configuration, and localized location records', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const view = new URL(String(input), 'http://localhost').searchParams.get('view');
      const data =
        view === 'configuration'
          ? [configurationRecord()]
          : view === 'locations'
            ? [countryRecord()]
            : [flagRecord()];
      return Response.json({ data, page: { nextCursor: null } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(workspace('flags', 'vi'));
    expect(await screen.findByText('patient.passport-sharing')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Cấu hình' }));
    expect(await screen.findByText('booking.deposit-percent')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Ngôn ngữ' }));
    expect(await screen.findByText('VN')).toBeVisible();
    expect(screen.getByText('Việt Nam')).toBeVisible();
  });

  it('saves a typed non-secret configuration version', async () => {
    const commands: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        commands.push(JSON.parse(String(init.body)));
        return Response.json({ data: { resourceId: recordId, version: 3 } });
      }
      const view = new URL(String(input), 'http://localhost').searchParams.get('view');
      return Response.json({
        data: view === 'configuration' ? [configurationRecord()] : [flagRecord()],
        page: {},
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(workspace('flags'));
    await screen.findByText('patient.passport-sharing');
    fireEvent.click(screen.getByRole('tab', { name: 'Configuration' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create next version' }));
    fill('Reason and evidence', 'Approved booking policy ticket DT-FIN-3.');
    fireEvent.click(screen.getByLabelText('I confirm this governed administrative change.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save immutable version' }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual(
      expect.objectContaining({
        view: 'configuration',
        command: expect.objectContaining({
          valueType: 'INTEGER',
          value: '20',
          expectedVersion: 2,
          confirmation: 'CHANGE SYSTEM CONFIGURATION',
        }),
      }),
    );
    expect(JSON.stringify(commands[0])).not.toContain('secret');
  });

  it('keeps the governed form open and reports an upstream rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(null, { status: 409 })
          : Response.json({ data: [flagRecord()], page: {} }),
      ),
    );
    render(workspace('flags'));
    fireEvent.click(await screen.findByRole('button', { name: 'Create next version' }));
    fill('Reason and evidence', 'Approved release ticket DT-FLAG-9.');
    fireEvent.click(screen.getByLabelText('I confirm this governed administrative change.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save immutable version' }));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
    expect(screen.getByLabelText(/Reason and evidence/u)).toBeVisible();
  });

  it('renders empty and fail-closed invalid-response states', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [], page: {} }))
      .mockResolvedValueOnce(Response.json({ data: { invalid: true } }));
    vi.stubGlobal('fetch', fetchMock);
    const first = render(workspace('content'));
    expect(await screen.findByText(getMessages('en').common.emptyTitle)).toBeVisible();
    first.unmount();
    render(workspace('content'));
    expect(await screen.findByText(getMessages('en').common.errorTitle)).toBeVisible();
  });
});

function governanceFetch(records: unknown[], commands: unknown[]) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      commands.push(JSON.parse(String(init.body)));
      return Response.json({ data: { resourceId: recordId, version: 3 } });
    }
    return Response.json({ data: records, page: { nextCursor: null } });
  });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(escapePattern(label), 'u')), {
    target: { value },
  });
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function contentRecord() {
  return {
    id: recordId,
    slug: 'patient-safety',
    locale: 'en-US',
    version: 2,
    title: 'Patient safety commitments',
    summary: 'How Dental Trust protects patients.',
    publicationStatus: 'PUBLISHED',
    publishedAt: createdAt,
    archivedAt: null,
    createdAt,
  };
}
function categoryRecord() {
  return {
    id: categoryId,
    kind: 'service_category',
    parentId: null,
    code: 'general-dentistry',
    names: { 'vi-VN': 'Nha khoa tổng quát', 'en-US': 'General dentistry' },
    active: true,
    version: 1,
    updatedAt: createdAt,
  };
}
function templateRecord() {
  return {
    id: recordId,
    key: 'case.updated',
    category: 'CASE_UPDATES',
    channel: 'EMAIL',
    locale: 'vi-VN',
    createdAt,
    latestVersion: {
      id: recordId,
      version: 3,
      subject: 'Hồ sơ Dental Trust đã cập nhật',
      publicationStatus: 'PUBLISHED',
      createdAt,
    },
  };
}
function flagRecord() {
  return {
    id: recordId,
    key: 'patient.passport-sharing',
    description: 'Allow secure patient Passport shares.',
    createdAt,
    latestVersion: {
      id: recordId,
      version: 4,
      enabled: true,
      environment: 'production',
      audiences: ['PATIENT'],
      createdAt,
    },
  };
}
function configurationRecord() {
  return {
    id: recordId,
    key: 'booking.deposit-percent',
    description: 'Default booking deposit percentage.',
    valueType: 'INTEGER',
    createdAt,
    latestVersion: { id: recordId, version: 2, value: '20', createdAt },
  };
}
function countryRecord() {
  return {
    id: recordId,
    kind: 'country',
    code: 'VN',
    names: { 'vi-VN': 'Việt Nam', 'en-US': 'Vietnam' },
    currency: 'VND',
    callingCode: '+84',
    active: true,
    version: 1,
    updatedAt: createdAt,
  };
}
