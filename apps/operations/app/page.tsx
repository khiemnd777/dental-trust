import Link from 'next/link';

import { OperationsIcon } from '@/components/operations-icon';
import { OpsEmpty, OpsMetric, OpsPanelHeader, OpsStatus } from '@/components/operations-ui';
import { getOperationsOverview } from '@/lib/operations-data';
import { requireOperationsSession } from '@/lib/require-session';
import {
  auditActionLabel,
  auditResourceLabel,
  formatDateTime,
  humanize,
  isRoutineReadAuditAction,
  relativeDue,
} from '@/lib/presentation';

export default async function Overview() {
  const [data, session] = await Promise.all([getOperationsOverview(), requireOperationsSession()]);
  const administrator = session.roles.some((role) =>
    ['PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(role),
  );
  const landing = roleLanding(session.roles);
  const unavailableResources = new Set(data.issues.map(({ resource }) => resource));
  const degradedIssues = data.issues.filter(({ kind }) => kind !== 'authorization');
  const accessLimited = data.issues.length > 0 && degradedIssues.length === 0;
  const failedDeliveries = data.summary
    ? data.summary.failedOutboxEvents +
      data.summary.failedNotifications +
      data.summary.failedWebhooks
    : null;
  const healthLabel =
    data.availability === 'available'
      ? 'Hệ thống đang hoạt động'
      : accessLimited
        ? 'Dữ liệu theo phạm vi truy cập'
        : data.availability === 'partial'
          ? 'Dữ liệu đang bị gián đoạn'
          : 'Không thể kết nối dữ liệu';
  const resourceNote = (resource: (typeof data.issues)[number]['resource'], fallback: string) => {
    const issue = data.issues.find((candidate) => candidate.resource === resource);
    if (!issue) return fallback;
    return issue.kind === 'authorization'
      ? 'Ngoài phạm vi quyền hiện tại'
      : 'Nguồn dữ liệu chưa khả dụng';
  };
  const now = new Date().toISOString();
  const priorities = [
    ...data.coordinationQueue.map((item) => ({
      id: item.id,
      href: `/coordination?selected=${item.caseId}`,
      ref: item.case.caseNumber,
      subject: item.case.title,
      type: 'Điều phối',
      status: item.priority,
      due: relativeDue(item.slaDueAt),
      owner: item.assignedAgentUserId ? 'Đã phân công' : 'Chưa phân công',
      date: item.slaDueAt,
    })),
    ...data.verifications.map((item) => ({
      id: item.id,
      href: `/verification?selected=${item.id}`,
      ref: item.id.slice(0, 8).toUpperCase(),
      subject: item.subjectName,
      type: 'Xác minh',
      status: item.status,
      due: item.expiresAt ? relativeDue(item.expiresAt) : humanize(item.riskLevel),
      owner: item.assignedReviewerUserId ? 'Đã phân công' : 'Chưa phân công',
      date: item.expiresAt ?? item.updatedAt,
    })),
  ]
    .toSorted((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 8);
  const importantAudit = data.audit
    .filter((item) => !item.success || !isRoutineReadAuditAction(item.action))
    .slice(0, 6);

  return (
    <main className="ops-main">
      <header className="ops-page-header">
        <div>
          <span className="ops-eyebrow">Command center</span>
          <h1>Trung tâm vận hành</h1>
          <p>Ra quyết định từ ngoại lệ, SLA và bằng chứng — không từ dashboard trang trí.</p>
        </div>
        <div
          className={`ops-page-header__status${data.availability === 'available' ? '' : ' is-warning'}`}
        >
          <i />
          <span>
            <strong>{healthLabel}</strong>
            <small>
              {data.availability === 'available'
                ? `Cập nhật ${formatDateTime(now)}`
                : accessLimited
                  ? `${data.issues.length} nguồn bị giới hạn theo vai trò · ${formatDateTime(now)}`
                  : `${degradedIssues.length} nguồn chưa khả dụng · ${formatDateTime(now)}`}
            </small>
          </span>
        </div>
      </header>

      <section aria-label="Tổng quan vận hành" className="ops-metric-grid">
        <OpsMetric
          icon="coordination"
          label="Ca điều phối"
          note={resourceNote(
            'coordination-dashboard',
            `${data.coordination?.overdue ?? 0} ca quá SLA`,
          )}
          tone="coral"
          value={data.coordination?.total ?? data.summary?.openCases ?? '—'}
        />
        <OpsMetric
          icon="verification"
          label="Chờ xác minh"
          note={resourceNote(
            'verification-cases',
            `${data.verifications.filter(({ riskLevel }) => riskLevel === 'HIGH').length} hồ sơ rủi ro cao`,
          )}
          tone="amber"
          value={
            data.summary?.pendingVerifications ??
            (unavailableResources.has('verification-cases') ? '—' : data.verifications.length)
          }
        />
        <OpsMetric
          icon="alert"
          label="Sự cố chưa giải quyết"
          note={
            data.summary
              ? `${data.summary.pendingPrivacyRequests} yêu cầu riêng tư`
              : resourceNote('summary', 'Dữ liệu quản trị chưa khả dụng')
          }
          tone="blue"
          value={data.summary?.unresolvedIncidents ?? '—'}
        />
        <OpsMetric
          icon="jobs"
          label="Delivery thất bại"
          note={
            failedDeliveries === null
              ? 'Dữ liệu delivery chưa khả dụng'
              : 'Outbox · notification · webhook'
          }
          value={failedDeliveries ?? '—'}
        />
      </section>

      <div className="ops-overview-grid">
        <section className="ops-panel ops-priority-panel">
          <OpsPanelHeader
            action={
              <Link className="ops-button ops-button--secondary" href={landing.href}>
                <span>{landing.label}</span>
                <OperationsIcon name="arrow" />
              </Link>
            }
            description="Hợp nhất theo thời hạn và mức rủi ro hiện tại."
            icon="alert"
            title="Cần chú ý ngay"
          />
          {priorities.length ? (
            <div className="ops-priority-list">
              {priorities.map((item) => (
                <Link href={item.href} key={`${item.type}-${item.id}`}>
                  <span className="ops-priority-ref">
                    <small>{item.type}</small>
                    <strong>{item.ref}</strong>
                  </span>
                  <span>
                    <strong>{item.subject}</strong>
                    <small>{item.owner}</small>
                  </span>
                  <OpsStatus value={item.status} />
                  <time dateTime={item.date}>{item.due}</time>
                  <OperationsIcon name="chevron" />
                </Link>
              ))}
            </div>
          ) : (
            <OpsEmpty
              body={
                data.availability === 'available'
                  ? 'Khi có ca hoặc hồ sơ cần xử lý, chúng sẽ xuất hiện theo SLA tại đây.'
                  : accessLimited
                    ? 'Một số hàng đợi nằm ngoài phạm vi vai trò hiện tại. Các hàng đợi được phép vẫn đang hiển thị.'
                    : 'Một hoặc nhiều nguồn dữ liệu chưa phản hồi. Hãy thử lại trước khi kết luận hàng đợi đang trống.'
              }
              title={
                data.availability === 'available'
                  ? 'Không có ngoại lệ đang mở'
                  : accessLimited
                    ? 'Không có ngoại lệ trong phạm vi quyền'
                    : 'Chưa thể tải đầy đủ ngoại lệ'
              }
            />
          )}
        </section>

        <aside className="ops-overview-rail">
          <section className="ops-panel ops-pulse-card">
            <OpsPanelHeader description="Phân bố hiện tại" icon="trend" title="Nhịp điều phối" />
            {data.coordination ? (
              <div className="ops-pulse-list">
                {[
                  [
                    'Đúng SLA',
                    Math.max(0, data.coordination.total - data.coordination.overdue),
                    data.coordination.total,
                    'success',
                  ],
                  [
                    'Chưa phân công',
                    data.coordination.unassigned,
                    data.coordination.total,
                    'warning',
                  ],
                  ['Ưu tiên khẩn', data.coordination.urgent, data.coordination.total, 'danger'],
                ].map(([label, value, total, tone]) => {
                  const percent = Number(total)
                    ? Math.round((Number(value) / Number(total)) * 100)
                    : 0;
                  return (
                    <div key={String(label)}>
                      <span>
                        <strong>{label}</strong>
                        <small>
                          {value}/{total}
                        </small>
                      </span>
                      <i>
                        <b className={`is-${tone}`} style={{ width: `${percent}%` }} />
                      </i>
                    </div>
                  );
                })}
              </div>
            ) : (
              <OpsEmpty
                body="Tài khoản hiện tại chưa có phạm vi tổ chức điều phối."
                icon="coordination"
                title="Không có dữ liệu điều phối"
              />
            )}
          </section>
          <section className="ops-panel ops-reliability-card">
            <OpsPanelHeader description="24 giờ gần nhất" icon="jobs" title="Reliability" />
            <div className="ops-reliability-score">
              <span className={failedDeliveries === 0 ? 'is-healthy' : 'is-warning'}>
                <OperationsIcon name={failedDeliveries === 0 ? 'check' : 'alert'} />
              </span>
              <div>
                <strong>
                  {failedDeliveries === null
                    ? 'Không tải được dữ liệu delivery'
                    : failedDeliveries
                      ? 'Cần kiểm tra delivery'
                      : 'Không có job thất bại'}
                </strong>
                <small>
                  {failedDeliveries === null
                    ? 'Trạng thái hiện tại chưa xác định'
                    : `${failedDeliveries} lỗi cần xử lý`}
                </small>
              </div>
            </div>
            <Link href={administrator ? '/administration?view=reliability' : landing.href}>
              {administrator ? 'Mở reliability console' : landing.label}{' '}
              <OperationsIcon name="arrow" />
            </Link>
          </section>
        </aside>
      </div>

      <section className="ops-panel ops-audit-panel">
        <OpsPanelHeader
          action={
            administrator ? (
              <Link href="/administration?view=audit">Xem audit log</Link>
            ) : (
              <Link href={landing.href}>{landing.label}</Link>
            )
          }
          description="Chỉ hiển thị thay đổi, lỗi và sự kiện bảo mật đáng chú ý."
          icon="audit"
          title="Thay đổi và cảnh báo quan trọng"
        />
        {importantAudit.length ? (
          <div className="ops-audit-stream">
            {importantAudit.map((item) => (
              <article key={item.id}>
                <span className={item.success ? 'is-success' : 'is-danger'}>
                  <OperationsIcon name={item.success ? 'check' : 'alert'} />
                </span>
                <div>
                  <strong>{auditActionLabel(item.action)}</strong>
                  <small>
                    {auditResourceLabel(item.resourceType)} · {item.resourceId.slice(0, 12)}
                  </small>
                </div>
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
            body={
              unavailableResources.has('audit')
                ? 'Audit log chưa phản hồi. Hãy thử lại trước khi kết luận không có sự kiện mới.'
                : 'Các lượt xem thông thường đã được ẩn. Khi có thay đổi, lỗi hoặc sự kiện bảo mật, chúng sẽ xuất hiện tại đây.'
            }
            icon="audit"
            title={
              unavailableResources.has('audit')
                ? 'Chưa thể tải audit log'
                : 'Không có sự kiện quan trọng mới'
            }
          />
        )}
      </section>
    </main>
  );
}

function roleLanding(roles: readonly string[]): { readonly href: string; readonly label: string } {
  if (roles.some((role) => ['PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(role)))
    return { href: '/administration', label: 'Mở control plane' };
  if (roles.includes('CONCIERGE_AGENT'))
    return { href: '/coordination', label: 'Mở hàng đợi điều phối' };
  if (roles.includes('VERIFICATION_OFFICER'))
    return { href: '/verification', label: 'Mở hàng đợi xác minh' };
  if (roles.includes('FINANCE_ADMIN'))
    return { href: '/administration?view=finance', label: 'Mở vận hành tài chính' };
  if (roles.includes('CONTENT_ADMIN'))
    return { href: '/administration?view=governance', label: 'Mở quản trị nội dung' };
  if (roles.includes('SUPPORT_AGENT'))
    return { href: '/administration?view=trust', label: 'Mở Trust & Support' };
  return { href: '/administration?view=security', label: 'Mở bảo mật tài khoản' };
}
