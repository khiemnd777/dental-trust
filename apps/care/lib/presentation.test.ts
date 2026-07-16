import { describe, expect, it } from 'vitest';

import {
  actionFor,
  actionHref,
  dayPeriodGreeting,
  firstName,
  formatDateTime,
  formatMoney,
  notificationCopy,
  notificationHref,
  journeyStageIndex,
  journeyStageSteps,
  isMessageMine,
  stageLabel,
} from './presentation';

describe('care presentation language', () => {
  it('turns workflow stages into patient language', () => {
    expect(stageLabel('PLAN_REVIEW')).toBe('Xem phương án điều trị');
    expect(stageLabel('WARRANTY')).toBe('Hỗ trợ bảo hành');
    expect(stageLabel('UNKNOWN_STAGE')).toBe('Đang được chăm sóc');
    expect(journeyStageIndex('WARRANTY')).toBe(7);
    expect(journeyStageIndex('UNKNOWN_STAGE')).toBeNull();
    expect(journeyStageSteps).toHaveLength(9);
  });

  it('always returns a safe next action', () => {
    expect(actionFor('COMPLETE_INTAKE').label).toBe('Tiếp tục hồ sơ');
    expect(actionFor('UNSUPPORTED').label).toBe('Xem hành trình');
    expect(actionFor('VIEW_INCIDENT').label).toBe('Xem yêu cầu hỗ trợ');
    expect(actionHref('VIEW_MATCHES')).toBe('/discover');
    expect(actionHref('VIEW_INCIDENT', 'case-1')).toBe('/journey?caseId=case-1');
    expect(actionHref('UNSUPPORTED')).toBe('/journey');
  });

  it('formats Vietnamese patient-facing values', () => {
    expect(firstName('Nguyễn Thu Linh')).toBe('Linh');
    expect(firstName(null)).toBe('bạn');
    expect(formatMoney('20000000', 'VND')).toBe('20 triệu');
    expect(dayPeriodGreeting(new Date('2026-07-16T01:00:00.000Z'))).toBe('Chào buổi sáng');
    expect(dayPeriodGreeting(new Date('2026-07-16T13:00:00.000Z'))).toBe('Chào buổi tối');
  });

  it('presents notification contracts in patient language', () => {
    expect(notificationCopy('AFTERCARE', 'aftercare.check-in-due').title).toContain('kiểm tra');
    expect(notificationHref('CASE', 'case-1')).toBe('/journey?caseId=case-1');
    expect(notificationHref('INCIDENTS', 'case-2')).toBe('/journey?caseId=case-2');
    expect(formatDateTime('not-a-date')).toBe('Thời gian chưa xác định');
  });

  it('attributes messages from the authenticated author instead of list position', () => {
    expect(isMessageMine('patient-1', 'patient-1')).toBe(true);
    expect(isMessageMine('coordinator-1', 'patient-1')).toBe(false);
  });
});
