'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CustomSelect } from '@dental-trust/ui';
import { ProviderDialog } from '@/components/provider-dialog';
import { ProviderIcon } from '@/components/provider-icon';
import type { ProviderScheduleData } from '@/lib/provider-data';
import { commandErrorMessage, sendProviderCommand } from '@/lib/provider-command';
import { formatDate, formatDateTime, formatTime, labelStatus } from '@/lib/presentation';

type ScheduleDialog = 'appointment' | 'block' | null;

export function ScheduleWorkspace({ data }: { readonly data: ProviderScheduleData }) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [dialog, setDialog] = useState<ScheduleDialog>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const caseById = useMemo(() => new Map(data.cases.map((item) => [item.id, item])), [data.cases]);
  const selectedAppointments = data.appointments.filter(
    (item) => dateKey(new Date(item.startsAt)) === selectedDate,
  );
  const upcoming = data.appointments
    .filter((item) => Date.parse(item.endsAt) >= Date.now())
    .slice(0, 6);
  const activeRules = data.availability.rules.filter((rule) => rule.active);
  const week = useMemo(() => weekDates(new Date(`${selectedDate}T12:00:00`)), [selectedDate]);

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
          <button onClick={() => setSelectedDate(dateKey(new Date()))} type="button">
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
            (item) => dateKey(new Date(item.startsAt)) === key,
          ).length;
          return (
            <button
              aria-current={key === selectedDate ? 'date' : undefined}
              key={key}
              onClick={() => setSelectedDate(key)}
              type="button"
            >
              <small>{new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date)}</small>
              <strong>{date.getDate()}</strong>
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
                <h2>{formatDate(`${selectedDate}T00:00:00.000Z`, { weekday: 'long' })}</h2>
                <p>{selectedAppointments.length} lịch hẹn · Múi giờ Asia/Ho_Chi_Minh</p>
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
                  return (
                    <article key={appointment.id}>
                      <time>{formatTime(appointment.startsAt)}</time>
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
                          {formatTime(appointment.startsAt)}–{formatTime(appointment.endsAt)} ·{' '}
                          {appointment.timezone}
                        </small>
                      </div>
                      <span className="provider-agenda-status">
                        {labelStatus(appointment.status)}
                      </span>
                      <a
                        aria-label="Mở hồ sơ"
                        href={`/cases/${appointment.caseId}?tab=appointments`}
                      >
                        <ProviderIcon name="chevron" />
                      </a>
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
                  <time>{formatDateTime(appointment.startsAt)}</time>
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
          const form = new FormData(event.currentTarget);
          const start = new Date(String(form.get('startsAt')));
          const duration = Number(form.get('duration'));
          const kind = String(form.get('kind'));
          onSubmit(String(form.get('caseId')), {
            clinicId: data.onboarding.clinicId,
            ...(kind === 'CLINICAL_VISIT'
              ? { clinicLocationId: String(form.get('locationId')) }
              : {}),
            dentistId: String(form.get('dentistId')),
            kind,
            startsAt: start.toISOString(),
            endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
            timezone: 'Asia/Ho_Chi_Minh',
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
          <CustomSelect name="locationId" required>
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
          <button disabled={pending || !data.cases.length || !data.dentists.length} type="submit">
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
          const form = new FormData(event.currentTarget);
          onSubmit({
            locationId: String(form.get('locationId')),
            kind: String(form.get('kind')),
            startsAt: new Date(String(form.get('startsAt'))).toISOString(),
            endsAt: new Date(String(form.get('endsAt'))).toISOString(),
            reason: String(form.get('reason')),
          });
        }}
      >
        <label>
          <span>Phạm vi cơ sở</span>
          <CustomSelect name="locationId" required>
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
          <span>Loại khóa</span>
          <CustomSelect defaultValue="BLOCK" name="kind">
            <option value="BLOCK">Khóa vận hành</option>
            <option value="TIME_OFF">Nghỉ phép</option>
          </CustomSelect>
        </label>
        <label>
          <span>Bắt đầu</span>
          <input min={localDateTimeMin()} name="startsAt" required type="datetime-local" />
        </label>
        <label>
          <span>Kết thúc</span>
          <input min={localDateTimeMin()} name="endsAt" required type="datetime-local" />
        </label>
        <label className="is-wide">
          <span>Lý do</span>
          <textarea minLength={1} name="reason" required rows={4} />
        </label>
        <footer>
          <button onClick={onClose} type="button">
            Hủy
          </button>
          <button disabled={pending} type="submit">
            {pending ? 'Đang lưu…' : 'Khóa thời gian'}
          </button>
        </footer>
      </form>
    </ProviderDialog>
  );
}

function dateKey(date: Date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}
function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
function weekDates(input: Date) {
  const date = new Date(input);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const item = new Date(date);
    item.setDate(date.getDate() + index);
    return item;
  });
}
function weekLabel(start: Date | undefined, end: Date | undefined) {
  if (!start || !end) return 'Tuần hiện tại';
  return `${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short' }).format(start)} – ${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' }).format(end)}`;
}
function localDateTimeMin() {
  const date = new Date(Date.now() + 15 * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
