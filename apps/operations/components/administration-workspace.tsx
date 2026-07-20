'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CustomSelect } from '@dental-trust/ui';
import type {
  AdminNotificationJobView,
  AdminOrganizationView,
  AdminOutboxJobView,
  AdminUserView,
  AdminWebhookView,
} from '@dental-trust/contracts';

import { OperationsIcon, type OperationsIconName } from './operations-icon';
import { OpsAvatar, OpsEmpty, OpsMetric, OpsPanelHeader, OpsStatus } from './operations-ui';
import { RoleControlWorkspace, type RoleControlView } from './role-control-workspace';
import type { AdministrationData } from '@/lib/operations-data';
import { commandErrorMessage, sendOperationsCommand } from '@/lib/operations-command';
import type { RoleOperationsData } from '@/lib/operations-role-data';
import type { OperationsPageMetadata } from '@/lib/operations-api';
import {
  auditActionLabel,
  auditResourceLabel,
  formatDateTime,
  humanize,
  initials,
  isRoutineReadAuditAction,
} from '@/lib/presentation';

export type AdministrationView =
  | 'overview'
  | 'users'
  | 'organizations'
  | 'directory'
  | 'finance'
  | 'governance'
  | 'trust'
  | 'reliability'
  | 'audit'
  | 'security';

type ReliabilityView = 'outbox' | 'notifications' | 'webhooks';
type PrivilegedAction =
  | { readonly kind: 'outbox'; readonly item: AdminOutboxJobView }
  | { readonly kind: 'notification'; readonly item: AdminNotificationJobView }
  | { readonly kind: 'user'; readonly item: AdminUserView }
  | null;

const navigation: readonly {
  readonly href: AdministrationView;
  readonly label: string;
  readonly icon: OperationsIconName;
}[] = [
  { href: 'overview', label: 'Tổng quan', icon: 'dashboard' },
  { href: 'users', label: 'Người dùng', icon: 'users' },
  { href: 'organizations', label: 'Tổ chức', icon: 'organization' },
  { href: 'directory', label: 'Danh bạ', icon: 'inbox' },
  { href: 'finance', label: 'Tài chính', icon: 'jobs' },
  { href: 'governance', label: 'Nội dung', icon: 'document' },
  { href: 'trust', label: 'Trust & Support', icon: 'shield' },
  { href: 'reliability', label: 'Reliability', icon: 'jobs' },
  { href: 'audit', label: 'Audit log', icon: 'audit' },
  { href: 'security', label: 'Bảo mật', icon: 'lock' },
] as const;

export function AdministrationWorkspace({
  data,
  roleData,
  initialView,
  roles,
  mfaRequired,
  mfaVerified,
  pageSection,
  cursorActive,
}: {
  readonly data: AdministrationData;
  readonly roleData: RoleOperationsData;
  readonly initialView: AdministrationView;
  readonly roles: readonly string[];
  readonly mfaRequired: boolean;
  readonly mfaVerified: boolean;
  readonly pageSection: string | null;
  readonly cursorActive: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [reliabilityView, setReliabilityView] = useState<ReliabilityView>(
    ['outbox', 'notifications', 'webhooks'].includes(pageSection ?? '')
      ? (pageSection as ReliabilityView)
      : 'outbox',
  );
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<PrivilegedAction>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectView(next: AdministrationView) {
    setView(next);
    setQuery('');
    window.history.replaceState(null, '', `/administration?view=${next}`);
  }

  async function execute(operation: () => Promise<unknown>, success: string) {
    setPending(true);
    setError(null);
    try {
      await operation();
      setNotice(success);
      setAction(null);
      router.refresh();
    } catch (reason) {
      setError(commandErrorMessage(reason));
    } finally {
      setPending(false);
    }
  }

  const failures = data.summary
    ? data.summary.failedOutboxEvents +
      data.summary.failedNotifications +
      data.summary.failedWebhooks
    : null;
  const visibleNavigation = navigation.filter((item) => canAccessView(item.href, roles));
  const isAdministrator = roles.some((role) => ['PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(role));
  const statusLabel = failures
    ? `${failures} delivery cần xử lý`
    : data.summary
      ? 'Nền tảng ổn định'
      : isAdministrator
        ? 'Telemetry chưa khả dụng'
        : 'Control plane theo vai trò';

  return (
    <main className="ops-main ops-main--workspace">
      {notice ? (
        <div className="ops-toast ops-toast--success" role="status">
          <OperationsIcon name="check" />
          {notice}
          <button aria-label="Đóng" onClick={() => setNotice(null)} type="button">
            <OperationsIcon name="close" />
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="ops-toast ops-toast--danger" role="alert">
          <OperationsIcon name="alert" />
          {error}
          <button aria-label="Đóng" onClick={() => setError(null)} type="button">
            <OperationsIcon name="close" />
          </button>
        </div>
      ) : null}

      <header className="ops-page-header">
        <div>
          <span className="ops-eyebrow">Platform control plane</span>
          <h1>Quản trị nền tảng</h1>
          <p>Kiểm soát danh tính, reliability và audit bằng các thao tác có chủ đích.</p>
        </div>
        <div
          className={`ops-page-header__status${(failures ?? 0) > 0 || (isAdministrator && !data.summary) ? ' is-warning' : ''}`}
        >
          <i />
          <span>
            <strong>{statusLabel}</strong>
            <small>
              {data.summary
                ? `Cập nhật ${formatDateTime(data.summary.generatedAt)}`
                : 'Chưa có telemetry'}
            </small>
          </span>
        </div>
      </header>

      <nav aria-label="Khu vực quản trị" className="ops-admin-tabs">
        {visibleNavigation.map((item) => (
          <button
            aria-current={view === item.href ? 'page' : undefined}
            key={item.href}
            onClick={() => selectView(item.href)}
            type="button"
          >
            <OperationsIcon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>

      {view === 'overview' ? (
        <AdministrationOverview data={data} failures={failures} onSelect={selectView} />
      ) : null}
      {view === 'users' ? (
        <UsersView
          data={data.users}
          onAction={(item) => setAction({ kind: 'user', item })}
          cursorActive={cursorActive && pageSection === 'users'}
          page={data.pages.users}
          query={query}
          setQuery={setQuery}
        />
      ) : null}
      {view === 'organizations' ? (
        <OrganizationsView
          cursorActive={cursorActive && pageSection === 'organizations'}
          data={data.organizations}
          page={data.pages.organizations}
          query={query}
          setQuery={setQuery}
        />
      ) : null}
      {(['directory', 'finance', 'governance', 'trust'] as const).includes(
        view as RoleControlView,
      ) ? (
        <RoleControlWorkspace
          data={roleData}
          cursorActive={cursorActive}
          initialSection={pageSection}
          roles={roles}
          view={view as RoleControlView}
        />
      ) : null}
      {view === 'reliability' ? (
        <ReliabilityViewPanel
          data={data}
          cursorActive={cursorActive}
          onAction={setAction}
          selected={reliabilityView}
          setSelected={setReliabilityView}
        />
      ) : null}
      {view === 'audit' ? (
        <AuditView
          cursorActive={cursorActive && pageSection === 'audit'}
          data={data}
          query={query}
          setQuery={setQuery}
        />
      ) : null}
      {view === 'security' ? (
        <SecurityView mfaRequired={mfaRequired} mfaVerified={mfaVerified} roles={roles} />
      ) : null}

      {action ? (
        <PrivilegedActionDialog
          action={action}
          onClose={() => setAction(null)}
          onExecute={execute}
          pending={pending}
        />
      ) : null}
    </main>
  );
}

function AdministrationOverview({
  data,
  failures,
  onSelect,
}: {
  readonly data: AdministrationData;
  readonly failures: number | null;
  readonly onSelect: (view: AdministrationView) => void;
}) {
  const summary = data.summary;
  return (
    <>
      <section aria-label="Chỉ số nền tảng" className="ops-metric-grid ops-metric-grid--four">
        <OpsMetric
          icon="users"
          label="Người dùng hoạt động"
          note={`${data.users.length} tài khoản trong trang hiện tại`}
          value={summary?.activeUsers ?? data.users.length}
        />
        <OpsMetric
          icon="coordination"
          label="Ca đang mở"
          note={`${summary?.unresolvedIncidents ?? 0} sự cố chưa xử lý`}
          tone="blue"
          value={summary?.openCases ?? 0}
        />
        <OpsMetric
          icon="verification"
          label="Chờ xác minh"
          note={`${summary?.pendingPrivacyRequests ?? 0} yêu cầu riêng tư`}
          tone="amber"
          value={summary?.pendingVerifications ?? 0}
        />
        <OpsMetric
          icon="jobs"
          label="Delivery thất bại"
          note="Outbox · notification · webhook"
          tone={failures === null ? 'amber' : failures ? 'coral' : 'teal'}
          value={failures ?? '—'}
        />
      </section>

      <div className="ops-admin-overview-grid">
        <section className="ops-panel">
          <OpsPanelHeader
            description="Các bề mặt điều hành quan trọng, ưu tiên theo tác động."
            icon="command"
            title="Control plane"
          />
          <div className="ops-control-list">
            {[
              [
                'users',
                'users',
                'Danh tính và quyền truy cập',
                'Khóa, tạm ngưng và theo dõi MFA',
                `${data.users.length} người dùng`,
              ],
              [
                'organization',
                'organizations',
                'Tổ chức và phạm vi dữ liệu',
                'Clinic, concierge và platform workspace',
                `${data.organizations.length} tổ chức`,
              ],
              [
                'jobs',
                'reliability',
                'Reliability console',
                'Outbox, notification và webhook delivery',
                failures === null ? 'Chưa xác định' : failures ? `${failures} lỗi mở` : 'Ổn định',
              ],
              [
                'audit',
                'audit',
                'Immutable audit trail',
                'Lý do, tác nhân và tài nguyên bị tác động',
                `${data.audit.length} sự kiện`,
              ],
            ].map(([icon, target, title, description, meta]) => (
              <button
                key={target}
                onClick={() => onSelect(target as AdministrationView)}
                type="button"
              >
                <span>
                  <OperationsIcon name={icon as OperationsIconName} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                <em>{meta}</em>
                <OperationsIcon name="chevron" />
              </button>
            ))}
          </div>
        </section>
        <aside className="ops-panel ops-privilege-card">
          <OpsPanelHeader
            description="Guardrail cho thao tác nhạy cảm"
            icon="shield"
            title="Privileged controls"
          />
          <div className="ops-guardrail-list">
            <p>
              <OperationsIcon name="check" />
              <span>
                <strong>MFA gate</strong>
                <small>Kiểm tra trước mọi mutation đặc quyền</small>
              </span>
            </p>
            <p>
              <OperationsIcon name="check" />
              <span>
                <strong>Reason required</strong>
                <small>Không cho phép thao tác không lý do</small>
              </span>
            </p>
            <p>
              <OperationsIcon name="check" />
              <span>
                <strong>Optimistic concurrency</strong>
                <small>Chặn ghi đè dữ liệu đã thay đổi</small>
              </span>
            </p>
            <p>
              <OperationsIcon name="check" />
              <span>
                <strong>Immutable audit</strong>
                <small>Lưu actor, request và kết quả</small>
              </span>
            </p>
          </div>
          <button
            className="ops-button ops-button--secondary"
            onClick={() => onSelect('security')}
            type="button"
          >
            Xem chính sách bảo mật <OperationsIcon name="arrow" />
          </button>
        </aside>
      </div>
    </>
  );
}

function UsersView({
  data,
  query,
  setQuery,
  onAction,
  page,
  cursorActive,
}: {
  readonly data: readonly AdminUserView[];
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly onAction: (item: AdminUserView) => void;
  readonly page: OperationsPageMetadata | null;
  readonly cursorActive: boolean;
}) {
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    if (!normalized) return data;
    return data.filter((item) =>
      `${item.email} ${item.accountStatus} ${item.roles.join(' ')}`
        .toLocaleLowerCase('vi-VN')
        .includes(normalized),
    );
  }, [data, query]);
  return (
    <section className="ops-panel ops-directory-panel">
      <OpsPanelHeader
        action={<DirectorySearch label="Tìm người dùng" query={query} setQuery={setQuery} />}
        description={`${filtered.length} trong ${data.length} tài khoản · chỉ hiển thị phạm vi được cấp`}
        icon="users"
        title="Danh tính người dùng"
      />
      {filtered.length ? (
        <div className="ops-data-list ops-admin-user-list">
          <div className="ops-data-list__head">
            <span>Tài khoản</span>
            <span>Trạng thái</span>
            <span>Bảo mật</span>
            <span>Khởi tạo</span>
            <span />
          </div>
          {filtered.map((item) => (
            <button key={item.id} onClick={() => onAction(item)} type="button">
              <span className="ops-record-main">
                <OpsAvatar
                  label={initials(item.email)}
                  tone={item.accountStatus === 'ACTIVE' ? 'teal' : 'amber'}
                />
                <span>
                  <strong>{item.email}</strong>
                  <small>{item.roles.map(humanize).join(' · ') || 'Chưa có vai trò'}</small>
                  <em>{item.id.slice(0, 8).toUpperCase()}</em>
                </span>
              </span>
              <OpsStatus value={item.accountStatus} />
              <span className="ops-security-facts">
                <strong>{item.mfaEnabled ? 'MFA đã bật' : 'Chưa bật MFA'}</strong>
                <small>
                  {item.activeSessionCount} phiên hoạt động ·{' '}
                  {item.emailVerified ? 'Email đã xác minh' : 'Email chưa xác minh'}
                </small>
              </span>
              <time>{formatDateTime(item.createdAt)}</time>
              <OperationsIcon name="chevron" />
            </button>
          ))}
        </div>
      ) : (
        <OpsEmpty
          body="Thử tìm theo email, vai trò hoặc trạng thái tài khoản."
          title="Không có người dùng phù hợp"
        />
      )}
      <AdminPagination cursorActive={cursorActive} page={page} section="users" view="users" />
    </section>
  );
}

function OrganizationsView({
  data,
  query,
  setQuery,
  page,
  cursorActive,
}: {
  readonly data: readonly AdminOrganizationView[];
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly page: OperationsPageMetadata | null;
  readonly cursorActive: boolean;
}) {
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    if (!normalized) return data;
    return data.filter((item) =>
      `${item.name} ${item.slug} ${item.type}`.toLocaleLowerCase('vi-VN').includes(normalized),
    );
  }, [data, query]);
  return (
    <section className="ops-panel ops-directory-panel">
      <OpsPanelHeader
        action={<DirectorySearch label="Tìm tổ chức" query={query} setQuery={setQuery} />}
        description={`${filtered.length} trong ${data.length} tổ chức · membership quyết định phạm vi dữ liệu`}
        icon="organization"
        title="Danh bạ tổ chức"
      />
      {filtered.length ? (
        <div className="ops-organization-grid">
          {filtered.map((item) => (
            <article key={item.id}>
              <header>
                <OpsAvatar
                  label={initials(item.name)}
                  tone={
                    item.type === 'PLATFORM' ? 'blue' : item.type === 'CONCIERGE' ? 'amber' : 'teal'
                  }
                />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.slug}</small>
                </span>
                <OpsStatus
                  label={item.active ? 'Hoạt động' : 'Ngưng hoạt động'}
                  value={item.active ? 'ACTIVE' : 'SUSPENDED'}
                />
              </header>
              <dl>
                <div>
                  <dt>Loại tổ chức</dt>
                  <dd>{humanize(item.type)}</dd>
                </div>
                <div>
                  <dt>Thành viên</dt>
                  <dd>{item.memberCount}</dd>
                </div>
                <div>
                  <dt>Khởi tạo</dt>
                  <dd>{formatDateTime(item.createdAt)}</dd>
                </div>
              </dl>
              <footer>
                <span>ID {item.id.slice(0, 8).toUpperCase()}</span>
                <OperationsIcon name="shield" /> Phạm vi cô lập
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <OpsEmpty
          body="Thử tìm theo tên, slug hoặc loại tổ chức."
          title="Không có tổ chức phù hợp"
        />
      )}
      <AdminPagination
        cursorActive={cursorActive}
        page={page}
        section="organizations"
        view="organizations"
      />
    </section>
  );
}

function ReliabilityViewPanel({
  data,
  selected,
  setSelected,
  onAction,
  cursorActive,
}: {
  readonly data: AdministrationData;
  readonly selected: ReliabilityView;
  readonly setSelected: (view: ReliabilityView) => void;
  readonly onAction: (action: PrivilegedAction) => void;
  readonly cursorActive: boolean;
}) {
  const failedOutbox = data.outbox.filter((item) =>
    ['FAILED', 'DEAD_LETTER'].includes(item.status),
  );
  const failedNotifications = data.notifications.filter(({ status }) => status === 'FAILED');
  const failedWebhooks = data.webhooks.filter(({ status }) => status === 'FAILED');
  return (
    <section className="ops-panel ops-reliability-console">
      <OpsPanelHeader
        description="Retry chỉ khả dụng cho delivery thất bại và luôn yêu cầu lý do."
        icon="jobs"
        title="Reliability console"
      />
      <div className="ops-segmented ops-segmented--reliability">
        {(
          [
            ['outbox', 'Outbox', failedOutbox.length],
            ['notifications', 'Notification', failedNotifications.length],
            ['webhooks', 'Webhook', failedWebhooks.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            aria-pressed={selected === value}
            key={value}
            onClick={() => setSelected(value)}
            type="button"
          >
            {label}
            <b>{count}</b>
          </button>
        ))}
      </div>
      {selected === 'outbox' ? (
        <OutboxList data={data.outbox} onAction={(item) => onAction({ kind: 'outbox', item })} />
      ) : null}
      {selected === 'notifications' ? (
        <NotificationList
          data={data.notifications}
          onAction={(item) => onAction({ kind: 'notification', item })}
        />
      ) : null}
      {selected === 'webhooks' ? <WebhookList data={data.webhooks} /> : null}
      <AdminPagination
        cursorActive={cursorActive}
        page={data.pages[selected]}
        section={selected}
        view="reliability"
      />
    </section>
  );
}

function OutboxList({
  data,
  onAction,
}: {
  readonly data: readonly AdminOutboxJobView[];
  readonly onAction: (item: AdminOutboxJobView) => void;
}) {
  return data.length ? (
    <div className="ops-job-list">
      {data.map((item) => (
        <article key={item.id}>
          <span
            className={['FAILED', 'DEAD_LETTER'].includes(item.status) ? 'is-danger' : 'is-success'}
          >
            <OperationsIcon
              name={['FAILED', 'DEAD_LETTER'].includes(item.status) ? 'alert' : 'check'}
            />
          </span>
          <div>
            <strong>{humanize(item.eventType)}</strong>
            <small>
              {item.aggregateType} · {item.id.slice(0, 8).toUpperCase()}
            </small>
          </div>
          <OpsStatus value={item.status} />
          <span>
            <strong>{item.attemptCount} lần thử</strong>
            <small>{item.lastErrorCode ? humanize(item.lastErrorCode) : 'Không có mã lỗi'}</small>
          </span>
          <time>{formatDateTime(item.availableAt)}</time>
          {['FAILED', 'DEAD_LETTER'].includes(item.status) ? (
            <button onClick={() => onAction(item)} type="button">
              <OperationsIcon name="refresh" /> Retry
            </button>
          ) : (
            <span />
          )}
        </article>
      ))}
    </div>
  ) : (
    <OpsEmpty body="Không có outbox event trong trang hiện tại." icon="jobs" title="Outbox trống" />
  );
}

function NotificationList({
  data,
  onAction,
}: {
  readonly data: readonly AdminNotificationJobView[];
  readonly onAction: (item: AdminNotificationJobView) => void;
}) {
  return data.length ? (
    <div className="ops-job-list">
      {data.map((item) => (
        <article key={item.id}>
          <span className={item.status === 'FAILED' ? 'is-danger' : 'is-success'}>
            <OperationsIcon name={item.status === 'FAILED' ? 'alert' : 'check'} />
          </span>
          <div>
            <strong>{item.templateKey}</strong>
            <small>
              {humanize(item.category)} · {humanize(item.channel)}
            </small>
          </div>
          <OpsStatus value={item.status} />
          <span>
            <strong>{item.deliveredAt ? 'Đã giao' : 'Chưa giao'}</strong>
            <small>{item.id.slice(0, 8).toUpperCase()}</small>
          </span>
          <time>{formatDateTime(item.scheduledAt)}</time>
          {item.status === 'FAILED' ? (
            <button onClick={() => onAction(item)} type="button">
              <OperationsIcon name="refresh" /> Retry
            </button>
          ) : (
            <span />
          )}
        </article>
      ))}
    </div>
  ) : (
    <OpsEmpty
      body="Không có notification job trong trang hiện tại."
      icon="bell"
      title="Notification queue trống"
    />
  );
}

function WebhookList({ data }: { readonly data: readonly AdminWebhookView[] }) {
  return data.length ? (
    <div className="ops-job-list">
      {data.map((item) => (
        <article key={item.id}>
          <span className={item.status === 'FAILED' ? 'is-danger' : 'is-success'}>
            <OperationsIcon name={item.status === 'FAILED' ? 'alert' : 'check'} />
          </span>
          <div>
            <strong>{humanize(item.type)}</strong>
            <small>
              {item.provider} · {item.providerEventId}
            </small>
          </div>
          <OpsStatus value={item.status} />
          <span>
            <strong>{item.attemptCount} lần xử lý</strong>
            <small>{item.lastErrorCode ? humanize(item.lastErrorCode) : 'Không có mã lỗi'}</small>
          </span>
          <time>{formatDateTime(item.receivedAt)}</time>
          <span />
        </article>
      ))}
    </div>
  ) : (
    <OpsEmpty
      body="Không có webhook delivery trong trang hiện tại."
      icon="jobs"
      title="Webhook queue trống"
    />
  );
}

function AuditView({
  data,
  query,
  setQuery,
  cursorActive,
}: {
  readonly data: AdministrationData;
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly cursorActive: boolean;
}) {
  const [auditFilter, setAuditFilter] = useState<'all' | 'changes' | 'reads' | 'failed'>('all');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    return data.audit.filter((item) => {
      const isRead = isRoutineReadAuditAction(item.action);
      const matchesFilter =
        auditFilter === 'all' ||
        (auditFilter === 'changes' && !isRead) ||
        (auditFilter === 'reads' && isRead) ||
        (auditFilter === 'failed' && !item.success);
      if (!matchesFilter) return false;
      if (!normalized) return true;
      return `${item.action} ${auditActionLabel(item.action)} ${item.resourceType} ${auditResourceLabel(item.resourceType)} ${item.resourceId} ${item.reason ?? ''}`
        .toLocaleLowerCase('vi-VN')
        .includes(normalized);
    });
  }, [auditFilter, data.audit, query]);
  const reads = data.audit.filter((item) => isRoutineReadAuditAction(item.action)).length;
  const failed = data.audit.filter((item) => !item.success).length;
  return (
    <section className="ops-panel ops-audit-console">
      <OpsPanelHeader
        action={
          <DirectorySearch
            label="Tìm hoạt động hoặc tài nguyên"
            query={query}
            setQuery={setQuery}
          />
        }
        description="Toàn bộ lượt xem và thay đổi; mã kỹ thuật được giữ trong metadata để điều tra."
        icon="audit"
        title="Nhật ký hoạt động"
      />
      <div aria-label="Lọc nhật ký hoạt động" className="ops-segmented" role="toolbar">
        {(
          [
            ['all', 'Tất cả', data.audit.length],
            ['changes', 'Thay đổi', data.audit.length - reads],
            ['reads', 'Lượt xem', reads],
            ['failed', 'Thất bại', failed],
          ] as const
        ).map(([value, label, count]) => (
          <button
            aria-pressed={auditFilter === value}
            key={value}
            onClick={() => setAuditFilter(value)}
            type="button"
          >
            {label}
            <b>{count}</b>
          </button>
        ))}
      </div>
      {filtered.length ? (
        <div className="ops-audit-stream ops-audit-stream--full">
          {filtered.map((item) => (
            <article key={item.id}>
              <span className={item.success ? 'is-success' : 'is-danger'}>
                <OperationsIcon name={item.success ? 'check' : 'alert'} />
              </span>
              <div>
                <strong>{auditActionLabel(item.action)}</strong>
                <small>
                  {item.action} · {item.actorType} ·{' '}
                  {item.actorUserId?.slice(0, 8).toUpperCase() ?? 'SYSTEM'}
                </small>
                {item.reason ? <p>{item.reason}</p> : null}
              </div>
              <span>
                <strong>{auditResourceLabel(item.resourceType)}</strong>
                <small>{item.resourceId}</small>
              </span>
              <OpsStatus
                label={item.success ? 'Thành công' : 'Thất bại'}
                value={item.success ? 'SUCCESS' : 'FAILED'}
              />
              <time>{formatDateTime(item.createdAt)}</time>
            </article>
          ))}
        </div>
      ) : (
        <OpsEmpty
          body="Thử thay đổi từ khóa hoặc kiểm tra quyền audit của tài khoản."
          icon="audit"
          title="Không có sự kiện phù hợp"
        />
      )}
      <AdminPagination
        cursorActive={cursorActive}
        page={data.pages.audit}
        section="audit"
        view="audit"
      />
    </section>
  );
}

function SecurityView({
  roles,
  mfaRequired,
  mfaVerified,
}: {
  readonly roles: readonly string[];
  readonly mfaRequired: boolean;
  readonly mfaVerified: boolean;
}) {
  return (
    <div className="ops-security-grid">
      <section className="ops-panel ops-session-card">
        <OpsPanelHeader
          description="Trạng thái bảo vệ của phiên quản trị hiện tại."
          icon="shield"
          title="Phiên đặc quyền"
        />
        <div className="ops-session-state">
          <span className={mfaRequired && !mfaVerified ? 'is-warning' : 'is-success'}>
            <OperationsIcon name={mfaRequired && !mfaVerified ? 'alert' : 'check'} />
          </span>
          <div>
            <strong>
              {mfaRequired && !mfaVerified ? 'Cần hoàn tất MFA' : 'Phiên đủ điều kiện thao tác'}
            </strong>
            <p>
              {mfaRequired
                ? 'Chính sách yêu cầu xác thực nhiều lớp cho mutation đặc quyền.'
                : 'Tài khoản hiện tại không bị policy yêu cầu MFA bổ sung.'}
            </p>
          </div>
        </div>
        <dl>
          <div>
            <dt>Vai trò hiệu lực</dt>
            <dd>{roles.map(humanize).join(', ')}</dd>
          </div>
          <div>
            <dt>MFA policy</dt>
            <dd>{mfaRequired ? 'Bắt buộc' : 'Không bắt buộc'}</dd>
          </div>
          <div>
            <dt>MFA session</dt>
            <dd>{mfaVerified ? 'Đã xác minh' : 'Chưa xác minh'}</dd>
          </div>
          <div>
            <dt>Audit</dt>
            <dd>Bắt buộc cho mutation</dd>
          </div>
        </dl>
        <Link className="ops-button ops-button--secondary" href="/administration?view=audit">
          Mở audit trail <OperationsIcon name="arrow" />
        </Link>
      </section>
      <section className="ops-panel ops-policy-card">
        <OpsPanelHeader
          description="Defense-in-depth được áp dụng ở cả UI và API."
          icon="lock"
          title="Guardrail đang áp dụng"
        />
        <div className="ops-policy-stack">
          {[
            ['Origin validation', 'Mutation chỉ nhận request same-origin.'],
            ['Idempotency key', 'Ngăn thao tác lặp khi retry mạng.'],
            ['Expected state', 'Từ chối ghi nếu dữ liệu đã thay đổi.'],
            ['Explicit confirmation', 'Retry và thay đổi tài khoản cần câu xác nhận.'],
            ['Organization scope', 'Dữ liệu bị giới hạn bởi membership và vai trò.'],
          ].map(([title, body]) => (
            <article key={title}>
              <span>
                <OperationsIcon name="check" />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function DirectorySearch({
  label,
  query,
  setQuery,
}: {
  readonly label: string;
  readonly query: string;
  readonly setQuery: (value: string) => void;
}) {
  return (
    <label className="ops-directory-search">
      <OperationsIcon name="search" />
      <input
        aria-label={label}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={label}
        value={query}
      />
    </label>
  );
}

function AdminPagination({
  page,
  view,
  section,
  cursorActive,
}: {
  readonly page: OperationsPageMetadata | null;
  readonly view: AdministrationView;
  readonly section: string;
  readonly cursorActive: boolean;
}) {
  if (!cursorActive && !page?.nextCursor) return null;
  return (
    <nav aria-label="Phân trang quản trị" className="ops-pagination">
      {cursorActive ? <Link href={`/administration?view=${view}`}>Về trang đầu</Link> : <span />}
      {page?.nextCursor ? (
        <Link
          href={`/administration?view=${view}&section=${section}&cursor=${encodeURIComponent(page.nextCursor)}`}
        >
          Trang tiếp <OperationsIcon name="arrow" />
        </Link>
      ) : (
        <span>Đã đến cuối danh sách</span>
      )}
    </nav>
  );
}

function PrivilegedActionDialog({
  action,
  onClose,
  onExecute,
  pending,
}: {
  readonly action: Exclude<PrivilegedAction, null>;
  readonly onClose: () => void;
  readonly onExecute: (operation: () => Promise<unknown>, success: string) => Promise<void>;
  readonly pending: boolean;
}) {
  const [userOperation, setUserOperation] = useState<'status' | 'role'>('status');
  const title =
    action.kind === 'user'
      ? 'Quản trị tài khoản và vai trò'
      : action.kind === 'outbox'
        ? 'Retry outbox delivery'
        : 'Retry notification';
  return (
    <div className="ops-dialog-layer">
      <button
        aria-label="Đóng hộp thoại"
        className="ops-dialog-backdrop"
        onClick={onClose}
        type="button"
      />
      <section aria-modal="true" className="ops-dialog" role="dialog">
        <header>
          <div>
            <span className="ops-eyebrow">Privileged action</span>
            <h2>{title}</h2>
            <p>Thao tác sẽ được ghi cùng lý do vào immutable audit trail.</p>
          </div>
          <button aria-label="Đóng" onClick={onClose} type="button">
            <OperationsIcon name="close" />
          </button>
        </header>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const reason = String(form.get('reason'));
            if (action.kind === 'user') {
              if (userOperation === 'role') {
                const role = String(form.get('role'));
                const roleAction = String(form.get('roleAction'));
                void onExecute(
                  () =>
                    sendOperationsCommand({
                      command: 'admin_change_user_role',
                      resourceId: action.item.id,
                      payload: {
                        role,
                        action: roleAction,
                        expectedRolePresent: action.item.roles.includes(role),
                        reason,
                        confirmation: 'CHANGE USER ROLE',
                      },
                    }),
                  'Đã cập nhật vai trò tài khoản.',
                );
                return;
              }
              void onExecute(
                () =>
                  sendOperationsCommand({
                    command: 'admin_change_user_status',
                    resourceId: action.item.id,
                    payload: {
                      toStatus: String(form.get('toStatus')),
                      expectedStatus: action.item.accountStatus,
                      reason,
                      confirmation: 'CHANGE ACCOUNT STATUS',
                    },
                  }),
                'Đã cập nhật trạng thái tài khoản.',
              );
              return;
            }
            if (action.kind === 'outbox') {
              void onExecute(
                () =>
                  sendOperationsCommand({
                    command: 'admin_retry_outbox',
                    resourceId: action.item.id,
                    payload: {
                      reason,
                      confirmation: 'RETRY FAILED DELIVERY',
                      expectedAttemptCount: action.item.attemptCount,
                    },
                  }),
                'Đã đưa outbox event vào hàng đợi retry.',
              );
              return;
            }
            void onExecute(
              () =>
                sendOperationsCommand({
                  command: 'admin_retry_notification',
                  resourceId: action.item.id,
                  payload: { reason, confirmation: 'RETRY FAILED DELIVERY' },
                }),
              'Đã đưa notification vào hàng đợi retry.',
            );
          }}
        >
          {action.kind === 'user' ? (
            <>
              <label>
                <span>Loại thay đổi</span>
                <CustomSelect
                  name="userOperation"
                  onChange={(event) => setUserOperation(event.target.value as 'status' | 'role')}
                  value={userOperation}
                >
                  <option value="status">Trạng thái tài khoản</option>
                  <option value="role">Vai trò hệ thống</option>
                </CustomSelect>
              </label>
              {userOperation === 'status' ? (
                <label>
                  <span>Trạng thái mới</span>
                  <CustomSelect
                    defaultValue={action.item.accountStatus === 'ACTIVE' ? 'LOCKED' : 'ACTIVE'}
                    name="toStatus"
                  >
                    <option value="ACTIVE">Kích hoạt</option>
                    <option value="LOCKED">Khóa tài khoản</option>
                    <option value="SUSPENDED">Tạm ngưng</option>
                  </CustomSelect>
                </label>
              ) : (
                <>
                  <label>
                    <span>Vai trò</span>
                    <CustomSelect defaultValue="SUPPORT_AGENT" name="role">
                      <option value="PATIENT">Patient</option>
                      <option value="CAREGIVER">Caregiver</option>
                      <option value="VERIFICATION_OFFICER">Verification officer</option>
                      <option value="SUPPORT_AGENT">Support agent</option>
                      <option value="FINANCE_ADMIN">Finance administrator</option>
                      <option value="CONTENT_ADMIN">Content administrator</option>
                      <option value="PLATFORM_ADMIN">Platform administrator</option>
                      <option value="SUPER_ADMIN">Super administrator</option>
                    </CustomSelect>
                  </label>
                  <label>
                    <span>Thao tác</span>
                    <CustomSelect defaultValue="GRANT" name="roleAction">
                      <option value="GRANT">Cấp vai trò</option>
                      <option value="REVOKE">Thu hồi vai trò</option>
                    </CustomSelect>
                  </label>
                </>
              )}
            </>
          ) : (
            <div className="ops-dialog-record">
              <OperationsIcon name="jobs" />
              <span>
                <strong>
                  {action.kind === 'outbox' ? action.item.eventType : action.item.templateKey}
                </strong>
                <small>ID {action.item.id.slice(0, 8).toUpperCase()}</small>
              </span>
            </div>
          )}
          <label>
            <span>Lý do bắt buộc</span>
            <textarea
              minLength={12}
              name="reason"
              placeholder="Mô tả căn cứ và tác động của thao tác…"
              required
              rows={5}
            />
          </label>
          <div className="ops-confirmation-note">
            <OperationsIcon name="shield" />
            <span>
              <strong>Xác nhận có chủ đích</strong>
              <small>Hệ thống sẽ tự thêm confirmation phrase và idempotency key.</small>
            </span>
          </div>
          <footer>
            <button onClick={onClose} type="button">
              Hủy
            </button>
            <button className="ops-button ops-button--primary" disabled={pending} type="submit">
              {pending ? 'Đang thực hiện…' : 'Xác nhận thao tác'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function canAccessView(view: AdministrationView, roles: readonly string[]): boolean {
  if (view === 'security') return true;
  const administrator = roles.some((role) => ['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(role));
  if (['overview', 'users', 'organizations', 'directory', 'reliability', 'audit'].includes(view))
    return administrator;
  if (view === 'finance') return administrator || roles.includes('FINANCE_ADMIN');
  if (view === 'governance') return administrator || roles.includes('CONTENT_ADMIN');
  return administrator || roles.includes('SUPPORT_AGENT') || roles.includes('CONTENT_ADMIN');
}
