'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CustomSelect } from '@dental-trust/ui';
import type { AppointmentView, TreatmentPlanVersionView } from '@dental-trust/contracts';
import { ProviderDialog } from '@/components/provider-dialog';
import { ProviderIcon } from '@/components/provider-icon';
import {
  appointmentMutationsAt,
  type AppointmentLifecycleMutation as AppointmentMutation,
} from '@/lib/appointment-lifecycle';
import type { ProviderCaseWorkspaceData, ProviderIncidentView } from '@/lib/provider-data';
import { commandErrorMessage, sendProviderCommand } from '@/lib/provider-command';
import { unreadParticipantMessageIds } from '@/lib/messaging';
import { isoToLocalDateTimeInput, localDateTimeToIso } from '@/lib/provider-time';
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

type CaseTab =
  | 'overview'
  | 'plan'
  | 'clinical'
  | 'records'
  | 'appointments'
  | 'messages'
  | 'aftercare'
  | 'incidents';
type DialogKind =
  | 'decision'
  | 'appointment'
  | 'appointmentLifecycle'
  | 'plan'
  | 'instruction'
  | 'planChange'
  | 'passportDraft'
  | 'thread'
  | null;

interface PlanItemDraft {
  readonly id: number;
  readonly procedureCode: string;
  readonly teeth: string;
  readonly quantity: string;
  readonly material: string;
  readonly brand: string;
  readonly unitPrice: string;
}

type ParsedPlanItem =
  | {
      readonly ok: true;
      readonly value: {
        readonly procedureCode: string;
        readonly toothNumbers: readonly number[];
        readonly quantity: number;
        readonly material?: string;
        readonly brand?: string;
        readonly unitPriceMinor: number;
      };
    }
  | { readonly ok: false; readonly error: string };

const tabOptions: readonly {
  value: CaseTab;
  label: string;
  icon: 'home' | 'document' | 'cases' | 'calendar' | 'message' | 'aftercare' | 'alert';
}[] = [
  { value: 'overview', label: 'Tổng quan', icon: 'home' },
  { value: 'plan', label: 'Phương án', icon: 'document' },
  { value: 'clinical', label: 'Lâm sàng', icon: 'aftercare' },
  { value: 'records', label: 'Hồ sơ', icon: 'cases' },
  { value: 'appointments', label: 'Lịch hẹn', icon: 'calendar' },
  { value: 'messages', label: 'Tin nhắn', icon: 'message' },
  { value: 'aftercare', label: 'Hậu mãi', icon: 'aftercare' },
  { value: 'incidents', label: 'Sự cố', icon: 'alert' },
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
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentView | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState(data.threads?.[0]?.id ?? null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedThread = data.threads?.find((item) => item.id === selectedThreadId) ?? null;
  const selectedMessages = selectedThreadId ? (data.messages[selectedThreadId] ?? []) : [];
  const currentTeamMember = data.team?.members.find((member) => member.userId === currentUserId);
  const canRespondToIncidents =
    currentTeamMember?.permissions.includes('INCIDENT_RESPONSE') === true;
  const clinicalRole = currentTeamMember?.role;
  const canCompleteMilestones =
    clinicalRole === 'DENTIST' ||
    clinicalRole === 'CLINIC_STAFF' ||
    clinicalRole === 'CLINIC_ADMIN';
  const canAuthorClinical = clinicalRole === 'DENTIST';
  const canCreatePriceChange = clinicalRole === 'DENTIST' || clinicalRole === 'CLINIC_ADMIN';
  const canPublishPassport = clinicalRole === 'DENTIST' || clinicalRole === 'CLINIC_ADMIN';

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
          {tab === 'clinical' ? (
            <ClinicalJourney
              canAuthorClinical={canAuthorClinical}
              canCompleteMilestones={canCompleteMilestones}
              canCreatePriceChange={canCreatePriceChange}
              canPublishPassport={canPublishPassport}
              data={data}
              onCompleteMilestone={(milestoneId, expectedVersion) =>
                void execute(
                  () =>
                    sendProviderCommand({
                      command: 'complete_journey_milestone',
                      resourceId: data.dentalCase.id,
                      secondaryId: milestoneId,
                      payload: { expectedVersion },
                    }),
                  'Đã hoàn tất mốc điều trị.',
                  false,
                )
              }
              onCreateInstruction={() => setDialog('instruction')}
              onCreatePassport={() => setDialog('passportDraft')}
              onCreatePlanChange={() => setDialog('planChange')}
              onPublishPassport={(versionId) =>
                void execute(
                  () =>
                    sendProviderCommand({
                      command: 'publish_passport',
                      resourceId: data.dentalCase.id,
                      secondaryId: versionId,
                      payload: {},
                    }),
                  'Dental Passport đã được phát hành.',
                  false,
                )
              }
              pending={pending}
            />
          ) : null}
          {tab === 'appointments' ? (
            <Appointments
              data={data}
              onCreate={() => setDialog('appointment')}
              onManage={(appointment) => {
                setSelectedAppointment(appointment);
                setDialog('appointmentLifecycle');
              }}
            />
          ) : null}
          {tab === 'messages' ? (
            <CaseMessages
              caseId={data.dentalCase.id}
              currentUserId={currentUserId}
              messages={selectedMessages}
              onCreateThread={() => setDialog('thread')}
              onReadError={setError}
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
          {tab === 'incidents' ? (
            <Incidents
              canRespond={canRespondToIncidents}
              data={data}
              onInternalNote={(incidentId, expectedVersion, note) =>
                execute(
                  () =>
                    sendProviderCommand({
                      command: 'incident_internal_note',
                      resourceId: incidentId,
                      payload: { expectedVersion, note },
                    }),
                  'Đã lưu ghi chú nội bộ cho sự cố.',
                  false,
                )
              }
              onRespond={(incidentId, expectedVersion, message) =>
                execute(
                  () =>
                    sendProviderCommand({
                      command: 'incident_clinic_response',
                      resourceId: incidentId,
                      payload: { expectedVersion, message },
                    }),
                  'Phản hồi sự cố đã được chia sẻ với bệnh nhân.',
                  false,
                )
              }
              pending={pending}
            />
          ) : null}
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
      <AppointmentLifecycleDialog
        appointment={selectedAppointment}
        onClose={() => setDialog(null)}
        onSubmit={(mutation, payload) =>
          selectedAppointment
            ? void execute(
                () =>
                  sendProviderCommand({
                    command:
                      mutation === 'reschedule'
                        ? 'reschedule_appointment'
                        : mutation === 'cancel'
                          ? 'cancel_appointment'
                          : 'record_appointment_attendance',
                    resourceId: data.dentalCase.id,
                    secondaryId: selectedAppointment.id,
                    payload,
                  }),
                mutation === 'reschedule'
                  ? 'Lịch hẹn đã được đổi sang thời gian mới.'
                  : mutation === 'cancel'
                    ? 'Lịch hẹn đã được hủy và lưu lý do.'
                    : 'Kết quả tham dự đã được ghi nhận.',
              )
            : undefined
        }
        open={dialog === 'appointmentLifecycle'}
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
      <InstructionDialog
        journey={data.clinicalJourney}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () =>
              sendProviderCommand({
                command: 'create_treatment_instruction',
                resourceId: data.dentalCase.id,
                payload,
              }),
            'Đã lưu hướng dẫn lâm sàng.',
          )
        }
        open={dialog === 'instruction'}
        pending={pending}
      />
      <PlanChangeDialog
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () =>
              sendProviderCommand({
                command: 'create_plan_change',
                resourceId: data.dentalCase.id,
                payload,
              }),
            'Đã ghi nhận thay đổi điều trị.',
          )
        }
        open={dialog === 'planChange'}
        pending={pending}
        plans={data.plans}
        priceOnly={!canAuthorClinical}
      />
      <PassportDraftDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () =>
              sendProviderCommand({
                command: 'create_passport_draft',
                resourceId: data.dentalCase.id,
                payload,
              }),
            'Đã tạo bản nháp Dental Passport.',
          )
        }
        open={dialog === 'passportDraft'}
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

type ClinicalSection = 'milestones' | 'instructions' | 'changes' | 'passport';

function ClinicalJourney({
  data,
  canCompleteMilestones,
  canAuthorClinical,
  canCreatePriceChange,
  canPublishPassport,
  onCompleteMilestone,
  onCreateInstruction,
  onCreatePlanChange,
  onCreatePassport,
  onPublishPassport,
  pending,
}: {
  readonly data: ProviderCaseWorkspaceData;
  readonly canCompleteMilestones: boolean;
  readonly canAuthorClinical: boolean;
  readonly canCreatePriceChange: boolean;
  readonly canPublishPassport: boolean;
  readonly onCompleteMilestone: (milestoneId: string, expectedVersion: number) => void;
  readonly onCreateInstruction: () => void;
  readonly onCreatePlanChange: () => void;
  readonly onCreatePassport: () => void;
  readonly onPublishPassport: (versionId: string) => void;
  readonly pending: boolean;
}) {
  const [section, setSection] = useState<ClinicalSection>('milestones');
  const journey = data.clinicalJourney;
  if (!journey) return <SectionUnavailable title="Không thể tải hành trình lâm sàng" />;

  const completedMilestones = journey.milestones.filter(
    (milestone) => milestone.status === 'COMPLETED',
  ).length;
  const completion = journey.milestones.length
    ? Math.round((completedMilestones / journey.milestones.length) * 100)
    : 0;
  const canDraftPassport =
    canAuthorClinical &&
    ['TREATMENT_COMPLETED', 'AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE', 'CLOSED'].includes(
      data.dentalCase.status,
    );
  const canCreatePlanChange =
    (canAuthorClinical || canCreatePriceChange) && Boolean(data.plans?.length);
  const canMutateAny =
    canCompleteMilestones || canAuthorClinical || canCreatePriceChange || canPublishPassport;

  function publishCurrentPassport() {
    if (data.passport) onPublishPassport(data.passport.id);
  }

  return (
    <div className="provider-case-stack">
      <header className="provider-workspace-toolbar">
        <div>
          <h2>Hành trình lâm sàng</h2>
          <p>Mốc điều trị, hướng dẫn và thay đổi được lưu bất biến theo hồ sơ.</p>
        </div>
        <strong>{completion}% hoàn tất</strong>
      </header>
      <nav aria-label="Dữ liệu lâm sàng" className="provider-case-tabs" role="tablist">
        {(
          [
            ['milestones', 'Mốc điều trị'],
            ['instructions', 'Hướng dẫn'],
            ['changes', 'Thay đổi'],
            ['passport', 'Dental Passport'],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-selected={section === value}
            key={value}
            onClick={() => setSection(value)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      {!canMutateAny ? (
        <section className="provider-inline-alert" role="status">
          <ProviderIcon name="shield" />
          <span>
            <strong>Phạm vi chỉ đọc</strong>
            <small>Vai trò hiện tại không có quyền cập nhật dữ liệu lâm sàng.</small>
          </span>
        </section>
      ) : null}

      {section === 'milestones' ? (
        journey.milestones.length ? (
          <section className="provider-panel provider-case-appointments">
            {journey.milestones.map((milestone) => (
              <article key={milestone.id}>
                <span
                  className={`provider-panel-icon provider-panel-icon--${milestone.status === 'COMPLETED' ? 'success' : 'blue'}`}
                >
                  <ProviderIcon name={milestone.status === 'COMPLETED' ? 'check' : 'clock'} />
                </span>
                <div>
                  <strong>{milestone.title}</strong>
                  <p>{milestone.code.replaceAll('_', ' ')}</p>
                  <small>
                    {milestone.completedAt
                      ? `Hoàn tất ${formatDateTime(milestone.completedAt)}`
                      : milestone.scheduledAt
                        ? `Dự kiến ${formatDateTime(milestone.scheduledAt)}`
                        : 'Chưa có lịch dự kiến'}
                  </small>
                </div>
                <b
                  className={`provider-status provider-status--${toneForStatus(milestone.status)}`}
                >
                  {labelStatus(milestone.status)}
                </b>
                {canCompleteMilestones &&
                (milestone.status === 'PENDING' || milestone.status === 'IN_PROGRESS') ? (
                  <button
                    className="provider-secondary-button"
                    disabled={pending}
                    onClick={() => onCompleteMilestone(milestone.id, milestone.version)}
                    type="button"
                  >
                    Hoàn tất
                  </button>
                ) : null}
              </article>
            ))}
          </section>
        ) : (
          <Empty
            body="Chưa có mốc điều trị nào được cấu hình cho hồ sơ này."
            title="Chưa có mốc điều trị"
          />
        )
      ) : null}

      {section === 'instructions' ? (
        <>
          <header className="provider-workspace-toolbar">
            <div>
              <h2>Hướng dẫn lâm sàng</h2>
              <p>Nội dung do nha sĩ lập, tách theo thuốc, xuất viện và tái khám.</p>
            </div>
            {canAuthorClinical ? (
              <button
                className="provider-primary-button"
                onClick={onCreateInstruction}
                type="button"
              >
                <ProviderIcon name="plus" /> Thêm hướng dẫn
              </button>
            ) : null}
          </header>
          {journey.instructions.length ? (
            journey.instructions
              .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((instruction) => (
                <article className="provider-panel provider-plan-card" key={instruction.id}>
                  <header>
                    <div>
                      <span>{labelStatus(instruction.type)}</span>
                      <h3>{instruction.locale === 'vi-VN' ? 'Tiếng Việt' : 'English'}</h3>
                    </div>
                    <small>{formatDateTime(instruction.createdAt)}</small>
                  </header>
                  <div className="provider-plan-summary-grid">
                    <PlanText label="Nội dung hướng dẫn" value={instruction.content} />
                  </div>
                </article>
              ))
          ) : (
            <Empty
              {...(canAuthorClinical
                ? { action: 'Thêm hướng dẫn', onAction: onCreateInstruction }
                : {})}
              body="Nha sĩ chưa ghi nhận hướng dẫn thuốc, xuất viện hoặc tái khám."
              title="Chưa có hướng dẫn"
            />
          )}
        </>
      ) : null}

      {section === 'changes' ? (
        <>
          <header className="provider-workspace-toolbar">
            <div>
              <h2>Thay đổi phương án</h2>
              <p>Mỗi thay đổi ghi rõ giá trị trước/sau và trạng thái bệnh nhân xác nhận.</p>
            </div>
            {canCreatePlanChange ? (
              <button
                className="provider-primary-button"
                onClick={onCreatePlanChange}
                type="button"
              >
                <ProviderIcon name="plus" /> Ghi nhận thay đổi
              </button>
            ) : null}
          </header>
          {journey.planChanges.length ? (
            journey.planChanges
              .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((change) => (
                <article className="provider-panel provider-plan-card" key={change.id}>
                  <header>
                    <div>
                      <span>{labelStatus(change.kind)}</span>
                      <h3>{change.reason}</h3>
                      <p>{formatDateTime(change.createdAt)}</p>
                    </div>
                    <b
                      className={`provider-status provider-status--${change.acknowledgedAt ? 'success' : 'attention'}`}
                    >
                      {change.acknowledgedAt ? 'Bệnh nhân đã xác nhận' : 'Chờ bệnh nhân xác nhận'}
                    </b>
                  </header>
                  <div className="provider-plan-items">
                    {change.changes.map((item) => (
                      <div key={item.field}>
                        <span>{humanize(item.field)}</span>
                        <small>
                          {item.beforeValue || '—'} → {item.afterValue || '—'}
                        </small>
                      </div>
                    ))}
                  </div>
                </article>
              ))
          ) : (
            <Empty
              {...(canCreatePlanChange
                ? { action: 'Ghi nhận thay đổi', onAction: onCreatePlanChange }
                : {})}
              body={
                canCreatePlanChange
                  ? 'Chưa có thay đổi nào so với phương án điều trị đã lập.'
                  : 'Cần có ít nhất một phiên bản phương án trước khi ghi nhận thay đổi.'
              }
              title="Chưa có thay đổi"
            />
          )}
        </>
      ) : null}

      {section === 'passport' ? (
        data.passportUnavailable ? (
          <SectionUnavailable title="Không thể tải Dental Passport" />
        ) : data.passport ? (
          <article className="provider-panel provider-plan-card">
            <header>
              <div>
                <span>Dental Passport · v{data.passport.version}</span>
                <h3>{data.passport.clinic.name}</h3>
                <p>
                  {data.passport.treatingDentist.fullName} · hoàn tất{' '}
                  {formatDate(data.passport.treatmentCompletedAt)}
                </p>
              </div>
              <div className="provider-plan-card__status">
                <b
                  className={`provider-status provider-status--${data.passport.status === 'PUBLISHED' ? 'success' : 'attention'}`}
                >
                  {labelStatus(data.passport.status)}
                </b>
                <small>
                  <ProviderIcon name={data.passport.integrity.verified ? 'shield' : 'alert'} />{' '}
                  {data.passport.integrity.verified ? 'Toàn vẹn đã xác minh' : 'Toàn vẹn lỗi'}
                </small>
              </div>
            </header>
            <div className="provider-plan-summary-grid">
              <PlanText label="Tóm tắt điều trị" value={data.passport.treatmentSummary} />
              <PlanText label="Hướng dẫn xuất viện" value={data.passport.dischargeInstructions} />
              <PlanText label="Hướng dẫn tái khám" value={data.passport.followUpInstructions} />
            </div>
            <div className="provider-plan-items">
              {data.passport.materials.map((material, index) => (
                <div key={`${material.procedureCode}-${index}`}>
                  <span>{material.procedureCode.replaceAll('_', ' ')}</span>
                  <small>
                    {material.material}
                    {material.manufacturer ? ` · ${material.manufacturer}` : ''}
                    {material.lotNumber ? ` · Lô ${material.lotNumber}` : ''}
                  </small>
                </div>
              ))}
            </div>
            <footer>
              <span>Mã toàn vẹn {data.passport.integrity.contentChecksum.slice(0, 12)}…</span>
              {data.passport.downloadable ? (
                <a
                  className="provider-text-button"
                  href={`/api/provider/passport-download?caseId=${data.dentalCase.id}&versionId=${data.passport.id}`}
                  rel="noreferrer"
                >
                  Tải Passport PDF <ProviderIcon name="document" />
                </a>
              ) : canPublishPassport && data.passport.status === 'DRAFT' ? (
                <button
                  disabled={pending || !data.passport.integrity.verified}
                  onClick={publishCurrentPassport}
                  type="button"
                >
                  Phát hành Passport <ProviderIcon name="arrow" />
                </button>
              ) : canDraftPassport ? (
                <button disabled={pending} onClick={onCreatePassport} type="button">
                  Tạo phiên bản mới <ProviderIcon name="plus" />
                </button>
              ) : null}
            </footer>
          </article>
        ) : (
          <Empty
            {...(canDraftPassport
              ? { action: 'Tạo bản nháp Passport', onAction: onCreatePassport }
              : {})}
            body={
              canDraftPassport
                ? 'Tạo hồ sơ vật liệu và hướng dẫn sau khi nha sĩ xác nhận điều trị hoàn tất.'
                : 'Dental Passport chỉ được tạo sau khi điều trị hoàn tất.'
            }
            title="Chưa có Dental Passport"
          />
        )
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
              {document.status === 'AVAILABLE' && document.scanStatus === 'CLEAN' ? (
                <a
                  aria-label={`Tải xuống ${document.originalFileName}`}
                  href={`/api/provider/files/${document.fileAssetId}/download?caseId=${data.dentalCase.id}`}
                >
                  Tải xuống
                </a>
              ) : null}
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
  onManage,
}: {
  readonly data: ProviderCaseWorkspaceData;
  readonly onCreate: () => void;
  readonly onManage: (appointment: AppointmentView) => void;
}) {
  if (data.appointments === null) return <SectionUnavailable title="Không thể tải lịch hẹn" />;
  return (
    <div className="provider-case-stack">
      <header className="provider-workspace-toolbar">
        <div>
          <h2>Lịch hẹn của hồ sơ</h2>
          <p>Giờ hiển thị theo múi giờ của từng lịch hẹn và luôn lưu bằng UTC.</p>
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
                  <strong>{formatTime(appointment.startsAt, appointment.timezone)}</strong>
                  <small>
                    {formatDate(appointment.startsAt, {
                      year: undefined,
                      timeZone: appointment.timezone,
                    })}
                  </small>
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
                    {formatDateTime(appointment.startsAt, appointment.timezone)}–
                    {formatTime(appointment.endsAt, appointment.timezone)}
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
                {appointmentMutationsAt(appointment).length ? (
                  <button
                    aria-label={`Quản lý lịch hẹn ${formatDateTime(appointment.startsAt, appointment.timezone)}`}
                    className="provider-secondary-button"
                    onClick={() => onManage(appointment)}
                    type="button"
                  >
                    <ProviderIcon name="more" />
                  </button>
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
  onReadError,
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
  readonly onReadError: (message: string) => void;
  readonly onSend: (message: string) => Promise<boolean>;
  readonly pending: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (!selectedThreadId) return;
    const messageIds = unreadParticipantMessageIds(messages, currentUserId);
    if (!messageIds.length) return;
    let active = true;
    void Promise.all(
      messageIds.map((messageId) =>
        sendProviderCommand({
          command: 'mark_message_read',
          resourceId: caseId,
          secondaryId: selectedThreadId,
          payload: { messageId },
        }),
      ),
    )
      .then(() => {
        if (active) router.refresh();
      })
      .catch((reason: unknown) => {
        if (active) onReadError(commandErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [caseId, currentUserId, messages, onReadError, router, selectedThreadId]);
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

function Incidents({
  data,
  canRespond,
  pending,
  onRespond,
  onInternalNote,
}: {
  readonly data: ProviderCaseWorkspaceData;
  readonly canRespond: boolean;
  readonly pending: boolean;
  readonly onRespond: (
    incidentId: string,
    expectedVersion: number,
    message: string,
  ) => Promise<boolean>;
  readonly onInternalNote: (
    incidentId: string,
    expectedVersion: number,
    note: string,
  ) => Promise<boolean>;
}) {
  if (data.incidents === null) {
    return <SectionUnavailable title="Không thể tải sự cố hoặc tài khoản chưa được phân quyền" />;
  }
  if (!data.incidents.length) {
    return (
      <section className="provider-panel">
        <Empty
          title="Không có sự cố trong hồ sơ"
          body="Sự cố và yêu cầu bảo hành liên quan đến ca này sẽ xuất hiện tại đây."
        />
      </section>
    );
  }
  return (
    <div className="provider-case-stack">
      <header className="provider-workspace-toolbar">
        <div>
          <h2>Sự cố và yêu cầu bảo hành</h2>
          <p>
            Phản hồi phòng khám được chia sẻ với bệnh nhân; ghi chú nội bộ có audience riêng và
            không xuất hiện trong hội thoại bệnh nhân.
          </p>
        </div>
        <span>
          {data.incidents.filter((incident) => incident.status !== 'CLOSED').length} đang mở
        </span>
      </header>
      {data.incidents.map((incident) => (
        <IncidentCard
          canRespond={canRespond}
          incident={incident}
          key={incident.id}
          onInternalNote={onInternalNote}
          onRespond={onRespond}
          pending={pending}
        />
      ))}
    </div>
  );
}

function IncidentCard({
  incident,
  canRespond,
  pending,
  onRespond,
  onInternalNote,
}: {
  readonly incident: ProviderIncidentView;
  readonly canRespond: boolean;
  readonly pending: boolean;
  readonly onRespond: (
    incidentId: string,
    expectedVersion: number,
    message: string,
  ) => Promise<boolean>;
  readonly onInternalNote: (
    incidentId: string,
    expectedVersion: number,
    note: string,
  ) => Promise<boolean>;
}) {
  const closed = incident.status === 'CLOSED';
  return (
    <article className="provider-panel provider-plan-card provider-incident-card">
      <header>
        <div>
          <span>{humanize(incident.type)}</span>
          <h3>{incident.summary}</h3>
          <p>
            Mở {formatDateTime(incident.createdAt)} · SLA {formatDateTime(incident.slaDueAt)}
          </p>
        </div>
        <div className="provider-plan-card__status">
          <b className={`provider-status provider-status--${toneForStatus(incident.status)}`}>
            {labelStatus(incident.status)}
          </b>
          <small>Mức độ {humanize(incident.severity)}</small>
        </div>
      </header>
      <div className="provider-plan-summary-grid">
        <PlanText label="Chi tiết đã khai báo" value={incident.details} />
        <PlanText
          label="Người phụ trách"
          value={incident.ownerAssigned ? 'Đã phân công' : 'Chưa phân công'}
        />
      </div>
      <section aria-label="Lịch sử cập nhật sự cố" className="provider-incident-timeline">
        <h4>Lịch sử chia sẻ</h4>
        {incident.updates.length ? (
          incident.updates.map((update) => (
            <article key={update.id}>
              <span className="provider-panel-icon provider-panel-icon--blue">
                <ProviderIcon name="message" />
              </span>
              <div>
                <strong>{humanize(update.eventType)}</strong>
                <p>{update.message}</p>
                <small>{formatDateTime(update.createdAt)}</small>
              </div>
            </article>
          ))
        ) : (
          <p>Chưa có cập nhật được chia sẻ.</p>
        )}
      </section>
      {canRespond ? (
        <section
          aria-label="Ghi chú nội bộ sự cố"
          className="provider-incident-timeline provider-incident-timeline--internal"
        >
          <h4>
            <ProviderIcon name="shield" /> Ghi chú nội bộ
          </h4>
          {incident.internalNotes.length ? (
            incident.internalNotes.map((note) => (
              <article key={note.id}>
                <span className="provider-panel-icon">
                  <ProviderIcon name="shield" />
                </span>
                <div>
                  <strong>{humanize(note.eventType)}</strong>
                  <p>{note.message}</p>
                  <small>{formatDateTime(note.createdAt)}</small>
                </div>
              </article>
            ))
          ) : (
            <p>Chưa có ghi chú nội bộ.</p>
          )}
        </section>
      ) : null}
      {canRespond ? (
        <div className="provider-incident-actions">
          <form
            className="provider-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const message = String(new FormData(form).get('message')).trim();
              void onRespond(incident.id, incident.version, message).then((sent) => {
                if (sent) form.reset();
              });
            }}
          >
            <label>
              <span>Phản hồi cho bệnh nhân</span>
              <textarea
                disabled={closed || pending}
                maxLength={2_000}
                minLength={3}
                name="message"
                required
                rows={4}
              />
            </label>
            <button className="provider-primary-button" disabled={closed || pending} type="submit">
              Gửi phản hồi
            </button>
          </form>
          <form
            className="provider-form provider-incident-internal-note"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const note = String(new FormData(form).get('note')).trim();
              void onInternalNote(incident.id, incident.version, note).then((saved) => {
                if (saved) form.reset();
              });
            }}
          >
            <label>
              <span>
                <ProviderIcon name="shield" /> Ghi chú nội bộ
              </span>
              <textarea
                disabled={closed || pending}
                maxLength={2_000}
                minLength={10}
                name="note"
                required
                rows={4}
              />
              <small>Chỉ đội ngũ xử lý sự cố được xem.</small>
            </label>
            <button
              className="provider-secondary-button"
              disabled={closed || pending}
              type="submit"
            >
              Lưu nội bộ
            </button>
          </form>
        </div>
      ) : (
        <section className="provider-inline-alert" role="status">
          <ProviderIcon name="shield" />
          <span>
            <strong>Chỉ đọc</strong>
            <small>Cần quyền Xử lý sự cố để phản hồi hoặc tạo ghi chú nội bộ.</small>
          </span>
        </section>
      )}
    </article>
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
  const activeLocations = data.onboarding.locations.filter((location) => location.active);
  const defaultLocationId = activeLocations[0]?.id ?? '';
  const [locationId, setLocationId] = useState(defaultLocationId);
  const timezone =
    activeLocations.find((location) => location.id === locationId)?.timezone ?? 'Asia/Ho_Chi_Minh';

  useEffect(() => {
    if (open) setLocationId(defaultLocationId);
  }, [defaultLocationId, open]);

  return (
    <ProviderDialog
      description={`Thời gian nhập theo ${timezone} và được chuyển thành UTC khi lưu.`}
      onClose={onClose}
      open={open}
      title="Tạo lịch hẹn"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          const startsAtInput = formElement.elements.namedItem('startsAt') as HTMLInputElement;
          let startsAt: string;
          try {
            startsAt = localDateTimeToIso(String(form.get('startsAt')), timezone);
            startsAtInput.setCustomValidity('');
          } catch {
            startsAtInput.setCustomValidity(
              'Thời gian này không tồn tại trong timezone của cơ sở.',
            );
            startsAtInput.reportValidity();
            return;
          }
          const duration = Number(form.get('duration'));
          const kind = String(form.get('kind'));
          onSubmit({
            clinicId: data.onboarding.clinicId,
            ...(kind === 'CLINICAL_VISIT' ? { clinicLocationId: locationId } : {}),
            dentistId: String(form.get('dentistId')),
            kind,
            startsAt,
            endsAt: new Date(Date.parse(startsAt) + duration * 60_000).toISOString(),
            timezone,
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
          <CustomSelect
            name="clinicLocationId"
            onChange={(event) => setLocationId(event.target.value)}
            required
            value={locationId}
          >
            {activeLocations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomSelect>
        </label>
        <label>
          <span>Bắt đầu</span>
          <input
            min={localDateTimeMin(timezone)}
            name="startsAt"
            onChange={(event) => event.currentTarget.setCustomValidity('')}
            required
            type="datetime-local"
          />
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
            disabled={pending || !data.dentists.length || !activeLocations.length}
            type="submit"
          >
            {pending ? 'Đang tạo…' : 'Tạo lịch hẹn'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function AppointmentLifecycleDialog({
  appointment,
  open,
  onClose,
  onSubmit,
  pending,
}: {
  readonly appointment: AppointmentView | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (mutation: AppointmentMutation, payload: Record<string, unknown>) => void;
  readonly pending: boolean;
}) {
  const [mutation, setMutation] = useState<AppointmentMutation>('reschedule');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !appointment) return;
    setMutation(appointmentMutationsAt(appointment)[0] ?? 'reschedule');
    setValidationError(null);
  }, [appointment?.id, open]);

  if (!appointment) return null;
  const durationMinutes = Math.max(
    15,
    Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000),
  );
  const availableMutations = appointmentMutationsAt(appointment);

  return (
    <ProviderDialog
      description={`${formatDateTime(appointment.startsAt, appointment.timezone)} · ${labelStatus(appointment.status)} · phiên bản ${appointment.version}`}
      onClose={onClose}
      open={open}
      title="Quản lý lịch hẹn"
    >
      <form
        className="provider-form provider-form--grid"
        key={`${appointment.id}-${mutation}`}
        onSubmit={(event) => {
          event.preventDefault();
          setValidationError(null);
          if (!appointmentMutationsAt(appointment).includes(mutation)) {
            setValidationError(
              'Thao tác này không còn phù hợp với thời gian hoặc trạng thái lịch hẹn.',
            );
            return;
          }
          const form = new FormData(event.currentTarget);
          if (mutation === 'reschedule') {
            const duration = Number(form.get('duration'));
            let startsAt: string;
            try {
              startsAt = localDateTimeToIso(String(form.get('startsAt')), appointment.timezone);
            } catch {
              setValidationError('Thời gian bắt đầu không tồn tại trong timezone của lịch hẹn.');
              return;
            }
            if (!Number.isInteger(duration) || duration < 15) {
              setValidationError('Thời gian bắt đầu hoặc thời lượng chưa hợp lệ.');
              return;
            }
            onSubmit(mutation, {
              expectedVersion: appointment.version,
              startsAt,
              endsAt: new Date(Date.parse(startsAt) + duration * 60_000).toISOString(),
              timezone: appointment.timezone,
            });
            return;
          }
          if (mutation === 'cancel') {
            const reason = String(form.get('reason') ?? '').trim();
            if (reason.length < 5) {
              setValidationError('Lý do hủy cần có ít nhất 5 ký tự.');
              return;
            }
            onSubmit(mutation, { expectedVersion: appointment.version, reason });
            return;
          }
          onSubmit(mutation, {
            expectedVersion: appointment.version,
            outcome: String(form.get('outcome')),
          });
        }}
      >
        <label className="is-wide">
          <span>Thao tác</span>
          <CustomSelect
            onChange={(event) => setMutation(event.target.value as AppointmentMutation)}
            value={mutation}
          >
            {availableMutations.includes('reschedule') ? (
              <option value="reschedule">Đổi thời gian</option>
            ) : null}
            {availableMutations.includes('cancel') ? (
              <option value="cancel">Hủy lịch hẹn</option>
            ) : null}
            {availableMutations.includes('attendance') ? (
              <option value="attendance">Ghi nhận tham dự</option>
            ) : null}
          </CustomSelect>
        </label>
        {mutation === 'reschedule' ? (
          <>
            <label>
              <span>Bắt đầu mới</span>
              <input
                defaultValue={isoToLocalDateTimeInput(appointment.startsAt, appointment.timezone)}
                min={localDateTimeMin(appointment.timezone)}
                name="startsAt"
                onChange={(event) => event.currentTarget.setCustomValidity('')}
                required
                type="datetime-local"
              />
            </label>
            <label>
              <span>Thời lượng</span>
              <CustomSelect defaultValue={String(durationMinutes)} name="duration">
                {Array.from(new Set([30, 45, 60, 90, 120, durationMinutes]))
                  .toSorted((a, b) => a - b)
                  .map((value) => (
                    <option key={value} value={value}>
                      {value} phút
                    </option>
                  ))}
              </CustomSelect>
            </label>
          </>
        ) : mutation === 'cancel' ? (
          <label className="is-wide">
            <span>Lý do hủy</span>
            <textarea
              maxLength={500}
              minLength={5}
              name="reason"
              placeholder="Nêu lý do để đội ngũ và bệnh nhân cùng theo dõi…"
              required
              rows={5}
            />
          </label>
        ) : (
          <label className="is-wide">
            <span>Kết quả tham dự</span>
            <CustomSelect defaultValue="COMPLETED" name="outcome">
              <option value="COMPLETED">Đã hoàn thành</option>
              <option value="NO_SHOW">Bệnh nhân không đến</option>
            </CustomSelect>
          </label>
        )}
        {validationError ? (
          <p className="is-wide" role="alert">
            {validationError}
          </p>
        ) : null}
        <footer>
          <button onClick={onClose} type="button">
            Đóng
          </button>
          <button disabled={pending || !availableMutations.length} type="submit">
            {pending
              ? 'Đang lưu…'
              : mutation === 'reschedule'
                ? 'Xác nhận đổi lịch'
                : mutation === 'cancel'
                  ? 'Xác nhận hủy'
                  : 'Lưu kết quả'}
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
  const initialCurrency = data.dentalCase.preferredCurrency === 'USD' ? 'USD' : 'VND';
  const nextItemId = useRef(1);
  const [currency, setCurrency] = useState<'VND' | 'USD'>(initialCurrency);
  const [items, setItems] = useState<PlanItemDraft[]>([
    newPlanItemDraft(1, data.dentalCase.desiredProcedureCode),
  ]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const totalMinor = useMemo(
    () =>
      items.reduce((total, item) => {
        const parsed = parsePlanItem(item, currency);
        return parsed.ok ? total + parsed.value.quantity * parsed.value.unitPriceMinor : total;
      }, 0),
    [currency, items],
  );

  useEffect(() => {
    if (!open) return;
    nextItemId.current = 1;
    setCurrency(initialCurrency);
    setItems([newPlanItemDraft(1, data.dentalCase.desiredProcedureCode)]);
    setValidationError(null);
  }, [data.dentalCase.desiredProcedureCode, initialCurrency, open]);

  function updateItem(id: number, patch: Partial<Omit<PlanItemDraft, 'id'>>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

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
          setValidationError(null);
          const form = new FormData(event.currentTarget);
          const requiredText = {
            preliminaryAssessment: String(form.get('assessment') ?? '').trim(),
            diagnosisStatement: String(form.get('diagnosis') ?? '').trim(),
            risks: String(form.get('risks') ?? '').trim(),
            limitations: String(form.get('limitations') ?? '').trim(),
            warrantyTerms: String(form.get('warranty') ?? '').trim(),
            exclusions: String(form.get('exclusions') ?? '').trim(),
          };
          if (Object.values(requiredText).some((value) => !value)) {
            setValidationError('Các nội dung lâm sàng và điều khoản không được để trống.');
            return;
          }
          const parsedItems = items.map((item) => parsePlanItem(item, currency));
          const invalidIndex = parsedItems.findIndex((item) => !item.ok);
          if (invalidIndex >= 0) {
            const invalid = parsedItems[invalidIndex];
            setValidationError(
              `Hạng mục ${invalidIndex + 1}: ${invalid && !invalid.ok ? invalid.error : 'dữ liệu chưa hợp lệ'}`,
            );
            return;
          }
          const expiresAt = String(form.get('expiresAt') ?? '');
          if (!expiresAt) {
            setValidationError('Vui lòng chọn ngày hết hiệu lực.');
            return;
          }
          onSubmit({
            authoringDentistId: String(form.get('dentistId')),
            ...requiredText,
            currency,
            expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString(),
            items: parsedItems.flatMap((item) => (item.ok ? [item.value] : [])),
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
        <label>
          <span>Tiền tệ</span>
          <CustomSelect
            name="currency"
            onChange={(event) => setCurrency(event.target.value as 'VND' | 'USD')}
            value={currency}
          >
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </CustomSelect>
        </label>
        <label>
          <span>Tạm tính</span>
          <input
            aria-label="Tạm tính phương án"
            readOnly
            value={formatCurrency(totalMinor, currency)}
          />
        </label>
        {items.map((item, index) => (
          <div className="provider-form-section is-wide" key={item.id}>
            <strong>Hạng mục điều trị {index + 1}</strong>
            {items.length > 1 ? (
              <button
                aria-label={`Xóa hạng mục ${index + 1}`}
                className="provider-secondary-button"
                onClick={() =>
                  setItems((current) => current.filter((entry) => entry.id !== item.id))
                }
                type="button"
              >
                Xóa hạng mục
              </button>
            ) : null}
            <div>
              <label>
                <span>Mã thủ thuật</span>
                <input
                  maxLength={80}
                  onChange={(event) => updateItem(item.id, { procedureCode: event.target.value })}
                  required
                  value={item.procedureCode}
                />
              </label>
              <label>
                <span>Số răng, cách nhau bằng dấu phẩy</span>
                <input
                  onChange={(event) => updateItem(item.id, { teeth: event.target.value })}
                  placeholder="11, 12"
                  value={item.teeth}
                />
              </label>
              <label>
                <span>Số lượng</span>
                <input
                  min="1"
                  onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                  required
                  step="1"
                  type="number"
                  value={item.quantity}
                />
              </label>
              <label>
                <span>Vật liệu</span>
                <input
                  maxLength={160}
                  onChange={(event) => updateItem(item.id, { material: event.target.value })}
                  value={item.material}
                />
              </label>
              <label>
                <span>Thương hiệu</span>
                <input
                  maxLength={160}
                  onChange={(event) => updateItem(item.id, { brand: event.target.value })}
                  value={item.brand}
                />
              </label>
              <label>
                <span>Đơn giá ({currency})</span>
                <input
                  min="0"
                  onChange={(event) => updateItem(item.id, { unitPrice: event.target.value })}
                  required
                  step={currency === 'USD' ? '0.01' : '1'}
                  type="number"
                  value={item.unitPrice}
                />
              </label>
            </div>
          </div>
        ))}
        <button
          className="provider-secondary-button is-wide"
          disabled={items.length >= 100}
          onClick={() => {
            nextItemId.current += 1;
            setItems((current) => [...current, newPlanItemDraft(nextItemId.current)]);
          }}
          type="button"
        >
          <ProviderIcon name="plus" /> Thêm hạng mục
        </button>
        {validationError ? (
          <p className="is-wide" role="alert">
            {validationError}
          </p>
        ) : null}
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

function InstructionDialog({
  journey,
  open,
  onClose,
  onSubmit,
  pending,
}: {
  readonly journey: ProviderCaseWorkspaceData['clinicalJourney'];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
  readonly pending: boolean;
}) {
  return (
    <ProviderDialog
      description="Nội dung được lưu như hướng dẫn do nha sĩ lập và gắn với hồ sơ điều trị."
      onClose={onClose}
      open={open}
      title="Thêm hướng dẫn lâm sàng"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const milestoneId = String(form.get('milestoneId') ?? '');
          onSubmit({
            ...(milestoneId ? { milestoneId } : {}),
            type: String(form.get('type')),
            locale: String(form.get('locale')),
            content: String(form.get('content') ?? '').trim(),
          });
        }}
      >
        <label>
          <span>Loại hướng dẫn</span>
          <CustomSelect defaultValue="DISCHARGE" name="type">
            <option value="MEDICATION">Thuốc</option>
            <option value="DISCHARGE">Xuất viện</option>
            <option value="FOLLOW_UP">Tái khám</option>
          </CustomSelect>
        </label>
        <label>
          <span>Ngôn ngữ</span>
          <CustomSelect defaultValue="vi-VN" name="locale">
            <option value="vi-VN">Tiếng Việt</option>
            <option value="en-US">English</option>
          </CustomSelect>
        </label>
        <label className="is-wide">
          <span>Gắn với mốc điều trị</span>
          <CustomSelect defaultValue="" name="milestoneId">
            <option value="">Toàn bộ hành trình</option>
            {(journey?.milestones ?? []).map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.title} · {labelStatus(milestone.status)}
              </option>
            ))}
          </CustomSelect>
        </label>
        <label className="is-wide">
          <span>Nội dung do nha sĩ lập</span>
          <textarea maxLength={10_000} minLength={1} name="content" required rows={7} />
        </label>
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button disabled={pending} type="submit">
            {pending ? 'Đang lưu…' : 'Lưu hướng dẫn'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function PlanChangeDialog({
  plans,
  open,
  onClose,
  onSubmit,
  pending,
  priceOnly,
}: {
  readonly plans: readonly TreatmentPlanVersionView[] | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
  readonly pending: boolean;
  readonly priceOnly: boolean;
}) {
  const [kind, setKind] = useState<'TREATMENT' | 'PRICE'>(priceOnly ? 'PRICE' : 'TREATMENT');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(priceOnly ? 'PRICE' : 'TREATMENT');
    setValidationError(null);
  }, [open, priceOnly]);

  return (
    <ProviderDialog
      description="Thay đổi được ghi bất biến và chờ bệnh nhân xác nhận đã xem."
      onClose={onClose}
      open={open}
      title="Ghi nhận thay đổi phương án"
    >
      <form
        className="provider-form provider-form--grid"
        key={kind}
        onSubmit={(event) => {
          event.preventDefault();
          setValidationError(null);
          const form = new FormData(event.currentTarget);
          const beforeValue = String(form.get('beforeValue') ?? '').trim();
          const afterValue = String(form.get('afterValue') ?? '').trim();
          if (beforeValue === afterValue) {
            setValidationError('Giá trị sau thay đổi phải khác giá trị trước thay đổi.');
            return;
          }
          onSubmit({
            fromPlanVersionId: String(form.get('planVersionId')),
            kind,
            reason: String(form.get('reason') ?? '').trim(),
            changes: [
              {
                field: String(form.get('field')),
                beforeValue,
                afterValue,
              },
            ],
          });
        }}
      >
        <label className="is-wide">
          <span>Phiên bản làm mốc</span>
          <CustomSelect name="planVersionId" required>
            {(plans ?? [])
              .toSorted((a, b) => b.version - a.version)
              .map((plan) => (
                <option key={plan.id} value={plan.id}>
                  Phiên bản {plan.version} · {labelStatus(plan.status)} ·{' '}
                  {formatCurrency(plan.totalMinor, plan.currency)}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>Nhóm thay đổi</span>
          <CustomSelect
            disabled={priceOnly}
            onChange={(event) => setKind(event.target.value as 'TREATMENT' | 'PRICE')}
            value={kind}
          >
            {!priceOnly ? <option value="TREATMENT">Điều trị</option> : null}
            <option value="PRICE">Chi phí</option>
          </CustomSelect>
        </label>
        <label>
          <span>Trường thay đổi</span>
          <CustomSelect name="field" required>
            {kind === 'TREATMENT' ? (
              <>
                <option value="PROCEDURE">Thủ thuật</option>
                <option value="MATERIAL">Vật liệu</option>
                <option value="QUANTITY">Số lượng</option>
                <option value="SCHEDULE">Lịch điều trị</option>
                <option value="OTHER_PROVIDER_SUPPLIED">Thông tin chuyên môn khác</option>
              </>
            ) : (
              <>
                <option value="UNIT_PRICE_MINOR">Đơn giá</option>
                <option value="TOTAL_PRICE_MINOR">Tổng chi phí</option>
                <option value="CURRENCY">Tiền tệ</option>
              </>
            )}
          </CustomSelect>
        </label>
        <label>
          <span>Giá trị trước</span>
          <input maxLength={5_000} name="beforeValue" required />
        </label>
        <label>
          <span>Giá trị sau</span>
          <input maxLength={5_000} name="afterValue" required />
        </label>
        <label className="is-wide">
          <span>Lý do thay đổi</span>
          <textarea maxLength={5_000} minLength={3} name="reason" required rows={5} />
        </label>
        {validationError ? (
          <p className="is-wide" role="alert">
            {validationError}
          </p>
        ) : null}
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button disabled={pending || !plans?.length} type="submit">
            {pending ? 'Đang ghi nhận…' : 'Ghi nhận thay đổi'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function PassportDraftDialog({
  data,
  open,
  onClose,
  onSubmit,
  pending,
}: {
  readonly data: ProviderCaseWorkspaceData;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
  readonly pending: boolean;
}) {
  return (
    <ProviderDialog
      description="Chỉ nhập nội dung lâm sàng do nha sĩ xác nhận. Bản nháp chưa hiển thị cho bệnh nhân."
      onClose={onClose}
      open={open}
      title="Tạo bản nháp Dental Passport"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const manufacturer = String(form.get('manufacturer') ?? '').trim();
          const lotNumber = String(form.get('lotNumber') ?? '').trim();
          onSubmit({
            treatingDentistId: String(form.get('dentistId')),
            treatmentCompletedAt: String(form.get('completedAt')),
            treatmentSummary: String(form.get('summary') ?? '').trim(),
            dischargeInstructions: String(form.get('discharge') ?? '').trim(),
            followUpInstructions: String(form.get('followUp') ?? '').trim(),
            implants: [],
            materials: [
              {
                procedureCode: String(form.get('procedureCode') ?? '')
                  .trim()
                  .toUpperCase()
                  .replaceAll(' ', '_'),
                material: String(form.get('material') ?? '').trim(),
                ...(manufacturer ? { manufacturer } : {}),
                ...(lotNumber ? { lotNumber } : {}),
              },
            ],
            prescriptions: [],
          });
        }}
      >
        <label>
          <span>Nha sĩ điều trị</span>
          <CustomSelect name="dentistId" required>
            {data.dentists
              .filter((dentist) => dentist.active)
              .map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.fullName}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>Ngày hoàn tất điều trị</span>
          <input max={dateOnly(new Date())} name="completedAt" required type="date" />
        </label>
        <label className="is-wide">
          <span>Tóm tắt điều trị</span>
          <textarea maxLength={10_000} minLength={1} name="summary" required rows={5} />
        </label>
        <label className="is-wide">
          <span>Hướng dẫn xuất viện</span>
          <textarea maxLength={10_000} minLength={1} name="discharge" required rows={5} />
        </label>
        <label className="is-wide">
          <span>Hướng dẫn tái khám</span>
          <textarea maxLength={10_000} minLength={1} name="followUp" required rows={5} />
        </label>
        <div className="provider-form-section is-wide">
          <strong>Vật liệu điều trị chính</strong>
          <div>
            <label>
              <span>Mã thủ thuật</span>
              <input
                defaultValue={data.dentalCase.desiredProcedureCode}
                maxLength={80}
                name="procedureCode"
                required
              />
            </label>
            <label>
              <span>Vật liệu</span>
              <input maxLength={240} name="material" required />
            </label>
            <label>
              <span>Nhà sản xuất</span>
              <input maxLength={240} name="manufacturer" />
            </label>
            <label>
              <span>Số lô</span>
              <input maxLength={240} name="lotNumber" />
            </label>
          </div>
        </div>
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button
            disabled={pending || !data.dentists.some((dentist) => dentist.active)}
            type="submit"
          >
            {pending ? 'Đang tạo…' : 'Tạo bản nháp'}
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
function localDateTimeMin(timeZone: string) {
  return isoToLocalDateTimeInput(new Date(Date.now() + 15 * 60_000).toISOString(), timeZone);
}

function dateOnly(value: Date) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function newPlanItemDraft(id: number, procedureCode = ''): PlanItemDraft {
  return {
    id,
    procedureCode,
    teeth: '',
    quantity: '1',
    material: '',
    brand: '',
    unitPrice: '',
  };
}

function parsePlanItem(item: PlanItemDraft, currency: 'VND' | 'USD'): ParsedPlanItem {
  const procedureCode = item.procedureCode.trim().toUpperCase().replaceAll(' ', '_');
  if (!procedureCode || procedureCode.length > 80) {
    return { ok: false, error: 'mã thủ thuật phải có từ 1 đến 80 ký tự.' };
  }
  const toothNumbers = item.teeth.trim()
    ? item.teeth.split(',').map((value) => Number(value.trim()))
    : [];
  if (
    toothNumbers.length > 32 ||
    toothNumbers.some((value) => !Number.isInteger(value) || value < 1 || value > 99)
  ) {
    return { ok: false, error: 'số răng phải là số nguyên từ 1 đến 99, tối đa 32 răng.' };
  }
  const quantity = Number(item.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: 'số lượng phải là số nguyên dương.' };
  }
  const validPrice =
    currency === 'USD'
      ? /^\d+(?:\.\d{1,2})?$/u.test(item.unitPrice)
      : /^\d+$/u.test(item.unitPrice);
  const displayedPrice = Number(item.unitPrice);
  const unitPriceMinor = currency === 'USD' ? Math.round(displayedPrice * 100) : displayedPrice;
  if (!validPrice || !Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 0) {
    return {
      ok: false,
      error:
        currency === 'USD'
          ? 'đơn giá USD phải là số không âm với tối đa 2 chữ số thập phân.'
          : 'đơn giá VND phải là số nguyên không âm.',
    };
  }
  const material = item.material.trim();
  const brand = item.brand.trim();
  return {
    ok: true,
    value: {
      procedureCode,
      toothNumbers,
      quantity,
      ...(material ? { material } : {}),
      ...(brand ? { brand } : {}),
      unitPriceMinor,
    },
  };
}
