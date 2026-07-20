'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

import { CustomSelect } from '@dental-trust/ui';
import type {
  ClinicOnboardingView,
  ClinicServiceView,
  ClinicTeamMemberView,
} from '@dental-trust/contracts';
import { ProviderDialog } from '@/components/provider-dialog';
import { ProviderIcon, type ProviderIconName } from '@/components/provider-icon';
import type { ClinicWorkspaceTab } from '@/lib/clinic-tabs';
import { commandErrorMessage, sendProviderCommand } from '@/lib/provider-command';
import type { ProviderClinicData } from '@/lib/provider-data';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  humanize,
  initials,
  labelStatus,
} from '@/lib/presentation';

type ClinicDialog = 'profile' | 'invite' | 'service' | 'rule' | 'policy' | 'submit' | null;

const tabs: readonly {
  id: ClinicWorkspaceTab;
  label: string;
  icon: ProviderIconName;
}[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'clinic' },
  { id: 'team', label: 'Đội ngũ', icon: 'users' },
  { id: 'services', label: 'Dịch vụ & giá', icon: 'services' },
  { id: 'availability', label: 'Lịch công bố', icon: 'calendar' },
  { id: 'analytics', label: 'Hiệu suất', icon: 'trend' },
  { id: 'security', label: 'Bảo mật', icon: 'shield' },
];

const permissionLabels: Readonly<Record<string, string>> = {
  CASE_INBOX: 'Tiếp nhận ca',
  CASE_ASSIGN_DENTIST: 'Phân công nha sĩ',
  TREATMENT_PLAN: 'Phương án điều trị',
  SCHEDULING: 'Lịch hẹn',
  CLINICAL_RECORDS: 'Hồ sơ lâm sàng',
  AFTERCARE: 'Hậu mãi',
  INCIDENT_RESPONSE: 'Xử lý sự cố',
  REVIEW_RESPONSE: 'Phản hồi đánh giá',
  ANALYTICS_READ: 'Xem phân tích',
};

export function ClinicWorkspace({
  data,
  initialTab,
}: {
  readonly data: ProviderClinicData;
  readonly initialTab: ClinicWorkspaceTab;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [dialog, setDialog] = useState<ClinicDialog>(null);
  const [archiveService, setArchiveService] = useState<ClinicServiceView | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onboarding = data.onboarding;
  const location = onboarding.locations.find((item) => item.active) ?? onboarding.locations[0];
  const verifiedDentists = data.dentists.filter(
    (item) => item.active && item.licenseStatus.toUpperCase().includes('VERIFIED'),
  );
  const readiness = Math.min(
    100,
    Math.round(
      (onboarding.progressPercent +
        (data.services.services.some((item) => item.active) ? 100 : 0) +
        (data.availability.rules.some((item) => item.active) ? 100 : 0) +
        (data.team.members.some((item) => item.status === 'ACTIVE' && item.mfaEnabled) ? 100 : 0)) /
        4,
    ),
  );

  function selectTab(tab: ClinicWorkspaceTab) {
    setActiveTab(tab);
    window.history.replaceState(null, '', `/clinic?tab=${tab}`);
  }

  async function execute(operation: () => Promise<unknown>, success: string): Promise<boolean> {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      setDialog(null);
      setArchiveService(null);
      router.refresh();
      return true;
    } catch (reason) {
      setError(commandErrorMessage(reason));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {notice ? (
        <div className="provider-toast provider-toast--success" role="status">
          <ProviderIcon name="check" />
          {notice}
          <button aria-label="Đóng" onClick={() => setNotice(null)} type="button">
            ×
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="provider-toast provider-toast--error" role="alert">
          <ProviderIcon name="alert" />
          {error}
          <button aria-label="Đóng" onClick={() => setError(null)} type="button">
            ×
          </button>
        </div>
      ) : null}

      <section className="provider-clinic-hero provider-clinic-hero--live">
        <span className="provider-clinic-hero__logo">{initials(onboarding.clinicName)}</span>
        <div>
          <span className="provider-verified-badge">
            <ProviderIcon name="shield" /> {verificationLabel(onboarding.verificationStatus)}
          </span>
          <h2>{onboarding.clinicName}</h2>
          <p>
            <ProviderIcon name="location" />
            {location ? `${location.address}, ${location.city}` : 'Chưa khai báo cơ sở'}
          </p>
        </div>
        <div className="provider-clinic-readiness">
          <span>
            <strong>{readiness}</strong>
            <small>/100</small>
          </span>
          <div>
            <small>Mức sẵn sàng vận hành</small>
            <strong>{readiness >= 85 ? 'Sẵn sàng vận hành' : 'Cần hoàn thiện'}</strong>
          </div>
        </div>
      </section>

      <nav aria-label="Quản lý phòng khám" className="provider-workspace-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-label={tab.label}
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            role="tab"
            type="button"
          >
            <ProviderIcon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <OverviewTab
          data={data}
          onEditProfile={() => setDialog('profile')}
          onSelectTab={selectTab}
          onSubmit={() => setDialog('submit')}
          readiness={readiness}
          verifiedDentists={verifiedDentists.length}
        />
      ) : null}
      {activeTab === 'team' ? <TeamTab data={data} onInvite={() => setDialog('invite')} /> : null}
      {activeTab === 'services' ? (
        <ServicesTab
          data={data}
          onArchive={setArchiveService}
          onPublish={() => setDialog('service')}
        />
      ) : null}
      {activeTab === 'availability' ? (
        <AvailabilityTab
          data={data}
          onCreateRule={() => setDialog('rule')}
          onEditPolicy={() => setDialog('policy')}
        />
      ) : null}
      {activeTab === 'analytics' ? <AnalyticsTab data={data} /> : null}
      {activeTab === 'security' ? <SecurityTab data={data} /> : null}

      <ProfileDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () => sendProviderCommand({ command: 'clinic_update_profile', payload }),
            'Hồ sơ pháp lý và chính sách hậu mãi đã được cập nhật.',
          )
        }
        open={dialog === 'profile'}
        pending={pending}
      />
      <InviteDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () => sendProviderCommand({ command: 'clinic_invite_team', payload }),
            'Lời mời đã được tạo với phạm vi quyền đã chọn.',
          )
        }
        open={dialog === 'invite'}
        pending={pending}
      />
      <ServiceDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () => sendProviderCommand({ command: 'clinic_publish_service', payload }),
            'Dịch vụ và khoảng giá mới đã được công bố.',
          )
        }
        open={dialog === 'service'}
        pending={pending}
      />
      <AvailabilityRuleDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () => sendProviderCommand({ command: 'clinic_create_availability_rule', payload }),
            'Khung lịch công bố đã được tạo.',
          )
        }
        open={dialog === 'rule'}
        pending={pending}
      />
      <PolicyDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () => sendProviderCommand({ command: 'clinic_update_scheduling_policy', payload }),
            'Chính sách đặt lịch đã được cập nhật.',
          )
        }
        open={dialog === 'policy'}
        pending={pending}
      />
      <SubmitDialog
        onboarding={onboarding}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () => sendProviderCommand({ command: 'clinic_submit_onboarding', payload }),
            'Hồ sơ đã được gửi để xác minh.',
          )
        }
        open={dialog === 'submit'}
        pending={pending}
      />
      <ArchiveDialog
        onClose={() => setArchiveService(null)}
        onSubmit={(reason) => {
          if (!archiveService) return;
          void execute(
            () =>
              sendProviderCommand({
                command: 'clinic_archive_service',
                resourceId: archiveService.id,
                payload: { reason },
              }),
            'Dịch vụ đã được ngừng công bố. Các hồ sơ cũ vẫn được giữ nguyên.',
          );
        }}
        open={archiveService !== null}
        pending={pending}
        service={archiveService}
      />
    </>
  );
}

function OverviewTab({
  data,
  readiness,
  verifiedDentists,
  onEditProfile,
  onSubmit,
  onSelectTab,
}: {
  readonly data: ProviderClinicData;
  readonly readiness: number;
  readonly verifiedDentists: number;
  readonly onEditProfile: () => void;
  readonly onSubmit: () => void;
  readonly onSelectTab: (tab: ClinicWorkspaceTab) => void;
}) {
  const onboarding = data.onboarding;
  const cards = [
    {
      label: 'Đội ngũ hoạt động',
      value: data.overview.activeTeam,
      detail: `${verifiedDentists}/${data.dentists.length} nha sĩ đã xác minh`,
      icon: 'users' as const,
      tone: 'blue',
    },
    {
      label: 'Dịch vụ công bố',
      value: data.overview.activeServices,
      detail: `${data.services.catalog.length} dịch vụ trong danh mục`,
      icon: 'services' as const,
      tone: 'amber',
    },
    {
      label: 'Khung lịch hoạt động',
      value: data.availability.rules.filter((item) => item.active).length,
      detail: `${data.availability.blocks.length} thời gian đang khóa`,
      icon: 'calendar' as const,
      tone: 'mint',
    },
  ];
  const requirements = onboarding.missingRequirements;
  return (
    <div className="provider-clinic-tab">
      <section aria-label="Năng lực phòng khám" className="provider-metric-grid">
        {cards.map((card) => (
          <article className={`provider-metric provider-metric--${card.tone}`} key={card.label}>
            <span className="provider-metric__icon">
              <ProviderIcon name={card.icon} />
            </span>
            <span className="provider-metric__label">{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </section>

      <div className="provider-clinic-overview-grid">
        <section className="provider-panel provider-readiness-workspace">
          <header className="provider-panel-header">
            <div>
              <span className="provider-panel-icon provider-panel-icon--blue">
                <ProviderIcon name="shield" />
              </span>
              <span>
                <h2>Hồ sơ tin cậy</h2>
                <p>Thông tin được dùng cho xác minh và hiển thị tới bệnh nhân.</p>
              </span>
            </div>
            <button className="provider-text-button" onClick={onEditProfile} type="button">
              Chỉnh sửa
            </button>
          </header>
          <div className="provider-readiness-summary">
            <span
              className="provider-readiness-ring"
              style={{ '--score': `${readiness}%` } as CSSProperties}
            >
              <strong>{readiness}</strong>
              <small>/100</small>
            </span>
            <div>
              <span
                className={`provider-status provider-status--${requirements.length ? 'attention' : 'success'}`}
              >
                {verificationLabel(onboarding.verificationStatus)}
              </span>
              <h3>{requirements.length ? 'Còn nội dung cần hoàn thiện' : 'Hồ sơ đã sẵn sàng'}</h3>
              <p>
                Tiến độ onboarding {onboarding.progressPercent}%. Dữ liệu khai báo và năng lực công
                bố được kiểm tra độc lập.
              </p>
            </div>
          </div>
          <div className="provider-requirement-list">
            {requirements.length ? (
              requirements.map((requirement) => (
                <div key={requirement}>
                  <span className="is-pending">
                    <ProviderIcon name="clock" />
                  </span>
                  <div>
                    <strong>{requirementLabel(requirement)}</strong>
                    <small>Cần hoàn tất trước khi gửi xác minh.</small>
                  </div>
                </div>
              ))
            ) : (
              <div>
                <span className="is-complete">
                  <ProviderIcon name="check" />
                </span>
                <div>
                  <strong>Đã hoàn tất các yêu cầu bắt buộc</strong>
                  <small>Có thể gửi hồ sơ để xác minh.</small>
                </div>
              </div>
            )}
          </div>
          <footer>
            <button className="provider-secondary-button" onClick={onEditProfile} type="button">
              Cập nhật hồ sơ
            </button>
            <button
              className="provider-primary-button"
              disabled={Boolean(onboarding.submittedAt) || requirements.length > 0}
              onClick={onSubmit}
              type="button"
            >
              <ProviderIcon name="arrow" />
              {onboarding.submittedAt ? 'Đã gửi xác minh' : 'Gửi xác minh'}
            </button>
          </footer>
        </section>

        <aside className="provider-clinic-quick-actions">
          <section className="provider-panel">
            <header>
              <h2>Điểm cần chú ý</h2>
              <span>{data.overview.openIncidents}</span>
            </header>
            <button onClick={() => onSelectTab('team')} type="button">
              <span
                className={
                  data.team.members.some((item) => item.status === 'ACTIVE' && !item.mfaEnabled)
                    ? 'is-warning'
                    : 'is-ok'
                }
              >
                <ProviderIcon name="shield" />
              </span>
              <div>
                <strong>MFA đội ngũ</strong>
                <small>
                  {
                    data.team.members.filter((item) => item.status === 'ACTIVE' && !item.mfaEnabled)
                      .length
                  }{' '}
                  tài khoản chưa bật
                </small>
              </div>
              <ProviderIcon name="chevron" />
            </button>
            <button onClick={() => onSelectTab('availability')} type="button">
              <span className={data.availability.policy ? 'is-ok' : 'is-warning'}>
                <ProviderIcon name="calendar" />
              </span>
              <div>
                <strong>Chính sách đặt lịch</strong>
                <small>{data.availability.policy ? 'Đã cấu hình' : 'Chưa cấu hình'}</small>
              </div>
              <ProviderIcon name="chevron" />
            </button>
            <button onClick={() => onSelectTab('services')} type="button">
              <span className={data.overview.activeServices ? 'is-ok' : 'is-warning'}>
                <ProviderIcon name="services" />
              </span>
              <div>
                <strong>Giá công khai</strong>
                <small>{data.overview.activeServices} dịch vụ đang hiển thị</small>
              </div>
              <ProviderIcon name="chevron" />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function TeamTab({
  data,
  onInvite,
}: {
  readonly data: ProviderClinicData;
  readonly onInvite: () => void;
}) {
  const activeMembers = data.team.members.filter((item) => item.status === 'ACTIVE');
  return (
    <div className="provider-clinic-tab">
      <section className="provider-tab-toolbar">
        <div>
          <h2>Đội ngũ và quyền truy cập</h2>
          <p>
            {activeMembers.length} thành viên hoạt động · {data.team.invitations.length} lời mời
            đang chờ
          </p>
        </div>
        <button className="provider-primary-button" onClick={onInvite} type="button">
          <ProviderIcon name="plus" /> Mời thành viên
        </button>
      </section>
      <section className="provider-panel provider-team-table">
        <header className="provider-data-table-head">
          <span>Thành viên</span>
          <span>Vai trò</span>
          <span>Phạm vi</span>
          <span>Bảo mật</span>
          <span>Trạng thái</span>
        </header>
        {data.team.members.map((member) => (
          <TeamMemberRow key={member.membershipId} member={member} />
        ))}
        {!data.team.members.length ? (
          <EmptyState
            title="Chưa có thành viên"
            description="Mời thành viên đầu tiên để bắt đầu phân quyền vận hành."
          />
        ) : null}
      </section>
      {data.team.invitations.length ? (
        <section className="provider-panel provider-pending-invitations">
          <header className="provider-panel-header">
            <div>
              <span>
                <h2>Lời mời đang chờ</h2>
                <p>Quyền chỉ có hiệu lực sau khi người nhận chấp nhận lời mời.</p>
              </span>
            </div>
          </header>
          {data.team.invitations.map((invitation) => (
            <div key={invitation.id}>
              <span className="provider-avatar provider-avatar--attention">
                {initials(invitation.email)}
              </span>
              <div>
                <strong>{invitation.email}</strong>
                <small>
                  {roleLabel(invitation.role)} · {invitation.permissions.length} quyền
                </small>
              </div>
              <time>Hết hạn {formatDate(invitation.expiresAt)}</time>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function TeamMemberRow({ member }: { readonly member: ClinicTeamMemberView }) {
  return (
    <article className="provider-data-table-row provider-team-row">
      <span className="provider-avatar provider-avatar--blue">{initials(member.email)}</span>
      <div>
        <strong>{member.email}</strong>
        <small>{member.jobTitle || 'Chưa đặt chức danh'}</small>
      </div>
      <span>{roleLabel(member.role)}</span>
      <span>
        {member.locationIds.length ? `${member.locationIds.length} cơ sở` : 'Toàn tổ chức'}
      </span>
      <span
        className={
          member.mfaEnabled ? 'provider-security-state is-ok' : 'provider-security-state is-warning'
        }
      >
        <ProviderIcon name={member.mfaEnabled ? 'shield' : 'alert'} />
        {member.mfaEnabled ? 'MFA đã bật' : 'Chưa bật MFA'}
      </span>
      <span
        className={`provider-status provider-status--${member.status === 'ACTIVE' ? 'success' : 'attention'}`}
      >
        {labelStatus(member.status)}
      </span>
    </article>
  );
}

function ServicesTab({
  data,
  onPublish,
  onArchive,
}: {
  readonly data: ProviderClinicData;
  readonly onPublish: () => void;
  readonly onArchive: (service: ClinicServiceView) => void;
}) {
  const active = data.services.services.filter((item) => item.active);
  return (
    <div className="provider-clinic-tab">
      <section className="provider-tab-toolbar">
        <div>
          <h2>Dịch vụ và khoảng giá</h2>
          <p>{active.length} dịch vụ đang công bố · Giá theo phiên bản, không sửa ngược lịch sử.</p>
        </div>
        <button
          className="provider-primary-button"
          disabled={!data.services.catalog.length}
          onClick={onPublish}
          type="button"
        >
          <ProviderIcon name="plus" /> Công bố dịch vụ
        </button>
      </section>
      <section className="provider-service-grid">
        {data.services.services.map((service) => {
          const version = currentServiceVersion(service);
          return (
            <article className="provider-panel provider-service-card" key={service.id}>
              <header>
                <span className="provider-service-icon">
                  <ProviderIcon name="services" />
                </span>
                <span
                  className={`provider-status provider-status--${service.active ? 'success' : 'neutral'}`}
                >
                  {service.active ? 'Đang công bố' : 'Đã lưu trữ'}
                </span>
              </header>
              <div>
                <small>{service.procedureCode}</small>
                <h3>
                  {service.displayNames['vi-VN'] ??
                    service.displayNames['en-US'] ??
                    humanize(service.procedureCode)}
                </h3>
                <p>{service.displayNames['en-US'] ?? 'Chưa có tên tiếng Anh'}</p>
              </div>
              {version ? (
                <dl>
                  <div>
                    <dt>Khoảng giá</dt>
                    <dd>
                      {formatCurrency(version.minimumMinor, version.currency)} –{' '}
                      {formatCurrency(version.maximumMinor, version.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Vật liệu / thương hiệu</dt>
                    <dd>
                      {[...version.materialOptions, ...version.brandOptions]
                        .slice(0, 3)
                        .join(', ') || 'Theo tư vấn lâm sàng'}
                    </dd>
                  </div>
                  <div>
                    <dt>Hiệu lực</dt>
                    <dd>{formatDate(version.effectiveAt)}</dd>
                  </div>
                </dl>
              ) : (
                <p>Chưa có phiên bản giá.</p>
              )}
              <footer>
                <span>{service.versions.length} phiên bản</span>
                {service.active ? (
                  <button onClick={() => onArchive(service)} type="button">
                    Ngừng công bố
                  </button>
                ) : null}
              </footer>
            </article>
          );
        })}
        {!data.services.services.length ? (
          <section className="provider-panel">
            <EmptyState
              title="Chưa công bố dịch vụ"
              description="Chọn một dịch vụ trong danh mục và khai báo khoảng giá minh bạch."
              action="Công bố dịch vụ"
              onAction={onPublish}
            />
          </section>
        ) : null}
      </section>
    </div>
  );
}

function AvailabilityTab({
  data,
  onCreateRule,
  onEditPolicy,
}: {
  readonly data: ProviderClinicData;
  readonly onCreateRule: () => void;
  readonly onEditPolicy: () => void;
}) {
  const policy = data.availability.policy;
  return (
    <div className="provider-clinic-tab">
      <section className="provider-tab-toolbar">
        <div>
          <h2>Availability và chính sách đặt lịch</h2>
          <p>Capacity công bố được kiểm tra cùng lịch hẹn, thời gian khóa và timezone.</p>
        </div>
        <div>
          <button
            className="provider-secondary-button"
            disabled={!policy}
            onClick={onEditPolicy}
            type="button"
          >
            <ProviderIcon name="settings" /> Chính sách
          </button>
          <button
            className="provider-primary-button"
            disabled={!data.onboarding.locations.length}
            onClick={onCreateRule}
            type="button"
          >
            <ProviderIcon name="plus" /> Thêm khung lịch
          </button>
        </div>
      </section>
      <div className="provider-availability-grid">
        <section className="provider-panel provider-rules-panel">
          <header className="provider-panel-header">
            <div>
              <span className="provider-panel-icon provider-panel-icon--blue">
                <ProviderIcon name="calendar" />
              </span>
              <span>
                <h2>Khung lịch công bố</h2>
                <p>
                  {data.availability.rules.filter((item) => item.active).length} quy tắc đang hoạt
                  động
                </p>
              </span>
            </div>
          </header>
          {data.availability.rules.length ? (
            data.availability.rules.map((rule) => (
              <article key={rule.id}>
                <span className="provider-weekday">{weekdayLabel(rule.dayOfWeek)}</span>
                <div>
                  <strong>
                    {rule.startsAtLocal}–{rule.endsAtLocal}
                  </strong>
                  <small>
                    {humanize(rule.slotKind)} · {rule.procedureDurationMinutes} phút
                  </small>
                </div>
                <div>
                  <strong>{rule.capacity} slot</strong>
                  <small>
                    {data.dentists.find((item) => item.id === rule.dentistId)?.fullName ??
                      'Toàn phòng khám'}
                  </small>
                </div>
                <span
                  className={`provider-status provider-status--${rule.active ? 'success' : 'neutral'}`}
                >
                  {rule.active ? 'Hoạt động' : 'Tạm dừng'}
                </span>
              </article>
            ))
          ) : (
            <EmptyState
              title="Chưa có khung lịch"
              description="Tạo capacity đầu tiên để hệ thống có thể kiểm tra thời gian phù hợp."
              action="Thêm khung lịch"
              onAction={onCreateRule}
            />
          )}
        </section>
        <aside className="provider-availability-aside">
          <section className="provider-panel provider-policy-card">
            <header>
              <span>
                <ProviderIcon name="settings" />
              </span>
              <div>
                <h2>Chính sách đặt lịch</h2>
                <p>{policy ? `Phiên bản ${policy.version}` : 'Chưa cấu hình'}</p>
              </div>
            </header>
            {policy ? (
              <dl>
                <div>
                  <dt>Báo trước tối thiểu</dt>
                  <dd>{Math.round(policy.minimumNoticeMinutes / 60)} giờ</dd>
                </div>
                <div>
                  <dt>Đặt trước tối đa</dt>
                  <dd>{policy.maximumAdvanceDays} ngày</dd>
                </div>
                <div>
                  <dt>Hủy trước</dt>
                  <dd>{Math.round(policy.cancellationCutoffMinutes / 60)} giờ</dd>
                </div>
                <div>
                  <dt>Overbooking</dt>
                  <dd>{policy.overbookingAllowed ? 'Cho phép' : 'Không'}</dd>
                </div>
              </dl>
            ) : null}
            <button disabled={!policy} onClick={onEditPolicy} type="button">
              Chỉnh sửa chính sách
            </button>
          </section>
          <section className="provider-panel provider-calendar-connections">
            <header>
              <h2>Đồng bộ lịch</h2>
              <span>{data.availability.calendarConnections.length}</span>
            </header>
            {data.availability.calendarConnections.length ? (
              data.availability.calendarConnections.map((connection) => (
                <div key={connection.id}>
                  <span className={connection.status === 'ACTIVE' ? 'is-ok' : 'is-warning'}>
                    <ProviderIcon name={connection.status === 'ACTIVE' ? 'check' : 'alert'} />
                  </span>
                  <div>
                    <strong>{humanize(connection.provider)}</strong>
                    <small>
                      {connection.lastSyncedAt
                        ? `Đồng bộ ${formatDateTime(connection.lastSyncedAt)}`
                        : 'Chưa đồng bộ'}
                    </small>
                  </div>
                  <em>{labelStatus(connection.status)}</em>
                </div>
              ))
            ) : (
              <p>Chưa kết nối lịch ngoài. Lịch nội bộ vẫn hoạt động bình thường.</p>
            )}
          </section>
          <section className="provider-panel provider-calendar-connections">
            <header>
              <h2>Thời gian khóa</h2>
              <span>{data.availability.blocks.length}</span>
            </header>
            {data.availability.blocks.slice(0, 4).map((block) => (
              <div key={block.id}>
                <span className="is-warning">
                  <ProviderIcon name="clock" />
                </span>
                <div>
                  <strong>{block.reason}</strong>
                  <small>
                    {formatDateTime(block.startsAt)} – {formatDateTime(block.endsAt)}
                  </small>
                </div>
                <em>{humanize(block.kind)}</em>
              </div>
            ))}
            {!data.availability.blocks.length ? (
              <p>Không có thời gian khóa đang ghi nhận.</p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function AnalyticsTab({ data }: { readonly data: ProviderClinicData }) {
  const { metrics } = data.analytics;
  const rates = [
    ['Tư vấn → phương án', metrics.consultationConversionRate],
    ['Phương án → đặt lịch', metrics.bookingConversionRate],
    ['Hoàn tất điều trị', metrics.treatmentCompletionRate],
    ['SLA hậu mãi', metrics.aftercareResponseSlaRate],
  ] as const;
  return (
    <div className="provider-clinic-tab">
      <section className="provider-tab-toolbar">
        <div>
          <h2>Hiệu suất phòng khám</h2>
          <p>
            {data.analytics.periodDays} ngày gần nhất · cập nhật{' '}
            {formatDateTime(data.analytics.generatedAt)}
          </p>
        </div>
      </section>
      <section className="provider-analytics-metrics">
        <article className="provider-panel">
          <small>Ca mới</small>
          <strong>{metrics.newCases}</strong>
          <span>Trong kỳ báo cáo</span>
        </article>
        <article className="provider-panel">
          <small>Phản hồi trung bình</small>
          <strong>
            {metrics.averageResponseHours === null
              ? '—'
              : `${metrics.averageResponseHours.toFixed(1)}h`}
          </strong>
          <span>Từ lúc nhận ca</span>
        </article>
        <article className="provider-panel">
          <small>Đánh giá xác minh</small>
          <strong>
            {metrics.averageVerifiedRating === null
              ? '—'
              : metrics.averageVerifiedRating.toFixed(1)}
          </strong>
          <span>{metrics.verifiedReviewCount} đánh giá</span>
        </article>
        <article className="provider-panel">
          <small>Sự cố</small>
          <strong>{formatPercent(metrics.incidentRate)}</strong>
          <span>Tỷ lệ trên ca điều trị</span>
        </article>
      </section>
      <div className="provider-analytics-grid">
        <section className="provider-panel provider-funnel-card">
          <header className="provider-panel-header">
            <div>
              <span>
                <h2>Chuyển đổi hành trình</h2>
                <p>Tỷ lệ được tính trên cohort đủ dữ liệu trong kỳ.</p>
              </span>
            </div>
          </header>
          <div>
            {rates.map(([label, value]) => (
              <div key={label}>
                <span>
                  <strong>{label}</strong>
                  <em>{formatPercent(value)}</em>
                </span>
                <i>
                  <b style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
                </i>
              </div>
            ))}
          </div>
        </section>
        <aside className="provider-panel provider-quality-card">
          <header>
            <span>
              <ProviderIcon name="shield" />
            </span>
            <div>
              <h2>Chất lượng vận hành</h2>
              <p>Các chỉ số guardrail</p>
            </div>
          </header>
          <dl>
            <div>
              <dt>Sai lệch chi phí</dt>
              <dd>{formatPercent(metrics.averageCostVarianceRate)}</dd>
            </div>
            <div>
              <dt>Sai lệch lịch</dt>
              <dd>
                {metrics.averageScheduleVarianceHours === null
                  ? '—'
                  : `${metrics.averageScheduleVarianceHours.toFixed(1)} giờ`}
              </dd>
            </div>
            <div>
              <dt>Tỷ lệ bảo hành</dt>
              <dd>{formatPercent(metrics.warrantyRate)}</dd>
            </div>
            <div>
              <dt>Hết hạn xác minh</dt>
              <dd>{formatDate(metrics.nextVerificationExpiry)}</dd>
            </div>
          </dl>
          {data.analytics.unavailableMetrics.length ? (
            <p>
              <ProviderIcon name="alert" /> {data.analytics.unavailableMetrics.length} chỉ số chưa
              đủ dữ liệu.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function SecurityTab({ data }: { readonly data: ProviderClinicData }) {
  const active = data.team.members.filter((item) => item.status === 'ACTIVE');
  const mfaCoverage = active.length
    ? active.filter((item) => item.mfaEnabled).length / active.length
    : null;
  return (
    <div className="provider-clinic-tab">
      <section className="provider-tab-toolbar">
        <div>
          <h2>Bảo mật và nhật ký truy cập</h2>
          <p>Kiểm tra posture của đội ngũ và hoạt động đặc quyền trong phạm vi tổ chức.</p>
        </div>
      </section>
      <section className="provider-security-overview">
        <article className="provider-panel">
          <span className="is-ok">
            <ProviderIcon name="shield" />
          </span>
          <div>
            <small>MFA coverage</small>
            <strong>{formatPercent(mfaCoverage)}</strong>
            <p>
              {active.filter((item) => !item.mfaEnabled).length} tài khoản hoạt động chưa bật MFA
            </p>
          </div>
        </article>
        <article className="provider-panel">
          <span className={data.overview.openIncidents ? 'is-warning' : 'is-ok'}>
            <ProviderIcon name={data.overview.openIncidents ? 'alert' : 'check'} />
          </span>
          <div>
            <small>Sự cố đang mở</small>
            <strong>{data.overview.openIncidents}</strong>
            <p>
              {data.overview.openIncidents
                ? 'Cần rà soát theo quy trình sự cố'
                : 'Không có sự cố cần xử lý'}
            </p>
          </div>
        </article>
        <article className="provider-panel">
          <span className="is-ok">
            <ProviderIcon name="document" />
          </span>
          <div>
            <small>Hoạt động ghi nhận</small>
            <strong>{data.team.activity.length}</strong>
            <p>Nhật ký gần nhất trong phạm vi truy vấn</p>
          </div>
        </article>
      </section>
      <section className="provider-panel provider-audit-log">
        <header className="provider-panel-header">
          <div>
            <span>
              <h2>Nhật ký hoạt động</h2>
              <p>Thao tác quản trị và kết quả thực thi.</p>
            </span>
          </div>
        </header>
        <header className="provider-data-table-head">
          <span>Thời gian</span>
          <span>Hành động</span>
          <span>Tài nguyên</span>
          <span>Kết quả</span>
        </header>
        {data.team.activity.length ? (
          data.team.activity.slice(0, 25).map((activity) => (
            <article key={activity.id}>
              <time>{formatDateTime(activity.createdAt)}</time>
              <strong>{humanize(activity.action)}</strong>
              <span>{humanize(activity.resourceType)}</span>
              <span
                className={`provider-status provider-status--${activity.success ? 'success' : 'urgent'}`}
              >
                {activity.success ? 'Thành công' : 'Thất bại'}
              </span>
            </article>
          ))
        ) : (
          <EmptyState
            title="Chưa có hoạt động"
            description="Nhật ký quản trị sẽ xuất hiện tại đây."
          />
        )}
      </section>
    </div>
  );
}

function ProfileDialog({
  data,
  open,
  pending,
  onClose,
  onSubmit,
}: DialogProps & {
  readonly data: ProviderClinicData;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const onboarding = data.onboarding;
  const contact = onboarding.businessContact;
  const policy = onboarding.aftercarePolicy as {
    responseTargetHours?: number;
    emergencyProtocol?: string;
    remoteFollowUpAvailable?: boolean;
  } | null;
  return (
    <ProviderDialog
      description="Thông tin pháp lý và chính sách hậu mãi sẽ được lưu theo phiên bản onboarding."
      onClose={onClose}
      open={open}
      title="Cập nhật hồ sơ phòng khám"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({
            expectedVersion: onboarding.version,
            legalEntityName: String(form.get('legalEntityName')),
            registrationNumber: String(form.get('registrationNumber')),
            registrationCountry: String(form.get('registrationCountry')).toUpperCase(),
            businessContact: {
              contactName: String(form.get('contactName')),
              email: String(form.get('email')),
              phone: String(form.get('phone')),
              ...(String(form.get('website')).trim()
                ? { website: String(form.get('website')).trim() }
                : {}),
            },
            responsibleClinicalLeaderDentistId: String(form.get('leaderId')),
            aftercarePolicy: {
              responseTargetHours: Number(form.get('responseTargetHours')),
              emergencyProtocol: String(form.get('emergencyProtocol')),
              remoteFollowUpAvailable: form.get('remoteFollowUpAvailable') === 'on',
            },
          });
        }}
      >
        <label className="is-wide">
          <span>Tên pháp nhân</span>
          <input
            defaultValue={onboarding.legalEntityName}
            maxLength={200}
            name="legalEntityName"
            required
          />
        </label>
        <label>
          <span>Số đăng ký</span>
          <input
            defaultValue={onboarding.registrationNumber ?? ''}
            maxLength={100}
            name="registrationNumber"
            required
          />
        </label>
        <label>
          <span>Quốc gia đăng ký</span>
          <input
            defaultValue={onboarding.registrationCountry ?? 'VN'}
            maxLength={2}
            minLength={2}
            name="registrationCountry"
            required
          />
        </label>
        <label>
          <span>Người liên hệ</span>
          <input
            defaultValue={contact?.contactName ?? ''}
            maxLength={160}
            name="contactName"
            required
          />
        </label>
        <label>
          <span>Email</span>
          <input
            defaultValue={contact?.email ?? ''}
            maxLength={254}
            name="email"
            required
            type="email"
          />
        </label>
        <label>
          <span>Số điện thoại</span>
          <input
            defaultValue={contact?.phone ?? ''}
            maxLength={32}
            minLength={7}
            name="phone"
            required
          />
        </label>
        <label>
          <span>Website</span>
          <input defaultValue={contact?.website ?? ''} name="website" type="url" />
        </label>
        <label>
          <span>Phụ trách lâm sàng</span>
          <CustomSelect
            defaultValue={
              onboarding.responsibleClinicalLeaderDentistId ??
              data.dentists.find((item) => item.active)?.id
            }
            name="leaderId"
            required
          >
            {data.dentists
              .filter((item) => item.active)
              .map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.fullName}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>SLA hậu mãi</span>
          <input
            defaultValue={policy?.responseTargetHours ?? 24}
            max={168}
            min={1}
            name="responseTargetHours"
            required
            type="number"
          />
        </label>
        <label className="is-wide">
          <span>Quy trình khẩn cấp</span>
          <textarea
            defaultValue={
              policy?.emergencyProtocol ??
              'Liên hệ đầu mối lâm sàng, phân loại mức độ và phản hồi bệnh nhân theo SLA.'
            }
            maxLength={2000}
            name="emergencyProtocol"
            required
            rows={4}
          />
        </label>
        <label className="provider-checkbox is-wide">
          <input
            defaultChecked={policy?.remoteFollowUpAvailable ?? true}
            name="remoteFollowUpAvailable"
            type="checkbox"
          />
          <span>Có hỗ trợ theo dõi từ xa</span>
        </label>
        <FormFooter onClose={onClose} pending={pending} submitLabel="Lưu hồ sơ" />
      </form>
    </ProviderDialog>
  );
}

function InviteDialog({
  data,
  open,
  pending,
  onClose,
  onSubmit,
}: DialogProps & {
  readonly data: ProviderClinicData;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <ProviderDialog
      description="Chọn đúng phạm vi cơ sở và quyền tối thiểu cần thiết. Người nhận phải chấp nhận lời mời."
      onClose={onClose}
      open={open}
      title="Mời thành viên"
    >
      <form
        className="provider-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({
            email: String(form.get('email')),
            role: String(form.get('role')),
            jobTitle: String(form.get('jobTitle')) || undefined,
            locationIds: form.getAll('locationIds').map(String),
            permissions: form.getAll('permissions').map(String),
          });
        }}
      >
        <label>
          <span>Email công việc</span>
          <input maxLength={254} name="email" required type="email" />
        </label>
        <div className="provider-form-row">
          <label>
            <span>Vai trò</span>
            <CustomSelect defaultValue="DENTIST" name="role">
              <option value="DENTIST">Nha sĩ</option>
              <option value="CLINIC_STAFF">Nhân viên phòng khám</option>
              <option value="CLINIC_ADMIN">Quản trị phòng khám</option>
            </CustomSelect>
          </label>
          <label>
            <span>Chức danh</span>
            <input maxLength={160} name="jobTitle" placeholder="VD: Treatment coordinator" />
          </label>
        </div>
        <fieldset>
          <legend>Phạm vi cơ sở</legend>
          <div className="provider-check-grid">
            {data.onboarding.locations.map((location) => (
              <label className="provider-checkbox" key={location.id}>
                <input defaultChecked name="locationIds" type="checkbox" value={location.id} />
                <span>{location.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Quyền thao tác</legend>
          <div className="provider-check-grid">
            {Object.entries(permissionLabels).map(([permission, label]) => (
              <label className="provider-checkbox" key={permission}>
                <input
                  defaultChecked={['CASE_INBOX', 'TREATMENT_PLAN', 'SCHEDULING'].includes(
                    permission,
                  )}
                  name="permissions"
                  type="checkbox"
                  value={permission}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <FormFooter onClose={onClose} pending={pending} submitLabel="Gửi lời mời" />
      </form>
    </ProviderDialog>
  );
}

function ServiceDialog({
  data,
  open,
  pending,
  onClose,
  onSubmit,
}: DialogProps & {
  readonly data: ProviderClinicData;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <ProviderDialog
      description="Khoảng giá là thông tin minh bạch ban đầu; phương án điều trị vẫn cần đánh giá lâm sàng riêng."
      onClose={onClose}
      open={open}
      title="Công bố dịch vụ"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const displayName = String(form.get('displayName'));
          onSubmit({
            procedureDefinitionId: String(form.get('procedureDefinitionId')),
            displayNames: { 'vi-VN': displayName, 'en-US': String(form.get('displayNameEn')) },
            includedServices: splitList(String(form.get('includedServices'))),
            exclusions: splitList(String(form.get('exclusions'))),
            estimatedDurationDays: Number(form.get('durationDays')),
            warrantyPolicy: {
              name: 'Chính sách bảo hành tiêu chuẩn',
              terms: { note: String(form.get('warrantyTerms')) },
            },
            minimumMinor: toMinor(Number(form.get('minimum')), String(form.get('currency'))),
            maximumMinor: toMinor(Number(form.get('maximum')), String(form.get('currency'))),
            currency: String(form.get('currency')),
            materialOptions: splitList(String(form.get('materials'))),
            brandOptions: splitList(String(form.get('brands'))),
            effectiveAt: new Date().toISOString(),
          });
        }}
      >
        <label className="is-wide">
          <span>Dịch vụ trong danh mục</span>
          <CustomSelect name="procedureDefinitionId" required>
            {data.services.catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.names['vi-VN'] ?? item.names['en-US'] ?? humanize(item.code)}
              </option>
            ))}
          </CustomSelect>
        </label>
        <label>
          <span>Tên tiếng Việt</span>
          <input maxLength={160} name="displayName" required />
        </label>
        <label>
          <span>Tên tiếng Anh</span>
          <input maxLength={160} name="displayNameEn" required />
        </label>
        <label>
          <span>Giá từ</span>
          <input min={0} name="minimum" required step="0.01" type="number" />
        </label>
        <label>
          <span>Giá đến</span>
          <input min={0} name="maximum" required step="0.01" type="number" />
        </label>
        <label>
          <span>Tiền tệ</span>
          <CustomSelect defaultValue="VND" name="currency">
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </CustomSelect>
        </label>
        <label>
          <span>Thời lượng dự kiến</span>
          <input defaultValue={3} max={365} min={1} name="durationDays" required type="number" />
        </label>
        <label className="is-wide">
          <span>Dịch vụ bao gồm</span>
          <textarea
            name="includedServices"
            placeholder="Khám, chụp phim, tái khám"
            required
            rows={3}
          />
        </label>
        <label className="is-wide">
          <span>Không bao gồm</span>
          <textarea name="exclusions" placeholder="Vé máy bay, lưu trú" required rows={3} />
        </label>
        <label>
          <span>Vật liệu</span>
          <input name="materials" placeholder="Titanium, Zirconia" />
        </label>
        <label>
          <span>Thương hiệu</span>
          <input name="brands" placeholder="Nobel Biocare, Straumann" />
        </label>
        <label className="is-wide">
          <span>Điều khoản bảo hành</span>
          <textarea maxLength={1000} name="warrantyTerms" required rows={3} />
        </label>
        <FormFooter onClose={onClose} pending={pending} submitLabel="Công bố dịch vụ" />
      </form>
    </ProviderDialog>
  );
}

function AvailabilityRuleDialog({
  data,
  open,
  pending,
  onClose,
  onSubmit,
}: DialogProps & {
  readonly data: ProviderClinicData;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <ProviderDialog
      description="Khung lịch biểu thị capacity có thể nhận ca, không phải lịch hẹn cụ thể."
      onClose={onClose}
      open={open}
      title="Thêm khung lịch"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const dentistId = String(form.get('dentistId'));
          onSubmit({
            locationId: String(form.get('locationId')),
            ...(dentistId ? { dentistId } : {}),
            slotKind: String(form.get('slotKind')),
            dayOfWeek: Number(form.get('dayOfWeek')),
            startsAtLocal: String(form.get('startsAtLocal')),
            endsAtLocal: String(form.get('endsAtLocal')),
            timezone: String(form.get('timezone')),
            capacity: Number(form.get('capacity')),
            procedureDurationMinutes: Number(form.get('duration')),
            effectiveFrom: String(form.get('effectiveFrom')),
            active: true,
          });
        }}
      >
        <label>
          <span>Cơ sở</span>
          <CustomSelect name="locationId" required>
            {data.onboarding.locations
              .filter((item) => item.active)
              .map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>Nha sĩ (tùy chọn)</span>
          <CustomSelect defaultValue="" name="dentistId">
            <option value="">Toàn phòng khám</option>
            {data.dentists
              .filter((item) => item.active)
              .map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.fullName}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>Loại slot</span>
          <CustomSelect defaultValue="BOTH" name="slotKind">
            <option value="BOTH">Tư vấn & điều trị</option>
            <option value="CONSULTATION">Tư vấn</option>
            <option value="TREATMENT">Điều trị</option>
          </CustomSelect>
        </label>
        <label>
          <span>Thứ</span>
          <CustomSelect defaultValue="1" name="dayOfWeek">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <option key={day} value={day}>
                {weekdayLabel(day)}
              </option>
            ))}
          </CustomSelect>
        </label>
        <label>
          <span>Bắt đầu</span>
          <input defaultValue="08:30" name="startsAtLocal" required type="time" />
        </label>
        <label>
          <span>Kết thúc</span>
          <input defaultValue="17:30" name="endsAtLocal" required type="time" />
        </label>
        <label>
          <span>Capacity</span>
          <input defaultValue={1} max={100} min={1} name="capacity" required type="number" />
        </label>
        <label>
          <span>Thời lượng mặc định</span>
          <input
            defaultValue={60}
            max={720}
            min={15}
            name="duration"
            required
            step={15}
            type="number"
          />
        </label>
        <label>
          <span>Timezone</span>
          <input defaultValue="Asia/Ho_Chi_Minh" name="timezone" required />
        </label>
        <label>
          <span>Hiệu lực từ</span>
          <input defaultValue={todayDateKey()} name="effectiveFrom" required type="date" />
        </label>
        <FormFooter onClose={onClose} pending={pending} submitLabel="Tạo khung lịch" />
      </form>
    </ProviderDialog>
  );
}

function PolicyDialog({
  data,
  open,
  pending,
  onClose,
  onSubmit,
}: DialogProps & {
  readonly data: ProviderClinicData;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const policy = data.availability.policy;
  return (
    <ProviderDialog
      description="Chính sách được áp dụng cho kiểm tra lịch mới và thay đổi lịch."
      onClose={onClose}
      open={open}
      title="Chính sách đặt lịch"
    >
      {policy ? (
        <form
          className="provider-form provider-form--grid"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSubmit({
              expectedVersion: policy.version,
              minimumNoticeMinutes: Number(form.get('minimumNoticeHours')) * 60,
              maximumAdvanceDays: Number(form.get('maximumAdvanceDays')),
              rescheduleCutoffMinutes: Number(form.get('rescheduleCutoffHours')) * 60,
              cancellationCutoffMinutes: Number(form.get('cancellationCutoffHours')) * 60,
              defaultConsultationMinutes: Number(form.get('consultationMinutes')),
              defaultTreatmentMinutes: Number(form.get('treatmentMinutes')),
              overbookingAllowed: form.get('overbookingAllowed') === 'on',
            });
          }}
        >
          <label>
            <span>Báo trước tối thiểu (giờ)</span>
            <input
              defaultValue={policy.minimumNoticeMinutes / 60}
              max={720}
              min={0}
              name="minimumNoticeHours"
              required
              type="number"
            />
          </label>
          <label>
            <span>Đặt trước tối đa (ngày)</span>
            <input
              defaultValue={policy.maximumAdvanceDays}
              max={730}
              min={1}
              name="maximumAdvanceDays"
              required
              type="number"
            />
          </label>
          <label>
            <span>Đổi lịch trước (giờ)</span>
            <input
              defaultValue={policy.rescheduleCutoffMinutes / 60}
              max={720}
              min={0}
              name="rescheduleCutoffHours"
              required
              type="number"
            />
          </label>
          <label>
            <span>Hủy trước (giờ)</span>
            <input
              defaultValue={policy.cancellationCutoffMinutes / 60}
              max={720}
              min={0}
              name="cancellationCutoffHours"
              required
              type="number"
            />
          </label>
          <label>
            <span>Tư vấn mặc định (phút)</span>
            <input
              defaultValue={policy.defaultConsultationMinutes}
              max={480}
              min={15}
              name="consultationMinutes"
              required
              step={15}
              type="number"
            />
          </label>
          <label>
            <span>Điều trị mặc định (phút)</span>
            <input
              defaultValue={policy.defaultTreatmentMinutes}
              max={720}
              min={15}
              name="treatmentMinutes"
              required
              step={15}
              type="number"
            />
          </label>
          <label className="provider-checkbox is-wide">
            <input
              defaultChecked={policy.overbookingAllowed}
              name="overbookingAllowed"
              type="checkbox"
            />
            <span>Cho phép overbooking có kiểm soát</span>
          </label>
          <FormFooter onClose={onClose} pending={pending} submitLabel="Lưu chính sách" />
        </form>
      ) : (
        <EmptyState
          title="Chưa có chính sách"
          description="Chính sách cần được khởi tạo từ hệ thống vận hành trước khi chỉnh sửa."
        />
      )}
    </ProviderDialog>
  );
}

function SubmitDialog({
  onboarding,
  open,
  pending,
  onClose,
  onSubmit,
}: DialogProps & {
  readonly onboarding: ClinicOnboardingView;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <ProviderDialog
      description="Bằng việc gửi hồ sơ, người phụ trách xác nhận thông tin là chính xác và có thể được kiểm chứng."
      onClose={onClose}
      open={open}
      title="Gửi hồ sơ xác minh"
    >
      <form
        className="provider-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({
            expectedVersion: onboarding.version,
            attestation: String(form.get('attestation')),
          });
        }}
      >
        <label>
          <span>Xác nhận của người phụ trách</span>
          <textarea
            defaultValue="Tôi xác nhận thông tin phòng khám, năng lực chuyên môn và chính sách công bố là chính xác tại thời điểm gửi."
            maxLength={2000}
            minLength={20}
            name="attestation"
            required
            rows={6}
          />
        </label>
        <FormFooter onClose={onClose} pending={pending} submitLabel="Xác nhận và gửi" />
      </form>
    </ProviderDialog>
  );
}

function ArchiveDialog({
  service,
  open,
  pending,
  onClose,
  onSubmit,
}: DialogProps & {
  readonly service: ClinicServiceView | null;
  readonly onSubmit: (reason: string) => void;
}) {
  return (
    <ProviderDialog
      description="Dịch vụ sẽ ngừng xuất hiện cho ca mới. Phiên bản đã dùng trong hồ sơ cũ không bị thay đổi."
      onClose={onClose}
      open={open}
      title="Ngừng công bố dịch vụ"
    >
      <form
        className="provider-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit(String(form.get('reason')));
        }}
      >
        <p className="provider-dialog-callout">
          <strong>{service?.displayNames['vi-VN'] ?? service?.procedureCode}</strong>
          <span>Hành động này được ghi vào nhật ký quản trị.</span>
        </p>
        <label>
          <span>Lý do</span>
          <textarea maxLength={500} minLength={1} name="reason" required rows={4} />
        </label>
        <FormFooter danger onClose={onClose} pending={pending} submitLabel="Ngừng công bố" />
      </form>
    </ProviderDialog>
  );
}

interface DialogProps {
  readonly open: boolean;
  readonly pending: boolean;
  readonly onClose: () => void;
}

function FormFooter({
  onClose,
  pending,
  submitLabel,
  danger = false,
}: {
  readonly onClose: () => void;
  readonly pending: boolean;
  readonly submitLabel: string;
  readonly danger?: boolean;
}) {
  return (
    <footer>
      <button onClick={onClose} type="button">
        Hủy
      </button>
      <button className={danger ? 'is-danger' : ''} disabled={pending} type="submit">
        {pending ? 'Đang xử lý…' : submitLabel}
      </button>
    </footer>
  );
}

function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: string;
  readonly onAction?: () => void;
}) {
  return (
    <div className="provider-empty-state">
      <span>
        <ProviderIcon name="sparkle" />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action && onAction ? (
        <button onClick={onAction} type="button">
          {action}
        </button>
      ) : null}
    </div>
  );
}

function roleLabel(role: string): string {
  return role === 'CLINIC_ADMIN'
    ? 'Quản trị phòng khám'
    : role === 'CLINIC_STAFF'
      ? 'Nhân viên phòng khám'
      : 'Nha sĩ';
}
function verificationLabel(status: string): string {
  return status === 'VERIFIED' || status === 'APPROVED'
    ? 'Đã xác minh'
    : status === 'PENDING' || status === 'PENDING_REVIEW'
      ? 'Đang xác minh'
      : humanize(status);
}
function requirementLabel(requirement: string): string {
  const labels: Readonly<Record<string, string>> = {
    LEGAL_ENTITY: 'Thông tin pháp nhân',
    BUSINESS_CONTACT: 'Đầu mối liên hệ kinh doanh',
    LOCATION: 'Cơ sở hoạt động',
    CLINICAL_LEADER: 'Người phụ trách chuyên môn',
    OPERATING_LICENSE: 'Giấy phép hoạt động',
    PROFESSIONAL_LICENSE: 'Giấy phép hành nghề',
    DENTIST_ROSTER: 'Danh sách nha sĩ',
    STAFF: 'Nhân sự phòng khám',
    SERVICE_CAPABILITY: 'Năng lực dịch vụ',
    EQUIPMENT: 'Trang thiết bị',
    WARRANTY: 'Chính sách bảo hành',
    AFTERCARE: 'Chính sách hậu mãi',
    PAYOUT: 'Thông tin thanh toán',
    TERMS: 'Điều khoản tham gia',
    'DECLARATION:SCOPE_OF_PRACTICE': 'Phạm vi hành nghề',
    'DECLARATION:INFECTION_CONTROL_PROCESS': 'Quy trình kiểm soát nhiễm khuẩn',
    'DECLARATION:EMERGENCY_PROCEDURES': 'Quy trình xử lý khẩn cấp',
    'DECLARATION:MATERIAL_TRACEABILITY': 'Truy xuất vật liệu',
    'DECLARATION:CLINICAL_RECORD_PROCESS': 'Quy trình hồ sơ lâm sàng',
    'DECLARATION:INTERNATIONAL_PATIENT_SUPPORT': 'Hỗ trợ bệnh nhân quốc tế',
    'DECLARATION:ENGLISH_RECORDS_CAPABILITY': 'Khả năng cung cấp hồ sơ tiếng Anh',
  };
  return labels[requirement] ?? humanize(requirement);
}
function weekdayLabel(day: number): string {
  return day === 0 ? 'Chủ nhật' : `Thứ ${day + 1}`;
}
function todayDateKey(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}
function splitList(value: string): string[] {
  return value
    .split(/[,\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
function toMinor(value: number, currency: string): number {
  return currency === 'USD' ? Math.round(value * 100) : Math.round(value);
}
function currentServiceVersion(service: ClinicServiceView) {
  return (
    service.versions.toSorted((left, right) =>
      right.effectiveAt.localeCompare(left.effectiveAt),
    )[0] ?? null
  );
}
