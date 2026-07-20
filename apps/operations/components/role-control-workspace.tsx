'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CustomSelect } from '@dental-trust/ui';
import type {
  AdminGovernanceView,
  AdminPaymentView,
  IncidentView,
  PrivacyRequestView,
  ReviewAbuseReportView,
  SupportElevationView,
} from '@dental-trust/contracts';

import { OperationsIcon } from './operations-icon';
import { OpsEmpty, OpsPanelHeader, OpsStatus } from './operations-ui';
import {
  commandErrorMessage,
  sendOperationsCommand,
  type OperationsCommand,
} from '@/lib/operations-command';
import type {
  GovernanceRecord,
  OperationsRoleSection,
  RoleOperationsData,
} from '@/lib/operations-role-data';
import type { OperationsPageMetadata } from '@/lib/operations-api';
import { formatDateTime, humanize } from '@/lib/presentation';

export type RoleControlView = 'directory' | 'finance' | 'governance' | 'trust';
type DirectoryView = 'clinics' | 'dentists' | 'cases' | 'roles';
type TrustView = 'incidents' | 'reports' | 'privacy' | 'elevations';
type Action =
  | { readonly kind: 'refund'; readonly item: AdminPaymentView }
  | { readonly kind: 'incident'; readonly item: IncidentView }
  | { readonly kind: 'report'; readonly item: ReviewAbuseReportView }
  | { readonly kind: 'privacy'; readonly item: PrivacyRequestView }
  | { readonly kind: 'privacy-retry'; readonly item: PrivacyRequestView }
  | { readonly kind: 'elevation-create' }
  | { readonly kind: 'elevation-revoke'; readonly item: SupportElevationView }
  | {
      readonly kind: 'governance';
      readonly view: AdminGovernanceView;
      readonly record?: GovernanceRecord;
    }
  | null;

const governanceViews: readonly { readonly value: AdminGovernanceView; readonly label: string }[] =
  [
    { value: 'content', label: 'Nội dung' },
    { value: 'taxonomy', label: 'Taxonomy' },
    { value: 'templates', label: 'Template' },
    { value: 'feature-flags', label: 'Feature flag' },
    { value: 'configuration', label: 'Cấu hình' },
    { value: 'locations', label: 'Địa điểm' },
  ];

export function RoleControlWorkspace({
  view,
  data,
  roles,
  initialSection,
  cursorActive,
}: {
  readonly view: RoleControlView;
  readonly data: RoleOperationsData;
  readonly roles: readonly string[];
  readonly initialSection: string | null;
  readonly cursorActive: boolean;
}) {
  const router = useRouter();
  const isAdministrator = roles.some((role) => ['PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(role));
  const isContentAdministrator = isAdministrator || roles.includes('CONTENT_ADMIN');
  const isSupportAgent = roles.includes('SUPPORT_AGENT');
  const [directoryView, setDirectoryView] = useState<DirectoryView>(
    ['clinics', 'dentists', 'cases', 'roles'].includes(initialSection ?? '')
      ? (initialSection as DirectoryView)
      : 'clinics',
  );
  const [governanceView, setGovernanceView] = useState<AdminGovernanceView>(
    governanceViews.some(({ value }) => value === initialSection)
      ? (initialSection as AdminGovernanceView)
      : 'content',
  );
  const [trustView, setTrustView] = useState<TrustView>(
    initialTrustView(initialSection, isAdministrator, isContentAdministrator, isSupportAgent),
  );
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function execute(
    command: OperationsCommand,
    payload: Record<string, unknown>,
    success: string,
    resourceId?: string,
  ) {
    setPending(true);
    setError(null);
    try {
      await sendOperationsCommand({ command, payload, ...(resourceId ? { resourceId } : {}) });
      setAction(null);
      setNotice(success);
      router.refresh();
    } catch (reason) {
      setError(commandErrorMessage(reason));
    } finally {
      setPending(false);
    }
  }

  const feedback = (
    <>
      {notice ? (
        <div className="ops-toast ops-toast--success" role="status">
          <OperationsIcon name="check" /> {notice}
          <button aria-label="Đóng" onClick={() => setNotice(null)} type="button">
            <OperationsIcon name="close" />
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="ops-toast ops-toast--danger" role="alert">
          <OperationsIcon name="alert" /> {error}
          <button aria-label="Đóng" onClick={() => setError(null)} type="button">
            <OperationsIcon name="close" />
          </button>
        </div>
      ) : null}
    </>
  );

  if (view === 'directory') {
    return (
      <>
        {feedback}
        <section className="ops-panel ops-role-console">
          <OpsPanelHeader
            description="Clinic, nha sĩ, ca và ma trận quyền từ nguồn dữ liệu quản trị thực."
            icon="organization"
            title="Danh bạ vận hành"
          />
          <Segmented
            items={[
              ['clinics', 'Clinic', data.clinics.records.length],
              ['dentists', 'Nha sĩ', data.dentists.records.length],
              ['cases', 'Ca', data.cases.records.length],
              ['roles', 'Vai trò', data.roles.records.length],
            ]}
            onChange={(next) => setDirectoryView(next as DirectoryView)}
            selected={directoryView}
          />
          <Search query={query} setQuery={setQuery} />
          {directoryView === 'clinics' ? (
            <RecordList
              empty="Không có clinic trong phạm vi hiện tại."
              error={data.clinics.error}
              pagination={rolePagination(
                'directory',
                'clinics',
                data.clinics.page,
                initialSection,
                cursorActive,
              )}
              query={query}
              records={data.clinics.records.map((item) => ({
                id: item.id,
                title: item.name,
                subtitle: item.slug,
                status: item.verificationStatus,
                meta: `${item.activeLocationCount} địa điểm · ${item.activeDentistCount} nha sĩ`,
                time: item.createdAt,
              }))}
            />
          ) : null}
          {directoryView === 'dentists' ? (
            <RecordList
              empty="Không có nha sĩ trong phạm vi hiện tại."
              error={data.dentists.error}
              pagination={rolePagination(
                'directory',
                'dentists',
                data.dentists.page,
                initialSection,
                cursorActive,
              )}
              query={query}
              records={data.dentists.records.map((item) => ({
                id: item.id,
                title: item.fullName,
                subtitle: item.slug,
                status: item.licenseStatus,
                meta: `${item.activeClinicCount} clinic hoạt động`,
                time: item.createdAt,
              }))}
            />
          ) : null}
          {directoryView === 'cases' ? (
            <RecordList
              empty="Không có ca trong phạm vi hiện tại."
              error={data.cases.error}
              pagination={rolePagination(
                'directory',
                'cases',
                data.cases.page,
                initialSection,
                cursorActive,
              )}
              query={query}
              records={data.cases.records.map((item) => ({
                id: item.id,
                title: item.caseNumber,
                subtitle: item.preferredLocation ?? 'Chưa chọn địa điểm',
                status: item.status,
                meta: `${item.activeAssignmentCount} phân công`,
                time: item.updatedAt,
              }))}
            />
          ) : null}
          {directoryView === 'roles' ? (
            <RecordList
              empty="Không có vai trò được cấu hình."
              error={data.roles.error}
              pagination={null}
              query={query}
              records={data.roles.records.map((item) => ({
                id: item.code,
                title: item.displayName,
                subtitle: item.permissions.join(' · ') || 'Không có quyền',
                status: item.privileged ? 'PRIVILEGED' : 'STANDARD',
                meta: `${item.userCount} người dùng · ${item.membershipCount} membership`,
              }))}
            />
          ) : null}
        </section>
      </>
    );
  }

  if (view === 'finance') {
    return (
      <>
        {feedback}
        <section className="ops-panel ops-role-console">
          <OpsPanelHeader
            description="Theo dõi giao dịch và tạo yêu cầu hoàn tiền có idempotency."
            icon="jobs"
            title="Vận hành tài chính"
          />
          <RecordList
            empty="Không có thanh toán trong trang hiện tại."
            error={data.payments.error}
            pagination={rolePagination(
              'finance',
              'payments',
              data.payments.page,
              initialSection,
              cursorActive,
            )}
            query={query}
            records={data.payments.records.map((item) => ({
              id: item.id,
              title: money(item.amountMinor, item.currency),
              subtitle: `${item.provider} · booking ${shortId(item.bookingId)}`,
              status: item.status,
              meta: `${item.refundCount} yêu cầu hoàn tiền`,
              time: item.createdAt,
              action: ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(item.status) ? (
                <button onClick={() => setAction({ kind: 'refund', item })} type="button">
                  Hoàn tiền
                </button>
              ) : undefined,
            }))}
          />
        </section>
        {action ? (
          <ActionDialog
            action={action}
            execute={execute}
            onClose={() => setAction(null)}
            pending={pending}
          />
        ) : null}
      </>
    );
  }

  if (view === 'governance') {
    const section = data.governance[governanceView];
    return (
      <>
        {feedback}
        <section className="ops-panel ops-role-console">
          <OpsPanelHeader
            action={
              section.error ? undefined : (
                <button
                  className="ops-button ops-button--primary"
                  onClick={() => setAction({ kind: 'governance', view: governanceView })}
                  type="button"
                >
                  Tạo mới
                </button>
              )
            }
            description="Mọi thay đổi tạo version mới, yêu cầu expected version và lý do."
            icon="document"
            title="Quản trị nội dung & cấu hình"
          />
          <Segmented
            items={governanceViews.map(({ value, label }) => [
              value,
              label,
              data.governance[value].records.length,
            ])}
            onChange={(next) => setGovernanceView(next as AdminGovernanceView)}
            selected={governanceView}
          />
          <GovernanceRecords
            cursorActive={cursorActive}
            initialSection={initialSection}
            onVersion={(record) => setAction({ kind: 'governance', view: governanceView, record })}
            query={query}
            section={section}
            view={governanceView}
          />
        </section>
        {action ? (
          <ActionDialog
            action={action}
            execute={execute}
            onClose={() => setAction(null)}
            pending={pending}
          />
        ) : null}
      </>
    );
  }

  const trustSection =
    trustView === 'incidents'
      ? data.incidents
      : trustView === 'reports'
        ? data.reviewReports
        : trustView === 'privacy'
          ? data.privacy
          : data.elevations;
  return (
    <>
      {feedback}
      <section className="ops-panel ops-role-console">
        <OpsPanelHeader
          action={
            trustView === 'elevations' && isAdministrator && !trustSection.error ? (
              <button
                className="ops-button ops-button--primary"
                onClick={() => setAction({ kind: 'elevation-create' })}
                type="button"
              >
                Cấp quyền hỗ trợ
              </button>
            ) : undefined
          }
          description="Sự cố, moderation, quyền riêng tư và elevation được audit đầy đủ."
          icon="shield"
          title="Trust & Support"
        />
        <Segmented
          items={[
            ...(isAdministrator || isSupportAgent
              ? ([['incidents', 'Sự cố', data.incidents.records.length]] as const)
              : []),
            ...(isContentAdministrator
              ? ([['reports', 'Báo cáo review', data.reviewReports.records.length]] as const)
              : []),
            ...(isAdministrator
              ? ([['privacy', 'Quyền riêng tư', data.privacy.records.length]] as const)
              : []),
            ...(isAdministrator || isSupportAgent
              ? ([['elevations', 'Elevation', data.elevations.records.length]] as const)
              : []),
          ]}
          onChange={(next) => setTrustView(next as TrustView)}
          selected={trustView}
        />
        {trustView === 'incidents' ? (
          <RecordList
            empty="Không có sự cố trong hàng đợi."
            error={data.incidents.error}
            pagination={rolePagination(
              'trust',
              'incidents',
              data.incidents.page,
              initialSection,
              cursorActive,
            )}
            records={data.incidents.records.map((item) => ({
              id: item.id,
              title: item.summary,
              subtitle: `${humanize(item.type)} · ca ${shortId(item.caseId)}`,
              status: item.status,
              meta: `${humanize(item.severity)} · SLA ${formatDateTime(item.slaDueAt)}`,
              time: item.updatedAt,
              action: isAdministrator ? (
                <button onClick={() => setAction({ kind: 'incident', item })} type="button">
                  Xử lý
                </button>
              ) : undefined,
            }))}
          />
        ) : null}
        {trustView === 'reports' ? (
          <RecordList
            empty="Không có báo cáo review cần xử lý."
            error={data.reviewReports.error}
            pagination={rolePagination(
              'trust',
              'reports',
              data.reviewReports.page,
              initialSection,
              cursorActive,
            )}
            records={data.reviewReports.records.map((item) => ({
              id: item.id,
              title: humanize(item.reasonCode),
              subtitle: item.details,
              status: item.status,
              meta: `Review ${shortId(item.reviewId)}`,
              time: item.updatedAt,
              action: ['OPEN', 'UNDER_REVIEW'].includes(item.status) ? (
                <button onClick={() => setAction({ kind: 'report', item })} type="button">
                  Quyết định
                </button>
              ) : undefined,
            }))}
          />
        ) : null}
        {trustView === 'privacy' ? (
          <RecordList
            empty="Không có yêu cầu quyền riêng tư trong hàng đợi."
            error={data.privacy.error}
            pagination={rolePagination(
              'trust',
              'privacy',
              data.privacy.page,
              initialSection,
              cursorActive,
            )}
            records={data.privacy.records.map((item) => ({
              id: item.id,
              title: `Yêu cầu ${humanize(item.type)}`,
              subtitle: item.reason ?? 'Không có lý do từ người dùng',
              status: item.status,
              meta: `${item.activeLegalHoldScopes.length} legal hold · hạn ${formatDateTime(item.dueAt)}`,
              time: item.updatedAt,
              action:
                item.execution?.status === 'FAILED' ? (
                  <button onClick={() => setAction({ kind: 'privacy-retry', item })} type="button">
                    Retry
                  </button>
                ) : !['APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'PROCESSING'].includes(
                    item.status,
                  ) ? (
                  <button onClick={() => setAction({ kind: 'privacy', item })} type="button">
                    Xử lý
                  </button>
                ) : undefined,
            }))}
          />
        ) : null}
        {trustView === 'elevations' ? (
          <RecordList
            empty="Không có quyền hỗ trợ tạm thời."
            error={data.elevations.error}
            pagination={rolePagination(
              'trust',
              'elevations',
              data.elevations.page,
              initialSection,
              cursorActive,
            )}
            records={data.elevations.records.map((item) => ({
              id: item.id,
              title: item.ticketReference,
              subtitle: `${item.capabilities.map(humanize).join(' · ')} · subject ${shortId(item.subjectUserId)}`,
              status: item.status,
              meta: `${item.useCount} lượt dùng · hết hạn ${formatDateTime(item.expiresAt)}`,
              time: item.createdAt,
              action:
                item.status === 'ACTIVE' ? (
                  <button
                    onClick={() => setAction({ kind: 'elevation-revoke', item })}
                    type="button"
                  >
                    Thu hồi
                  </button>
                ) : undefined,
            }))}
          />
        ) : null}
      </section>
      {action ? (
        <ActionDialog
          action={action}
          execute={execute}
          onClose={() => setAction(null)}
          pending={pending}
        />
      ) : null}
    </>
  );
}

function GovernanceRecords({
  section,
  query,
  onVersion,
  initialSection,
  cursorActive,
  view,
}: {
  readonly section: OperationsRoleSection<GovernanceRecord>;
  readonly query: string;
  readonly onVersion: (record: GovernanceRecord) => void;
  readonly initialSection: string | null;
  readonly cursorActive: boolean;
  readonly view: AdminGovernanceView;
}) {
  return (
    <RecordList
      empty="Chưa có cấu hình trong khu vực này."
      error={section.error}
      pagination={rolePagination('governance', view, section.page, initialSection, cursorActive)}
      query={query}
      records={section.records.map((item, index) => {
        const time = item.updatedAt ?? item.createdAt ?? item.latestVersion?.createdAt;
        return {
          id: item.id ?? `${item.kind ?? 'record'}-${index}`,
          title:
            item.title ?? item.slug ?? item.key ?? item.code ?? item.kind ?? 'Bản ghi cấu hình',
          subtitle: item.description ?? item.locale ?? item.kind ?? 'Governance resource',
          status:
            item.publicationStatus ??
            item.latestVersion?.publicationStatus ??
            (item.latestVersion?.enabled === true
              ? 'ENABLED'
              : item.latestVersion?.enabled === false
                ? 'DISABLED'
                : item.active === false
                  ? 'INACTIVE'
                  : 'ACTIVE'),
          meta: `Version ${item.version ?? item.latestVersion?.version ?? 0}`,
          ...(time ? { time } : {}),
          action: (
            <button onClick={() => onVersion(item)} type="button">
              Tạo version
            </button>
          ),
        };
      })}
    />
  );
}

interface DisplayRecord {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly meta: string;
  readonly time?: string;
  readonly action?: React.ReactNode;
}

interface RolePagination {
  readonly view: RoleControlView;
  readonly section: string;
  readonly page: OperationsPageMetadata;
  readonly cursorActive: boolean;
}

function RecordList({
  records,
  empty,
  error,
  query = '',
  pagination,
}: {
  readonly records: readonly DisplayRecord[];
  readonly empty: string;
  readonly error: string | null;
  readonly query?: string;
  readonly pagination: RolePagination | null;
}) {
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    if (!normalized) return records;
    return records.filter((item) =>
      `${item.title} ${item.subtitle} ${item.status} ${item.meta}`
        .toLocaleLowerCase('vi-VN')
        .includes(normalized),
    );
  }, [query, records]);
  if (error) {
    const mfaError = ['MFA_REQUIRED', 'MFA_VERIFICATION_REQUIRED'].includes(error.toUpperCase());
    return (
      <>
        <OpsEmpty
          body={sectionError(error)}
          icon={mfaError ? 'lock' : 'alert'}
          title={mfaError ? 'Cần hoàn tất MFA' : 'Không thể tải dữ liệu'}
        />
        {pagination?.cursorActive ? <RolePageNav pagination={pagination} /> : null}
      </>
    );
  }
  if (!filtered.length)
    return (
      <>
        <OpsEmpty body={empty} title="Không có dữ liệu" />
        {pagination ? <RolePageNav pagination={pagination} /> : null}
      </>
    );
  return (
    <>
      <div className="ops-role-record-list">
        {filtered.map((item) => (
          <article key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
              <em>ID {shortId(item.id)}</em>
            </div>
            <OpsStatus value={item.status} />
            <span>
              <strong>{item.meta}</strong>
              <small>{item.time ? formatDateTime(item.time) : 'Không có mốc thời gian'}</small>
            </span>
            {item.action ?? <span />}
          </article>
        ))}
      </div>
      {pagination ? <RolePageNav pagination={pagination} /> : null}
    </>
  );
}

function RolePageNav({ pagination }: { readonly pagination: RolePagination }) {
  if (!pagination.cursorActive && !pagination.page.nextCursor) return null;
  return (
    <nav aria-label="Phân trang control plane" className="ops-pagination">
      {pagination.cursorActive ? (
        <Link href={`/administration?view=${pagination.view}`}>Về trang đầu</Link>
      ) : (
        <span />
      )}
      {pagination.page.nextCursor ? (
        <Link
          href={`/administration?view=${pagination.view}&section=${pagination.section}&cursor=${encodeURIComponent(pagination.page.nextCursor)}`}
        >
          Trang tiếp <OperationsIcon name="arrow" />
        </Link>
      ) : (
        <span>Đã đến cuối danh sách</span>
      )}
    </nav>
  );
}

function rolePagination(
  view: RoleControlView,
  section: string,
  page: OperationsPageMetadata,
  initialSection: string | null,
  cursorActive: boolean,
): RolePagination {
  return {
    view,
    section,
    page,
    cursorActive: cursorActive && initialSection === section,
  };
}

function Segmented({
  items,
  selected,
  onChange,
}: {
  readonly items: readonly (readonly [string, string, number])[];
  readonly selected: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="ops-segmented" role="toolbar">
      {items.map(([value, label, count]) => (
        <button
          aria-pressed={selected === value}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          {label} <b>{count}</b>
        </button>
      ))}
    </div>
  );
}

function Search({
  query,
  setQuery,
}: {
  readonly query: string;
  readonly setQuery: (value: string) => void;
}) {
  return (
    <label className="ops-directory-search ops-role-search">
      <OperationsIcon name="search" />
      <input
        aria-label="Tìm trong danh bạ"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm theo tên, mã hoặc trạng thái…"
        value={query}
      />
    </label>
  );
}

function ActionDialog({
  action,
  pending,
  onClose,
  execute,
}: {
  readonly action: Exclude<Action, null>;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly execute: (
    command: OperationsCommand,
    payload: Record<string, unknown>,
    success: string,
    resourceId?: string,
  ) => Promise<void>;
}) {
  const [privacyStatus, setPrivacyStatus] = useState(
    action.kind === 'privacy'
      ? (privacyTransitions(action.item.status)[0] ?? 'CANCELLED')
      : 'IN_REVIEW',
  );
  const [incidentTransition, setIncidentTransition] = useState(
    action.kind === 'incident' && ['CLOSED', 'RESOLVED'].includes(action.item.status)
      ? 'reopen'
      : 'triage',
  );
  return (
    <div className="ops-dialog-layer">
      <button aria-label="Đóng" className="ops-dialog-backdrop" onClick={onClose} type="button" />
      <section aria-modal="true" className="ops-dialog ops-role-dialog" role="dialog">
        <header>
          <div>
            <span className="ops-eyebrow">Privileged action</span>
            <h2>{actionTitle(action)}</h2>
            <p>Payload được xác thực ở BFF và API; kết quả được ghi vào audit trail.</p>
          </div>
          <button aria-label="Đóng" onClick={onClose} type="button">
            <OperationsIcon name="close" />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (action.kind === 'governance') {
              void execute(
                'admin_governance_mutate',
                governanceCommand(action.view, form),
                'Đã tạo phiên bản cấu hình mới.',
              );
              return;
            }
            const reason = String(form.get('reason') ?? '');
            if (action.kind === 'refund') {
              void execute(
                'finance_refund',
                { amountMinor: Number(form.get('amountMinor')), reason },
                'Đã tạo yêu cầu hoàn tiền.',
                action.item.id,
              );
              return;
            }
            if (action.kind === 'incident') {
              const transition = incidentTransition;
              const common = {
                expectedVersion: action.item.version,
                patientMessage: String(form.get('patientMessage')),
              };
              if (transition === 'triage') {
                void execute(
                  'trust_incident_triage',
                  {
                    ...common,
                    severity: String(form.get('severity')),
                    ownerUserId: String(form.get('ownerUserId')),
                    toStatus: String(form.get('toStatus')),
                  },
                  'Đã cập nhật phân loại sự cố.',
                  action.item.id,
                );
              } else {
                void execute(
                  transition === 'reopen' ? 'trust_incident_reopen' : 'trust_incident_close',
                  common,
                  transition === 'reopen' ? 'Đã mở lại sự cố.' : 'Đã đóng sự cố.',
                  action.item.id,
                );
              }
              return;
            }
            if (action.kind === 'report') {
              void execute(
                'trust_review_report_decide',
                { status: String(form.get('status')), reason },
                'Đã ghi nhận quyết định moderation.',
                action.item.id,
              );
              return;
            }
            if (action.kind === 'privacy') {
              const payload: Record<string, unknown> = {
                toStatus: privacyStatus,
                expectedVersion: action.item.version,
                reason,
                patientMessage: String(form.get('patientMessage')),
                confirmation: 'PROCESS PRIVACY REQUEST',
              };
              if (privacyStatus === 'APPROVED') {
                payload.verification = {
                  method: String(form.get('verificationMethod')),
                  reference: String(form.get('verificationReference')),
                  verifiedAt: new Date().toISOString(),
                };
              }
              void execute(
                'trust_privacy_process',
                payload,
                'Đã chuyển trạng thái yêu cầu quyền riêng tư.',
                action.item.id,
              );
              return;
            }
            if (action.kind === 'privacy-retry') {
              void execute(
                'trust_privacy_retry',
                {
                  expectedVersion: action.item.execution?.version,
                  reason,
                  confirmation: 'RETRY PRIVACY EXECUTION',
                },
                'Đã đưa privacy execution vào hàng đợi retry.',
                action.item.id,
              );
              return;
            }
            if (action.kind === 'elevation-create') {
              void execute(
                'trust_support_elevation_create',
                {
                  actorUserId: String(form.get('actorUserId')),
                  subjectUserId: String(form.get('subjectUserId')),
                  ticketReference: String(form.get('ticketReference')),
                  reason,
                  expiresInMinutes: Number(form.get('expiresInMinutes')),
                  capabilities: form.getAll('capabilities').map(String),
                },
                'Đã cấp quyền hỗ trợ có thời hạn.',
              );
              return;
            }
            void execute(
              'trust_support_elevation_revoke',
              { reason },
              'Đã thu hồi quyền hỗ trợ.',
              action.item.id,
            );
          }}
        >
          {action.kind === 'governance' ? (
            <GovernanceFields record={action.record} view={action.view} />
          ) : null}
          {action.kind === 'refund' ? (
            <label>
              <span>Số tiền ({action.item.currency}, đơn vị nhỏ nhất)</span>
              <input
                defaultValue={action.item.amountMinor}
                max={Number(action.item.amountMinor)}
                min="1"
                name="amountMinor"
                required
                type="number"
              />
            </label>
          ) : null}
          {action.kind === 'incident' ? (
            <IncidentFields
              item={action.item}
              onTransition={setIncidentTransition}
              transition={incidentTransition}
            />
          ) : null}
          {action.kind === 'report' ? (
            <label>
              <span>Quyết định</span>
              <CustomSelect defaultValue="ACTIONED" name="status">
                <option value="ACTIONED">Actioned</option>
                <option value="DISMISSED">Dismissed</option>
              </CustomSelect>
            </label>
          ) : null}
          {action.kind === 'privacy' ? (
            <>
              <label>
                <span>Trạng thái tiếp theo</span>
                <CustomSelect
                  name="toStatus"
                  onChange={(event) => setPrivacyStatus(event.target.value)}
                  value={privacyStatus}
                >
                  {privacyTransitions(action.item.status).map((status) => (
                    <option key={status} value={status}>
                      {humanize(status)}
                    </option>
                  ))}
                </CustomSelect>
              </label>
              {privacyStatus === 'APPROVED' ? (
                <>
                  <label>
                    <span>Phương thức xác minh</span>
                    <CustomSelect defaultValue="ACCOUNT_MFA" name="verificationMethod">
                      <option value="ACCOUNT_MFA">Account MFA</option>
                      <option value="VERIFIED_COMMUNICATION">Verified communication</option>
                      <option value="DOCUMENT_REVIEW">Document review</option>
                    </CustomSelect>
                  </label>
                  <label>
                    <span>Tham chiếu xác minh</span>
                    <input minLength={8} name="verificationReference" required />
                  </label>
                </>
              ) : null}
              <label>
                <span>Thông báo cho người dùng</span>
                <textarea minLength={10} name="patientMessage" required rows={3} />
              </label>
            </>
          ) : null}
          {action.kind === 'elevation-create' ? <ElevationFields /> : null}
          {needsReason(action) ? (
            <label>
              <span>Lý do bắt buộc</span>
              <textarea minLength={reasonMinimum(action)} name="reason" required rows={4} />
            </label>
          ) : null}
          <div className="ops-confirmation-note">
            <OperationsIcon name="shield" />
            <span>
              <strong>Xác nhận có chủ đích</strong>
              <small>Expected state và idempotency key được gửi cùng thao tác.</small>
            </span>
          </div>
          <footer>
            <button onClick={onClose} type="button">
              Hủy
            </button>
            <button className="ops-button ops-button--primary" disabled={pending} type="submit">
              {pending ? 'Đang thực hiện…' : 'Xác nhận'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function IncidentFields({
  item,
  transition,
  onTransition,
}: {
  readonly item: IncidentView;
  readonly transition: string;
  readonly onTransition: (value: string) => void;
}) {
  const canReopen = ['CLOSED', 'RESOLVED'].includes(item.status);
  const triageStatuses = incidentTriageStatuses(item.status);
  return (
    <>
      <label>
        <span>Thao tác</span>
        <CustomSelect
          name="transition"
          onChange={(event) => onTransition(event.target.value)}
          value={transition}
        >
          {!canReopen && triageStatuses.length ? (
            <option value="triage">Phân loại / phân công</option>
          ) : null}
          {!canReopen ? <option value="close">Đóng sự cố</option> : null}
          {canReopen ? <option value="reopen">Mở lại sự cố</option> : null}
        </CustomSelect>
      </label>
      {transition === 'triage' ? (
        <div className="ops-inline-fields">
          <label>
            <span>Mức độ</span>
            <CustomSelect defaultValue={item.severity} name="severity">
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </CustomSelect>
          </label>
          <label>
            <span>Trạng thái xử lý</span>
            <CustomSelect defaultValue={triageStatuses[0]} name="toStatus">
              {triageStatuses.map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </CustomSelect>
          </label>
          <label>
            <span>Owner user ID</span>
            <input name="ownerUserId" pattern="[0-9a-fA-F-]{36}" required />
          </label>
        </div>
      ) : null}
      <label>
        <span>Thông báo cho người dùng</span>
        <textarea minLength={3} name="patientMessage" required rows={3} />
      </label>
    </>
  );
}

function ElevationFields() {
  return (
    <>
      <label>
        <span>Support agent user ID</span>
        <input name="actorUserId" pattern="[0-9a-fA-F-]{36}" required />
      </label>
      <label>
        <span>Subject user ID</span>
        <input name="subjectUserId" pattern="[0-9a-fA-F-]{36}" required />
      </label>
      <label>
        <span>Ticket tham chiếu</span>
        <input minLength={3} name="ticketReference" required />
      </label>
      <label>
        <span>Thời hạn (phút)</span>
        <input defaultValue="30" max="120" min="5" name="expiresInMinutes" required type="number" />
      </label>
      <fieldset className="ops-checkbox-fieldset">
        <legend>Capability</legend>
        {['CASE_READ', 'INCIDENT_READ', 'INCIDENT_UPDATE', 'PRIVACY_STATUS_READ'].map((value) => (
          <label key={value}>
            <input
              defaultChecked={value === 'CASE_READ'}
              name="capabilities"
              type="checkbox"
              value={value}
            />
            {humanize(value)}
          </label>
        ))}
      </fieldset>
    </>
  );
}

function GovernanceFields({
  view,
  record,
}: {
  readonly view: AdminGovernanceView;
  readonly record?: GovernanceRecord | undefined;
}) {
  const expectedVersion = record?.version ?? record?.latestVersion?.version ?? 0;
  return (
    <>
      {view === 'content' ? (
        <>
          <TextField
            label="Slug"
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={record?.slug}
          />
          <LocaleField value={record?.locale} />
          <TextField label="Tiêu đề" minLength={4} name="title" value={record?.title} />
          <TextField
            label="Tóm tắt"
            minLength={8}
            name="summary"
            required={false}
            value={record?.summary ?? undefined}
          />
          <label>
            <span>Nội dung</span>
            <textarea minLength={20} name="body" required rows={6} />
          </label>
          <PublicationField value={record?.publicationStatus} />
        </>
      ) : null}
      {view === 'templates' ? (
        <>
          <TextField
            label="Template key"
            name="key"
            pattern="[a-z][a-z0-9_.-]{2,159}"
            value={record?.key}
          />
          <label>
            <span>Category</span>
            <CustomSelect
              defaultValue={record?.category ?? 'ADMINISTRATIVE_ALERTS'}
              name="category"
            >
              <option value="ADMINISTRATIVE_ALERTS">Administrative alerts</option>
              <option value="CASE_UPDATES">Case updates</option>
              <option value="PAYMENTS">Payments</option>
              <option value="INCIDENTS">Incidents</option>
              <option value="VERIFICATION_EXPIRY">Verification expiry</option>
            </CustomSelect>
          </label>
          <label>
            <span>Channel</span>
            <CustomSelect defaultValue={record?.channel ?? 'EMAIL'} name="channel">
              <option value="IN_APP">In-app</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="MESSAGING">Messaging</option>
            </CustomSelect>
          </label>
          <LocaleField value={record?.locale} />
          <TextField label="Subject" name="subject" value={record?.latestVersion?.subject} />
          <label>
            <span>Nội dung template</span>
            <textarea minLength={20} name="body" required rows={6} />
          </label>
          <PublicationField value={record?.latestVersion?.publicationStatus} />
        </>
      ) : null}
      {view === 'feature-flags' ? (
        <>
          <TextField
            label="Flag key"
            name="key"
            pattern="[a-z][a-z0-9_.-]{2,119}"
            value={record?.key}
          />
          <TextField label="Mô tả" minLength={8} name="description" value={record?.description} />
          <label>
            <span>Environment</span>
            <CustomSelect
              defaultValue={record?.latestVersion?.environment ?? 'production'}
              name="environment"
            >
              <option value="development">Development</option>
              <option value="test">Test</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
              <option value="all">All</option>
            </CustomSelect>
          </label>
          <label className="ops-checkbox-line">
            <input defaultChecked={record?.latestVersion?.enabled} name="enabled" type="checkbox" />{' '}
            Bật feature flag
          </label>
          <TextField
            label="Audience (phân tách bằng dấu phẩy)"
            name="audiences"
            required={false}
            value={record?.latestVersion?.audiences?.join(', ')}
          />
        </>
      ) : null}
      {view === 'configuration' ? (
        <>
          <TextField
            label="Configuration key"
            name="key"
            pattern="[a-z][a-z0-9_.-]{2,119}"
            value={record?.key}
          />
          <TextField label="Mô tả" minLength={8} name="description" value={record?.description} />
          <label>
            <span>Kiểu dữ liệu</span>
            <CustomSelect defaultValue={record?.valueType ?? 'STRING'} name="valueType">
              <option value="STRING">String</option>
              <option value="BOOLEAN">Boolean</option>
              <option value="INTEGER">Integer</option>
              <option value="DECIMAL">Decimal</option>
            </CustomSelect>
          </label>
          <TextField label="Giá trị" name="value" value={record?.latestVersion?.value} />
        </>
      ) : null}
      {view === 'taxonomy' ? (
        <>
          <label>
            <span>Loại taxonomy</span>
            <CustomSelect defaultValue={record?.kind ?? 'service_category'} name="kind">
              <option value="service_category">Service category</option>
              <option value="procedure">Procedure</option>
            </CustomSelect>
          </label>
          <TextField
            label="Code"
            name="code"
            pattern="[a-z][a-z0-9_.-]{2,119}"
            value={record?.code}
          />
          <BilingualNames record={record} />
          <TextField
            label="Parent / Service category ID (nếu có)"
            name="relationshipId"
            required={false}
            value={record?.serviceCategoryId ?? record?.parentId ?? undefined}
          />
          <TextField
            label="Mô tả tiếng Việt (procedure)"
            name="descriptionVi"
            required={false}
            value={record?.descriptions?.['vi-VN']}
          />
          <TextField
            label="Mô tả tiếng Anh (procedure)"
            name="descriptionEn"
            required={false}
            value={record?.descriptions?.['en-US']}
          />
          <label className="ops-checkbox-line">
            <input defaultChecked={record?.active ?? true} name="active" type="checkbox" /> Đang
            hoạt động
          </label>
        </>
      ) : null}
      {view === 'locations' ? (
        <>
          <label>
            <span>Loại địa điểm</span>
            <CustomSelect defaultValue={record?.kind ?? 'country'} name="kind">
              <option value="country">Country</option>
              <option value="city">City</option>
              <option value="locale">Locale</option>
            </CustomSelect>
          </label>
          <TextField
            label="ID khi cập nhật (để trống khi tạo mới)"
            name="id"
            required={false}
            value={record?.id}
          />
          <TextField
            label="Code quốc gia / thành phố"
            name="code"
            required={false}
            value={record?.code}
          />
          <TextField
            label="Country ID (city)"
            name="countryId"
            required={false}
            value={record?.countryId}
          />
          <TextField
            label="Locale (locale)"
            name="locale"
            required={false}
            value={record?.locale}
          />
          <BilingualNames record={record} />
          <TextField
            label="Currency (country)"
            name="currency"
            required={false}
            value={record?.currency ?? 'VND'}
          />
          <TextField
            label="Calling code (country)"
            name="callingCode"
            required={false}
            value={record?.callingCode ?? '+84'}
          />
          <TextField
            label="Timezone (city)"
            name="timezone"
            required={false}
            value={record?.timezone ?? 'Asia/Ho_Chi_Minh'}
          />
          <label className="ops-checkbox-line">
            <input defaultChecked={record?.active ?? true} name="active" type="checkbox" /> Đang
            hoạt động
          </label>
          <label className="ops-checkbox-line">
            <input defaultChecked={record?.isDefault} name="isDefault" type="checkbox" /> Locale mặc
            định
          </label>
        </>
      ) : null}
      <TextField
        label="Expected version"
        min="0"
        name="expectedVersion"
        type="number"
        value={String(expectedVersion)}
      />
      <label>
        <span>Lý do bắt buộc</span>
        <textarea minLength={12} name="reason" required rows={4} />
      </label>
    </>
  );
}

function TextField({
  label,
  name,
  required = true,
  value,
  ...input
}: {
  readonly label: string;
  readonly name: string;
  readonly required?: boolean;
  readonly value?: string | undefined;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'required' | 'defaultValue'>) {
  return (
    <label>
      <span>{label}</span>
      <input defaultValue={value} name={name} required={required} {...input} />
    </label>
  );
}

function LocaleField({ value }: { readonly value?: string | undefined }) {
  return (
    <label>
      <span>Locale</span>
      <CustomSelect defaultValue={value ?? 'vi-VN'} name="locale">
        <option value="vi-VN">Tiếng Việt</option>
        <option value="en-US">English</option>
      </CustomSelect>
    </label>
  );
}

function PublicationField({ value }: { readonly value?: string | undefined }) {
  return (
    <label>
      <span>Trạng thái xuất bản</span>
      <CustomSelect defaultValue={value ?? 'DRAFT'} name="publicationStatus">
        <option value="DRAFT">Draft</option>
        <option value="PUBLISHED">Published</option>
        <option value="ARCHIVED">Archived</option>
      </CustomSelect>
    </label>
  );
}

function BilingualNames({ record }: { readonly record?: GovernanceRecord | undefined }) {
  return (
    <div className="ops-inline-fields">
      <TextField
        label="Tên tiếng Việt"
        minLength={2}
        name="nameVi"
        value={record?.names?.['vi-VN']}
      />
      <TextField
        label="Tên tiếng Anh"
        minLength={2}
        name="nameEn"
        value={record?.names?.['en-US']}
      />
    </div>
  );
}

function governanceCommand(view: AdminGovernanceView, form: FormData): Record<string, unknown> {
  const expectedVersion = Number(form.get('expectedVersion'));
  const reason = String(form.get('reason'));
  if (view === 'content')
    return {
      view,
      command: {
        slug: textValue(form, 'slug'),
        locale: textValue(form, 'locale'),
        expectedVersion,
        title: textValue(form, 'title'),
        ...(optionalText(form, 'summary') ? { summary: optionalText(form, 'summary') } : {}),
        body: textValue(form, 'body'),
        publicationStatus: textValue(form, 'publicationStatus'),
        reason,
        confirmation: 'SAVE CONTENT VERSION',
      },
    };
  if (view === 'templates')
    return {
      view,
      command: {
        key: textValue(form, 'key'),
        category: textValue(form, 'category'),
        channel: textValue(form, 'channel'),
        locale: textValue(form, 'locale'),
        expectedVersion,
        subject: textValue(form, 'subject'),
        body: textValue(form, 'body'),
        publicationStatus: textValue(form, 'publicationStatus'),
        reason,
        confirmation: 'SAVE NOTIFICATION TEMPLATE',
      },
    };
  if (view === 'feature-flags')
    return {
      view,
      command: {
        key: textValue(form, 'key'),
        description: textValue(form, 'description'),
        expectedVersion,
        enabled: form.get('enabled') === 'on',
        environment: textValue(form, 'environment'),
        audiences: optionalText(form, 'audiences')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        reason,
        confirmation: 'CHANGE FEATURE FLAG',
      },
    };
  if (view === 'configuration')
    return {
      view,
      command: {
        key: textValue(form, 'key'),
        description: textValue(form, 'description'),
        valueType: textValue(form, 'valueType'),
        expectedVersion,
        value: textValue(form, 'value'),
        reason,
        confirmation: 'CHANGE SYSTEM CONFIGURATION',
      },
    };
  const names = { 'vi-VN': textValue(form, 'nameVi'), 'en-US': textValue(form, 'nameEn') };
  if (view === 'taxonomy') {
    const kind = textValue(form, 'kind');
    return {
      view,
      command:
        kind === 'procedure'
          ? {
              kind,
              code: textValue(form, 'code'),
              names,
              descriptions: {
                'vi-VN': textValue(form, 'descriptionVi'),
                'en-US': textValue(form, 'descriptionEn'),
              },
              active: form.get('active') === 'on',
              serviceCategoryId: textValue(form, 'relationshipId'),
              expectedVersion,
              reason,
              confirmation: 'CHANGE TAXONOMY',
            }
          : {
              kind,
              code: textValue(form, 'code'),
              names,
              active: form.get('active') === 'on',
              parentId: optionalText(form, 'relationshipId') || null,
              expectedVersion,
              reason,
              confirmation: 'CHANGE TAXONOMY',
            },
    };
  }
  const kind = textValue(form, 'kind');
  const shared = {
    kind,
    ...(optionalText(form, 'id') ? { id: optionalText(form, 'id') } : {}),
    names,
    active: form.get('active') === 'on',
    expectedVersion,
    reason,
    confirmation: 'CHANGE LOCATION CONFIGURATION',
  };
  if (kind === 'city')
    return {
      view,
      command: {
        ...shared,
        countryId: textValue(form, 'countryId'),
        code: textValue(form, 'code'),
        timezone: textValue(form, 'timezone'),
      },
    };
  if (kind === 'locale')
    return {
      view,
      command: {
        ...shared,
        locale: textValue(form, 'locale'),
        isDefault: form.get('isDefault') === 'on',
      },
    };
  return {
    view,
    command: {
      ...shared,
      code: textValue(form, 'code'),
      currency: textValue(form, 'currency'),
      callingCode: textValue(form, 'callingCode'),
    },
  };
}

function actionTitle(action: Exclude<Action, null>): string {
  if (action.kind === 'refund') return 'Tạo yêu cầu hoàn tiền';
  if (action.kind === 'incident') return 'Xử lý sự cố';
  if (action.kind === 'report') return 'Quyết định báo cáo review';
  if (action.kind === 'privacy') return 'Xử lý yêu cầu quyền riêng tư';
  if (action.kind === 'privacy-retry') return 'Retry privacy execution';
  if (action.kind === 'elevation-create') return 'Cấp quyền hỗ trợ tạm thời';
  if (action.kind === 'elevation-revoke') return 'Thu hồi quyền hỗ trợ';
  return `Tạo phiên bản ${governanceViews.find(({ value }) => value === action.view)?.label ?? ''}`;
}

function needsReason(action: Exclude<Action, null>): boolean {
  return !['incident', 'governance', 'privacy'].includes(action.kind);
}

function reasonMinimum(action: Exclude<Action, null>): number {
  return action.kind === 'elevation-create'
    ? 20
    : action.kind === 'refund' || action.kind === 'elevation-revoke' || action.kind === 'report'
      ? 10
      : 12;
}

function textValue(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function optionalText(form: FormData, key: string): string {
  return textValue(form, key);
}

function sectionError(error: string): string {
  const normalized = error.toUpperCase();
  if (['MFA_REQUIRED', 'MFA_VERIFICATION_REQUIRED'].includes(normalized))
    return 'Hoàn tất xác thực nhiều lớp để đọc và thay đổi dữ liệu đặc quyền.';
  if (['FORBIDDEN', 'AUTHORIZATION_DENIED'].includes(normalized))
    return 'Vai trò hiện tại không có quyền truy cập khu vực này.';
  return 'Dịch vụ nguồn đang không khả dụng. Không hiển thị dữ liệu rỗng giả tạo.';
}

function privacyTransitions(status: PrivacyRequestView['status']): readonly string[] {
  if (status === 'SUBMITTED') return ['IDENTITY_VERIFICATION_REQUIRED', 'IN_REVIEW', 'CANCELLED'];
  if (status === 'IDENTITY_VERIFICATION_REQUIRED') return ['IN_REVIEW', 'REJECTED', 'CANCELLED'];
  if (status === 'IN_REVIEW')
    return ['IDENTITY_VERIFICATION_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED'];
  return ['CANCELLED'];
}

function incidentTriageStatuses(status: IncidentView['status']): readonly string[] {
  if (status === 'OPEN' || status === 'REOPENED') return ['TRIAGED', 'IN_PROGRESS'];
  if (status === 'TRIAGED') return ['IN_PROGRESS', 'AWAITING_CLINIC'];
  if (status === 'IN_PROGRESS') return ['AWAITING_CLINIC'];
  if (status === 'AWAITING_CLINIC') return ['IN_PROGRESS'];
  return [];
}

function initialTrustView(
  section: string | null,
  administrator: boolean,
  contentAdministrator: boolean,
  supportAgent: boolean,
): TrustView {
  if (section === 'reports' && contentAdministrator) return 'reports';
  if (section === 'privacy' && administrator) return 'privacy';
  if (section === 'elevations' && (administrator || supportAgent)) return 'elevations';
  if (section === 'incidents' && (administrator || supportAgent)) return 'incidents';
  return contentAdministrator && !administrator && !supportAgent ? 'reports' : 'incidents';
}

function money(amountMinor: string, currency: 'VND' | 'USD'): string {
  const divisor = currency === 'USD' ? 100 : 1;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(
    Number(amountMinor) / divisor,
  );
}

function shortId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}
