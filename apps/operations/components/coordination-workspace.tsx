'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { OperationsIcon } from './operations-icon';
import { OpsAvatar, OpsEmpty, OpsMetric, OpsPanelHeader, OpsStatus } from './operations-ui';
import type { CoordinationData, CoordinationDetail } from '@/lib/operations-data';
import { commandErrorMessage, sendOperationsCommand } from '@/lib/operations-command';
import { formatDateTime, humanize, initials, relativeDue } from '@/lib/presentation';

type QueueFilter = 'all' | 'mine' | 'unassigned' | 'urgent' | 'overdue';
type DetailTab = 'overview' | 'tasks' | 'notes';

export function CoordinationWorkspace({
  data,
  currentUserId,
  initialSelectedId,
}: {
  readonly data: CoordinationData;
  readonly currentUserId: string;
  readonly initialSelectedId: string | null;
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

  async function execute(operation: () => Promise<unknown>, success: string) {
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
    } catch (reason) {
      setError(commandErrorMessage(reason));
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
          onClick={() => setFilter('unassigned')}
          type="button"
        >
          <OperationsIcon name="inbox" />
          Nhận việc từ hàng đợi
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
                    aria-pressed={detailTab === 'notes'}
                    onClick={() => setDetailTab('notes')}
                    type="button"
                  >
                    Ghi chú <b>{detail.internalNotes.length}</b>
                  </button>
                </nav>
                <div className="ops-drawer-body">
                  {detailTab === 'overview' ? (
                    <CoordinationOverview detail={detail} execute={execute} pending={pending} />
                  ) : null}
                  {detailTab === 'tasks' ? <CoordinationTasks detail={detail} /> : null}
                  {detailTab === 'notes' ? (
                    <CoordinationNotes detail={detail} execute={execute} pending={pending} />
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
  detail,
  execute,
  pending,
}: {
  readonly detail: CoordinationDetail;
  readonly execute: (operation: () => Promise<unknown>, success: string) => Promise<void>;
  readonly pending: boolean;
}) {
  return (
    <>
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
          <select defaultValue={detail.status} name="status">
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
          </select>
        </label>
        <div className="ops-form-row">
          <label>
            <span>Ưu tiên</span>
            <select defaultValue={detail.priority} name="priority">
              {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Lý do đổi ưu tiên</span>
            <select defaultValue="SUPERVISOR_DECISION" name="priorityChangeReason">
              <option value="CLINICAL_RISK">Rủi ro lâm sàng</option>
              <option value="TRAVEL_DEADLINE">Hạn chuyến đi</option>
              <option value="MISSING_DOCUMENT">Thiếu hồ sơ</option>
              <option value="PATIENT_REQUEST">Yêu cầu bệnh nhân</option>
              <option value="CLINIC_DEPENDENCY">Phụ thuộc phòng khám</option>
              <option value="SUPERVISOR_DECISION">Quyết định supervisor</option>
            </select>
          </label>
        </div>
        <label>
          <span>Tóm tắt bệnh nhân</span>
          <textarea
            defaultValue={detail.patientSummary ?? 'Chưa có thông tin tóm tắt.'}
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
    </>
  );
}

function CoordinationTasks({ detail }: { readonly detail: CoordinationDetail }) {
  return (
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
        <OpsEmpty body="Tạo task khi cần theo dõi một cam kết cụ thể." title="Chưa có công việc" />
      )}
    </section>
  );
}

function CoordinationNotes({
  detail,
  execute,
  pending,
}: {
  readonly detail: CoordinationDetail;
  readonly execute: (operation: () => Promise<unknown>, success: string) => Promise<void>;
  readonly pending: boolean;
}) {
  return (
    <section className="ops-detail-section">
      <h3>Ghi chú nội bộ</h3>
      {detail.internalNotes.length ? (
        <div className="ops-note-list">
          {detail.internalNotes.toReversed().map((note) => (
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
        <OpsEmpty body="Ghi chú chỉ hiển thị cho đội vận hành có quyền." title="Chưa có ghi chú" />
      )}
      <form
        className="ops-note-composer"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          const body = String(form.get('body'));
          void execute(
            () =>
              sendOperationsCommand({
                command: 'coordination_note',
                resourceId: detail.caseId,
                payload: { body },
              }),
            'Đã thêm ghi chú nội bộ.',
          ).then(() => formElement.reset());
        }}
      >
        <textarea minLength={1} name="body" placeholder="Thêm bối cảnh cho ca…" required rows={3} />
        <button className="ops-button ops-button--primary" disabled={pending} type="submit">
          <OperationsIcon name="arrow" />
          Ghi chú
        </button>
      </form>
    </section>
  );
}

function priorityLabel(value: CoordinationDetail['priority']): string {
  return {
    LOW: 'Ưu tiên thấp',
    NORMAL: 'Ưu tiên thường',
    HIGH: 'Ưu tiên cao',
    URGENT: 'Khẩn cấp',
  }[value];
}
