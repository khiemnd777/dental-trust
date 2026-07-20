import { describe, expect, it } from 'vitest';

import {
  addSchedulePeriod,
  dateKey,
  isScheduleDate,
  monthDates,
  navigationLabel,
  normalizeScheduleView,
  scheduleHref,
  weekDates,
} from './schedule-view';

describe('Provider schedule view state', () => {
  it('accepts supported views and safely defaults unknown values to week', () => {
    expect(normalizeScheduleView('day')).toBe('day');
    expect(normalizeScheduleView('month')).toBe('month');
    expect(normalizeScheduleView('agenda')).toBe('week');
    expect(normalizeScheduleView(undefined)).toBe('week');
  });

  it('accepts real ISO calendar dates and rejects malformed or impossible dates', () => {
    expect(isScheduleDate('2026-07-20')).toBe(true);
    expect(isScheduleDate('2026-02-29')).toBe(false);
    expect(isScheduleDate('20-07-2026')).toBe(false);
    expect(isScheduleDate(undefined)).toBe(false);
  });

  it('moves by the active calendar period and clamps short target months', () => {
    expect(addSchedulePeriod('2026-07-20', 'day', -1)).toBe('2026-07-19');
    expect(addSchedulePeriod('2026-07-20', 'week', 1)).toBe('2026-07-27');
    expect(addSchedulePeriod('2026-01-31', 'month', 1)).toBe('2026-02-28');
    expect(addSchedulePeriod('2024-01-31', 'month', 1)).toBe('2024-02-29');
  });

  it('creates a Monday-first week and a complete six-week month grid', () => {
    const week = weekDates(new Date('2026-07-17T12:00:00.000Z'));
    expect(week.map(dateKey)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);

    const month = monthDates(new Date('2026-07-17T12:00:00.000Z'));
    expect(month).toHaveLength(42);
    expect(dateKey(month[0] ?? new Date(0))).toBe('2026-06-29');
    expect(dateKey(month[41] ?? new Date(0))).toBe('2026-08-09');
  });

  it('persists the selected view and date in a shareable URL', () => {
    expect(scheduleHref('month', '2026-07-20')).toBe('/schedule?view=month&date=2026-07-20');
    expect(navigationLabel('day', -1)).toBe('Ngày trước');
    expect(navigationLabel('month', 1)).toBe('Tháng sau');
  });
});
