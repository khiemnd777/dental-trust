'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { CustomSelect } from '@dental-trust/ui';
import type { TreatmentPlanVersionView } from '@dental-trust/contracts';
import { ProviderDialog } from '@/components/provider-dialog';
import { ProviderIcon } from '@/components/provider-icon';
import type { ProviderCaseWorkspaceData } from '@/lib/provider-data';
import { commandErrorMessage, sendProviderCommand } from '@/lib/provider-command';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTime,
  humanize,
  labelAction,
  labelStatus,
  toneForStatus,
} from '@/lib/presentation';

type CaseTab = 'overview' | 'plan' | 'records' | 'appointments' | 'messages' | 'aftercare';
type DialogKind = 'decision' | 'appointment' | 'plan' | 'thread' | null;

const tabOptions: readonly {
  value: CaseTab;
  label: string;
  icon: 'home' | 'document' | 'cases' | 'calendar' | 'message' | 'aftercare';
}[] = [
  { value: 'overview', label: 'Tổng quan', icon: 'home' },
  { value: 'plan', label: 'Phương án', icon: 'document' },
  { value: 'records', label: 'Hồ sơ', icon: 'cases' },
  { value: 'appointments', label: 'Lịch hẹn', icon: 'calendar' },
  { value: 'messages', label: 'Tin nhắn', icon: 'message' },
  { value: 'aftercare', label: 'Hậu mãi', icon: 'aftercare' },
];

export function CaseWorkspace({
  data,
  initialTab,
  currentUserId,
}: {
  readonly data: ProviderCaseWorkspaceData;
  readonly initialTab: string;
  readonly currentUserId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<CaseTab>(initialTab as CaseTab);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [decision, setDecision] = useState<'ACCEPT' | 'DECLINE' | 'REQUEST_RECORDS'>('ACCEPT');
  const [selectedThreadId, setSelectedThreadId] = useState(data.threads?.[0]?.id ?? null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedThread = data.threads?.find((item) => item.id === selectedThreadId) ?? null;
  const selectedMessages = selectedThreadId ? (data.messages[selectedThreadId] ?? []) : [];

  async function execute(
    operation: () => Promise<unknown>,
    success: string,
    closeDialog = true,
  ): Promise<boolean> {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      if (closeDialog) setDialog(null);
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
          <ProviderIcon name="check" /> {notice}
          <button aria-label="Đóng thông báo" onClick={() => setNotice(null)} type="button">
            ×
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="provider-toast provider-toast--error" role="alert">
          <ProviderIcon name="alert" /> {error}
          <button aria-label="Đóng thông báo" onClick={() => setError(null)} type="button">
            ×
          </button>
        </div>
      ) : null}

      <nav aria-label="Khu vực hồ sơ" className="provider-case-tabs" role="tablist">
        {tabOptions.map((option) => (
          <button
            aria-label={option.label}
            aria-selected={tab === option.value}
            key={option.value}
            onClick={() => setTab(option.value)}
            role="tab"
            type="button"
          >
            <ProviderIcon name={option.icon} />
            <span>{option.label}</span>
            {option.value === 'messages' && selectedThread?.unreadCount ? (
              <b>{selectedThread.unreadCount}</b>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="provider-case-layout">
        <section className="provider-case-content">
          {tab === 'overview' ? <Overview data={data} /> : null}
          {tab === 'plan' ? (
            <Plans
              plans={data.plans}
              onCreate={() => setDialog('plan')}
              onPublish={(plan) =>
                void execute(
                  () =>
                    sendProviderCommand({
                      command: 'publish_treatment_plan',
                      resourceId: data.dentalCase.id,
                      secondaryId: plan.id,
                      payload: {
                        expectedVersion: plan.version,
                        contentChecksum: plan.contentChecksum,
                      },
                    }),
                  'Đã công bố phiên bản phương án cho bệnh nhân.',
                  false,
                )
              }
              pending={pending}
            />
          ) : null}
          {tab === 'records' ? <Records data={data} /> : null}
          {tab === 'appointments' ? (
            <Appointments data={data} onCreate={() => setDialog('appointment')} />
          ) : null}
          {tab === 'messages' ? (
            <CaseMessages
              caseId={data.dentalCase.id}
              currentUserId={currentUserId}
              messages={selectedMessages}
              onCreateThread={() => setDialog('thread')}
              onSend={(messageBody) =>
                selectedThreadId
                  ? execute(
                      () =>
                        sendProviderCommand({
                          command: 'send_message',
                          resourceId: data.dentalCase.id,
                          secondaryId: selectedThreadId,
                          payload: { messageBody, fileAssetIds: [] },
                        }),
                      'Tin nhắn đã được gửi và lưu trong hồ sơ.',
                      false,
                    )
                  : Promise.resolve(false)
              }
              pending={pending}
              selectedThreadId={selectedThreadId}
              setSelectedThreadId={setSelectedThreadId}
              threads={data.threads}
            />
          ) : null}
          {tab === 'aftercare' ? <Aftercare data={data} /> : null}
        </section>

        <aside className="provider-case-rail">
          <NextActionCard data={data} />
          <OpportunityCard
            data={data}
            onDecision={(value) => {
              setDecision(value);
              setDialog('decision');
            }}
            onAssign={(dentistId) =>
              void execute(
                () =>
                  sendProviderCommand({
                    command: 'clinic_assign_dentist',
                    resourceId: data.dentalCase.id,
                    payload: { dentistId },
                  }),
                'Đã phân công nha sĩ cho hồ sơ.',
                false,
              )
            }
            pending={pending}
          />
          <PrivacyCard />
        </aside>
      </div>

      <DecisionDialog
        data={data}
        decision={decision}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () =>
              sendProviderCommand({
                command: 'clinic_case_decision',
                resourceId: data.dentalCase.id,
                payload,
              }),
            decision === 'ACCEPT'
              ? 'Đã tiếp nhận hồ sơ.'
              : decision === 'DECLINE'
                ? 'Đã ghi nhận từ chối cùng lý do.'
                : 'Đã gửi yêu cầu bổ sung hồ sơ.',
          )
        }
        open={dialog === 'decision'}
        pending={pending}
      />
      <AppointmentDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () =>
              sendProviderCommand({
                command: 'create_appointment',
                resourceId: data.dentalCase.id,
                payload,
              }),
            'Lịch hẹn đã được tạo.',
          )
        }
        open={dialog === 'appointment'}
        pending={pending}
      />
      <PlanDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () =>
              sendProviderCommand({
                command: 'create_treatment_plan',
                resourceId: data.dentalCase.id,
                payload,
              }),
            'Đã lưu phiên bản nháp của phương án điều trị.',
          )
        }
        open={dialog === 'plan'}
        pending={pending}
      />
      <ThreadDialog
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () =>
              sendProviderCommand({
                command: 'create_message_thread',
                resourceId: data.dentalCase.id,
                payload,
              }),
            'Đã tạo cuộc trò chuyện mới.',
          )
        }
        open={dialog === 'thread'}
        pending={pending}
      />
    </>
  );
}

function Overview({ data }: { readonly data: ProviderCaseWorkspaceData }) {
  const progress = data.journey.progress;
  return (
    <div className="provider-case-stack">
      <section className="provider-panel provider-case-overview-card">
        <header>
          <div>
            <span className="provider-eyebrow">Tiến độ hành trình</span>
            <h2>{labelStatus(data.journey.status)}</h2>
            <p>{labelAction(data.journey.primaryAction.code)}</p>
          </div>
          <strong>{progress}%</strong>
        </header>
        <div className="provider-progress-track">
          <i style={{ width: `${progress}%` }} />
        </div>
        <dl className="provider-case-facts">
          <Fact
            label="Điều trị quan tâm"
            value={data.dentalCase.desiredProcedureCode.replaceAll('_', ' ')}
          />
          <Fact label="Địa điểm" value={data.dentalCase.preferredLocation ?? 'Chưa xác định'} />
          <Fact label="Dự kiến đến" value={formatDate(data.dentalCase.expectedArrivalDate)} />
          <Fact label="Dự kiến rời" value={formatDate(data.dentalCase.expectedDepartureDate)} />
          <Fact label="Tiền tệ" value={data.dentalCase.preferredCurrency} />
          <Fact label="Cập nhật gần nhất" value={formatDateTime(data.journey.updatedAt)} />
        </dl>
      </section>

      <section className="provider-panel provider-timeline-card">
        <header className="provider-section-heading">
          <div>
            <h2>Dòng thời gian</h2>
            <p>Các thay đổi trạng thái đã được ghi nhận trong hồ sơ.</p>
          </div>
        </header>
        <ol>
          {data.journey.timeline.map((event, index) => (
            <li key={event.id}>
              <span className={index === 0 ? 'is-current' : undefined}>
                <ProviderIcon name="check" />
              </span>
              <div>
                <strong>{labelStatus(event.status)}</strong>
                <small>{formatDateTime(event.occurredAt)}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {data.journey.blockers.length ? (
        <section className="provider-panel provider-blocker-card">
          <ProviderIcon name="alert" />
          <div>
            <h2>Điểm đang chặn tiến độ</h2>
            {data.journey.blockers.map((item) => (
              <p key={item.code}>{humanize(item.code)}</p>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Plans({
  plans,
  onCreate,
  onPublish,
  pending,
}: {
  readonly plans: readonly TreatmentPlanVersionView[] | null;
  readonly onCreate: () => void;
  readonly onPublish: (plan: TreatmentPlanVersionView) => void;
  readonly pending: boolean;
}) {
  if (plans === null) return <SectionUnavailable title="Không thể tải phương án điều trị" />;
  return (
    <div className="provider-case-stack">
      <header className="provider-workspace-toolbar">
        <div>
          <h2>Phương án điều trị</h2>
          <p>Mỗi lần chỉnh sửa tạo một phiên bản độc lập, không ghi đè lịch sử.</p>
        </div>
        <button className="provider-primary-button" onClick={onCreate} type="button">
          <ProviderIcon name="plus" /> Tạo phiên bản nháp
        </button>
      </header>
      {plans.length ? (
        plans
          .toSorted((a, b) => b.version - a.version)
          .map((plan) => (
            <article className="provider-panel provider-plan-card" key={plan.id}>
              <header>
                <div>
                  <span>Phiên bản {plan.version}</span>
                  <h3>{plan.clinicName}</h3>
                  <p>Soạn bởi {plan.authoringDentistName}</p>
                </div>
                <div className="provider-plan-card__status">
                  <b
                    className={`provider-status provider-status--${plan.status === 'PUBLISHED' ? 'success' : 'attention'}`}
                  >
                    {labelStatus(plan.status)}
                  </b>
                  <strong>{formatCurrency(plan.totalMinor, plan.currency)}</strong>
                </div>
              </header>
              <div className="provider-plan-summary-grid">
                <PlanText label="Đánh giá sơ bộ" value={plan.preliminaryAssessment} />
                <PlanText label="Chẩn đoán của nha sĩ" value={plan.diagnosisStatement} />
                <PlanText label="Rủi ro" value={plan.risks} />
                <PlanText label="Giới hạn" value={plan.limitations} />
              </div>
              <div className="provider-plan-items">
                {plan.items.map((item) => (
                  <div key={item.id}>
                    <span>{item.procedureCode.replaceAll('_', ' ')}</span>
                    <small>
                      Răng {item.toothNumbers.join(', ') || '—'} · SL {item.quantity}
                      {item.material ? ` · ${item.material}` : ''}
                    </small>
                    <strong>{formatCurrency(item.totalPriceMinor, plan.currency)}</strong>
                  </div>
                ))}
              </div>
              <footer>
                <span>Hết hạn {formatDate(plan.expiresAt)}</span>
                {plan.status === 'DRAFT' ? (
                  <button disabled={pending} onClick={() => onPublish(plan)} type="button">
                    Công bố cho bệnh nhân <ProviderIcon name="arrow" />
                  </button>
                ) : plan.acceptedAt ? (
                  <span className="provider-plan-accepted">
                    <ProviderIcon name="check" /> Đã chấp nhận {formatDate(plan.acceptedAt)}
                  </span>
                ) : (
                  <span>Đang chờ bệnh nhân xem xét</span>
                )}
              </footer>
            </article>
          ))
      ) : (
        <Empty
          title="Chưa có phương án điều trị"
          body="Tạo phiên bản nháp đầu tiên sau khi nha sĩ đã xem đủ hồ sơ được bệnh nhân chia sẻ."
          action="Tạo phương án"
          onAction={onCreate}
        />
      )}
    </div>
  );
}

function Records({ data }: { readonly data: ProviderCaseWorkspaceData }) {
  if (data.documents === null) return <SectionUnavailable title="Không thể tải hồ sơ đính kèm" />;
  return (
    <section className="provider-panel provider-documents-card">
      <header className="provider-section-heading">
        <div>
          <h2>Hồ sơ được chia sẻ</h2>
          <p>Chỉ các tài liệu đã qua quét và thuộc ca này mới được hiển thị.</p>
        </div>
        <span>
          <ProviderIcon name="shield" /> Phạm vi theo ca
        </span>
      </header>
      {data.documents.length ? (
        <div>
          {data.documents.map((document) => (
            <article key={document.id}>
              <span className="provider-document-icon">
                <ProviderIcon name="document" />
              </span>
              <div>
                <strong>{document.originalFileName}</strong>
                <small>
                  {humanize(document.category)} · {(document.sizeBytes / 1_000_000).toFixed(1)} MB ·{' '}
                  {formatDate(document.createdAt)}
                </small>
              </div>
              <b
                className={`provider-status provider-status--${document.status === 'AVAILABLE' && document.scanStatus === 'CLEAN' ? 'success' : 'attention'}`}
              >
                {document.status === 'AVAILABLE' && document.scanStatus === 'CLEAN'
                  ? 'Sẵn sàng'
                  : `${document.status} · ${document.scanStatus}`}
              </b>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Chưa có tài liệu"
          body="Bệnh nhân hoặc điều phối viên chưa chia sẻ tài liệu nào với phòng khám."
        />
      )}
    </section>
  );
}

function Appointments({
  data,
  onCreate,
}: {
  readonly data: ProviderCaseWorkspaceData;
  readonly onCreate: () => void;
}) {
  if (data.appointments === null) return <SectionUnavailable title="Không thể tải lịch hẹn" />;
  return (
    <div className="provider-case-stack">
      <header className="provider-workspace-toolbar">
        <div>
          <h2>Lịch hẹn của hồ sơ</h2>
          <p>Giờ hiển thị theo Asia/Ho_Chi_Minh và luôn lưu bằng UTC.</p>
        </div>
        <button className="provider-primary-button" onClick={onCreate} type="button">
          <ProviderIcon name="plus" /> Tạo lịch hẹn
        </button>
      </header>
      {data.appointments.length ? (
        <section className="provider-panel provider-case-appointments">
          {data.appointments
            .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
            .map((appointment) => (
              <article key={appointment.id}>
                <time>
                  <strong>{formatTime(appointment.startsAt)}</strong>
                  <small>{formatDate(appointment.startsAt, { year: undefined })}</small>
                </time>
                <span
                  className={`provider-avatar provider-avatar--${appointment.kind === 'CONSULTATION' ? 'blue' : 'success'}`}
                >
                  <ProviderIcon name={appointment.kind === 'CONSULTATION' ? 'video' : 'clinic'} />
                </span>
                <div>
                  <strong>
                    {appointment.kind === 'CONSULTATION'
                      ? 'Tư vấn trực tuyến'
                      : 'Khám tại phòng khám'}
                  </strong>
                  <p>
                    {formatDateTime(appointment.startsAt)}–{formatTime(appointment.endsAt)}
                  </p>
                  <small>{appointment.timezone}</small>
                </div>
                <b
                  className={`provider-status provider-status--${toneForStatus(appointment.status)}`}
                >
                  {labelStatus(appointment.status)}
                </b>
                {appointment.meetingJoinUrl ? (
                  <a href={appointment.meetingJoinUrl} rel="noreferrer" target="_blank">
                    Tham gia
                  </a>
                ) : null}
              </article>
            ))}
        </section>
      ) : (
        <Empty
          title="Chưa có lịch hẹn"
          body="Tạo lịch tư vấn hoặc lịch khám khi bệnh nhân và nha sĩ đã thống nhất thời gian."
          action="Tạo lịch hẹn"
          onAction={onCreate}
        />
      )}
    </div>
  );
}

function CaseMessages({
  caseId,
  currentUserId,
  threads,
  messages,
  selectedThreadId,
  setSelectedThreadId,
  onCreateThread,
  onSend,
  pending,
}: {
  readonly caseId: string;
  readonly currentUserId: string;
  readonly threads: ProviderCaseWorkspaceData['threads'];
  readonly messages: readonly ProviderCaseWorkspaceData['messages'][string][number][];
  readonly selectedThreadId: string | null;
  readonly setSelectedThreadId: (value: string) => void;
  readonly onCreateThread: () => void;
  readonly onSend: (message: string) => Promise<boolean>;
  readonly pending: boolean;
}) {
  const [draft, setDraft] = useState('');
  if (threads === null) return <SectionUnavailable title="Không thể tải cuộc trò chuyện" />;
  return (
    <section className="provider-panel provider-case-messages">
      <aside>
        <header>
          <strong>Trao đổi theo hồ sơ</strong>
          <button aria-label="Tạo cuộc trò chuyện" onClick={onCreateThread} type="button">
            <ProviderIcon name="plus" />
          </button>
        </header>
        {threads.length ? (
          threads.map((thread) => (
            <button
              aria-pressed={selectedThreadId === thread.id}
              key={thread.id}
              onClick={() => setSelectedThreadId(thread.id)}
              type="button"
            >
              <span className="provider-avatar provider-avatar--blue">DT</span>
              <span>
                <strong>{thread.threadSubject}</strong>
                <small>
                  {thread.messageCount} tin nhắn · {thread.unreadCount} chưa đọc
                </small>
              </span>
            </button>
          ))
        ) : (
          <p>Chưa có cuộc trò chuyện.</p>
        )}
      </aside>
      <div className="provider-case-chat">
        <header>
          <span>
            <ProviderIcon name="shield" /> Hội thoại bảo mật · {caseId.slice(0, 8)}
          </span>
        </header>
        <div className="provider-case-chat__body">
          {messages.length ? (
            messages.map((message) => {
              const isMine = message.authorUserId === currentUserId;
              return (
                <article
                  aria-label={isMine ? 'Tin nhắn của bạn' : 'Tin nhắn từ bệnh nhân'}
                  className={isMine ? 'is-mine' : 'is-theirs'}
                  key={message.id}
                >
                  {isMine ? null : (
                    <span className="provider-avatar provider-avatar--blue">BN</span>
                  )}
                  <div>
                    <p>{message.messageBody}</p>
                    <small>
                      {isMine ? 'Bạn · ' : ''}
                      {formatDateTime(message.createdAt)}
                      {message.readByCurrentUser ? ' · Đã đọc' : ''}
                    </small>
                  </div>
                </article>
              );
            })
          ) : (
            <Empty
              title="Chưa có tin nhắn"
              body="Gửi câu hỏi hoặc cập nhật đầu tiên trong hồ sơ này."
            />
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            if (!value) return;
            void onSend(value).then((sent) => {
              if (sent) setDraft('');
            });
          }}
        >
          <input
            aria-label="Nội dung tin nhắn"
            disabled={!selectedThreadId || pending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              selectedThreadId ? 'Nhập tin nhắn bảo mật…' : 'Tạo hoặc chọn một cuộc trò chuyện'
            }
            value={draft}
          />
          <button
            aria-label="Gửi tin nhắn"
            disabled={!selectedThreadId || pending || !draft.trim()}
            type="submit"
          >
            <ProviderIcon name="arrow" />
          </button>
        </form>
      </div>
    </section>
  );
}

function Aftercare({ data }: { readonly data: ProviderCaseWorkspaceData }) {
  if (data.aftercare === null) return <SectionUnavailable title="Không thể tải dữ liệu hậu mãi" />;
  return data.aftercare.length ? (
    <div className="provider-case-stack">
      {data.aftercare.map((plan) => (
        <section className="provider-panel provider-aftercare-card" key={plan.id}>
          <header>
            <span className="provider-panel-icon provider-panel-icon--blue">
              <ProviderIcon name="aftercare" />
            </span>
            <div>
              <h2>
                {plan.active ? 'Kế hoạch hậu mãi đang hoạt động' : 'Kế hoạch hậu mãi đã hoàn tất'}
              </h2>
              <p>
                Bắt đầu {formatDate(plan.startsAt)} · {plan.checkIns.length} lần check-in
              </p>
            </div>
          </header>
          {plan.checkIns.length ? (
            <div>
              {plan.checkIns.map((checkIn) => (
                <article key={checkIn.id}>
                  <span>
                    <strong>Đau {checkIn.painScale}/10</strong>
                    <small>{formatDateTime(checkIn.submittedAt)}</small>
                  </span>
                  <p>{checkIn.patientNotes ?? 'Không có ghi chú thêm.'}</p>
                  <div>
                    {checkIn.symptomCodes.map((code) => (
                      <b key={code}>{humanize(code)}</b>
                    ))}
                  </div>
                  {checkIn.escalations.map((escalation) => (
                    <em key={escalation.id}>
                      <ProviderIcon name="alert" /> {escalation.severity} ·{' '}
                      {labelStatus(escalation.status)} · hạn {formatDateTime(escalation.dueAt)}
                    </em>
                  ))}
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Chưa có check-in"
              body="Bệnh nhân chưa gửi phản hồi hậu mãi cho kế hoạch này."
            />
          )}
        </section>
      ))}
    </div>
  ) : (
    <Empty
      title="Chưa có kế hoạch hậu mãi"
      body="Kế hoạch hậu mãi sẽ xuất hiện sau khi điều trị được xác nhận hoàn tất."
    />
  );
}

function NextActionCard({ data }: { readonly data: ProviderCaseWorkspaceData }) {
  return (
    <section className="provider-panel provider-next-action-card">
      <span className="provider-eyebrow">Hành động tiếp theo</span>
      <h2>{labelAction(data.journey.primaryAction.code)}</h2>
      <p>
        {data.journey.expectedAt
          ? `Cam kết trước ${formatDateTime(data.journey.expectedAt)}`
          : 'Chưa có thời hạn cam kết.'}
      </p>
      <div>
        <span>
          <ProviderIcon name="users" /> {data.journey.owner?.displayName ?? 'Chưa phân công'}
        </span>
        <span>
          <ProviderIcon name="clock" /> {data.journey.stage.replaceAll('_', ' ')}
        </span>
      </div>
    </section>
  );
}

function OpportunityCard({
  data,
  onDecision,
  onAssign,
  pending,
}: {
  readonly data: ProviderCaseWorkspaceData;
  readonly onDecision: (value: 'ACCEPT' | 'DECLINE' | 'REQUEST_RECORDS') => void;
  readonly onAssign: (dentistId: string) => void;
  readonly pending: boolean;
}) {
  const opportunity = data.opportunity;
  if (!opportunity)
    return (
      <section className="provider-panel provider-opportunity-card">
        <h2>Phân công lâm sàng</h2>
        <p>Hồ sơ đã nằm trong phạm vi của phòng khám.</p>
        <AssignDentist data={data} disabled={pending} onAssign={onAssign} />
      </section>
    );
  return (
    <section className="provider-panel provider-opportunity-card">
      <header>
        <h2>Tiếp nhận hồ sơ</h2>
        <b className={`provider-status provider-status--${toneForStatus(opportunity.status)}`}>
          {labelStatus(opportunity.status)}
        </b>
      </header>
      <p>Chỉ dữ liệu tối thiểu đã được bệnh nhân cho phép mới hiển thị ở bước này.</p>
      {opportunity.status === 'ASSIGNED' ? (
        <div className="provider-opportunity-actions">
          <button disabled={pending} onClick={() => onDecision('ACCEPT')} type="button">
            Tiếp nhận
          </button>
          <button disabled={pending} onClick={() => onDecision('REQUEST_RECORDS')} type="button">
            Yêu cầu hồ sơ
          </button>
          <button disabled={pending} onClick={() => onDecision('DECLINE')} type="button">
            Từ chối
          </button>
        </div>
      ) : null}
      <AssignDentist data={data} disabled={pending} onAssign={onAssign} />
    </section>
  );
}

function AssignDentist({
  data,
  disabled,
  onAssign,
}: {
  readonly data: ProviderCaseWorkspaceData;
  readonly disabled: boolean;
  readonly onAssign: (dentistId: string) => void;
}) {
  const [value, setValue] = useState(data.opportunity?.assignedDentistId ?? '');
  return (
    <div className="provider-assign-dentist">
      <label htmlFor="assigned-dentist">Nha sĩ phụ trách</label>
      <div>
        <CustomSelect
          disabled={disabled || !data.dentists.length}
          id="assigned-dentist"
          onChange={(event) => setValue(event.target.value)}
          value={value}
        >
          <option value="">Chưa phân công</option>
          {data.dentists
            .filter((dentist) => dentist.active)
            .map((dentist) => (
              <option key={dentist.id} value={dentist.id}>
                {dentist.fullName}
              </option>
            ))}
        </CustomSelect>
        <button
          disabled={disabled || !value || value === data.opportunity?.assignedDentistId}
          onClick={() => onAssign(value)}
          type="button"
        >
          Lưu
        </button>
      </div>
    </div>
  );
}

function PrivacyCard() {
  return (
    <section className="provider-case-privacy">
      <ProviderIcon name="shield" />
      <div>
        <strong>Quyền truy cập theo ca</strong>
        <p>Không tải xuống hoặc chia sẻ lại ngoài mục đích điều trị đã được bệnh nhân cho phép.</p>
      </div>
    </section>
  );
}

function DecisionDialog({
  open,
  onClose,
  onSubmit,
  data,
  decision,
  pending,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
  readonly data: ProviderCaseWorkspaceData;
  readonly decision: 'ACCEPT' | 'DECLINE' | 'REQUEST_RECORDS';
  readonly pending: boolean;
}) {
  const needsReason = decision !== 'ACCEPT';
  return (
    <ProviderDialog
      description="Quyết định được ghi vào audit log và không thể xóa khỏi lịch sử ca."
      onClose={onClose}
      open={open}
      title={
        decision === 'ACCEPT'
          ? 'Tiếp nhận hồ sơ'
          : decision === 'DECLINE'
            ? 'Từ chối hồ sơ'
            : 'Yêu cầu bổ sung hồ sơ'
      }
    >
      <form
        className="provider-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({
            expectedVersion: data.opportunity?.version ?? 0,
            decision,
            ...(needsReason ? { reason: String(form.get('reason') ?? '').trim() } : {}),
          });
        }}
      >
        <label>
          <span>{needsReason ? 'Lý do / thông tin cần bổ sung' : 'Xác nhận'}</span>
          {needsReason ? (
            <textarea
              minLength={5}
              name="reason"
              placeholder={
                decision === 'DECLINE'
                  ? 'Nêu lý do chuyên môn hoặc năng lực phục vụ…'
                  : 'Liệt kê phim chụp, kết quả hoặc thông tin còn thiếu…'
              }
              required
              rows={5}
            />
          ) : (
            <p>
              Phòng khám xác nhận có khả năng xem xét hồ sơ {data.dentalCase.caseNumber} và sẽ tuân
              thủ SLA phản hồi.
            </p>
          )}
        </label>
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button
            className={decision === 'DECLINE' ? 'is-danger' : ''}
            disabled={pending}
            type="submit"
          >
            {pending ? 'Đang ghi nhận…' : 'Xác nhận quyết định'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function AppointmentDialog({
  open,
  onClose,
  onSubmit,
  data,
  pending,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
  readonly data: ProviderCaseWorkspaceData;
  readonly pending: boolean;
}) {
  return (
    <ProviderDialog
      description="Thời gian nhập theo giờ Việt Nam và được chuyển thành UTC khi lưu."
      onClose={onClose}
      open={open}
      title="Tạo lịch hẹn"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const startsAt = new Date(String(form.get('startsAt')));
          const duration = Number(form.get('duration'));
          const kind = String(form.get('kind'));
          onSubmit({
            clinicId: data.onboarding.clinicId,
            ...(kind === 'CLINICAL_VISIT'
              ? { clinicLocationId: String(form.get('clinicLocationId')) }
              : {}),
            dentistId: String(form.get('dentistId')),
            kind,
            startsAt: startsAt.toISOString(),
            endsAt: new Date(startsAt.getTime() + duration * 60_000).toISOString(),
            timezone: 'Asia/Ho_Chi_Minh',
          });
        }}
      >
        <label>
          <span>Loại lịch hẹn</span>
          <CustomSelect defaultValue="CONSULTATION" name="kind">
            <option value="CONSULTATION">Tư vấn trực tuyến</option>
            <option value="CLINICAL_VISIT">Khám tại phòng khám</option>
          </CustomSelect>
        </label>
        <label>
          <span>Nha sĩ</span>
          <CustomSelect name="dentistId" required>
            {data.dentists
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>Cơ sở</span>
          <CustomSelect name="clinicLocationId" required>
            {data.onboarding.locations
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>Bắt đầu</span>
          <input min={localDateTimeMin()} name="startsAt" required type="datetime-local" />
        </label>
        <label>
          <span>Thời lượng</span>
          <CustomSelect defaultValue="45" name="duration">
            <option value="30">30 phút</option>
            <option value="45">45 phút</option>
            <option value="60">60 phút</option>
            <option value="90">90 phút</option>
          </CustomSelect>
        </label>
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button
            disabled={pending || !data.dentists.length || !data.onboarding.locations.length}
            type="submit"
          >
            {pending ? 'Đang tạo…' : 'Tạo lịch hẹn'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function PlanDialog({
  open,
  onClose,
  onSubmit,
  data,
  pending,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
  readonly data: ProviderCaseWorkspaceData;
  readonly pending: boolean;
}) {
  return (
    <ProviderDialog
      description="Đây là bản nháp của nha sĩ. Bệnh nhân chỉ thấy sau khi phiên bản được công bố."
      onClose={onClose}
      open={open}
      title="Tạo phương án điều trị"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const currency = String(form.get('currency')) as 'VND' | 'USD';
          const displayed = Number(form.get('unitPrice'));
          const unitPriceMinor =
            currency === 'USD' ? Math.round(displayed * 100) : Math.round(displayed);
          onSubmit({
            authoringDentistId: String(form.get('dentistId')),
            preliminaryAssessment: String(form.get('assessment')),
            diagnosisStatement: String(form.get('diagnosis')),
            risks: String(form.get('risks')),
            limitations: String(form.get('limitations')),
            warrantyTerms: String(form.get('warranty')),
            exclusions: String(form.get('exclusions')),
            currency,
            expiresAt: new Date(`${String(form.get('expiresAt'))}T23:59:59.000Z`).toISOString(),
            items: [
              {
                procedureCode: String(form.get('procedureCode'))
                  .trim()
                  .toUpperCase()
                  .replaceAll(' ', '_'),
                toothNumbers: String(form.get('teeth'))
                  .split(',')
                  .map((value) => Number(value.trim()))
                  .filter((value) => Number.isInteger(value) && value > 0),
                quantity: Number(form.get('quantity')),
                material: String(form.get('material')).trim() || undefined,
                brand: String(form.get('brand')).trim() || undefined,
                unitPriceMinor,
              },
            ],
          });
        }}
      >
        <label>
          <span>Nha sĩ lập phương án</span>
          <CustomSelect name="dentistId" required>
            {data.dentists
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>Hiệu lực đến</span>
          <input
            min={new Date().toISOString().slice(0, 10)}
            name="expiresAt"
            required
            type="date"
          />
        </label>
        <label className="is-wide">
          <span>Đánh giá sơ bộ</span>
          <textarea minLength={1} name="assessment" required rows={3} />
        </label>
        <label className="is-wide">
          <span>Chẩn đoán của nha sĩ</span>
          <textarea minLength={1} name="diagnosis" required rows={3} />
        </label>
        <label>
          <span>Rủi ro</span>
          <textarea minLength={1} name="risks" required rows={3} />
        </label>
        <label>
          <span>Giới hạn</span>
          <textarea minLength={1} name="limitations" required rows={3} />
        </label>
        <label>
          <span>Điều khoản bảo hành</span>
          <textarea minLength={1} name="warranty" required rows={3} />
        </label>
        <label>
          <span>Loại trừ</span>
          <textarea minLength={1} name="exclusions" required rows={3} />
        </label>
        <div className="provider-form-section is-wide">
          <strong>Hạng mục điều trị đầu tiên</strong>
          <div>
            <label>
              <span>Mã thủ thuật</span>
              <input
                defaultValue={data.dentalCase.desiredProcedureCode}
                name="procedureCode"
                required
              />
            </label>
            <label>
              <span>Số răng, cách nhau bằng dấu phẩy</span>
              <input name="teeth" placeholder="11, 12" />
            </label>
            <label>
              <span>Số lượng</span>
              <input defaultValue="1" min="1" name="quantity" required type="number" />
            </label>
            <label>
              <span>Vật liệu</span>
              <input name="material" />
            </label>
            <label>
              <span>Thương hiệu</span>
              <input name="brand" />
            </label>
            <label>
              <span>Tiền tệ</span>
              <CustomSelect defaultValue={data.dentalCase.preferredCurrency} name="currency">
                <option value="VND">VND</option>
                <option value="USD">USD</option>
              </CustomSelect>
            </label>
            <label>
              <span>Đơn giá</span>
              <input min="0" name="unitPrice" required type="number" />
            </label>
          </div>
        </div>
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button disabled={pending || !data.dentists.length} type="submit">
            {pending ? 'Đang lưu…' : 'Lưu bản nháp'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function ThreadDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
  readonly pending: boolean;
}) {
  return (
    <ProviderDialog
      description="Tin nhắn sẽ hiển thị cho các thành viên được phép truy cập hồ sơ."
      onClose={onClose}
      open={open}
      title="Tạo cuộc trò chuyện"
    >
      <form
        className="provider-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({
            threadSubject: String(form.get('subject')),
            messageBody: String(form.get('message')),
            fileAssetIds: [],
          });
        }}
      >
        <label>
          <span>Chủ đề</span>
          <input maxLength={160} name="subject" required />
        </label>
        <label>
          <span>Tin nhắn đầu tiên</span>
          <textarea maxLength={8000} name="message" required rows={6} />
        </label>
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button disabled={pending} type="submit">
            {pending ? 'Đang tạo…' : 'Tạo cuộc trò chuyện'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function PlanText({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}
function SectionUnavailable({ title }: { readonly title: string }) {
  return (
    <section className="provider-inline-alert" role="alert">
      <ProviderIcon name="alert" />
      <span>
        <strong>{title}</strong>
        <small>Máy chủ không trả về dữ liệu hợp lệ. Không có thay đổi nào được giả lập.</small>
      </span>
    </section>
  );
}
function Empty({
  title,
  body,
  action,
  onAction,
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: string;
  readonly onAction?: () => void;
}) {
  return (
    <div className="provider-empty-state">
      <span>
        <ProviderIcon name="document" />
      </span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action && onAction ? (
        <button onClick={onAction} type="button">
          {action}
        </button>
      ) : null}
    </div>
  );
}
function localDateTimeMin() {
  const date = new Date(Date.now() + 15 * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
