import Link from 'next/link';

import { OperationsIcon } from '@/components/operations-icon';
import { OpsEmpty, OpsMetric, OpsPanelHeader, OpsStatus } from '@/components/operations-ui';
import { getOperationsOverview } from '@/lib/operations-data';
import {
  auditActionLabel,
  auditResourceLabel,
  formatDateTime,
  humanize,
  isRoutineReadAuditAction,
  relativeDue,
} from '@/lib/presentation';

export default async function Overview() {
  const data = await getOperationsOverview();
  const failedDeliveries =
    (data.summary?.failedOutboxEvents ?? 0) +
    (data.summary?.failedNotifications ?? 0) +
    (data.summary?.failedWebhooks ?? 0);
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
        <div className="ops-page-header__status">
          <i />
          <span>
            <strong>Hệ thống đang hoạt động</strong>
            <small>Cập nhật {formatDateTime(now)}</small>
          </span>
        </div>
      </header>

      <section aria-label="Tổng quan vận hành" className="ops-metric-grid">
        <OpsMetric
          icon="coordination"
          label="Ca điều phối"
          note={`${data.coordination?.overdue ?? 0} ca quá SLA`}
          tone="coral"
          value={data.coordination?.total ?? data.summary?.openCases ?? 0}
        />
        <OpsMetric
          icon="verification"
          label="Chờ xác minh"
          note={`${data.verifications.filter(({ riskLevel }) => riskLevel === 'HIGH').length} hồ sơ rủi ro cao`}
          tone="amber"
          value={data.summary?.pendingVerifications ?? data.verifications.length}
        />
        <OpsMetric
          icon="alert"
          label="Sự cố chưa giải quyết"
          note={`${data.summary?.pendingPrivacyRequests ?? 0} yêu cầu riêng tư`}
          tone="blue"
          value={data.summary?.unresolvedIncidents ?? 0}
        />
        <OpsMetric
          icon="jobs"
          label="Delivery thất bại"
          note="Outbox · notification · webhook"
          value={failedDeliveries}
        />
      </section>

      <div className="ops-overview-grid">
        <section className="ops-panel ops-priority-panel">
          <OpsPanelHeader
            action={
              <Link className="ops-button ops-button--secondary" href="/coordination">
                <span>Mở hàng đợi</span>
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
              body="Khi có ca hoặc hồ sơ cần xử lý, chúng sẽ xuất hiện theo SLA tại đây."
              title="Không có ngoại lệ đang mở"
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
              <span className={failedDeliveries ? 'is-warning' : 'is-healthy'}>
                <OperationsIcon name={failedDeliveries ? 'alert' : 'check'} />
              </span>
              <div>
                <strong>
                  {failedDeliveries ? 'Cần kiểm tra delivery' : 'Không có job thất bại'}
                </strong>
                <small>{failedDeliveries} lỗi cần xử lý</small>
              </div>
            </div>
            <Link href="/administration?view=reliability">
              Mở reliability console <OperationsIcon name="arrow" />
            </Link>
          </section>
        </aside>
      </div>

      <section className="ops-panel ops-audit-panel">
        <OpsPanelHeader
          action={<Link href="/administration?view=audit">Xem audit log</Link>}
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
            body="Các lượt xem thông thường đã được ẩn. Khi có thay đổi, lỗi hoặc sự kiện bảo mật, chúng sẽ xuất hiện tại đây."
            icon="audit"
            title="Không có sự kiện quan trọng mới"
          />
        )}
      </section>
    </main>
  );
}
