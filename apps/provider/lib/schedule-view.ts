export const scheduleViews = ['day', 'week', 'month'] as const;

export type ScheduleView = (typeof scheduleViews)[number];

export function normalizeScheduleView(value: string | undefined): ScheduleView {
  return scheduleViews.includes(value as ScheduleView) ? (value as ScheduleView) : 'week';
}

export function isScheduleDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && dateKey(date) === value;
}

export function scheduleHref(view: ScheduleView, date: string): string {
  const params = new URLSearchParams({ view, date });
  return `/schedule?${params.toString()}`;
}

export function addSchedulePeriod(value: string, view: ScheduleView, direction: -1 | 1): string {
  if (view === 'day') return addDays(value, direction);
  if (view === 'week') return addDays(value, direction * 7);

  const date = new Date(`${value}T12:00:00.000Z`);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1, 12));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return dateKey(target);
}

export function periodLabel(view: ScheduleView, selectedDate: string): string {
  const selected = new Date(`${selectedDate}T12:00:00.000Z`);
  if (view === 'day') {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(selected);
  }
  if (view === 'month') {
    return new Intl.DateTimeFormat('vi-VN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(selected);
  }
  const week = weekDates(selected);
  return weekLabel(week[0], week[week.length - 1]);
}

export function navigationLabel(view: ScheduleView, direction: -1 | 1): string {
  const unit = view === 'day' ? 'Ngày' : view === 'week' ? 'Tuần' : 'Tháng';
  return `${unit} ${direction === -1 ? 'trước' : 'sau'}`;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

export function weekDates(input: Date): readonly Date[] {
  const date = new Date(input);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const item = new Date(date);
    item.setUTCDate(date.getUTCDate() + index);
    return item;
  });
}

export function monthDates(input: Date): readonly Date[] {
  const firstOfMonth = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1, 12));
  const gridStart = new Date(weekDates(firstOfMonth)[0] ?? firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => {
    const item = new Date(gridStart);
    item.setUTCDate(gridStart.getUTCDate() + index);
    return item;
  });
}

function weekLabel(start: Date | undefined, end: Date | undefined): string {
  if (!start || !end) return 'Tuần hiện tại';
  const startLabel = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(start);
  const endLabel = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(end);
  return `${startLabel} – ${endLabel}`;
}
