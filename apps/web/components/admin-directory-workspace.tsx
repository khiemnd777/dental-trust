'use client';

import { useEffect, useState, type FormEvent } from 'react';

import type {
  AdminCaseView,
  AdminClinicView,
  AdminDentistView,
  AdminOrganizationView,
  AdminPaymentView,
  AdminRoleView,
  AdminUserView,
} from '@dental-trust/contracts';
import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Icon,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';

type DirectoryRecord =
  | AdminCaseView
  | AdminClinicView
  | AdminDentistView
  | AdminOrganizationView
  | AdminPaymentView
  | AdminRoleView
  | AdminUserView;

const supported = new Set([
  'admin:users',
  'admin:organizations',
  'admin:roles',
  'admin:clinics',
  'admin:dentists',
  'admin:cases',
  'admin:payments',
]);

const copy = {
  en: {
    search: 'Search by reference or name',
    submitSearch: 'Search',
    clear: 'Clear',
    reference: 'Reference',
    subject: 'Subject',
    status: 'Status',
    details: 'Details',
    created: 'Created',
    manage: 'Manage',
    loadMore: 'Load more',
    manageUser: 'Manage user access',
    accountStatus: 'Account status',
    reason: 'Reason for privileged change',
    confirmStatus: 'I confirm this account-status change.',
    saveStatus: 'Change account status',
    role: 'System role',
    roleAction: 'Role action',
    grant: 'Grant',
    revoke: 'Revoke',
    confirmRole: 'I confirm this system-role change.',
    saveRole: 'Change user role',
    close: 'Close',
    saved: 'The authorized user change was recorded and audited.',
    reasonHint: 'Include the ticket, evidence, and business reason. Minimum 12 characters.',
    members: 'members',
    locations: 'locations',
    dentists: 'dentists',
    clinics: 'clinics',
    assignments: 'assignments',
    refunds: 'refunds',
    permissions: 'permissions',
  },
  vi: {
    search: 'Tìm theo mã tham chiếu hoặc tên',
    submitSearch: 'Tìm kiếm',
    clear: 'Xóa lọc',
    reference: 'Mã tham chiếu',
    subject: 'Đối tượng',
    status: 'Trạng thái',
    details: 'Chi tiết',
    created: 'Ngày tạo',
    manage: 'Quản lý',
    loadMore: 'Xem thêm',
    manageUser: 'Quản lý quyền người dùng',
    accountStatus: 'Trạng thái tài khoản',
    reason: 'Lý do thay đổi đặc quyền',
    confirmStatus: 'Tôi xác nhận thay đổi trạng thái tài khoản này.',
    saveStatus: 'Đổi trạng thái tài khoản',
    role: 'Vai trò hệ thống',
    roleAction: 'Thao tác vai trò',
    grant: 'Cấp',
    revoke: 'Thu hồi',
    confirmRole: 'Tôi xác nhận thay đổi vai trò hệ thống này.',
    saveRole: 'Đổi vai trò người dùng',
    close: 'Đóng',
    saved: 'Thay đổi người dùng đã được ghi nhận và kiểm toán.',
    reasonHint: 'Nêu mã yêu cầu, bằng chứng và lý do nghiệp vụ. Tối thiểu 12 ký tự.',
    members: 'thành viên',
    locations: 'cơ sở',
    dentists: 'nha sĩ',
    clinics: 'phòng khám',
    assignments: 'phân công',
    refunds: 'khoản hoàn tiền',
    permissions: 'quyền',
  },
} as const;

const assignableRoles = [
  'PATIENT',
  'CAREGIVER',
  'VERIFICATION_OFFICER',
  'SUPPORT_AGENT',
  'FINANCE_ADMIN',
  'CONTENT_ADMIN',
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
] as const;

export function isAdminDirectoryWorkspace(area: string, pageKey: string) {
  return supported.has(`${area}:${pageKey}`);
}

export function AdminDirectoryWorkspace({
  pageKey,
  title,
  description,
  locale,
  messages,
  development,
}: {
  readonly pageKey: string;
  readonly title: string;
  readonly description: string;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const language = locale.startsWith('vi') ? 'vi' : 'en';
  const t = copy[language];
  const [records, setRecords] = useState<DirectoryRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUserView | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadDirectory(pageKey, appliedSearch, undefined, controller.signal)
      .then((result) => {
        setRecords(result.records);
        setNextCursor(result.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [appliedSearch, pageKey]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(false);
    try {
      const result = await loadDirectory(pageKey, appliedSearch, nextCursor);
      setRecords((current) => [...current, ...result.records]);
      setNextCursor(result.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = search.trim();
    if (normalized && normalized.length < 2) return;
    setAppliedSearch(normalized);
  };

  const sendUserCommand = async (kind: 'status' | 'role', command: Record<string, unknown>) => {
    if (!selected) return;
    setSending(true);
    setError(false);
    setNotice(null);
    try {
      const response = await fetch('/api/portal/admin-directory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          view: 'users',
          kind,
          userId: selected.id,
          command,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error('admin_user_change_rejected');
      if (kind === 'status' && typeof command.toStatus === 'string') {
        setRecords((current) =>
          current.map((record) =>
            'email' in record && record.id === selected.id
              ? { ...record, accountStatus: command.toStatus as AdminUserView['accountStatus'] }
              : record,
          ),
        );
      }
      if (
        kind === 'role' &&
        typeof command.role === 'string' &&
        typeof command.action === 'string'
      ) {
        setRecords((current) =>
          current.map((record) => {
            if (!('email' in record) || record.id !== selected.id) return record;
            const roles =
              command.action === 'GRANT'
                ? [...new Set([...record.roles, command.role as string])]
                : record.roles.filter((role) => role !== command.role);
            return { ...record, roles };
          }),
        );
      }
      setSelected(null);
      setNotice(t.saved);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections.admin} ·{' '}
            {development ? messages.portal.demo : messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="info">
          <Icon name="shield" />
          {messages.portal.secure}
        </Badge>
      </div>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {pageKey !== 'roles' ? (
        <form
          className="search-bar"
          onSubmit={submitSearch}
          role="search"
          style={{ marginTop: '1rem' }}
        >
          <label className="dt-sr-only" htmlFor="admin-directory-search">
            {t.search}
          </label>
          <input
            className="dt-input"
            id="admin-directory-search"
            minLength={2}
            placeholder={t.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button type="submit">
            <Icon name="search" />
            {t.submitSearch}
          </Button>
          {appliedSearch ? (
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setSearch('');
                setAppliedSearch('');
              }}
            >
              {t.clear}
            </Button>
          ) : null}
        </form>
      ) : null}
      {loading ? (
        <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <Skeleton style={{ height: '2rem', width: '40%' }} />
          <Skeleton style={{ height: '14rem', marginTop: '1rem' }} />
        </Card>
      ) : records.length ? (
        <DirectoryTable locale={locale} records={records} text={t} onManage={setSelected} />
      ) : (
        <EmptyState title={messages.common.emptyTitle} body={messages.common.emptyBody} />
      )}
      {nextCursor ? (
        <Button
          disabled={loadingMore}
          style={{ marginTop: '1rem' }}
          variant="secondary"
          onClick={() => void loadMore()}
        >
          {t.loadMore}
        </Button>
      ) : null}
      {selected ? (
        <UserManagementDialog
          locale={language}
          sending={sending}
          user={selected}
          onClose={() => setSelected(null)}
          onRole={(command) => void sendUserCommand('role', command)}
          onStatus={(command) => void sendUserCommand('status', command)}
        />
      ) : null}
    </main>
  );
}

async function loadDirectory(
  pageKey: string,
  search: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    view: pageKey,
    ...(search ? { search } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const response = await fetch(`/api/portal/admin-directory?${query}`, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('admin_directory_unavailable');
  const envelope = (await response.json()) as {
    data?: unknown;
    page?: { nextCursor?: string | null };
  };
  if (!Array.isArray(envelope.data)) throw new Error('invalid_admin_directory_data');
  return {
    records: envelope.data as DirectoryRecord[],
    nextCursor: envelope.page?.nextCursor ?? null,
  };
}

function DirectoryTable({
  records,
  locale,
  text,
  onManage,
}: {
  readonly records: readonly DirectoryRecord[];
  readonly locale: Locale;
  readonly text: (typeof copy)['en'] | (typeof copy)['vi'];
  readonly onManage: (record: AdminUserView) => void;
}) {
  return (
    <Card className="workspace-card" style={{ marginTop: '1rem' }}>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{text.reference}</th>
              <th>{text.subject}</th>
              <th>{text.status}</th>
              <th>{text.details}</th>
              <th>{text.created}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={recordKey(record)}>
                <td className="data-table__id" data-label={text.reference}>
                  {recordReference(record)}
                </td>
                <td className="data-table__primary" data-label={text.subject}>
                  {recordSubject(record, locale)}
                </td>
                <td data-label={text.status}>
                  <Badge tone={recordTone(record)}>{recordStatus(record)}</Badge>
                </td>
                <td data-label={text.details}>{recordDetails(record, text)}</td>
                <td data-label={text.created}>
                  {'createdAt' in record ? formatDate(record.createdAt, locale) : '—'}
                </td>
                <td data-label={text.manage}>
                  {'email' in record ? (
                    <Button size="sm" variant="secondary" onClick={() => onManage(record)}>
                      {text.manage}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function UserManagementDialog({
  user,
  locale,
  sending,
  onClose,
  onStatus,
  onRole,
}: {
  readonly user: AdminUserView;
  readonly locale: 'en' | 'vi';
  readonly sending: boolean;
  readonly onClose: () => void;
  readonly onStatus: (command: Record<string, unknown>) => void;
  readonly onRole: (command: Record<string, unknown>) => void;
}) {
  const t = copy[locale];
  const submitStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('statusConfirmed') !== 'on' || !event.currentTarget.reportValidity()) return;
    onStatus({
      toStatus: String(form.get('toStatus')),
      expectedStatus: user.accountStatus,
      reason: String(form.get('statusReason')).trim(),
      confirmation: 'CHANGE ACCOUNT STATUS',
    });
  };
  const submitRole = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('roleConfirmed') !== 'on' || !event.currentTarget.reportValidity()) return;
    const role = String(form.get('role'));
    onRole({
      role,
      action: String(form.get('roleAction')),
      expectedRolePresent: user.roles.includes(role),
      reason: String(form.get('roleReason')).trim(),
      confirmation: 'CHANGE USER ROLE',
    });
  };
  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <Card style={{ maxWidth: '48rem', padding: '1.4rem', width: '100%' }}>
        <div className="workspace-card__head" style={{ padding: 0 }}>
          <div>
            <h2>{t.manageUser}</h2>
            <p>{user.email}</p>
          </div>
          <Button aria-label={t.close} size="icon" variant="quiet" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </div>
        <div className="workflow-summary" style={{ marginTop: '1rem' }}>
          <form className="auth-form" onSubmit={submitStatus}>
            <h3>{t.accountStatus}</h3>
            <SelectField label={t.accountStatus} name="toStatus" defaultValue={user.accountStatus}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="LOCKED">LOCKED</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </SelectField>
            <TextAreaField
              hint={t.reasonHint}
              label={t.reason}
              minLength={12}
              name="statusReason"
              required
            />
            <Checkbox label={t.confirmStatus} name="statusConfirmed" required />
            <Button disabled={sending} type="submit">
              {t.saveStatus}
            </Button>
          </form>
          <form className="auth-form" onSubmit={submitRole}>
            <h3>{t.role}</h3>
            <SelectField label={t.role} name="role">
              {assignableRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </SelectField>
            <SelectField label={t.roleAction} name="roleAction">
              <option value="GRANT">{t.grant}</option>
              <option value="REVOKE">{t.revoke}</option>
            </SelectField>
            <TextAreaField
              hint={t.reasonHint}
              label={t.reason}
              minLength={12}
              name="roleReason"
              required
            />
            <Checkbox label={t.confirmRole} name="roleConfirmed" required />
            <Button disabled={sending} type="submit">
              {t.saveRole}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

function recordKey(record: DirectoryRecord) {
  return 'id' in record ? record.id : record.code;
}

function recordReference(record: DirectoryRecord) {
  return 'id' in record ? record.id.slice(0, 8) : record.code;
}

function recordSubject(record: DirectoryRecord, locale: Locale) {
  if ('email' in record) return record.email;
  if ('name' in record) return record.name;
  if ('fullName' in record) return record.fullName;
  if ('caseNumber' in record) return record.caseNumber;
  if ('amountMinor' in record) return formatMinorMoney(record.amountMinor, record.currency, locale);
  return record.displayName;
}

function recordStatus(record: DirectoryRecord) {
  if ('accountStatus' in record) return record.accountStatus;
  if ('verificationStatus' in record) return record.verificationStatus;
  if ('licenseStatus' in record) return record.licenseStatus;
  if ('status' in record) return record.status;
  if ('active' in record) return record.active ? 'ACTIVE' : 'DELETED';
  return record.privileged ? 'PRIVILEGED' : 'STANDARD';
}

function recordTone(record: DirectoryRecord): 'verified' | 'attention' | 'danger' | 'info' {
  const status = recordStatus(record);
  if (['ACTIVE', 'VERIFIED', 'SUCCEEDED'].includes(status)) return 'verified';
  if (['SUSPENDED', 'LOCKED', 'FAILED', 'DELETED', 'EXPIRED'].includes(status)) return 'danger';
  if (['PENDING_VERIFICATION', 'UNDER_REVIEW', 'MATCHING_IN_PROGRESS'].includes(status))
    return 'attention';
  return 'info';
}

function recordDetails(record: DirectoryRecord, text: (typeof copy)['en'] | (typeof copy)['vi']) {
  if ('roles' in record) return record.roles.join(', ') || '—';
  if ('memberCount' in record) return `${record.memberCount} ${text.members}`;
  if ('activeLocationCount' in record)
    return `${record.activeLocationCount} ${text.locations} · ${record.activeDentistCount} ${text.dentists}`;
  if ('activeClinicCount' in record) return `${record.activeClinicCount} ${text.clinics}`;
  if ('activeAssignmentCount' in record)
    return `${record.activeAssignmentCount} ${text.assignments} · ${record.preferredLocation ?? '—'}`;
  if ('refundCount' in record) return `${record.provider} · ${record.refundCount} ${text.refunds}`;
  return `${record.permissions.length} ${text.permissions}`;
}

function formatDate(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

function formatMinorMoney(amountMinor: string, currency: 'VND' | 'USD', locale: Locale) {
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount)) return `${currency} ${amountMinor}`;
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(currency === 'USD' ? amount / 100 : amount);
}
