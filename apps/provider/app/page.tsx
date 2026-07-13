import Link from 'next/link';

import { ProviderIcon, type ProviderIconName } from '@/components/provider-icon';
import { getProviderDashboard } from '@/lib/provider-data';
import {
  formatDateTime,
  formatPercent,
  initials,
  labelAction,
  labelStatus,
  relativeDue,
  toneForStatus,
} from '@/lib/presentation';

export default async function ProviderToday() {
  const data = await getProviderDashboard();
  const actionable = data.today.filter((item) => item.status !== 'CLOSED');
  const nextAppointments = data.today
    .flatMap((item) => (item.nextAppointment ? [{ caseItem: item, ...item.nextAppointment }] : []))
    .filter((item) => Date.parse(item.startsAt) >= Date.now())
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const next = nextAppointments[0];
  const aftercareCount = data.today.filter((item) => item.status === 'AFTERCARE_ACTIVE').length;
  const totalCapacity =
    data.availability?.rules
      .filter((rule) => rule.active)
      .reduce((sum, rule) => sum + rule.capacity, 0) ?? 0;
  const metrics: readonly {
    label: string;
    value: string;
    detail: string;
    icon: ProviderIconName;
    tone: string;
  }[] = [
    {
      label: 'Cần bạn xử lý',
      value: String(actionable.length),
      detail: `${actionable.filter((item) => item.urgency === 'URGENT').length} ca ưu tiên cao`,
      icon: 'alert',
      tone: 'coral',
    },
    {
      label: 'Lịch sắp tới',
      value: String(nextAppointments.length),
      detail: next ? `Tiếp theo ${formatDateTime(next.startsAt)}` : 'Chưa có lịch sắp tới',
      icon: 'calendar',
      tone: 'blue',
    },
    {
      label: 'Theo dõi sau điều trị',
      value: String(aftercareCount),
      detail: `${data.overview?.openIncidents ?? 0} sự cố đang mở`,
      icon: 'aftercare',
      tone: 'mint',
    },
  ];

  return (
    <main className="provider-main">
      <header className="provider-page-header">
        <div>
          <span className="provider-eyebrow">{todayLabel()}</span>
          <h1>Trung tâm công việc hôm nay</h1>
          <p>Triage theo SLA, tiếp tục ca đang xử lý và chuẩn bị lịch hẹn kế tiếp.</p>
        </div>
        <Link className="provider-primary-button" href="/schedule?create=1">
          <ProviderIcon name="plus" /> Tạo lịch hẹn
        </Link>
      </header>

      {data.unavailable.length ? (
        <section className="provider-inline-alert" role="status">
          <ProviderIcon name="alert" />
          <span>
            <strong>Một phần dữ liệu đang tạm thời không khả dụng</strong>
            <small>Các khu vực còn lại vẫn dùng được. Hãy tải lại trước khi ra quyết định.</small>
          </span>
        </section>
      ) : null}

      <section aria-label="Tổng quan hôm nay" className="provider-metric-grid">
        {metrics.map((metric) => (
          <article className={`provider-metric provider-metric--${metric.tone}`} key={metric.label}>
            <span className="provider-metric__icon">
              <ProviderIcon name={metric.icon} />
            </span>
            <span className="provider-metric__label">{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>
              <ProviderIcon name="trend" /> {metric.detail}
            </small>
          </article>
        ))}
      </section>

      <div className="provider-dashboard-grid">
        <section className="provider-panel provider-task-panel">
          <header className="provider-panel-header">
            <div>
              <span className="provider-panel-icon provider-panel-icon--coral">
                <ProviderIcon name="alert" />
              </span>
              <span>
                <h2>Hàng đợi lâm sàng</h2>
                <p>Ưu tiên theo mức độ khẩn cấp, blocker và thời hạn cam kết.</p>
              </span>
            </div>
            <Link href="/cases">
              Xem tất cả <ProviderIcon name="arrow" />
            </Link>
          </header>

          <div className="provider-task-list">
            {actionable.length ? (
              actionable.slice(0, 6).map((item) => {
                const tone = item.urgency === 'URGENT' ? 'urgent' : toneForStatus(item.status);
                return (
                  <Link
                    className="provider-task-row"
                    href={`/cases/${item.caseId}`}
                    key={item.caseId}
                  >
                    <span className={`provider-avatar provider-avatar--${tone}`}>
                      {initials(item.title)}
                    </span>
                    <span className="provider-task-patient">
                      <small>{item.caseNumber}</small>
                      <strong>{item.title}</strong>
                      <span>{labelStatus(item.status)}</span>
                    </span>
                    <span className="provider-task-owner">
                      <small>Phụ trách</small>
                      <strong>{item.owner?.displayName ?? 'Chưa phân công'}</strong>
                    </span>
                    <span className="provider-task-state">
                      <b className={`provider-status provider-status--${tone}`}>
                        {labelAction(item.primaryAction.code)}
                      </b>
                      <small>{relativeDue(item.expectedAt)}</small>
                    </span>
                    <ProviderIcon name="chevron" />
                  </Link>
                );
              })
            ) : (
              <div className="provider-empty-state">
                <span>
                  <ProviderIcon name="check" />
                </span>
                <strong>Hàng đợi đã được xử lý</strong>
                <p>Không có ca nào cần hành động ngay trong phạm vi của bạn.</p>
                <Link href="/cases">Xem toàn bộ hồ sơ</Link>
              </div>
            )}
          </div>
        </section>

        <aside className="provider-dashboard-rail">
          <section className="provider-panel provider-next-appointment">
            <header className="provider-panel-header provider-panel-header--compact">
              <div>
                <span className="provider-panel-icon provider-panel-icon--blue">
                  <ProviderIcon name="calendar" />
                </span>
                <span>
                  <h2>Lịch tiếp theo</h2>
                  <p>{next ? relativeDue(next.startsAt) : 'Không có lịch sắp tới'}</p>
                </span>
              </div>
              <Link aria-label="Xem toàn bộ lịch" href="/schedule">
                <ProviderIcon name="chevron" />
              </Link>
            </header>
            {next ? (
              <div className="provider-appointment-feature">
                <div className="provider-appointment-time">
                  <strong>
                    {new Intl.DateTimeFormat('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                      timeZone: 'Asia/Ho_Chi_Minh',
                    }).format(new Date(next.startsAt))}
                  </strong>
                  <small>{next.kind === 'CONSULTATION' ? 'Tư vấn' : 'Tại phòng khám'}</small>
                </div>
                <div>
                  <strong>{next.caseItem.title}</strong>
                  <p>{next.caseItem.caseNumber}</p>
                  <small>
                    <ProviderIcon name={next.kind === 'CONSULTATION' ? 'video' : 'clinic'} />{' '}
                    {labelStatus(next.status)}
                  </small>
                </div>
                <Link
                  className="provider-join-button"
                  href={`/cases/${next.caseItem.caseId}?tab=appointments`}
                >
                  <ProviderIcon name="arrow" /> Mở hồ sơ
                </Link>
              </div>
            ) : (
              <div className="provider-empty-state provider-empty-state--compact">
                <strong>Chưa có lịch hẹn</strong>
                <Link href="/schedule?create=1">Tạo lịch hẹn</Link>
              </div>
            )}
          </section>

          <section className="provider-panel provider-capacity-card">
            <header>
              <span>
                <ProviderIcon name="sparkle" />
              </span>
              <div>
                <h2>Nhịp phòng khám</h2>
                <p>{data.overview?.activeTeam ?? 0} thành viên đang hoạt động</p>
              </div>
            </header>
            <div>
              <span>
                <small>Capacity công bố</small>
                <strong>{totalCapacity || '—'}</strong>
              </span>
              <i>
                <b
                  style={{ width: totalCapacity ? `${Math.min(totalCapacity * 8, 100)}%` : '0%' }}
                />
              </i>
            </div>
            <div>
              <span>
                <small>SLA hậu mãi</small>
                <strong>
                  {formatPercent(data.analytics?.metrics.aftercareResponseSlaRate ?? null)}
                </strong>
              </span>
              <i>
                <b
                  style={{
                    width: `${Math.round((data.analytics?.metrics.aftercareResponseSlaRate ?? 0) * 100)}%`,
                  }}
                />
              </i>
            </div>
          </section>

          {data.overview?.onboarding && data.overview.onboarding.progressPercent < 100 ? (
            <section className="provider-panel provider-readiness-card">
              <span>{data.overview.onboarding.progressPercent}%</span>
              <div>
                <strong>Hoàn thiện hồ sơ phòng khám</strong>
                <small>
                  {data.overview.onboarding.missingRequirements.length} yêu cầu còn thiếu
                </small>
              </div>
              <Link href="/clinic?tab=overview">Tiếp tục</Link>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
    .format(new Date())
    .toUpperCase();
}
