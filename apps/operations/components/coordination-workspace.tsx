'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { CustomSelect } from '@dental-trust/ui';
import { OperationsIcon } from './operations-icon';
import { OpsAvatar, OpsEmpty, OpsMetric, OpsPanelHeader, OpsStatus } from './operations-ui';
import type { CoordinationData, CoordinationDetail } from '@/lib/operations-data';
import { commandErrorMessage, sendOperationsCommand } from '@/lib/operations-command';
import { formatDateTime, humanize, initials, relativeDue } from '@/lib/presentation';

type QueueFilter = 'all' | 'mine' | 'unassigned' | 'urgent' | 'overdue';
type DetailTab = 'overview' | 'tasks' | 'activity' | 'handoff';

interface CoordinationMatchingResult {
  readonly id: string;
  readonly clinicId: string;
  readonly clinicName: string;
  readonly organicRank: number;
  readonly fitScore: number;
  readonly reasons: readonly string[];
  readonly limitations: readonly string[];
}

interface CoordinationShortlistEntry {
  readonly id: string;
  readonly clinicId: string;
  readonly clinicName: string;
  readonly displayedRank: number;
  readonly fitScore: number;
  readonly overrideReason: string | null;
  readonly status: string;
}

interface CoordinationAppendOnlyNote {
  readonly id: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly createdAt: string;
}

interface CoordinationCommunication {
  readonly id: string;
  readonly channel: string;
  readonly direction: string;
  readonly summary: string;
  readonly occurredAt: string;
}

interface CoordinationHandoff {
  readonly id: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly reason: string;
  readonly status: string;
  readonly createdAt: string;
  readonly acceptedAt: string | null;
}

interface CoordinationSupervisorReview {
  readonly id: string;
  readonly reviewerUserId: string;
  readonly decision: string;
  readonly note: string;
  readonly workspaceVersion: number;
  readonly createdAt: string;
}

type ExecuteCommand = (operation: () => Promise<unknown>, success: string) => Promise<boolean>;

export function CoordinationWorkspace({
  data,
  currentUserId,
  initialSelectedId,
  cursorActive,
}: {
  readonly data: CoordinationData;
  readonly currentUserId: string;
  readonly initialSelectedId: string | null;
  readonly cursorActive: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [detail, setDetail] = useState<CoordinationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    return data.queue.filter((item) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'mine' &&
          (item.assignedAgentUserId === currentUserId ||
            item.supervisorUserId === currentUserId)) ||
        (filter === 'unassigned' && item.assignedAgentUserId === null) ||
        (filter === 'urgent' && item.priority === 'URGENT') ||
        (filter === 'overdue' &&
          Date.parse(item.slaDueAt) < Date.now() &&
          item.status !== 'RESOLVED');
      if (!matchesFilter) return false;
      if (!normalized) return true;
      return [item.case.caseNumber, item.case.title, item.status, item.priority].some((value) =>
        value.toLocaleLowerCase('vi-VN').includes(normalized),
      );
    });
  }, [currentUserId, data.queue, filter, query]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setError(null);
    void fetch(
      `/api/operations/data?kind=coordination&resourceId=${encodeURIComponent(selectedId)}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const envelope = (await response.json()) as { data?: CoordinationDetail; error?: string };
        if (!response.ok || !envelope.data) throw new Error(envelope.error ?? 'detail_unavailable');
        setDetail(envelope.data);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError('Không thể tải chi tiết ca điều phối.');
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  async function execute(operation: () => Promise<unknown>, success: string): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      await operation();
      setNotice(success);
      router.refresh();
      if (selectedId) {
        const response = await fetch(
          `/api/operations/data?kind=coordination&resourceId=${encodeURIComponent(selectedId)}`,
        );
        const envelope = (await response.json()) as { data?: CoordinationDetail };
        if (envelope.data) setDetail(envelope.data);
      }
      return true;
    } catch (reason) {
      setError(commandErrorMessage(reason));
      return false;
    } finally {
      setPending(false);
    }
  }

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
          <span className="ops-eyebrow">Concierge operations</span>
          <h1>Điều phối hành trình</h1>
          <p>Triage, phân công và tháo gỡ blocker theo một hàng đợi SLA duy nhất.</p>
        </div>
        <button
          className="ops-button ops-button--primary"
          onClick={() => {
            setFilter('unassigned');
            const firstUnassigned = data.queue.find((item) => item.assignedAgentUserId === null);
            if (firstUnassigned) {
              setSelectedId(firstUnassigned.caseId);
              setDetailTab('overview');
            }
          }}
          type="button"
        >
          <OperationsIcon name="inbox" />
          Mở ca chưa phân công
        </button>
      </header>

      <section aria-label="Chỉ số điều phối" className="ops-metric-grid ops-metric-grid--four">
        <OpsMetric
          icon="inbox"
          label="Tổng ca"
          note="Trong phạm vi tổ chức"
          value={data.dashboard?.total ?? data.queue.length}
        />
        <OpsMetric
          icon="alert"
          label="Quá SLA"
          note="Cần escalation"
          tone="coral"
          value={data.dashboard?.overdue ?? 0}
        />
        <OpsMetric
          icon="users"
          label="Chưa phân công"
          note="Đang chờ nhận việc"
          tone="amber"
          value={data.dashboard?.unassigned ?? 0}
        />
        <OpsMetric
          icon="trend"
          label="Ưu tiên khẩn"
          note="Loại trừ ca đã đóng"
          tone="blue"
          value={data.dashboard?.urgent ?? 0}
        />
      </section>

      <section className="ops-panel ops-queue-panel">
        <OpsPanelHeader
          action={
            <div className="ops-list-tools">
              <label>
                <OperationsIcon name="search" />
                <input
                  aria-label="Tìm ca điều phối"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Mã ca hoặc nội dung…"
                  value={query}
                />
              </label>
              <button aria-label="Làm mới" onClick={() => router.refresh()} type="button">
                <OperationsIcon name="refresh" />
              </button>
            </div>
          }
          description={`${filtered.length} trên ${data.queue.length} ca · dữ liệu trực tiếp`}
          icon="coordination"
          title="Hàng đợi điều phối"
        />
        <div aria-label="Lọc hàng đợi" className="ops-segmented" role="toolbar">
          {(
            [
              ['all', 'Tất cả', data.queue.length],
              [
                'mine',
                'Của tôi',
                data.queue.filter(
                  (item) =>
                    item.assignedAgentUserId === currentUserId ||
                    item.supervisorUserId === currentUserId,
                ).length,
              ],
              ['unassigned', 'Chưa phân công', data.dashboard?.unassigned ?? 0],
              ['urgent', 'Ưu tiên khẩn', data.dashboard?.urgent ?? 0],
              ['overdue', 'Quá SLA', data.dashboard?.overdue ?? 0],
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
        {!data.available ? (
          <OpsEmpty
            body="Hãy chọn hoặc đăng nhập tài khoản thuộc tổ chức Concierge để xem hàng đợi thật."
            icon="coordination"
            title="Chưa có phạm vi điều phối"
          />
        ) : filtered.length ? (
          <div className="ops-data-list ops-coordination-list">
            <div className="ops-data-list__head">
              <span>Ca điều trị</span>
              <span>Trạng thái</span>
              <span>Phụ trách</span>
              <span>SLA</span>
              <span />
            </div>
            {filtered.map((item) => (
              <button
                className={selectedId === item.caseId ? 'is-selected' : ''}
                key={item.id}
                onClick={() => {
                  setSelectedId(item.caseId);
                  setDetailTab('overview');
                }}
                type="button"
              >
                <span className="ops-record-main">
                  <OpsAvatar label={initials(item.case.title)} />
                  <span>
                    <small>{item.case.caseNumber}</small>
                    <strong>{item.case.title}</strong>
                    <em>{humanize(item.case.status)}</em>
                  </span>
                </span>
                <span>
                  <OpsStatus value={item.status} />
                  <small
                    className={`ops-priority ops-priority--${item.priority.toLocaleLowerCase()}`}
                  >
                    {priorityLabel(item.priority)}
                  </small>
                </span>
                <span className="ops-owner">
                  {item.assignedAgentUserId ? (
                    <>
                      <OpsAvatar label="ĐP" tone="teal" />
                      <span>
                        <strong>Đã phân công</strong>
                        <small>
                          {item.assignedAgentUserId === currentUserId
                            ? 'Bạn phụ trách'
                            : 'Thành viên khác'}
                        </small>
                      </span>
                    </>
                  ) : (
                    <>
                      <OpsAvatar label="—" tone="amber" />
                      <span>
                        <strong>Chưa phân công</strong>
                        <small>Cần supervisor xử lý</small>
                      </span>
                    </>
                  )}
                </span>
                <time
                  className={
                    Date.parse(item.slaDueAt) < Date.now() && item.status !== 'RESOLVED'
                      ? 'is-overdue'
                      : ''
                  }
                  dateTime={item.slaDueAt}
                >
                  <strong>{relativeDue(item.slaDueAt)}</strong>
                  <small>{formatDateTime(item.slaDueAt)}</small>
                </time>
                <OperationsIcon name="chevron" />
              </button>
            ))}
          </div>
        ) : (
          <OpsEmpty body="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." title="Không có ca phù hợp" />
        )}
        {data.available && (cursorActive || data.page?.nextCursor) ? (
          <nav aria-label="Phân trang hàng đợi" className="ops-pagination">
            {cursorActive ? <Link href="/coordination">Về trang đầu</Link> : <span />}
            {data.page?.nextCursor ? (
              <Link href={`/coordination?cursor=${encodeURIComponent(data.page.nextCursor)}`}>
                Trang tiếp <OperationsIcon name="arrow" />
              </Link>
            ) : (
              <span>Đã đến cuối hàng đợi</span>
            )}
          </nav>
        ) : null}
      </section>

      {selectedId ? (
        <div className="ops-drawer-layer">
          <button
            aria-label="Đóng chi tiết"
            className="ops-drawer-backdrop"
            onClick={() => setSelectedId(null)}
            type="button"
          />
          <aside aria-label="Chi tiết ca điều phối" className="ops-drawer">
            <header>
              <div>
                <span className="ops-eyebrow">Case workspace</span>
                <h2>{detail?.case.caseNumber ?? 'Đang tải ca…'}</h2>
                <p>{detail?.case.title ?? 'Đang đồng bộ dữ liệu'}</p>
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
              <>
                <div className="ops-drawer-summary">
                  <OpsStatus value={detail.status} />
                  <span
                    className={`ops-priority ops-priority--${detail.priority.toLocaleLowerCase()}`}
                  >
                    {priorityLabel(detail.priority)}
                  </span>
                  <time>{relativeDue(detail.slaDueAt)}</time>
                </div>
                <nav aria-label="Khu vực chi tiết">
                  <button
                    aria-pressed={detailTab === 'overview'}
                    onClick={() => setDetailTab('overview')}
                    type="button"
                  >
                    Tổng quan
                  </button>
                  <button
                    aria-pressed={detailTab === 'tasks'}
                    onClick={() => setDetailTab('tasks')}
                    type="button"
                  >
                    Công việc <b>{detail.tasks.length}</b>
                  </button>
                  <button
                    aria-pressed={detailTab === 'activity'}
                    onClick={() => setDetailTab('activity')}
                    type="button"
                  >
                    Hoạt động{' '}
                    <b>
                      {detail.internalNotes.length +
                        detail.travelNotes.length +
                        detail.communications.length}
                    </b>
                  </button>
                  <button
                    aria-pressed={detailTab === 'handoff'}
                    onClick={() => setDetailTab('handoff')}
                    type="button"
                  >
                    Bàn giao <b>{detail.handoffs.length}</b>
                  </button>
                </nav>
                <div className="ops-drawer-body">
                  {detailTab === 'overview' ? (
                    <CoordinationOverview
                      currentUserId={currentUserId}
                      detail={detail}
                      execute={execute}
                      pending={pending}
                    />
                  ) : null}
                  {detailTab === 'tasks' ? (
                    <CoordinationTasks detail={detail} execute={execute} pending={pending} />
                  ) : null}
                  {detailTab === 'activity' ? (
                    <CoordinationActivity detail={detail} execute={execute} pending={pending} />
                  ) : null}
                  {detailTab === 'handoff' ? (
                    <CoordinationHandoffs
                      currentUserId={currentUserId}
                      detail={detail}
                      execute={execute}
                      pending={pending}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <OpsEmpty
                body="Đóng bảng chi tiết và thử mở lại ca."
                icon="alert"
                title="Không thể tải dữ liệu"
              />
            )}
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function CoordinationOverview({
  currentUserId,
  detail,
  execute,
  pending,
}: {
  readonly currentUserId: string;
  readonly detail: CoordinationDetail;
  readonly execute: ExecuteCommand;
  readonly pending: boolean;
}) {
  const assignedAgentUserId = detail.assignedAgentUserId ?? detail.assignedAgent?.id ?? null;
  const supervisorUserId = detail.supervisorUserId ?? detail.supervisor?.id ?? null;
  return (
    <>
      <section className="ops-detail-section">
        <h3>Phân công ca</h3>
        <dl>
          <div>
            <dt>Điều phối viên</dt>
            <dd>{detail.assignedAgent?.email ?? assignedAgentUserId ?? 'Chưa phân công'}</dd>
          </div>
          <div>
            <dt>Supervisor</dt>
            <dd>{detail.supervisor?.email ?? supervisorUserId ?? 'Chưa chỉ định supervisor'}</dd>
          </div>
        </dl>
        {assignedAgentUserId !== currentUserId ? (
          <form
            className="ops-note-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void execute(
                () =>
                  sendOperationsCommand({
                    command: 'coordination_assign',
                    resourceId: detail.caseId,
                    payload: {
                      assignedAgentUserId: currentUserId,
                      expectedVersion: detail.version,
                      priority: detail.priority,
                      ...(supervisorUserId ? { supervisorUserId } : {}),
                    },
                  }),
                'Bạn đã nhận phụ trách ca này.',
              );
            }}
          >
            <button className="ops-button ops-button--primary" disabled={pending} type="submit">
              <OperationsIcon name="inbox" />
              {pending ? 'Đang nhận ca…' : 'Nhận ca cho tôi'}
            </button>
          </form>
        ) : (
          <p className="ops-muted">Bạn đang là điều phối viên phụ trách ca này.</p>
        )}
      </section>
      <form
        className="ops-detail-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const assignedAgentUserId = String(form.get('assignedAgentUserId')).trim();
          const supervisorUserId = String(form.get('supervisorUserId')).trim();
          void execute(
            () =>
              sendOperationsCommand({
                command: 'coordination_assign',
                resourceId: detail.caseId,
                payload: {
                  assignedAgentUserId,
                  expectedVersion: detail.version,
                  priority: String(form.get('assignmentPriority')),
                  ...(supervisorUserId ? { supervisorUserId } : {}),
                },
              }),
            'Đã cập nhật người phụ trách ca.',
          );
        }}
      >
        <header>
          <div>
            <h3>Phân công thành viên</h3>
            <p>Dành cho supervisor; thành viên phải đang hoạt động trong tổ chức Concierge.</p>
          </div>
        </header>
        <label>
          <span>User ID điều phối viên</span>
          <textarea
            defaultValue={assignedAgentUserId ?? currentUserId}
            minLength={36}
            name="assignedAgentUserId"
            required
            rows={1}
          />
        </label>
        <label>
          <span>User ID supervisor (không bắt buộc)</span>
          <textarea defaultValue={supervisorUserId ?? ''} name="supervisorUserId" rows={1} />
        </label>
        <label>
          <span>Ưu tiên và SLA mới</span>
          <CustomSelect defaultValue={detail.priority} name="assignmentPriority">
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </CustomSelect>
        </label>
        <button className="ops-button" disabled={pending} type="submit">
          {pending ? 'Đang phân công…' : 'Phân công'}
        </button>
      </form>
      <section className="ops-detail-section">
        <h3>Bệnh nhân và hành trình</h3>
        <dl>
          <div>
            <dt>Thủ thuật</dt>
            <dd>{humanize(detail.case.desiredProcedureCode)}</dd>
          </div>
          <div>
            <dt>Điểm đến</dt>
            <dd>{detail.case.preferredLocation ?? 'Chưa xác định'}</dd>
          </div>
          <div>
            <dt>Thời gian dự kiến</dt>
            <dd>
              {detail.case.expectedArrivalDate ?? '—'} → {detail.case.expectedDepartureDate ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Hồ sơ thiếu</dt>
            <dd>
              {detail.missingDocumentCategories.length
                ? detail.missingDocumentCategories.map(humanize).join(', ')
                : 'Không có'}
            </dd>
          </div>
        </dl>
        {detail.patientSummary ? (
          <blockquote>{detail.patientSummary}</blockquote>
        ) : (
          <p className="ops-muted">Chưa có tóm tắt bệnh nhân.</p>
        )}
      </section>
      <form
        className="ops-detail-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const priority = String(form.get('priority'));
          const originalPriority = detail.priority;
          void execute(
            () =>
              sendOperationsCommand({
                command: 'coordination_update',
                resourceId: detail.caseId,
                payload: {
                  expectedVersion: detail.version,
                  priority,
                  ...(priority !== originalPriority
                    ? { priorityChangeReason: String(form.get('priorityChangeReason')) }
                    : {}),
                  status: String(form.get('status')),
                  patientSummary: String(form.get('patientSummary')),
                  missingDocumentCategories: detail.missingDocumentCategories,
                },
              }),
            'Đã cập nhật workspace điều phối.',
          );
        }}
      >
        <header>
          <div>
            <h3>Cập nhật workspace</h3>
            <p>Thay đổi trạng thái và SLA được ghi audit.</p>
          </div>
        </header>
        <label>
          <span>Trạng thái</span>
          <CustomSelect defaultValue={detail.status} name="status">
            {[
              'ASSIGNED',
              'IN_PROGRESS',
              'WAITING_PATIENT',
              'WAITING_CLINIC',
              'SUPERVISOR_REVIEW',
              'HANDED_OFF',
              'RESOLVED',
            ].map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </CustomSelect>
        </label>
        <div className="ops-form-row">
          <label>
            <span>Ưu tiên</span>
            <CustomSelect defaultValue={detail.priority} name="priority">
              {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </CustomSelect>
          </label>
          <label>
            <span>Lý do đổi ưu tiên</span>
            <CustomSelect defaultValue="SUPERVISOR_DECISION" name="priorityChangeReason">
              <option value="CLINICAL_RISK">Rủi ro lâm sàng</option>
              <option value="TRAVEL_DEADLINE">Hạn chuyến đi</option>
              <option value="MISSING_DOCUMENT">Thiếu hồ sơ</option>
              <option value="PATIENT_REQUEST">Yêu cầu bệnh nhân</option>
              <option value="CLINIC_DEPENDENCY">Phụ thuộc phòng khám</option>
              <option value="SUPERVISOR_DECISION">Quyết định supervisor</option>
            </CustomSelect>
          </label>
        </div>
        <label>
          <span>Tóm tắt bệnh nhân</span>
          <textarea
            defaultValue={detail.patientSummary ?? ''}
            minLength={1}
            name="patientSummary"
            required
            rows={5}
          />
        </label>
        <button className="ops-button ops-button--primary" disabled={pending} type="submit">
          {pending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </form>
      <CoordinationRecommendations detail={detail} execute={execute} pending={pending} />
    </>
  );
}

function CoordinationRecommendations({
  detail,
  execute,
  pending,
}: {
  readonly detail: CoordinationDetail;
  readonly execute: ExecuteCommand;
  readonly pending: boolean;
}) {
  const matchingResults = detail.matchingResults as readonly CoordinationMatchingResult[];
  const shortlist = detail.shortlist as readonly CoordinationShortlistEntry[];
  const shortlistedClinicIds = new Set(shortlist.map((entry) => entry.clinicId));
  return (
    <form
      className="ops-detail-form"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const selectedIds = form.getAll('matchingResultId').map(String);
        const firstCheckbox = formElement.querySelector<HTMLInputElement>(
          'input[name="matchingResultId"]',
        );
        firstCheckbox?.setCustomValidity('');
        if (!selectedIds.length) {
          firstCheckbox?.setCustomValidity('Chọn ít nhất một phòng khám.');
          firstCheckbox?.reportValidity();
          return;
        }
        const overrideReason = String(form.get('overrideReason')).trim();
        const recommendations = selectedIds.map((matchingResultId) => {
          const result = matchingResults.find((candidate) => candidate.id === matchingResultId);
          const displayedRank = Number(form.get(`rank:${matchingResultId}`));
          return {
            matchingResultId,
            displayedRank,
            ...(result && result.organicRank !== displayedRank && overrideReason
              ? { overrideReason }
              : {}),
          };
        });
        const rankChanged = recommendations.some((recommendation) => {
          const result = matchingResults.find(
            (candidate) => candidate.id === recommendation.matchingResultId,
          );
          return result?.organicRank !== recommendation.displayedRank;
        });
        const overrideField = formElement.elements.namedItem(
          'overrideReason',
        ) as HTMLTextAreaElement | null;
        overrideField?.setCustomValidity('');
        const rankField = formElement.elements.namedItem(
          `rank:${selectedIds[0] ?? ''}`,
        ) as HTMLInputElement | null;
        rankField?.setCustomValidity('');
        if (
          new Set(recommendations.map((recommendation) => recommendation.displayedRank)).size !==
          recommendations.length
        ) {
          rankField?.setCustomValidity('Thứ hạng hiển thị không được trùng nhau.');
          rankField?.reportValidity();
          return;
        }
        if (rankChanged && overrideReason.length < 10) {
          overrideField?.setCustomValidity(
            'Cần ít nhất 10 ký tự để giải thích thay đổi thứ hạng organic.',
          );
          overrideField?.reportValidity();
          return;
        }
        void execute(
          () =>
            sendOperationsCommand({
              command: 'coordination_recommendations',
              resourceId: detail.caseId,
              payload: {
                expectedWorkspaceVersion: detail.version,
                recommendations,
                shareWithPatient: form.get('shareWithPatient') === 'on',
              },
            }),
          'Đã cập nhật shortlist phòng khám.',
        );
      }}
    >
      <header>
        <div>
          <h3>Shortlist đề xuất</h3>
          <p>Chọn clinic, đặt thứ hạng hiển thị và giải thích mọi thay đổi organic rank.</p>
        </div>
      </header>
      {matchingResults.length ? (
        <div className="ops-task-list">
          {matchingResults.slice(0, 10).map((result) => {
            const existing = shortlist.find((entry) => entry.clinicId === result.clinicId);
            return (
              <article key={result.id}>
                <span>
                  <input
                    aria-label={`Chọn ${result.clinicName}`}
                    defaultChecked={shortlistedClinicIds.has(result.clinicId)}
                    name="matchingResultId"
                    type="checkbox"
                    value={result.id}
                  />
                </span>
                <div>
                  <strong>
                    #{result.organicRank} · {result.clinicName}
                  </strong>
                  <small>Fit score {result.fitScore}/100</small>
                  {result.reasons.length ? <p>{result.reasons.join(' · ')}</p> : null}
                  {result.limitations.length ? (
                    <p>Hạn chế: {result.limitations.join(' · ')}</p>
                  ) : null}
                  <label>
                    <small>Thứ hạng hiển thị</small>
                    <input
                      defaultValue={existing?.displayedRank ?? result.organicRank}
                      max={25}
                      min={1}
                      name={`rank:${result.id}`}
                      required
                      type="number"
                    />
                  </label>
                </div>
                {existing ? <OpsStatus value={existing.status} /> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <OpsEmpty
          body="Cần chạy matching trước khi điều phối viên tạo shortlist."
          title="Chưa có kết quả matching"
        />
      )}
      {matchingResults.length ? (
        <>
          <label>
            <span>Lý do thay đổi thứ hạng</span>
            <textarea
              defaultValue={shortlist.find((entry) => entry.overrideReason)?.overrideReason ?? ''}
              maxLength={2000}
              name="overrideReason"
              placeholder="Giải thích dựa trên nhu cầu bệnh nhân hoặc bằng chứng vận hành…"
              rows={3}
            />
          </label>
          <label>
            <span>Hiển thị cho bệnh nhân</span>
            <input
              defaultChecked={shortlist.some((entry) => entry.status !== 'PROPOSED')}
              name="shareWithPatient"
              type="checkbox"
            />
          </label>
          <button className="ops-button ops-button--primary" disabled={pending} type="submit">
            {pending ? 'Đang lưu shortlist…' : 'Lưu shortlist'}
          </button>
        </>
      ) : null}
    </form>
  );
}

function CoordinationTasks({
  detail,
  execute,
  pending,
}: {
  readonly detail: CoordinationDetail;
  readonly execute: ExecuteCommand;
  readonly pending: boolean;
}) {
  return (
    <>
      <section className="ops-detail-section">
        <h3>Công việc theo ca</h3>
        {detail.tasks.length ? (
          <div className="ops-task-list">
            {detail.tasks.map((task) => (
              <article key={task.id}>
                <span>
                  <OperationsIcon name="check" />
                </span>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    {humanize(task.kind)} · {formatDateTime(task.dueAt)}
                  </small>
                  {task.details ? <p>{task.details}</p> : null}
                </div>
                <OpsStatus value={task.status} />
              </article>
            ))}
          </div>
        ) : (
          <OpsEmpty
            body="Tạo task khi cần theo dõi một cam kết cụ thể."
            title="Chưa có công việc"
          />
        )}
      </section>
      <form
        className="ops-detail-form"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          const details = String(form.get('details')).trim();
          const assignedUserId = String(form.get('assignedUserId')).trim();
          void execute(
            () =>
              sendOperationsCommand({
                command: 'coordination_task_create',
                resourceId: detail.caseId,
                payload: {
                  kind: String(form.get('kind')),
                  title: String(form.get('title')).trim(),
                  ...(details ? { details } : {}),
                  ...(assignedUserId ? { assignedUserId } : {}),
                  dueAt: new Date(String(form.get('dueAt'))).toISOString(),
                },
              }),
            'Đã tạo công việc theo ca.',
          ).then((succeeded) => {
            if (succeeded) formElement.reset();
          });
        }}
      >
        <header>
          <div>
            <h3>Tạo công việc</h3>
            <p>Task có người phụ trách, hạn xử lý và audit riêng.</p>
          </div>
        </header>
        <label>
          <span>Loại công việc</span>
          <CustomSelect defaultValue="FOLLOW_UP" name="kind">
            {[
              'MISSING_DOCUMENT',
              'MATCHING',
              'APPOINTMENT',
              'TRAVEL',
              'AFTERCARE',
              'INCIDENT',
              'FOLLOW_UP',
              'OTHER',
            ].map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </CustomSelect>
        </label>
        <label>
          <span>Tiêu đề</span>
          <textarea maxLength={500} minLength={1} name="title" required rows={1} />
        </label>
        <label>
          <span>Chi tiết</span>
          <textarea maxLength={5000} name="details" rows={3} />
        </label>
        <div className="ops-form-row">
          <label>
            <span>Hạn xử lý</span>
            <input
              defaultValue={toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000))}
              name="dueAt"
              required
              type="datetime-local"
            />
          </label>
          <label>
            <span>User ID phụ trách (không bắt buộc)</span>
            <textarea name="assignedUserId" rows={1} />
          </label>
        </div>
        <button className="ops-button ops-button--primary" disabled={pending} type="submit">
          {pending ? 'Đang tạo…' : 'Tạo công việc'}
        </button>
      </form>
      {detail.tasks.length ? (
        <form
          className="ops-detail-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const taskId = String(form.get('taskId'));
            const task = detail.tasks.find((candidate) => candidate.id === taskId);
            if (!task) return;
            void execute(
              () =>
                sendOperationsCommand({
                  command: 'coordination_task_transition',
                  resourceId: detail.caseId,
                  secondaryId: taskId,
                  payload: {
                    expectedVersion: task.version,
                    status: String(form.get('taskStatus')),
                  },
                }),
              'Đã cập nhật trạng thái công việc.',
            );
          }}
        >
          <header>
            <div>
              <h3>Chuyển trạng thái task</h3>
              <p>Version của task được kiểm tra để tránh ghi đè thay đổi đồng thời.</p>
            </div>
          </header>
          <label>
            <span>Công việc</span>
            <CustomSelect defaultValue={detail.tasks[0]?.id} name="taskId">
              {detail.tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </CustomSelect>
          </label>
          <label>
            <span>Trạng thái mới</span>
            <CustomSelect defaultValue="IN_PROGRESS" name="taskStatus">
              {['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </CustomSelect>
          </label>
          <button className="ops-button ops-button--primary" disabled={pending} type="submit">
            {pending ? 'Đang cập nhật…' : 'Cập nhật task'}
          </button>
        </form>
      ) : null}
    </>
  );
}

function CoordinationActivity({
  detail,
  execute,
  pending,
}: {
  readonly detail: CoordinationDetail;
  readonly execute: ExecuteCommand;
  readonly pending: boolean;
}) {
  const travelNotes = detail.travelNotes as readonly CoordinationAppendOnlyNote[];
  const communications = detail.communications as readonly CoordinationCommunication[];
  return (
    <>
      <CoordinationNoteSection
        command="coordination_note"
        detail={detail}
        empty="Ghi chú chỉ hiển thị cho đội vận hành có quyền."
        execute={execute}
        pending={pending}
        records={detail.internalNotes}
        success="Đã thêm ghi chú nội bộ."
        title="Ghi chú nội bộ"
      />
      <CoordinationNoteSection
        command="coordination_travel_note"
        detail={detail}
        empty="Ghi lại các mốc chuyến đi, visa, lưu trú hoặc đưa đón."
        execute={execute}
        pending={pending}
        records={travelNotes}
        success="Đã thêm ghi chú hành trình."
        title="Ghi chú hành trình"
      />
      <section className="ops-detail-section">
        <h3>Lịch sử liên lạc</h3>
        {communications.length ? (
          <div className="ops-note-list">
            {communications.map((communication) => (
              <article key={communication.id}>
                <OpsAvatar label={communication.channel.slice(0, 2)} tone="teal" />
                <div>
                  <p>{communication.summary}</p>
                  <small>
                    {humanize(communication.channel)} · {humanize(communication.direction)} ·{' '}
                    {formatDateTime(communication.occurredAt)}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <OpsEmpty
            body="Ghi lại cuộc gọi, email và tin nhắn liên quan đến ca."
            title="Chưa có liên lạc"
          />
        )}
      </section>
      <form
        className="ops-detail-form"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          void execute(
            () =>
              sendOperationsCommand({
                command: 'coordination_communication',
                resourceId: detail.caseId,
                payload: {
                  channel: String(form.get('channel')),
                  direction: String(form.get('direction')),
                  occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
                  summary: String(form.get('summary')).trim(),
                },
              }),
            'Đã ghi nhận hoạt động liên lạc.',
          ).then((succeeded) => {
            if (succeeded) formElement.reset();
          });
        }}
      >
        <header>
          <div>
            <h3>Ghi nhận liên lạc</h3>
            <p>Chỉ lưu phần tóm tắt cần thiết cho việc điều phối.</p>
          </div>
        </header>
        <div className="ops-form-row">
          <label>
            <span>Kênh</span>
            <CustomSelect defaultValue="PHONE" name="channel">
              {['PHONE', 'EMAIL', 'MESSAGE', 'VIDEO', 'IN_PERSON', 'SYSTEM'].map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </CustomSelect>
          </label>
          <label>
            <span>Chiều liên lạc</span>
            <CustomSelect defaultValue="OUTBOUND" name="direction">
              {['INBOUND', 'OUTBOUND', 'INTERNAL'].map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </CustomSelect>
          </label>
        </div>
        <label>
          <span>Thời điểm</span>
          <input
            defaultValue={toDateTimeLocal(new Date())}
            name="occurredAt"
            required
            type="datetime-local"
          />
        </label>
        <label>
          <span>Tóm tắt</span>
          <textarea maxLength={5000} minLength={1} name="summary" required rows={3} />
        </label>
        <button className="ops-button ops-button--primary" disabled={pending} type="submit">
          {pending ? 'Đang ghi nhận…' : 'Lưu liên lạc'}
        </button>
      </form>
    </>
  );
}

function CoordinationNoteSection({
  command,
  detail,
  empty,
  execute,
  pending,
  records,
  success,
  title,
}: {
  readonly command: 'coordination_note' | 'coordination_travel_note';
  readonly detail: CoordinationDetail;
  readonly empty: string;
  readonly execute: ExecuteCommand;
  readonly pending: boolean;
  readonly records: readonly CoordinationAppendOnlyNote[];
  readonly success: string;
  readonly title: string;
}) {
  return (
    <section className="ops-detail-section">
      <h3>{title}</h3>
      {records.length ? (
        <div className="ops-note-list">
          {records.toReversed().map((note) => (
            <article key={note.id}>
              <OpsAvatar label="ĐP" />
              <div>
                <p>{note.body}</p>
                <small>{formatDateTime(note.createdAt)}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <OpsEmpty body={empty} title={`Chưa có ${title.toLocaleLowerCase('vi-VN')}`} />
      )}
      <form
        className="ops-note-composer"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          void execute(
            () =>
              sendOperationsCommand({
                command,
                resourceId: detail.caseId,
                payload: { body: String(form.get('body')).trim() },
              }),
            success,
          ).then((succeeded) => {
            if (succeeded) formElement.reset();
          });
        }}
      >
        <textarea minLength={1} name="body" placeholder="Thêm bối cảnh cho ca…" required rows={3} />
        <button className="ops-button ops-button--primary" disabled={pending} type="submit">
          <OperationsIcon name="arrow" />
          Thêm ghi chú
        </button>
      </form>
    </section>
  );
}

function CoordinationHandoffs({
  currentUserId,
  detail,
  execute,
  pending,
}: {
  readonly currentUserId: string;
  readonly detail: CoordinationDetail;
  readonly execute: ExecuteCommand;
  readonly pending: boolean;
}) {
  const handoffs = detail.handoffs as readonly CoordinationHandoff[];
  const reviews = detail.supervisorReviews as readonly CoordinationSupervisorReview[];
  const assignedAgentUserId = detail.assignedAgentUserId ?? detail.assignedAgent?.id ?? null;
  const supervisorUserId = detail.supervisorUserId ?? detail.supervisor?.id ?? null;
  return (
    <>
      <section className="ops-detail-section">
        <h3>Lịch sử bàn giao</h3>
        {handoffs.length ? (
          <div className="ops-review-list">
            {handoffs.map((handoff) => (
              <article key={handoff.id}>
                <span>
                  <OperationsIcon name="users" />
                </span>
                <div>
                  <strong>
                    {handoff.fromUserId} → {handoff.toUserId}
                  </strong>
                  <small>{formatDateTime(handoff.createdAt)}</small>
                  <p>{handoff.reason}</p>
                </div>
                <div>
                  <OpsStatus value={handoff.status} />
                  {handoff.status === 'PENDING' && handoff.toUserId === currentUserId ? (
                    <button
                      disabled={pending}
                      onClick={() =>
                        void execute(
                          () =>
                            sendOperationsCommand({
                              command: 'coordination_handoff_accept',
                              resourceId: detail.caseId,
                              secondaryId: handoff.id,
                              payload: { expectedVersion: detail.version },
                            }),
                          'Đã tiếp nhận bàn giao ca.',
                        )
                      }
                      type="button"
                    >
                      Tiếp nhận
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <OpsEmpty
            body="Bàn giao luôn cần người nhận và lý do có thể audit."
            title="Chưa có bàn giao"
          />
        )}
      </section>
      {assignedAgentUserId === currentUserId ? (
        <form
          className="ops-detail-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void execute(
              () =>
                sendOperationsCommand({
                  command: 'coordination_handoff',
                  resourceId: detail.caseId,
                  payload: {
                    expectedVersion: detail.version,
                    reason: String(form.get('handoffReason')).trim(),
                    toAgentUserId: String(form.get('toAgentUserId')).trim(),
                  },
                }),
              'Đã gửi yêu cầu bàn giao.',
            );
          }}
        >
          <header>
            <div>
              <h3>Yêu cầu bàn giao</h3>
              <p>Người nhận phải chủ động tiếp nhận trước khi assignment được chuyển.</p>
            </div>
          </header>
          <label>
            <span>User ID người nhận</span>
            <textarea minLength={36} name="toAgentUserId" required rows={1} />
          </label>
          <label>
            <span>Lý do bàn giao</span>
            <textarea maxLength={2000} minLength={10} name="handoffReason" required rows={3} />
          </label>
          <button className="ops-button ops-button--primary" disabled={pending} type="submit">
            {pending ? 'Đang gửi…' : 'Gửi bàn giao'}
          </button>
        </form>
      ) : (
        <p className="ops-muted">Chỉ điều phối viên đang phụ trách mới có thể yêu cầu bàn giao.</p>
      )}
      <section className="ops-detail-section">
        <h3>Supervisor review</h3>
        {reviews.length ? (
          <div className="ops-review-list">
            {reviews.map((review) => (
              <article key={review.id}>
                <span>
                  <OperationsIcon name="shield" />
                </span>
                <div>
                  <strong>{humanize(review.decision)}</strong>
                  <small>
                    Version {review.workspaceVersion} · {formatDateTime(review.createdAt)}
                  </small>
                  <p>{review.note}</p>
                </div>
                <OpsStatus value={review.decision} />
              </article>
            ))}
          </div>
        ) : (
          <OpsEmpty
            body="Review được lưu cùng workspace version đã đánh giá."
            title="Chưa có review"
          />
        )}
      </section>
      {supervisorUserId === currentUserId ? (
        <form
          className="ops-detail-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void execute(
              () =>
                sendOperationsCommand({
                  command: 'coordination_supervisor_review',
                  resourceId: detail.caseId,
                  payload: {
                    decision: String(form.get('decision')),
                    expectedVersion: detail.version,
                    note: String(form.get('reviewNote')).trim(),
                  },
                }),
              'Đã ghi nhận quyết định của supervisor.',
            );
          }}
        >
          <header>
            <div>
              <h3>Gửi supervisor review</h3>
              <p>Quyết định được ràng buộc với version hiện tại của workspace.</p>
            </div>
          </header>
          <label>
            <span>Quyết định</span>
            <CustomSelect defaultValue="APPROVED" name="decision">
              <option value="APPROVED">Phê duyệt</option>
              <option value="CHANGES_REQUESTED">Yêu cầu thay đổi</option>
            </CustomSelect>
          </label>
          <label>
            <span>Nhận xét</span>
            <textarea maxLength={5000} minLength={3} name="reviewNote" required rows={4} />
          </label>
          <button className="ops-button ops-button--primary" disabled={pending} type="submit">
            {pending ? 'Đang review…' : 'Gửi review'}
          </button>
        </form>
      ) : (
        <p className="ops-muted">Chỉ supervisor được chỉ định mới có thể gửi review.</p>
      )}
    </>
  );
}

function toDateTimeLocal(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function priorityLabel(value: CoordinationDetail['priority']): string {
  return {
    LOW: 'Ưu tiên thấp',
    NORMAL: 'Ưu tiên thường',
    HIGH: 'Ưu tiên cao',
    URGENT: 'Khẩn cấp',
  }[value];
}
