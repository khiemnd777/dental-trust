'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  VerificationCaseDetail,
  VerificationEvidenceView,
  VerificationRequirementView,
} from '@dental-trust/contracts';

import { OperationsIcon } from './operations-icon';
import { OpsAvatar, OpsEmpty, OpsMetric, OpsPanelHeader, OpsStatus } from './operations-ui';
import type { VerificationData } from '@/lib/operations-data';
import { commandErrorMessage, sendOperationsCommand } from '@/lib/operations-command';
import { formatDateTime, humanize, initials, relativeDue } from '@/lib/presentation';

type VerificationFilter = 'all' | 'mine' | 'unassigned' | 'high' | 'second';
type DetailTab = 'overview' | 'requirements' | 'reviews' | 'corrective';
type VerificationAction =
  | {
      readonly kind: 'evidence';
      readonly evidence: VerificationEvidenceView;
      readonly requirement: VerificationRequirementView;
      readonly decision: 'APPROVE' | 'REJECT';
    }
  | { readonly kind: 'decision' }
  | { readonly kind: 'second'; readonly reviewId: string; readonly approve: boolean }
  | null;

export function VerificationWorkspace({
  data,
  currentUserId,
  initialSelectedId,
}: {
  readonly data: VerificationData;
  readonly currentUserId: string;
  readonly initialSelectedId: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<VerificationFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [detail, setDetail] = useState<VerificationCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [action, setAction] = useState<VerificationAction>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    return data.cases.filter((item) => {
      const matches =
        filter === 'all' ||
        (filter === 'mine' && item.assignedReviewerUserId === currentUserId) ||
        (filter === 'unassigned' && item.assignedReviewerUserId === null) ||
        (filter === 'high' && item.riskLevel === 'HIGH') ||
        (filter === 'second' && ['APPROVED', 'UNDER_REVIEW', 'SUBMITTED'].includes(item.status));
      if (!matches) return false;
      if (!normalized) return true;
      return [item.subjectName, item.subjectType, item.status, item.riskLevel].some((value) =>
        value.toLocaleLowerCase('vi-VN').includes(normalized),
      );
    });
  }, [currentUserId, data.cases, filter, query]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setError(null);
    void fetch(
      `/api/operations/data?kind=verification&resourceId=${encodeURIComponent(selectedId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const envelope = (await response.json()) as {
          data?: VerificationCaseDetail;
          error?: string;
        };
        if (!response.ok || !envelope.data) throw new Error(envelope.error ?? 'detail_unavailable');
        setDetail(envelope.data);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError('Không thể tải hồ sơ xác minh.');
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  async function execute(operation: () => Promise<unknown>, success: string) {
    setPending(true);
    setError(null);
    try {
      await operation();
      setNotice(success);
      setAction(null);
      router.refresh();
      if (selectedId) {
        const response = await fetch(
          `/api/operations/data?kind=verification&resourceId=${encodeURIComponent(selectedId)}`,
        );
        const envelope = (await response.json()) as { data?: VerificationCaseDetail };
        if (envelope.data) setDetail(envelope.data);
      }
    } catch (reason) {
      setError(commandErrorMessage(reason));
    } finally {
      setPending(false);
    }
  }

  const highRisk = data.cases.filter(({ riskLevel }) => riskLevel === 'HIGH').length;
  const unassigned = data.cases.filter(
    ({ assignedReviewerUserId }) => assignedReviewerUserId === null,
  ).length;
  const expiring = data.cases.filter(
    ({ expiresAt }) => expiresAt && Date.parse(expiresAt) - Date.now() < 30 * 86_400_000,
  ).length;

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
          <span className="ops-eyebrow">Trust operations</span>
          <h1>Kiểm soát xác minh</h1>
          <p>Bằng chứng, rủi ro và phê duyệt kép trong một audit trail duy nhất.</p>
        </div>
        <div className="ops-policy-chip">
          <OperationsIcon name="shield" />
          <span>
            <strong>Phê duyệt kép bắt buộc</strong>
            <small>Không tự phê duyệt quyết định của mình</small>
          </span>
        </div>
      </header>

      <section aria-label="Chỉ số xác minh" className="ops-metric-grid ops-metric-grid--four">
        <OpsMetric
          icon="verification"
          label="Trong hàng đợi"
          note="Tất cả trạng thái đang tải"
          value={data.cases.length}
        />
        <OpsMetric
          icon="alert"
          label="Rủi ro cao"
          note="Cần kiểm tra tăng cường"
          tone="coral"
          value={highRisk}
        />
        <OpsMetric
          icon="users"
          label="Chưa phân công"
          note="Chờ reviewer nhận"
          tone="amber"
          value={unassigned}
        />
        <OpsMetric
          icon="clock"
          label="Sắp hết hạn"
          note="Trong vòng 30 ngày"
          tone="blue"
          value={expiring}
        />
      </section>

      <section className="ops-panel ops-queue-panel">
        <OpsPanelHeader
          action={
            <div className="ops-list-tools">
              <label>
                <OperationsIcon name="search" />
                <input
                  aria-label="Tìm hồ sơ xác minh"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tên cơ sở, nha sĩ…"
                  value={query}
                />
              </label>
              <button aria-label="Làm mới" onClick={() => router.refresh()} type="button">
                <OperationsIcon name="refresh" />
              </button>
            </div>
          }
          description={`${filtered.length} trên ${data.cases.length} hồ sơ · phê duyệt kép đang bật`}
          icon="verification"
          title="Hàng đợi xác minh"
        />
        <div aria-label="Lọc xác minh" className="ops-segmented" role="toolbar">
          {(
            [
              ['all', 'Tất cả', data.cases.length],
              [
                'mine',
                'Của tôi',
                data.cases.filter((item) => item.assignedReviewerUserId === currentUserId).length,
              ],
              ['unassigned', 'Chưa phân công', unassigned],
              ['high', 'Rủi ro cao', highRisk],
              [
                'second',
                'Cần quyết định',
                data.cases.filter((item) =>
                  ['APPROVED', 'UNDER_REVIEW', 'SUBMITTED'].includes(item.status),
                ).length,
              ],
            ] as const
          ).map(([value, label, count]) => (
            <button
              aria-pressed={filter === value}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label}
              <b>{count}</b>
            </button>
          ))}
        </div>
        {filtered.length ? (
          <div className="ops-data-list ops-verification-list">
            <div className="ops-data-list__head">
              <span>Đối tượng</span>
              <span>Trạng thái</span>
              <span>Reviewer</span>
              <span>Cập nhật</span>
              <span />
            </div>
            {filtered.map((item) => (
              <button
                className={selectedId === item.id ? 'is-selected' : ''}
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setDetailTab('overview');
                }}
                type="button"
              >
                <span className="ops-record-main">
                  <OpsAvatar
                    label={initials(item.subjectName)}
                    tone={item.subjectType === 'CLINIC' ? 'teal' : 'blue'}
                  />
                  <span>
                    <small>
                      {humanize(item.subjectType)} · {item.id.slice(0, 8).toUpperCase()}
                    </small>
                    <strong>{item.subjectName}</strong>
                    <em>Phiên bản {item.version}</em>
                  </span>
                </span>
                <span>
                  {item.status === 'APPROVED' ? (
                    <OpsStatus label="Chờ duyệt độc lập" value="PENDING" />
                  ) : (
                    <OpsStatus value={item.status} />
                  )}
                  <small
                    className={`ops-priority ops-priority--${item.riskLevel === 'HIGH' ? 'urgent' : 'normal'}`}
                  >
                    {riskLabel(item.riskLevel)}
                  </small>
                </span>
                <span className="ops-owner">
                  {item.assignedReviewerUserId ? (
                    <>
                      <OpsAvatar
                        label={item.assignedReviewerUserId === currentUserId ? 'TÔI' : 'RV'}
                        tone="teal"
                      />
                      <span>
                        <strong>
                          {item.assignedReviewerUserId === currentUserId
                            ? 'Bạn phụ trách'
                            : 'Đã phân công'}
                        </strong>
                        <small>Reviewer có thẩm quyền</small>
                      </span>
                    </>
                  ) : (
                    <>
                      <OpsAvatar label="—" tone="amber" />
                      <span>
                        <strong>Chưa phân công</strong>
                        <small>Có thể nhận hồ sơ</small>
                      </span>
                    </>
                  )}
                </span>
                <time>
                  <strong>{formatDateTime(item.updatedAt)}</strong>
                  <small>
                    {item.expiresAt ? relativeDue(item.expiresAt) : 'Chưa có hạn xác minh'}
                  </small>
                </time>
                <OperationsIcon name="chevron" />
              </button>
            ))}
          </div>
        ) : (
          <OpsEmpty
            body="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
            title="Không có hồ sơ phù hợp"
          />
        )}
      </section>

      {selectedId ? (
        <div className="ops-drawer-layer">
          <button
            aria-label="Đóng chi tiết"
            className="ops-drawer-backdrop"
            onClick={() => setSelectedId(null)}
            type="button"
          />
          <aside
            aria-label="Chi tiết xác minh"
            className="ops-drawer ops-drawer--wide ops-verification-drawer"
          >
            <header className="ops-verification-header">
              <div>
                <span className="ops-eyebrow">Verification case</span>
                <h2>{detail?.subjectName ?? 'Đang tải hồ sơ…'}</h2>
                <p>
                  {detail
                    ? `${humanize(detail.subjectType)} · ${detail.id.slice(0, 8).toUpperCase()} · Phiên bản ${detail.version}`
                    : 'Đang đồng bộ dữ liệu'}
                </p>
              </div>
              <button aria-label="Đóng chi tiết" onClick={() => setSelectedId(null)} type="button">
                <OperationsIcon name="close" />
              </button>
            </header>
            {detailLoading ? (
              <div className="ops-detail-loading">
                <i />
                <i />
                <i />
              </div>
            ) : detail ? (
              <VerificationCasePanel
                currentUserId={currentUserId}
                detail={detail}
                detailTab={detailTab}
                onAction={setAction}
                onExecute={execute}
                onTabChange={setDetailTab}
                pending={pending}
              />
            ) : (
              <OpsEmpty
                body="Đóng bảng chi tiết và thử lại."
                icon="alert"
                title="Không thể tải dữ liệu"
              />
            )}
          </aside>
        </div>
      ) : null}

      {action && detail ? (
        <VerificationActionDialog
          action={action}
          detail={detail}
          onClose={() => setAction(null)}
          onExecute={execute}
          pending={pending}
        />
      ) : null}
    </main>
  );
}

function VerificationCasePanel({
  currentUserId,
  detail,
  detailTab,
  onAction,
  onExecute,
  onTabChange,
  pending,
}: {
  readonly currentUserId: string;
  readonly detail: VerificationCaseDetail;
  readonly detailTab: DetailTab;
  readonly onAction: (action: VerificationAction) => void;
  readonly onExecute: (operation: () => Promise<unknown>, success: string) => Promise<void>;
  readonly onTabChange: (tab: DetailTab) => void;
  readonly pending: boolean;
}) {
  const approvedRequirements = detail.requirements.filter(({ status }) =>
    ['APPROVED', 'WAIVED'].includes(status),
  ).length;
  const requiredBlockers = detail.requirements.filter(
    ({ required, status }) => required && !['APPROVED', 'WAIVED'].includes(status),
  ).length;
  const fourEyes = verificationFourEyesProgress(detail);
  const pendingSecondReview = detail.reviews.find(
    ({ status }) => status === 'PENDING_SECOND_APPROVAL',
  );
  const assignedToMe = detail.assignedReviewerUserId === currentUserId;
  const canClaim =
    detail.assignedReviewerUserId === null &&
    ['SUBMITTED', 'UNDER_REVIEW', 'SITE_AUDIT_REQUIRED', 'EXPIRED'].includes(detail.status);
  const completed = ['VERIFIED', 'REJECTED'].includes(detail.status);
  const canDecide =
    assignedToMe &&
    !completed &&
    !pendingSecondReview &&
    availableVerificationTransitions(detail.status).length > 0;
  const nextStep = verificationNextStep(detail, currentUserId);

  return (
    <>
      <section className="ops-case-context" aria-label="Tóm tắt hồ sơ">
        <div className="ops-case-context__state">
          {detail.status === 'APPROVED' ? (
            <OpsStatus label="Chờ duyệt độc lập" value="PENDING" />
          ) : (
            <OpsStatus value={detail.status} />
          )}
          <span
            className={`ops-risk-badge ops-risk-badge--${detail.riskLevel === 'HIGH' ? 'high' : 'standard'}`}
          >
            <OperationsIcon name={detail.riskLevel === 'HIGH' ? 'alert' : 'shield'} />
            {riskLabel(detail.riskLevel)}
          </span>
          <span className="ops-methodology">Chuẩn {detail.methodologyVersion}</span>
        </div>
        <div className="ops-case-context__meta">
          <div>
            <OpsAvatar
              label={assignedToMe ? 'TÔI' : detail.assignedReviewerUserId ? 'RV' : '—'}
              tone={detail.assignedReviewerUserId ? 'teal' : 'amber'}
            />
            <span>
              <small>Reviewer</small>
              <strong>
                {assignedToMe
                  ? 'Bạn phụ trách'
                  : detail.assignedReviewerUserId
                    ? 'Đã phân công'
                    : 'Chưa phân công'}
              </strong>
            </span>
          </div>
          <div>
            <span className="ops-case-meta-icon">
              <OperationsIcon name="clock" />
            </span>
            <span>
              <small>Cập nhật {formatDateTime(detail.updatedAt)}</small>
              <strong>
                {detail.expiresAt
                  ? `Hiệu lực: ${relativeDue(detail.expiresAt)}`
                  : 'Chưa đặt hạn hiệu lực'}
              </strong>
            </span>
          </div>
        </div>
      </section>

      <nav aria-label="Khu vực xác minh" className="ops-verification-tabs">
        <button
          aria-pressed={detailTab === 'overview'}
          onClick={() => onTabChange('overview')}
          type="button"
        >
          Tổng quan
        </button>
        <button
          aria-pressed={detailTab === 'requirements'}
          onClick={() => onTabChange('requirements')}
          type="button"
        >
          Yêu cầu{' '}
          <b>
            {approvedRequirements}/{detail.requirements.length} đạt
          </b>
        </button>
        <button
          aria-pressed={detailTab === 'reviews'}
          onClick={() => onTabChange('reviews')}
          type="button"
        >
          Phê duyệt kép <b>{fourEyes.completed}/2</b>
        </button>
        <button
          aria-pressed={detailTab === 'corrective'}
          onClick={() => onTabChange('corrective')}
          type="button"
        >
          Khắc phục <b>{detail.correctiveActions.length}</b>
        </button>
      </nav>

      <div className="ops-drawer-body ops-verification-body">
        {detailTab === 'overview' ? (
          <VerificationOverview
            currentUserId={currentUserId}
            detail={detail}
            onTabChange={onTabChange}
          />
        ) : null}
        {detailTab === 'requirements' ? (
          <Requirements currentUserId={currentUserId} detail={detail} onAction={onAction} />
        ) : null}
        {detailTab === 'reviews' ? (
          <Reviews currentUserId={currentUserId} detail={detail} onAction={onAction} />
        ) : null}
        {detailTab === 'corrective' ? <Corrective detail={detail} /> : null}
      </div>

      <footer className="ops-verification-footer">
        <div className="ops-verification-footer__message">
          <span>
            <OperationsIcon
              name={completed ? 'check' : pendingSecondReview ? 'shield' : 'verification'}
            />
          </span>
          <div>
            <strong>{nextStep.title}</strong>
            <small>{nextStep.body}</small>
          </div>
        </div>
        <div className="ops-verification-footer__actions">
          {completed ? (
            <button
              className="ops-button ops-button--secondary"
              onClick={() => onTabChange('reviews')}
              type="button"
            >
              <OperationsIcon name="audit" />
              Xem quyết định
            </button>
          ) : null}
          {pendingSecondReview && pendingSecondReview.reviewerUserId !== currentUserId ? (
            <button
              className="ops-button ops-button--primary"
              onClick={() => onTabChange('reviews')}
              type="button"
            >
              <OperationsIcon name="shield" />
              Phê duyệt độc lập
            </button>
          ) : null}
          {canClaim ? (
            <button
              className="ops-button ops-button--primary"
              disabled={pending}
              onClick={() =>
                void onExecute(
                  () =>
                    sendOperationsCommand({
                      command: 'verification_assign',
                      resourceId: detail.id,
                      payload: {
                        reviewerUserId: currentUserId,
                        expectedVersion: detail.version,
                      },
                    }),
                  'Đã nhận hồ sơ xác minh.',
                )
              }
              type="button"
            >
              <OperationsIcon name="users" />
              Nhận hồ sơ
            </button>
          ) : null}
          {canDecide ? (
            <button
              className="ops-button ops-button--primary"
              onClick={() => onAction({ kind: 'decision' })}
              type="button"
            >
              <OperationsIcon name="verification" />
              {verificationDecisionCta(detail.status, requiredBlockers)}
            </button>
          ) : null}
        </div>
      </footer>
    </>
  );
}

function VerificationOverview({
  currentUserId,
  detail,
  onTabChange,
}: {
  readonly currentUserId: string;
  readonly detail: VerificationCaseDetail;
  readonly onTabChange: (tab: DetailTab) => void;
}) {
  const approvedRequirements = detail.requirements.filter(({ status }) =>
    ['APPROVED', 'WAIVED'].includes(status),
  ).length;
  const evidence = detail.requirements.flatMap((requirement) => requirement.evidence);
  const approvedEvidence = evidence.filter(
    ({ approvedAt, revokedAt }) => approvedAt && !revokedAt,
  ).length;
  const pendingSecondReviews = detail.reviews.filter(
    ({ status }) => status === 'PENDING_SECOND_APPROVAL',
  ).length;
  const fourEyes = verificationFourEyesProgress(detail);
  const signals = verificationRiskSignals(detail);
  const progress = detail.requirements.length
    ? Math.round((approvedRequirements / detail.requirements.length) * 100)
    : 0;
  const nextStep = verificationNextStep(detail, currentUserId);

  return (
    <div className="ops-verification-overview">
      <section
        className={`ops-risk-summary ops-risk-summary--${detail.riskLevel === 'HIGH' ? 'high' : 'standard'}`}
      >
        <header>
          <span>
            <OperationsIcon name={detail.riskLevel === 'HIGH' ? 'alert' : 'shield'} />
          </span>
          <div>
            <small>Đánh giá rủi ro</small>
            <h3>{riskLabel(detail.riskLevel)}</h3>
          </div>
          <span className="ops-risk-summary__method">{detail.methodologyVersion}</span>
        </header>
        <p>Các tín hiệu được tổng hợp trực tiếp từ yêu cầu và bằng chứng của hồ sơ.</p>
        <ul>
          {signals.map((signal) => (
            <li key={signal}>
              <OperationsIcon name="check" />
              {signal}
            </li>
          ))}
        </ul>
      </section>

      <section className="ops-verification-progress">
        <header>
          <div>
            <small>Tiến độ kiểm soát</small>
            <h3>
              {approvedRequirements}/{detail.requirements.length} yêu cầu đạt
            </h3>
          </div>
          <strong>{progress}%</strong>
        </header>
        <div
          aria-label={`${progress}% yêu cầu đã đạt`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="ops-verification-progress__track"
          role="progressbar"
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="ops-verification-stats">
          <div>
            <span>
              <OperationsIcon name="document" />
            </span>
            <small>Bằng chứng</small>
            <strong>
              {approvedEvidence}/{evidence.length} đã duyệt
            </strong>
          </div>
          <div>
            <span>
              <OperationsIcon name="shield" />
            </span>
            <small>Phê duyệt kép</small>
            <strong>{fourEyes.completed}/2 người đã duyệt</strong>
          </div>
          <div>
            <span>
              <OperationsIcon name="clock" />
            </span>
            <small>Khắc phục</small>
            <strong>
              {
                detail.correctiveActions.filter(
                  ({ status }) => !['CLOSED', 'ACCEPTED'].includes(status),
                ).length
              }{' '}
              đang mở
            </strong>
          </div>
        </div>
      </section>

      <section className="ops-verification-next-step">
        <span>
          <OperationsIcon name="arrow" />
        </span>
        <div>
          <small>Bước tiếp theo</small>
          <h3>{nextStep.title}</h3>
          <p>{nextStep.body}</p>
        </div>
        <button
          onClick={() =>
            onTabChange(
              pendingSecondReviews
                ? 'reviews'
                : approvedRequirements < detail.requirements.length
                  ? 'requirements'
                  : 'reviews',
            )
          }
          type="button"
        >
          Xem chi tiết
          <OperationsIcon name="chevron" />
        </button>
      </section>
    </div>
  );
}

function Requirements({
  currentUserId,
  detail,
  onAction,
}: {
  readonly currentUserId: string;
  readonly detail: VerificationCaseDetail;
  readonly onAction: (action: VerificationAction) => void;
}) {
  const approvedRequirements = detail.requirements.filter(({ status }) =>
    ['APPROVED', 'WAIVED'].includes(status),
  ).length;
  const canReviewEvidence =
    detail.assignedReviewerUserId === currentUserId &&
    ['SUBMITTED', 'UNDER_REVIEW'].includes(detail.status);

  return (
    <section className="ops-detail-section ops-verification-section">
      <header className="ops-verification-section__header">
        <div>
          <span className="ops-eyebrow">Review checklist</span>
          <h3>Yêu cầu và bằng chứng</h3>
          <p>Mở tài liệu, đối chiếu tiêu chí rồi mới ghi nhận kết quả review.</p>
        </div>
        <strong>
          {approvedRequirements}/{detail.requirements.length} yêu cầu đã đạt
        </strong>
      </header>
      <div className="ops-requirement-list">
        {detail.requirements.map((requirement) => {
          const name = localizedVerificationText(requirement.names, humanize(requirement.category));
          const description = localizedVerificationText(
            requirement.descriptions,
            'Chưa cấu hình tiêu chí kiểm tra.',
          );
          return (
            <article key={requirement.id}>
              <header>
                <span className="ops-requirement-icon">
                  <OperationsIcon name={requirement.highRisk ? 'alert' : 'document'} />
                </span>
                <div>
                  <strong>{name}</strong>
                  <code>
                    {requirement.code} · mẫu v{requirement.templateVersion}
                  </code>
                  <span className="ops-requirement-tags">
                    <small>{requirement.required ? 'Bắt buộc' : 'Tùy chọn'}</small>
                    {requirement.highRisk ? <small>Kiểm soát tăng cường</small> : null}
                  </span>
                </div>
                <OpsStatus value={requirement.status} />
              </header>

              <div className="ops-review-basis">
                <span>
                  <OperationsIcon name="verification" />
                </span>
                <div>
                  <small>Tiêu chí đạt</small>
                  <p>{description}</p>
                  <em>
                    {requirement.validityDays
                      ? `Chu kỳ hiệu lực tham chiếu: ${requirement.validityDays} ngày.`
                      : 'Không áp dụng chu kỳ hiệu lực cố định.'}
                  </em>
                </div>
              </div>

              {requirement.evidence.length ? (
                <div className="ops-evidence-list">
                  {requirement.evidence.map((evidence) => {
                    const rejected = requirement.status === 'REJECTED' && !evidence.approvedAt;
                    const canAct =
                      canReviewEvidence && !rejected && !evidence.approvedAt && !evidence.revokedAt;
                    const openable = Boolean(
                      evidence.fileAssetId || openableSourceReference(evidence.sourceReference),
                    );
                    return (
                      <section className="ops-evidence-item" key={evidence.id}>
                        <div className="ops-evidence-record">
                          <span
                            className={`ops-evidence-record__icon ${evidence.revokedAt || rejected ? 'is-revoked' : evidence.approvedAt ? 'is-approved' : ''}`}
                          >
                            <OperationsIcon
                              name={
                                evidence.revokedAt || rejected
                                  ? 'close'
                                  : evidence.approvedAt
                                    ? 'check'
                                    : 'document'
                              }
                            />
                          </span>
                          <div className="ops-evidence-record__body">
                            <strong>{evidenceDisplayName(evidence)}</strong>
                            <small>
                              Cung cấp {formatDateTime(evidence.createdAt)} ·{' '}
                              {evidence.fileAssetId ? 'Tệp tải lên' : 'Nguồn tham chiếu'}
                            </small>
                            <dl className="ops-evidence-facts">
                              <div>
                                <dt>Ngày cấp</dt>
                                <dd>{evidence.issuedAt ?? 'Chưa cung cấp'}</dd>
                              </div>
                              <div>
                                <dt>Hiệu lực</dt>
                                <dd className={evidenceIsExpired(evidence) ? 'is-danger' : ''}>
                                  {evidence.expiresAt
                                    ? evidenceIsExpired(evidence)
                                      ? `Đã hết hạn ${evidence.expiresAt}`
                                      : `Đến ${evidence.expiresAt}`
                                    : 'Chưa cung cấp'}
                                </dd>
                              </div>
                              <div>
                                <dt>An toàn tệp</dt>
                                <dd>{evidenceFileCheck(evidence)}</dd>
                              </div>
                              <div>
                                <dt>Toàn vẹn</dt>
                                <dd>
                                  {evidence.contentHash
                                    ? `${evidence.contentHash.slice(0, 12)}…`
                                    : 'Chưa có checksum'}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                        <div className="ops-evidence-actions">
                          {openable ? (
                            <a
                              href={verificationEvidenceHref(detail.id, evidence)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <OperationsIcon name="document" />
                              Xem tài liệu / nguồn
                            </a>
                          ) : (
                            <span className="ops-evidence-unavailable">
                              <OperationsIcon name="alert" />
                              Không có tài liệu để mở
                            </span>
                          )}
                          {canAct ? (
                            <>
                              <button
                                onClick={() =>
                                  onAction({
                                    kind: 'evidence',
                                    evidence,
                                    requirement,
                                    decision: 'APPROVE',
                                  })
                                }
                                type="button"
                              >
                                <OperationsIcon name="check" />
                                Duyệt bằng chứng
                              </button>
                              <button
                                onClick={() =>
                                  onAction({
                                    kind: 'evidence',
                                    evidence,
                                    requirement,
                                    decision: 'REJECT',
                                  })
                                }
                                type="button"
                              >
                                <OperationsIcon name="close" />
                                Từ chối
                              </button>
                            </>
                          ) : (
                            <span
                              className={`ops-evidence-state ${evidence.revokedAt || rejected ? 'is-revoked' : evidence.approvedAt ? 'is-approved' : ''}`}
                            >
                              <OperationsIcon
                                name={
                                  evidence.revokedAt || rejected
                                    ? 'close'
                                    : evidence.approvedAt
                                      ? 'check'
                                      : 'clock'
                                }
                              />
                              {evidence.revokedAt
                                ? 'Đã thu hồi'
                                : rejected
                                  ? 'Đã từ chối'
                                  : evidence.approvedAt
                                    ? 'Đã duyệt'
                                    : 'Chờ review'}
                            </span>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <p>Chưa có bằng chứng cho yêu cầu này.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Reviews({
  detail,
  currentUserId,
  onAction,
}: {
  readonly detail: VerificationCaseDetail;
  readonly currentUserId: string;
  readonly onAction: (action: VerificationAction) => void;
}) {
  const fourEyesReview = detail.reviews.find(({ fourEyesRequired }) => fourEyesRequired);
  const fourEyes = verificationFourEyesProgress(detail);
  return (
    <section className="ops-detail-section ops-review-workspace">
      <header className="ops-review-workspace__header">
        <div>
          <span className="ops-eyebrow">Independent approval</span>
          <h3>Phê duyệt hồ sơ bởi hai người</h3>
          <p>Người đề xuất và người phê duyệt cuối phải là hai tài khoản độc lập.</p>
        </div>
        <strong>{fourEyes.completed}/2 người đã duyệt</strong>
      </header>

      <div className="ops-four-eyes-summary">
        <article className={fourEyes.completed >= 1 ? 'is-complete' : ''}>
          <span>
            <OperationsIcon name={fourEyes.completed >= 1 ? 'check' : 'users'} />
          </span>
          <div>
            <small>Người 1 · Đề xuất quyết định</small>
            <strong>{fourEyesReview?.reviewerEmail ?? 'Chưa có người đề xuất'}</strong>
            <p>{fourEyes.completed >= 1 ? 'Đã hoàn tất review chính.' : 'Chưa gửi phê duyệt.'}</p>
          </div>
        </article>
        <span className="ops-four-eyes-summary__connector" aria-hidden="true" />
        <article className={fourEyes.completed === 2 ? 'is-complete' : ''}>
          <span>
            <OperationsIcon name={fourEyes.completed === 2 ? 'check' : 'shield'} />
          </span>
          <div>
            <small>Người 2 · Phê duyệt độc lập</small>
            <strong>
              {fourEyesReview?.secondApproverEmail ??
                (fourEyes.completed === 1 ? 'Đang chờ người khác' : 'Chưa bắt đầu')}
            </strong>
            <p>
              {fourEyes.completed === 2
                ? 'Đã hoàn tất phê duyệt cuối.'
                : 'Không được trùng với người đề xuất.'}
            </p>
          </div>
        </article>
      </div>

      <h4>Lịch sử quyết định</h4>
      {detail.reviews.length ? (
        <div className="ops-review-list">
          {detail.reviews.toReversed().map((review) => (
            <article key={review.id}>
              <span>
                <OperationsIcon name="shield" />
              </span>
              <div>
                <strong>
                  {humanize(review.fromStatus)} → {humanize(review.toStatus)}
                </strong>
                <small>
                  {formatDateTime(review.createdAt)} ·{' '}
                  {review.fourEyesRequired
                    ? review.status === 'PENDING_SECOND_APPROVAL'
                      ? 'Chờ phê duyệt độc lập'
                      : 'Đã đủ 2 người duyệt'
                    : 'Một người review'}
                </small>
                {review.notes ? <p>{review.notes}</p> : null}
              </div>
              <div>
                <OpsStatus value={review.status} />
                {review.status === 'PENDING_SECOND_APPROVAL' &&
                review.reviewerUserId !== currentUserId ? (
                  <>
                    <button
                      onClick={() =>
                        onAction({ kind: 'second', reviewId: review.id, approve: true })
                      }
                      type="button"
                    >
                      Phê duyệt cuối
                    </button>
                    <button
                      onClick={() =>
                        onAction({ kind: 'second', reviewId: review.id, approve: false })
                      }
                      type="button"
                    >
                      Trả lại
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <OpsEmpty
          body="Quyết định và lượt phê duyệt độc lập sẽ xuất hiện tại đây."
          title="Chưa có lượt review"
        />
      )}
    </section>
  );
}

function Corrective({ detail }: { readonly detail: VerificationCaseDetail }) {
  return (
    <section className="ops-detail-section">
      <h3>Hành động khắc phục</h3>
      {detail.correctiveActions.length ? (
        <div className="ops-corrective-list">
          {detail.correctiveActions.map((item) => (
            <article key={item.id}>
              <span>
                <OperationsIcon name="clock" />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <small>Hạn {formatDateTime(item.dueAt)}</small>
              </div>
              <OpsStatus value={item.status} />
            </article>
          ))}
        </div>
      ) : (
        <OpsEmpty
          body="Không có yêu cầu khắc phục đang mở cho hồ sơ này."
          icon="check"
          title="Không có corrective action"
        />
      )}
    </section>
  );
}

function VerificationActionDialog({
  action,
  detail,
  onClose,
  onExecute,
  pending,
}: {
  readonly action: Exclude<VerificationAction, null>;
  readonly detail: VerificationCaseDetail;
  readonly onClose: () => void;
  readonly onExecute: (operation: () => Promise<unknown>, success: string) => Promise<void>;
  readonly pending: boolean;
}) {
  const requiredBlockers = detail.requirements.filter(
    ({ required, status }) => required && !['APPROVED', 'WAIVED'].includes(status),
  ).length;
  const decisionOptions = availableVerificationTransitions(detail.status).filter(
    (status) => !requiredBlockers || !['APPROVED', 'VERIFIED'].includes(status),
  );
  const [selectedDecision, setSelectedDecision] = useState<VerificationCaseDetail['status']>(
    decisionOptions[0] ?? detail.status,
  );
  const [evidenceOpened, setEvidenceOpened] = useState(false);
  const secondReview =
    action.kind === 'second' ? detail.reviews.find(({ id }) => id === action.reviewId) : undefined;
  const evidenceOpenable =
    action.kind === 'evidence' &&
    Boolean(
      action.evidence.fileAssetId || openableSourceReference(action.evidence.sourceReference),
    );
  const requiresExpiry =
    (action.kind === 'decision' && selectedDecision === 'VERIFIED') ||
    (action.kind === 'second' && action.approve && secondReview?.toStatus === 'VERIFIED');
  const title =
    action.kind === 'evidence'
      ? `${action.decision === 'APPROVE' ? 'Duyệt' : 'Từ chối'} bằng chứng`
      : action.kind === 'second'
        ? action.approve
          ? 'Phê duyệt cuối'
          : 'Trả lại người đề xuất'
        : verificationDecisionCta(detail.status, requiredBlockers);
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
            <p>Mọi quyết định yêu cầu lý do và được ghi vào audit trail.</p>
          </div>
          <button aria-label="Đóng" onClick={onClose} type="button">
            <OperationsIcon name="close" />
          </button>
        </header>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const rawNotes = String(form.get('notes'));
            if (action.kind === 'evidence') {
              const checks = form.getAll('checks').map(String);
              const rejectionReason = String(form.get('rejectionReason') ?? '');
              const notes = [
                `Kết quả: ${action.decision}.`,
                rejectionReason ? `Lý do: ${rejectionReason}.` : '',
                checks.length ? `Xác nhận: ${checks.join(', ')}.` : '',
                rawNotes,
              ]
                .filter(Boolean)
                .join(' ');
              void onExecute(
                () =>
                  sendOperationsCommand({
                    command: 'verification_review_evidence',
                    resourceId: detail.id,
                    secondaryId: action.evidence.id,
                    payload: {
                      decision: action.decision,
                      notes,
                      expectedCaseVersion: detail.version,
                    },
                  }),
                'Đã ghi nhận review bằng chứng.',
              );
              return;
            }
            if (action.kind === 'second') {
              const expiresAt = String(form.get('expiresAt'));
              const notes = `${action.approve ? 'Đã kiểm tra độc lập quyết định và bằng chứng. ' : ''}${rawNotes}`;
              void onExecute(
                () =>
                  sendOperationsCommand({
                    command: 'verification_second_approve',
                    resourceId: action.reviewId,
                    payload: {
                      approve: action.approve,
                      notes,
                      expectedCaseVersion: detail.version,
                      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
                    },
                  }),
                'Đã hoàn tất phê duyệt độc lập.',
              );
              return;
            }
            const toStatus = String(form.get('toStatus'));
            const expiresAt = String(form.get('expiresAt'));
            const notes = rawNotes;
            void onExecute(
              () =>
                sendOperationsCommand({
                  command: 'verification_decide',
                  resourceId: detail.id,
                  payload: {
                    toStatus,
                    notes,
                    expectedVersion: detail.version,
                    ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
                  },
                }),
              'Đã tạo quyết định xác minh.',
            );
          }}
        >
          {action.kind === 'evidence' ? (
            <>
              <section className="ops-dialog-evidence-summary">
                <small>Yêu cầu đang review</small>
                <strong>
                  {localizedVerificationText(
                    action.requirement.names,
                    humanize(action.requirement.category),
                  )}
                </strong>
                <p>
                  {localizedVerificationText(
                    action.requirement.descriptions,
                    'Chưa cấu hình tiêu chí kiểm tra.',
                  )}
                </p>
                <dl>
                  <div>
                    <dt>Nguồn</dt>
                    <dd>{evidenceDisplayName(action.evidence)}</dd>
                  </div>
                  <div>
                    <dt>Hiệu lực</dt>
                    <dd>{action.evidence.expiresAt ?? 'Chưa cung cấp ngày hết hạn'}</dd>
                  </div>
                </dl>
                {evidenceOpenable ? (
                  <a
                    href={verificationEvidenceHref(detail.id, action.evidence)}
                    onClick={() => setEvidenceOpened(true)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <OperationsIcon name="document" />
                    Mở tài liệu / nguồn để kiểm tra
                  </a>
                ) : (
                  <div className="ops-dialog-evidence-warning">
                    <OperationsIcon name="alert" />
                    Không có tài liệu hoặc đường dẫn có thể mở. Bằng chứng này không đủ điều kiện để
                    duyệt.
                  </div>
                )}
              </section>

              {action.decision === 'APPROVE' ? (
                <fieldset className="ops-review-confirmations">
                  <legend>Xác nhận bắt buộc trước khi duyệt</legend>
                  <label>
                    <input
                      disabled={!evidenceOpened}
                      name="checks"
                      required
                      type="checkbox"
                      value="SOURCE_REVIEWED"
                    />
                    <span>Tôi đã mở và kiểm tra tài liệu hoặc nguồn tham chiếu.</span>
                  </label>
                  <label>
                    <input
                      disabled={!evidenceOpened}
                      name="checks"
                      required
                      type="checkbox"
                      value="SUBJECT_MATCHED"
                    />
                    <span>Thông tin trên bằng chứng khớp với đối tượng của hồ sơ.</span>
                  </label>
                  <label>
                    <input
                      disabled={!evidenceOpened}
                      name="checks"
                      required
                      type="checkbox"
                      value="CRITERIA_AND_VALIDITY_CONFIRMED"
                    />
                    <span>Bằng chứng đáp ứng tiêu chí và còn hiệu lực.</span>
                  </label>
                  {action.requirement.highRisk ? (
                    <label>
                      <input
                        disabled={!evidenceOpened}
                        name="checks"
                        required
                        type="checkbox"
                        value="ENHANCED_CHECK_COMPLETED"
                      />
                      <span>Đã hoàn tất kiểm soát tăng cường hoặc đối chiếu nguồn độc lập.</span>
                    </label>
                  ) : null}
                  {!evidenceOpened && evidenceOpenable ? (
                    <small>Hãy mở tài liệu trước để bật các xác nhận.</small>
                  ) : null}
                </fieldset>
              ) : (
                <label>
                  <span>Lý do từ chối · Bắt buộc</span>
                  <select name="rejectionReason" required>
                    <option value="">Chọn lý do</option>
                    <option value="MISSING_OR_UNREADABLE">
                      Thiếu hoặc không đọc được tài liệu
                    </option>
                    <option value="SUBJECT_MISMATCH">Không khớp pháp nhân / đối tượng</option>
                    <option value="EXPIRED">Đã hết hạn</option>
                    <option value="UNVERIFIABLE_SOURCE">Không xác minh được nguồn</option>
                    <option value="INSUFFICIENT_SCOPE">Không đáp ứng đủ tiêu chí</option>
                    <option value="OTHER">Lý do khác</option>
                  </select>
                </label>
              )}
            </>
          ) : null}
          {action.kind === 'decision' ? (
            <label>
              <span>Quyết định</span>
              <select
                name="toStatus"
                onChange={(event) =>
                  setSelectedDecision(event.target.value as VerificationCaseDetail['status'])
                }
                value={selectedDecision}
              >
                {decisionOptions.map((status) => (
                  <option key={status} value={status}>
                    {verificationDecisionLabel(status)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {action.kind !== 'evidence' ? (
            <label>
              <span>Hết hạn xác minh {requiresExpiry ? '· Bắt buộc' : '· Không bắt buộc'}</span>
              <input name="expiresAt" required={requiresExpiry} type="datetime-local" />
            </label>
          ) : null}
          {action.kind === 'second' && action.approve ? (
            <label className="ops-second-approval-confirmation">
              <input name="independentCheck" required type="checkbox" />
              <span>
                Tôi xác nhận đã kiểm tra độc lập quyết định, các yêu cầu rủi ro cao và audit trail.
              </span>
            </label>
          ) : null}
          <label>
            <span>Lý do / ghi chú</span>
            <textarea
              maxLength={1_400}
              minLength={10}
              name="notes"
              placeholder="Nêu bằng chứng và cơ sở của quyết định…"
              required
              rows={5}
            />
          </label>
          <footer>
            <button onClick={onClose} type="button">
              Hủy
            </button>
            <button
              className="ops-button ops-button--primary"
              disabled={
                pending ||
                (action.kind === 'evidence' &&
                  action.decision === 'APPROVE' &&
                  (!evidenceOpenable || !evidenceOpened))
              }
              type="submit"
            >
              {pending
                ? 'Đang ghi nhận…'
                : action.kind === 'evidence'
                  ? action.decision === 'APPROVE'
                    ? 'Xác nhận duyệt'
                    : 'Xác nhận từ chối'
                  : action.kind === 'second'
                    ? action.approve
                      ? 'Phê duyệt cuối'
                      : 'Trả lại'
                    : 'Xác nhận quyết định'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function localizedVerificationText(
  values: Readonly<Record<string, string>>,
  fallback: string,
): string {
  return values['vi-VN'] ?? values['en-US'] ?? Object.values(values)[0] ?? fallback;
}

function openableSourceReference(reference: string | null): boolean {
  if (!reference) return false;
  if (reference.startsWith('/')) return true;
  try {
    const url = new URL(reference);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function verificationEvidenceHref(
  verificationCaseId: string,
  evidence: VerificationEvidenceView,
): string {
  if (!evidence.fileAssetId && openableSourceReference(evidence.sourceReference)) {
    return evidence.sourceReference ?? '#';
  }
  return `/api/operations/evidence/${verificationCaseId}/${evidence.id}`;
}

function evidenceDisplayName(evidence: VerificationEvidenceView): string {
  return (
    evidence.fileName ??
    evidence.sourceReference ??
    evidence.fileAssetId ??
    'Bằng chứng chưa có tên'
  );
}

function evidenceIsExpired(evidence: VerificationEvidenceView): boolean {
  return Boolean(
    evidence.expiresAt && Date.parse(`${evidence.expiresAt}T23:59:59+07:00`) < Date.now(),
  );
}

function evidenceFileCheck(evidence: VerificationEvidenceView): string {
  if (!evidence.fileAssetId) return 'Không áp dụng';
  if (evidence.fileStatus === 'AVAILABLE' && evidence.scanStatus === 'CLEAN') {
    return 'Sẵn sàng · Đã quét an toàn';
  }
  if (evidence.scanStatus === 'INFECTED') return 'Phát hiện mã độc';
  if (evidence.fileStatus === 'REJECTED' || evidence.scanStatus === 'ERROR')
    return 'Tệp bị từ chối';
  return 'Chưa sẵn sàng';
}

function verificationFourEyesProgress(detail: VerificationCaseDetail): {
  readonly completed: 0 | 1 | 2;
} {
  const review = detail.reviews.find(({ fourEyesRequired }) => fourEyesRequired);
  if (!review) return { completed: 0 };
  return { completed: review.status === 'APPLIED' ? 2 : 1 };
}

function verificationDecisionCta(
  status: VerificationCaseDetail['status'],
  requiredBlockers: number,
): string {
  if (status === 'SUBMITTED') return 'Bắt đầu xem xét';
  if (status === 'UNDER_REVIEW') {
    return requiredBlockers ? 'Xử lý hồ sơ chưa đạt' : 'Gửi phê duyệt hồ sơ';
  }
  if (status === 'APPROVED') return 'Gửi phê duyệt cuối';
  return 'Ghi quyết định hồ sơ';
}

function riskLabel(value: string): string {
  return (
    {
      STANDARD: 'Rủi ro tiêu chuẩn',
      LOW: 'Rủi ro thấp',
      MEDIUM: 'Rủi ro vừa',
      HIGH: 'Rủi ro cao',
      CRITICAL: 'Rủi ro nghiêm trọng',
    }[value] ?? humanize(value)
  );
}

const verificationTransitions: Readonly<
  Record<VerificationCaseDetail['status'], readonly VerificationCaseDetail['status'][]>
> = {
  NOT_SUBMITTED: ['DRAFT'],
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ADDITIONAL_INFORMATION_REQUIRED', 'SITE_AUDIT_REQUIRED', 'APPROVED', 'REJECTED'],
  ADDITIONAL_INFORMATION_REQUIRED: ['SUBMITTED', 'REJECTED'],
  SITE_AUDIT_REQUIRED: ['UNDER_REVIEW', 'REJECTED'],
  APPROVED: ['VERIFIED'],
  VERIFIED: ['VERIFICATION_EXPIRING', 'SUSPENDED'],
  VERIFICATION_EXPIRING: ['VERIFIED', 'EXPIRED', 'SUSPENDED'],
  EXPIRED: ['UNDER_REVIEW', 'SUSPENDED'],
  SUSPENDED: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
  REJECTED: ['DRAFT'],
};

function availableVerificationTransitions(
  status: VerificationCaseDetail['status'],
): readonly VerificationCaseDetail['status'][] {
  return verificationTransitions[status];
}

function verificationDecisionLabel(status: VerificationCaseDetail['status']): string {
  const labels: Partial<Record<VerificationCaseDetail['status'], string>> = {
    DRAFT: 'Đưa về bản nháp',
    SUBMITTED: 'Gửi lại để xem xét',
    UNDER_REVIEW: 'Bắt đầu xem xét',
    ADDITIONAL_INFORMATION_REQUIRED: 'Yêu cầu bổ sung thông tin',
    SITE_AUDIT_REQUIRED: 'Yêu cầu kiểm tra thực địa',
    APPROVED: 'Đề xuất phê duyệt',
    VERIFIED: 'Xác minh hồ sơ',
    VERIFICATION_EXPIRING: 'Đánh dấu sắp hết hạn',
    EXPIRED: 'Đánh dấu hết hạn',
    SUSPENDED: 'Tạm ngưng xác minh',
    REJECTED: 'Từ chối hồ sơ',
  };
  return labels[status] ?? humanize(status);
}

function verificationRiskSignals(detail: VerificationCaseDetail): readonly string[] {
  const signals: string[] = [];
  const evidence = detail.requirements.flatMap((requirement) => requirement.evidence);
  const requiredNotMet = detail.requirements.filter(
    ({ required, status }) => required && !['APPROVED', 'WAIVED'].includes(status),
  ).length;
  const rejected = detail.requirements.filter(({ status }) => status === 'REJECTED').length;
  const highRisk = detail.requirements.filter(({ highRisk }) => highRisk).length;
  const revoked = evidence.filter(({ revokedAt }) => revokedAt).length;
  const expired = evidence.filter(
    ({ expiresAt }) => expiresAt && Date.parse(`${expiresAt}T23:59:59+07:00`) < Date.now(),
  ).length;

  if (rejected) signals.push(`${rejected} yêu cầu đang bị từ chối và chặn quyết định.`);
  if (requiredNotMet) signals.push(`${requiredNotMet} yêu cầu bắt buộc chưa đạt.`);
  if (revoked) signals.push(`${revoked} bằng chứng đã bị thu hồi.`);
  if (expired) signals.push(`${expired} bằng chứng đã hết hạn.`);
  if (highRisk) signals.push(`${highRisk} yêu cầu thuộc nhóm kiểm soát tăng cường.`);

  if (!signals.length && detail.riskLevel === 'HIGH') {
    signals.push(`Phân loại rủi ro cao theo phương pháp ${detail.methodologyVersion}.`);
  }
  if (!signals.length) {
    signals.push('Không có điều kiện chặn được phát hiện từ checklist hiện tại.');
  }
  return signals;
}

function verificationNextStep(
  detail: VerificationCaseDetail,
  currentUserId: string,
): { readonly title: string; readonly body: string } {
  if (detail.status === 'VERIFIED') {
    return {
      title: 'Quyết định đã hoàn tất',
      body: detail.expiresAt
        ? `Hồ sơ đang có hiệu lực và ${relativeDue(detail.expiresAt).toLocaleLowerCase('vi-VN')}.`
        : 'Mở lịch sử để xem người phê duyệt và cơ sở quyết định.',
    };
  }
  if (detail.status === 'REJECTED') {
    return {
      title: 'Hồ sơ đã bị từ chối',
      body: 'Mở lịch sử để xem lý do và audit trail của quyết định.',
    };
  }

  const pendingSecondReview = detail.reviews.find(
    ({ status }) => status === 'PENDING_SECOND_APPROVAL',
  );
  if (pendingSecondReview) {
    return pendingSecondReview.reviewerUserId === currentUserId
      ? {
          title: 'Đang chờ reviewer thứ hai',
          body: 'Bạn đã ghi quyết định; chính sách phê duyệt kép yêu cầu một người khác phê duyệt độc lập.',
        }
      : {
          title: 'Cần phê duyệt độc lập',
          body: 'Kiểm tra quyết định, bằng chứng và ghi lý do phê duyệt độc lập.',
        };
  }

  if (!detail.assignedReviewerUserId) {
    return {
      title: 'Chờ reviewer nhận hồ sơ',
      body: 'Reviewer có thẩm quyền cần nhận hồ sơ trước khi review bằng chứng.',
    };
  }
  if (detail.assignedReviewerUserId !== currentUserId) {
    return {
      title: 'Reviewer khác đang phụ trách',
      body: 'Bạn có thể theo dõi tiến độ và audit trail nhưng không thấy CTA xử lý chính.',
    };
  }

  const blockers = detail.requirements.filter(
    ({ required, status }) => required && !['APPROVED', 'WAIVED'].includes(status),
  ).length;
  if (blockers) {
    return {
      title: `Còn ${blockers} yêu cầu bắt buộc chưa đạt`,
      body: 'Review bằng chứng hoặc yêu cầu bổ sung trước khi tạo quyết định.',
    };
  }
  return {
    title: 'Sẵn sàng ghi quyết định',
    body: 'Checklist bắt buộc đã đạt; quyết định vẫn cần lý do và audit trail.',
  };
}
