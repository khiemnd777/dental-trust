import { describe, expect, it } from 'vitest';

import {
  isoDateKeyInTimeZone,
  isoToLocalDateTimeInput,
  localDateTimeToIso,
} from '@/lib/provider-time';

describe('localDateTimeToIso', () => {
  it('interprets datetime-local values in the declared clinic timezone', () => {
    expect(localDateTimeToIso('2026-08-10T09:00', 'Asia/Ho_Chi_Minh')).toBe(
      '2026-08-10T02:00:00.000Z',
    );
    expect(localDateTimeToIso('2026-01-15T09:00', 'America/New_York')).toBe(
      '2026-01-15T14:00:00.000Z',
    );
    expect(localDateTimeToIso('2026-07-15T09:00', 'America/New_York')).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('rejects malformed values and local times skipped by daylight saving', () => {
    expect(() => localDateTimeToIso('not-a-date', 'Asia/Ho_Chi_Minh')).toThrow(
      'invalid_local_datetime',
    );
    expect(() => localDateTimeToIso('2026-03-08T02:30', 'America/New_York')).toThrow(
      'nonexistent_local_datetime',
    );
  });

  it('formats an instant for datetime-local in the declared timezone', () => {
    expect(isoToLocalDateTimeInput('2026-08-10T02:00:00.000Z', 'Asia/Ho_Chi_Minh')).toBe(
      '2026-08-10T09:00',
    );
    expect(isoToLocalDateTimeInput('2026-08-10T02:00:00.000Z', 'America/New_York')).toBe(
      '2026-08-09T22:00',
    );
  });

  it('groups an instant by the calendar date in each appointment timezone', () => {
    const instant = '2026-08-10T02:00:00.000Z';
    expect(isoDateKeyInTimeZone(instant, 'Asia/Ho_Chi_Minh')).toBe('2026-08-10');
    expect(isoDateKeyInTimeZone(instant, 'America/New_York')).toBe('2026-08-09');
  });
});
