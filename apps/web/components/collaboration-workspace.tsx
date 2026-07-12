'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AppointmentKind,
  AppointmentView,
  InternalNoteView,
  MessageThreadView,
  MessageView,
  SchedulingContextView,
} from '@dental-trust/contracts';
import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';
import type { PortalArea } from '@/lib/routing';

interface CollaborationData {
  appointments?: AppointmentView[];
  schedulingContext?: SchedulingContextView | null;
  threads?: MessageThreadView[];
  messages?: MessageView[];
  internalNotes?: InternalNoteView[];
}

const collaborationPages = new Set([
  'patient:consultations',
  'patient:messages',
  'clinic:scheduling',
  'clinic:messages',
]);

export function isCollaborationWorkspace(area: PortalArea, pageKey: string): boolean {
  return collaborationPages.has(`${area}:${pageKey}`);
}

export function CollaborationWorkspace({
  area,
  pageKey,
  locale,
  title,
  description,
  messages,
  resourceId,
  development,
}: {
  area: PortalArea;
  pageKey: string;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
  resourceId?: string | undefined;
  development: boolean;
}) {
  const labels = collaborationLabels(locale);
  const [data, setData] = useState<CollaborationData | null>(null);
  const [threadMessages, setThreadMessages] = useState<MessageView[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNoteView[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [appointmentKind, setAppointmentKind] = useState<AppointmentKind>('CONSULTATION');

  useEffect(() => {
    if (!resourceId) {
      setLoading(false);
      setError(true);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const query = new URLSearchParams({ area, pageKey, resourceId });
    void fetch(`/api/portal/data?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('load_failed');
        const envelope = (await response.json()) as { data?: CollaborationData };
        if (!envelope.data) throw new Error('invalid_response');
        setData(envelope.data);
        if (pageKey === 'messages') {
          setSelectedThreadId((current) => current ?? envelope.data?.threads?.[0]?.id ?? null);
        }
      })
      .catch((caught: unknown) => {
        if ((caught as { name?: string }).name !== 'AbortError') setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [area, pageKey, resourceId, revision]);

  useEffect(() => {
    if (!resourceId || pageKey !== 'messages' || !selectedThreadId) {
      setThreadMessages([]);
      setInternalNotes([]);
      return;
    }
    const controller = new AbortController();
    const messageQuery = new URLSearchParams({
      area,
      pageKey,
      resourceId,
      threadId: selectedThreadId,
    });
    void fetch(`/api/portal/data?${messageQuery.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('load_failed');
        const envelope = (await response.json()) as { data?: CollaborationData };
        setThreadMessages(envelope.data?.messages ?? []);
      })
      .catch((caught: unknown) => {
        if ((caught as { name?: string }).name !== 'AbortError') setError(true);
      });
    if (area === 'clinic') {
      const noteQuery = new URLSearchParams({
        area,
        pageKey,
        resourceId,
        threadId: selectedThreadId,
        view: 'internal-notes',
      });
      void fetch(`/api/portal/data?${noteQuery.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('load_failed');
          const envelope = (await response.json()) as { data?: CollaborationData };
          setInternalNotes(envelope.data?.internalNotes ?? []);
        })
        .catch((caught: unknown) => {
          if ((caught as { name?: string }).name !== 'AbortError') setError(true);
        });
    }
    return () => controller.abort();
  }, [area, pageKey, resourceId, selectedThreadId, revision]);

  const sendCommand = async (command: string, payload: Record<string, unknown>) => {
    if (!resourceId) return false;
    setSending(true);
    setError(false);
    setNotice(null);
    try {
      const response = await fetch('/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          area,
          pageKey,
          command,
          entityId: resourceId,
          idempotencyKey: crypto.randomUUID(),
          payload,
        }),
      });
      if (!response.ok) throw new Error('command_failed');
      setNotice(labels.saved);
      setRevision((value) => value + 1);
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setSending(false);
    }
  };

  const submitAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.reportValidity()) return;
    const form = new FormData(formElement);
    const context = data?.schedulingContext;
    const meetingJoinUrl = String(form.get('meetingJoinUrl') ?? '').trim();
    const clinicLocationId = String(form.get('clinicLocationId') ?? '').trim();
    const success = await sendCommand('create_appointment', {
      clinicId: context?.clinicId,
      dentistId: String(form.get('dentistId')),
      kind: String(form.get('kind')),
      ...(clinicLocationId ? { clinicLocationId } : {}),
      startsAt: utcControlValue(String(form.get('startsAt'))),
      endsAt: utcControlValue(String(form.get('endsAt'))),
      timezone: String(form.get('timezone')),
      ...(meetingJoinUrl ? { meetingJoinUrl } : {}),
    });
    if (success) {
      formElement.reset();
      setAppointmentKind('CONSULTATION');
    }
  };

  const submitReschedule = async (
    event: FormEvent<HTMLFormElement>,
    appointment: AppointmentView,
  ) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    await sendCommand('reschedule_appointment', {
      appointmentId: appointment.id,
      expectedVersion: appointment.version,
      startsAt: utcControlValue(String(form.get('startsAt'))),
      endsAt: utcControlValue(String(form.get('endsAt'))),
      timezone: String(form.get('timezone')),
    });
  };

  const submitCancel = async (event: FormEvent<HTMLFormElement>, appointment: AppointmentView) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    await sendCommand('cancel_appointment', {
      appointmentId: appointment.id,
      expectedVersion: appointment.version,
      reason: String(form.get('reason')),
    });
  };

  const submitThread = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.reportValidity()) return;
    const form = new FormData(formElement);
    const success = await sendCommand('create_message_thread', {
      threadSubject: String(form.get('threadSubject')),
      messageBody: String(form.get('messageBody')),
      fileAssetIds: [],
    });
    if (success) formElement.reset();
  };

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.reportValidity() || !selectedThreadId) return;
    const form = new FormData(formElement);
    const success = await sendCommand('send_message', {
      threadId: selectedThreadId,
      messageBody: String(form.get('messageBody')),
      fileAssetIds: [],
    });
    if (success) formElement.reset();
  };

  const submitInternalNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.reportValidity() || !selectedThreadId || area !== 'clinic') return;
    const form = new FormData(formElement);
    const success = await sendCommand('create_internal_note', {
      threadId: selectedThreadId,
      internalNote: String(form.get('internalNote')),
    });
    if (success) formElement.reset();
  };

  const activeAppointments = useMemo(
    () =>
      (data?.appointments ?? []).filter(
        ({ status }) => status === 'TENTATIVE' || status === 'CONFIRMED',
      ),
    [data?.appointments],
  );

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections[area]} ·{' '}
            {development ? messages.portal.demo : messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="info">
          <Icon name="lock" />
          {labels.caseScoped}
        </Badge>
      </div>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {loading ? (
        <Card style={{ padding: '1.2rem' }}>
          <Skeleton style={{ height: '2rem', width: '40%' }} />
          <Skeleton style={{ height: '12rem', marginTop: '1rem' }} />
        </Card>
      ) : pageKey === 'consultations' || pageKey === 'scheduling' ? (
        <div className="workspace-grid">
          <Card className="workflow-card">
            <h2>{labels.upcoming}</h2>
            {(data?.appointments ?? []).length === 0 ? (
              <EmptyState title={messages.common.emptyTitle} body={labels.noAppointments} />
            ) : (
              <div className="document-list">
                {(data?.appointments ?? []).map((appointment) => (
                  <div className="document-row" key={appointment.id}>
                    <Icon name="calendar" />
                    <div>
                      <strong>{formatAppointment(locale, appointment)}</strong>
                      <small>
                        {appointment.timezone} · {appointment.kind.replace('_', ' ')} · v
                        {appointment.version}
                      </small>
                      {appointment.meetingJoinUrl &&
                      (appointment.status === 'TENTATIVE' || appointment.status === 'CONFIRMED') ? (
                        <a
                          href={appointment.meetingJoinUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {labels.joinMeeting}
                        </a>
                      ) : null}
                    </div>
                    <Badge
                      tone={
                        appointment.status === 'COMPLETED'
                          ? 'verified'
                          : appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW'
                            ? 'attention'
                            : 'info'
                      }
                    >
                      {appointment.status}
                    </Badge>
                    {(appointment.status === 'TENTATIVE' || appointment.status === 'CONFIRMED') && (
                      <details>
                        <summary>{labels.manage}</summary>
                        <form
                          className="workflow-form"
                          onSubmit={(event) => void submitReschedule(event, appointment)}
                        >
                          <Field
                            id={`reschedule-start-${appointment.id}`}
                            label={labels.startUtc}
                            name="startsAt"
                            type="datetime-local"
                            required
                          />
                          <Field
                            id={`reschedule-end-${appointment.id}`}
                            label={labels.endUtc}
                            name="endsAt"
                            type="datetime-local"
                            required
                          />
                          <Field
                            defaultValue={appointment.timezone}
                            id={`reschedule-timezone-${appointment.id}`}
                            label={labels.timezone}
                            name="timezone"
                            required
                          />
                          <Button disabled={sending} size="sm" type="submit" variant="secondary">
                            {labels.reschedule}
                          </Button>
                        </form>
                        <form
                          className="workflow-form"
                          onSubmit={(event) => void submitCancel(event, appointment)}
                        >
                          <Field
                            id={`cancel-reason-${appointment.id}`}
                            label={labels.cancelReason}
                            maxLength={500}
                            minLength={5}
                            name="reason"
                            required
                          />
                          <Button disabled={sending} size="sm" type="submit" variant="secondary">
                            {labels.cancel}
                          </Button>
                        </form>
                        {area === 'clinic' ? (
                          <div className="portal-heading__actions">
                            <Button
                              disabled={sending}
                              onClick={() =>
                                void sendCommand('record_attendance', {
                                  appointmentId: appointment.id,
                                  expectedVersion: appointment.version,
                                  outcome: 'COMPLETED',
                                })
                              }
                              size="sm"
                            >
                              {labels.completed}
                            </Button>
                            <Button
                              disabled={sending}
                              onClick={() =>
                                void sendCommand('record_attendance', {
                                  appointmentId: appointment.id,
                                  expectedVersion: appointment.version,
                                  outcome: 'NO_SHOW',
                                })
                              }
                              size="sm"
                              variant="secondary"
                            >
                              {labels.noShow}
                            </Button>
                          </div>
                        ) : null}
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
          {area === 'clinic' ? (
            <Card className="side-card">
              <h2>{labels.createAppointment}</h2>
              {data?.schedulingContext ? (
                <form className="workflow-form" onSubmit={(event) => void submitAppointment(event)}>
                  <p>{data.schedulingContext.clinicName}</p>
                  <SelectField label={labels.dentist} name="dentistId" required>
                    {data.schedulingContext.dentists.map((dentist) => (
                      <option key={dentist.id} value={dentist.id}>
                        {dentist.fullName}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    id="appointment-kind"
                    label={labels.kind}
                    name="kind"
                    onChange={(event) =>
                      setAppointmentKind(event.currentTarget.value as AppointmentKind)
                    }
                    value={appointmentKind}
                  >
                    <option value="CONSULTATION">{labels.consultation}</option>
                    <option value="CLINICAL_VISIT">{labels.clinicalVisit}</option>
                  </SelectField>
                  {appointmentKind === 'CLINICAL_VISIT' ? (
                    <SelectField
                      id="appointment-location"
                      label={labels.location}
                      name="clinicLocationId"
                      required
                    >
                      <option value="">—</option>
                      {data.schedulingContext.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} · {location.timezone}
                        </option>
                      ))}
                    </SelectField>
                  ) : null}
                  <Field
                    id="appointment-start"
                    label={labels.startUtc}
                    name="startsAt"
                    type="datetime-local"
                    required
                  />
                  <Field
                    id="appointment-end"
                    label={labels.endUtc}
                    name="endsAt"
                    type="datetime-local"
                    required
                  />
                  <Field
                    defaultValue="Asia/Ho_Chi_Minh"
                    id="appointment-timezone"
                    label={labels.timezone}
                    name="timezone"
                    required
                  />
                  {appointmentKind === 'CONSULTATION' ? (
                    <Field
                      id="appointment-meeting-url"
                      label={labels.meetingUrl}
                      name="meetingJoinUrl"
                      placeholder="https://meet.example.com/room"
                      type="url"
                      required={!development}
                    />
                  ) : null}
                  <Button disabled={sending || activeAppointments.length > 100} type="submit">
                    {labels.createAppointment}
                  </Button>
                </form>
              ) : (
                <Alert tone="warning" title={labels.noSchedulingContext} />
              )}
            </Card>
          ) : null}
        </div>
      ) : (
        <div className="workspace-grid">
          <Card className="workflow-card">
            <h2>{labels.threads}</h2>
            {(data?.threads ?? []).map((thread) => (
              <button
                className="workspace-filter"
                data-active={selectedThreadId === thread.id}
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                type="button"
              >
                {thread.threadSubject} · {thread.unreadCount} {labels.unread}
              </button>
            ))}
            {(data?.threads ?? []).length === 0 ? (
              <EmptyState title={messages.common.emptyTitle} body={labels.noThreads} />
            ) : null}
            <form className="workflow-form" onSubmit={(event) => void submitThread(event)}>
              <Field
                label={labels.subject}
                maxLength={160}
                minLength={1}
                name="threadSubject"
                required
              />
              <TextAreaField
                id="thread-message-body"
                label={messages.forms.message}
                maxLength={8000}
                name="messageBody"
                required
              />
              <Button disabled={sending} type="submit">
                {labels.newThread}
              </Button>
            </form>
          </Card>
          <Card className="side-card">
            <h2>{labels.participantMessages}</h2>
            <div className="activity-list">
              {threadMessages.map((message) => (
                <div className="activity-item" key={message.id}>
                  <span className="activity-item__dot" />
                  <div>
                    <strong>{message.authorUserId}</strong>
                    <p>{message.messageBody}</p>
                    <small>{new Date(message.createdAt).toLocaleString()}</small>
                    {!message.readByCurrentUser ? (
                      <Button
                        disabled={sending}
                        onClick={() =>
                          void sendCommand('mark_message_read', {
                            threadId: message.threadId,
                            messageId: message.id,
                          })
                        }
                        size="sm"
                        variant="quiet"
                      >
                        {labels.markRead}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {selectedThreadId ? (
              <form className="workflow-form" onSubmit={(event) => void submitMessage(event)}>
                <TextAreaField
                  id="reply-message-body"
                  label={messages.forms.message}
                  maxLength={8000}
                  name="messageBody"
                  required
                />
                <Button disabled={sending} type="submit">
                  <Icon name="message" />
                  {messages.forms.send}
                </Button>
              </form>
            ) : null}
            {area === 'clinic' && selectedThreadId ? (
              <section aria-labelledby="internal-notes-heading">
                <h3 id="internal-notes-heading">{labels.internalNotes}</h3>
                <Alert tone="warning" title={labels.internalNotesWarning} />
                {internalNotes.map((note) => (
                  <div className="activity-item" key={note.id}>
                    <Icon name="lock" />
                    <div>
                      <p>{note.internalNote}</p>
                      <small>{new Date(note.createdAt).toLocaleString()}</small>
                    </div>
                  </div>
                ))}
                <form
                  className="workflow-form"
                  onSubmit={(event) => void submitInternalNote(event)}
                >
                  <TextAreaField
                    id="internal-note-body"
                    label={labels.internalNotes}
                    maxLength={8000}
                    name="internalNote"
                    required
                  />
                  <Button disabled={sending} type="submit" variant="secondary">
                    {labels.saveInternalNote}
                  </Button>
                </form>
              </section>
            ) : null}
          </Card>
        </div>
      )}
    </main>
  );
}

function utcControlValue(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u.test(value)) return value;
  return new Date(`${value.length === 16 ? `${value}:00` : value}.000Z`).toISOString();
}

function formatAppointment(locale: Locale, appointment: AppointmentView): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: appointment.timezone,
  }).format(new Date(appointment.startsAt));
}

function collaborationLabels(locale: Locale) {
  return locale === 'vi'
    ? {
        caseScoped: 'Theo phạm vi hồ sơ',
        saved: 'Thay đổi đã được ghi nhận an toàn.',
        upcoming: 'Lịch hẹn',
        noAppointments: 'Chưa có lịch hẹn trong hồ sơ này.',
        joinMeeting: 'Mở phòng tư vấn',
        manage: 'Quản lý lịch hẹn',
        startUtc: 'Bắt đầu (UTC)',
        endUtc: 'Kết thúc (UTC)',
        timezone: 'Múi giờ hiển thị',
        reschedule: 'Đổi lịch',
        cancelReason: 'Lý do hủy',
        cancel: 'Hủy lịch',
        completed: 'Đã tham dự',
        noShow: 'Không tham dự',
        createAppointment: 'Tạo lịch hẹn',
        dentist: 'Nha sĩ',
        location: 'Cơ sở đang hoạt động',
        kind: 'Loại lịch hẹn',
        consultation: 'Tư vấn trực tuyến',
        clinicalVisit: 'Khám lâm sàng',
        meetingUrl: 'Liên kết phòng họp đã được phê duyệt',
        noSchedulingContext: 'Hồ sơ chưa được phân công cho phòng khám đang chọn.',
        threads: 'Chủ đề trao đổi',
        unread: 'chưa đọc',
        noThreads: 'Chưa có chủ đề trao đổi trong hồ sơ.',
        subject: 'Chủ đề',
        newThread: 'Tạo chủ đề',
        participantMessages: 'Tin nhắn người tham gia',
        markRead: 'Đánh dấu đã đọc',
        internalNotes: 'Ghi chú nội bộ',
        internalNotesWarning: 'Chỉ nhân sự được phân công nhìn thấy ghi chú nội bộ.',
        saveInternalNote: 'Lưu ghi chú nội bộ',
      }
    : {
        caseScoped: 'Case scoped',
        saved: 'The change was recorded securely.',
        upcoming: 'Appointments',
        noAppointments: 'No appointments are scheduled for this case.',
        joinMeeting: 'Open consultation room',
        manage: 'Manage appointment',
        startUtc: 'Start (UTC)',
        endUtc: 'End (UTC)',
        timezone: 'Display timezone',
        reschedule: 'Reschedule',
        cancelReason: 'Cancellation reason',
        cancel: 'Cancel appointment',
        completed: 'Attended',
        noShow: 'No show',
        createAppointment: 'Create appointment',
        dentist: 'Dentist',
        location: 'Active clinic location',
        kind: 'Appointment type',
        consultation: 'Online consultation',
        clinicalVisit: 'Clinical visit',
        meetingUrl: 'Approved meeting URL',
        noSchedulingContext: 'This case is not assigned to the selected clinic.',
        threads: 'Conversation threads',
        unread: 'unread',
        noThreads: 'No conversation thread exists for this case.',
        subject: 'Subject',
        newThread: 'Start thread',
        participantMessages: 'Participant messages',
        markRead: 'Mark read',
        internalNotes: 'Internal notes',
        internalNotesWarning: 'Only assigned staff can see internal notes.',
        saveInternalNote: 'Save internal note',
      };
}
