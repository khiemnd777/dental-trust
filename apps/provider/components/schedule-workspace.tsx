'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CustomSelect } from '@dental-trust/ui';
import type { AppointmentView } from '@dental-trust/contracts';
import { ProviderDialog } from '@/components/provider-dialog';
import { ProviderIcon } from '@/components/provider-icon';
import {
  appointmentMutationsAt,
  type AppointmentLifecycleMutation as AppointmentMutation,
} from '@/lib/appointment-lifecycle';
import type { ProviderScheduleData } from '@/lib/provider-data';
import { commandErrorMessage, sendProviderCommand } from '@/lib/provider-command';
import {
  isoDateKeyInTimeZone,
  isoToLocalDateTimeInput,
  localDateTimeToIso,
} from '@/lib/provider-time';
import { formatDate, formatDateTime, formatTime, labelStatus } from '@/lib/presentation';

type ScheduleDialog = 'appointment' | 'appointmentLifecycle' | 'block' | null;

const appointmentMutationLabels: Readonly<Record<AppointmentMutation, string>> = {
  reschedule: 'Đổi thời gian',
  cancel: 'Hủy lịch hẹn',
  attendance: 'Ghi nhận tham dự',
};

export function ScheduleWorkspace({ data }: { readonly data: ProviderScheduleData }) {
  const router = useRouter();
  const primaryTimeZone =
    data.onboarding.locations.find((location) => location.active)?.timezone ??
    data.onboarding.locations[0]?.timezone ??
    'Asia/Ho_Chi_Minh';
  const [selectedDate, setSelectedDate] = useState(() =>
    isoDateKeyInTimeZone(new Date().toISOString(), primaryTimeZone),
  );
  const [dialog, setDialog] = useState<ScheduleDialog>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentView | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const caseById = useMemo(() => new Map(data.cases.map((item) => [item.id, item])), [data.cases]);
  const selectedAppointments = data.appointments.filter(
    (item) => isoDateKeyInTimeZone(item.startsAt, item.timezone) === selectedDate,
  );
  const upcoming = data.appointments
    .filter((item) => Date.parse(item.endsAt) >= Date.now())
    .slice(0, 6);
  const activeRules = data.availability.rules.filter((rule) => rule.active);
  const week = useMemo(() => weekDates(new Date(`${selectedDate}T12:00:00.000Z`)), [selectedDate]);

  async function execute(operation: () => Promise<unknown>, success: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      setDialog(null);
      router.refresh();
    } catch (reason) {
      setError(commandErrorMessage(reason));
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
      <div className="provider-schedule-toolbar">
        <div>
          <button
            aria-label="Tuần trước"
            onClick={() => setSelectedDate(addDays(selectedDate, -7))}
            type="button"
          >
            <ProviderIcon name="chevron" />
          </button>
          <strong>
            {week.length ? weekLabel(week[0], week[week.length - 1]) : 'Tuần hiện tại'}
          </strong>
          <button
            aria-label="Tuần sau"
            onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            type="button"
          >
            <ProviderIcon name="chevron" />
          </button>
          <button
            onClick={() =>
              setSelectedDate(isoDateKeyInTimeZone(new Date().toISOString(), primaryTimeZone))
            }
            type="button"
          >
            Hôm nay
          </button>
        </div>
        <div>
          <button
            className="provider-secondary-button"
            onClick={() => setDialog('block')}
            type="button"
          >
            <ProviderIcon name="clock" /> Khóa lịch
          </button>
          <button
            className="provider-primary-button"
            onClick={() => setDialog('appointment')}
            type="button"
          >
            <ProviderIcon name="plus" /> Tạo lịch hẹn
          </button>
        </div>
      </div>

      <nav aria-label="Chọn ngày" className="provider-date-strip provider-date-strip--interactive">
        {week.map((date) => {
          const key = dateKey(date);
          const count = data.appointments.filter(
            (item) => isoDateKeyInTimeZone(item.startsAt, item.timezone) === key,
          ).length;
          return (
            <button
              aria-current={key === selectedDate ? 'date' : undefined}
              key={key}
              onClick={() => setSelectedDate(key)}
              type="button"
            >
              <small>
                {new Intl.DateTimeFormat('vi-VN', {
                  weekday: 'short',
                  timeZone: 'UTC',
                }).format(date)}
              </small>
              <strong>{date.getUTCDate()}</strong>
              {count ? <span>{count}</span> : null}
              {key === selectedDate ? <i /> : null}
            </button>
          );
        })}
      </nav>

      <div className="provider-schedule-layout">
        <section className="provider-panel provider-agenda">
          <header className="provider-panel-header">
            <div>
              <span className="provider-panel-icon provider-panel-icon--blue">
                <ProviderIcon name="calendar" />
              </span>
              <span>
                <h2>
                  {formatDate(`${selectedDate}T12:00:00.000Z`, {
                    weekday: 'long',
                    timeZone: 'UTC',
                  })}
                </h2>
                <p>{selectedAppointments.length} lịch hẹn · theo múi giờ từng lịch hẹn</p>
              </span>
            </div>
            <span className="provider-live-indicator">
              <i /> Dữ liệu trực tiếp
            </span>
          </header>
          {selectedAppointments.length ? (
            <div className="provider-agenda-list">
              {selectedAppointments
                .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
                .map((appointment) => {
                  const dentalCase = caseById.get(appointment.caseId);
                  const availableMutations = appointmentMutationsAt(appointment);
                  return (
                    <article key={appointment.id}>
                      <time>{formatTime(appointment.startsAt, appointment.timezone)}</time>
                      <span className="provider-agenda-line">
                        <i />
                      </span>
                      <span
                        className={`provider-avatar provider-avatar--${appointment.kind === 'CONSULTATION' ? 'blue' : 'success'}`}
                      >
                        {dentalCase ? dentalCase.caseNumber.slice(-2) : 'DT'}
                      </span>
                      <div>
                        <strong>{dentalCase?.title ?? 'Hồ sơ điều trị'}</strong>
                        <p>
                          {appointment.kind === 'CONSULTATION'
                            ? 'Tư vấn trực tuyến'
                            : 'Khám tại phòng khám'}
                        </p>
                        <small>
                          <ProviderIcon
                            name={appointment.kind === 'CONSULTATION' ? 'video' : 'clinic'}
                          />{' '}
                          {formatTime(appointment.startsAt, appointment.timezone)}–
                          {formatTime(appointment.endsAt, appointment.timezone)} ·{' '}
                          {appointment.timezone}
                        </small>
                      </div>
                      <span className="provider-agenda-status">
                        {labelStatus(appointment.status)}
                      </span>
                      {availableMutations.length ? (
                        <button
                          aria-label={`Quản lý lịch hẹn ${formatDateTime(appointment.startsAt, appointment.timezone)}`}
                          onClick={() => {
                            setSelectedAppointment(appointment);
                            setDialog('appointmentLifecycle');
                          }}
                          type="button"
                        >
                          <ProviderIcon name="more" />
                        </button>
                      ) : (
                        <a
                          aria-label="Mở hồ sơ"
                          href={`/cases/${appointment.caseId}?tab=appointments`}
                        >
                          <ProviderIcon name="chevron" />
                        </a>
                      )}
                    </article>
                  );
                })}
            </div>
          ) : (
            <div className="provider-empty-state provider-empty-state--schedule">
              <span>
                <ProviderIcon name="calendar" />
              </span>
              <strong>Không có lịch hẹn trong ngày này</strong>
              <p>
                Chọn ngày khác hoặc tạo lịch hẹn mới. Lịch khóa vẫn được áp dụng khi kiểm tra xung
                đột.
              </p>
              <button onClick={() => setDialog('appointment')} type="button">
                Tạo lịch hẹn
              </button>
            </div>
          )}
        </section>

        <aside className="provider-schedule-aside">
          <section className="provider-panel provider-day-summary">
            <header>
              <ProviderIcon name="clock" />
              <span>
                <h2>Capacity đang công bố</h2>
                <p>{activeRules.length} quy tắc hoạt động</p>
              </span>
            </header>
            <dl>
              <div>
                <dt>Tư vấn</dt>
                <dd>
                  {activeRules
                    .filter((item) => item.slotKind !== 'TREATMENT')
                    .reduce((sum, item) => sum + item.capacity, 0)}
                </dd>
              </div>
              <div>
                <dt>Điều trị</dt>
                <dd>
                  {activeRules
                    .filter((item) => item.slotKind !== 'CONSULTATION')
                    .reduce((sum, item) => sum + item.capacity, 0)}
                </dd>
              </div>
              <div>
                <dt>Khóa lịch</dt>
                <dd>{data.availability.blocks.length}</dd>
              </div>
            </dl>
            <div className="provider-utilization">
              <span>
                <small>Quy tắc có nha sĩ</small>
                <strong>
                  {activeRules.length
                    ? Math.round(
                        (activeRules.filter((item) => item.dentistId).length / activeRules.length) *
                          100,
                      )
                    : 0}
                  %
                </strong>
              </span>
              <i>
                <b
                  style={{
                    width: `${activeRules.length ? Math.round((activeRules.filter((item) => item.dentistId).length / activeRules.length) * 100) : 0}%`,
                  }}
                />
              </i>
            </div>
          </section>
          <section className="provider-panel provider-upcoming-card">
            <header>
              <h2>Sắp tới</h2>
              <span>{upcoming.length}</span>
            </header>
            {upcoming.length ? (
              upcoming.slice(0, 3).map((appointment) => (
                <a href={`/cases/${appointment.caseId}?tab=appointments`} key={appointment.id}>
                  <time>{formatDateTime(appointment.startsAt, appointment.timezone)}</time>
                  <strong>{caseById.get(appointment.caseId)?.title ?? 'Hồ sơ điều trị'}</strong>
                  <small>{labelStatus(appointment.status)}</small>
                </a>
              ))
            ) : (
              <p>Chưa có lịch hẹn sắp tới.</p>
            )}
          </section>
          <section className="provider-panel provider-calendar-health">
            <span
              className={
                data.availability.calendarConnections.some((item) => item.status === 'ERROR')
                  ? 'is-error'
                  : 'is-ok'
              }
            >
              <ProviderIcon
                name={
                  data.availability.calendarConnections.some((item) => item.status === 'ERROR')
                    ? 'alert'
                    : 'check'
                }
              />
            </span>
            <div>
              <h2>Đồng bộ lịch</h2>
              <p>
                {data.availability.calendarConnections.length
                  ? `${data.availability.calendarConnections.filter((item) => item.status === 'ACTIVE').length}/${data.availability.calendarConnections.length} kết nối hoạt động`
                  : 'Chưa kết nối lịch ngoài'}
              </p>
            </div>
            <a href="/clinic?tab=availability">
              <ProviderIcon name="chevron" />
            </a>
          </section>
        </aside>
      </div>

      <GlobalAppointmentDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(caseId, payload) =>
          void execute(
            () =>
              sendProviderCommand({ command: 'create_appointment', resourceId: caseId, payload }),
            'Lịch hẹn đã được tạo và kiểm tra theo phạm vi ca.',
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
                    resourceId: selectedAppointment.caseId,
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
      <BlockDialog
        data={data}
        onClose={() => setDialog(null)}
        onSubmit={(payload) =>
          void execute(
            () => sendProviderCommand({ command: 'clinic_create_availability_block', payload }),
            'Đã khóa thời gian trên lịch phòng khám.',
          )
        }
        open={dialog === 'block'}
        pending={pending}
      />
    </>
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
    if (!open) return;
    setMutation(
      appointment ? (appointmentMutationsAt(appointment)[0] ?? 'reschedule') : 'reschedule',
    );
    setValidationError(null);
  }, [appointment, open]);

  if (!appointment) return null;
  const availableMutations = appointmentMutationsAt(appointment);
  const durationMinutes = Math.max(
    15,
    Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000),
  );

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
            {availableMutations.map((value) => (
              <option key={value} value={value}>
                {appointmentMutationLabels[value]}
              </option>
            ))}
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
        <p className="is-wide">
          <a href={`/cases/${appointment.caseId}?tab=appointments`}>Mở hồ sơ lịch hẹn</a>
        </p>
        {validationError ? (
          <p className="is-wide" role="alert">
            {validationError}
          </p>
        ) : null}
        <footer>
          <button onClick={onClose} type="button">
            Đóng
          </button>
          <button disabled={pending} type="submit">
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

function GlobalAppointmentDialog({
  data,
  open,
  onClose,
  onSubmit,
  pending,
}: {
  readonly data: ProviderScheduleData;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (caseId: string, payload: Record<string, unknown>) => void;
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
      description="Lịch hẹn được kiểm tra theo ca, nha sĩ, cơ sở và timezone."
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
          onSubmit(String(form.get('caseId')), {
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
        <label className="is-wide">
          <span>Hồ sơ điều trị</span>
          <CustomSelect name="caseId" required>
            {data.cases
              .filter((item) => !['CLOSED', 'CANCELLED'].includes(item.status))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.caseNumber} · {item.title}
                </option>
              ))}
          </CustomSelect>
        </label>
        <label>
          <span>Loại</span>
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
            name="locationId"
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
            disabled={
              pending || !data.cases.length || !data.dentists.length || !activeLocations.length
            }
            type="submit"
          >
            {pending ? 'Đang tạo…' : 'Tạo lịch hẹn'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function BlockDialog({
  data,
  open,
  onClose,
  onSubmit,
  pending,
}: {
  readonly data: ProviderScheduleData;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
  readonly pending: boolean;
}) {
  const activeLocations = data.onboarding.locations.filter((location) => location.active);
  const defaultLocationId = activeLocations[0]?.id ?? '';
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [startsAtValue, setStartsAtValue] = useState('');
  const timezone =
    activeLocations.find((location) => location.id === locationId)?.timezone ?? 'Asia/Ho_Chi_Minh';
  const minimumDateTime = localDateTimeMin(timezone);

  useEffect(() => {
    if (!open) return;
    setLocationId(defaultLocationId);
    setStartsAtValue('');
  }, [defaultLocationId, open]);

  return (
    <ProviderDialog
      description="Khóa lịch được áp dụng khi kiểm tra availability và không xóa lịch hẹn hiện hữu."
      onClose={onClose}
      open={open}
      title="Khóa thời gian"
    >
      <form
        className="provider-form provider-form--grid"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          const startsAtInput = formElement.elements.namedItem('startsAt') as HTMLInputElement;
          const endsAtInput = formElement.elements.namedItem('endsAt') as HTMLInputElement;
          let startsAt: string;
          let endsAt: string;
          try {
            startsAt = localDateTimeToIso(String(form.get('startsAt')), timezone);
            startsAtInput.setCustomValidity('');
          } catch {
            startsAtInput.setCustomValidity(
              'Thời gian bắt đầu không tồn tại trong timezone của cơ sở.',
            );
            startsAtInput.reportValidity();
            return;
          }
          try {
            endsAt = localDateTimeToIso(String(form.get('endsAt')), timezone);
            endsAtInput.setCustomValidity('');
          } catch {
            endsAtInput.setCustomValidity(
              'Thời gian kết thúc không tồn tại trong timezone của cơ sở.',
            );
            endsAtInput.reportValidity();
            return;
          }
          if (Date.parse(endsAt) <= Date.parse(startsAt)) {
            endsAtInput.setCustomValidity('Thời gian kết thúc phải sau thời gian bắt đầu.');
            endsAtInput.reportValidity();
            return;
          }
          onSubmit({
            locationId,
            kind: String(form.get('kind')),
            startsAt,
            endsAt,
            reason: String(form.get('reason')),
          });
        }}
      >
        <label>
          <span>Phạm vi cơ sở</span>
          <CustomSelect
            name="locationId"
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
          <span>Loại khóa</span>
          <CustomSelect defaultValue="BLOCK" name="kind">
            <option value="BLOCK">Khóa vận hành</option>
            <option value="TIME_OFF">Nghỉ phép</option>
          </CustomSelect>
        </label>
        <label>
          <span>Bắt đầu</span>
          <input
            min={minimumDateTime}
            name="startsAt"
            onChange={(event) => {
              event.currentTarget.setCustomValidity('');
              setStartsAtValue(event.target.value);
            }}
            required
            type="datetime-local"
          />
        </label>
        <label>
          <span>Kết thúc</span>
          <input
            min={startsAtValue || minimumDateTime}
            name="endsAt"
            onChange={(event) => event.currentTarget.setCustomValidity('')}
            required
            type="datetime-local"
          />
        </label>
        <label className="is-wide">
          <span>Lý do</span>
          <textarea minLength={1} name="reason" required rows={4} />
        </label>
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button disabled={pending || !activeLocations.length} type="submit">
            {pending ? 'Đang lưu…' : 'Khóa thời gian'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}
function weekDates(input: Date) {
  const date = new Date(input);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const item = new Date(date);
    item.setUTCDate(date.getUTCDate() + index);
    return item;
  });
}
function weekLabel(start: Date | undefined, end: Date | undefined) {
  if (!start || !end) return 'Tuần hiện tại';
  return `${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(start)} – ${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(end)}`;
}
function localDateTimeMin(timeZone: string) {
  return isoToLocalDateTimeInput(new Date(Date.now() + 15 * 60_000).toISOString(), timeZone);
}
