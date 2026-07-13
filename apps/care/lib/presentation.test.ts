import { describe, expect, it } from 'vitest';

import {
  actionFor,
  actionHref,
  firstName,
  formatDateTime,
  formatMoney,
  notificationCopy,
  notificationHref,
  stageLabel,
} from './presentation';

describe('care presentation language', () => {
  it('turns workflow stages into patient language', () => {
    expect(stageLabel('PLAN_REVIEW')).toBe('Xem phương án điều trị');
    expect(stageLabel('UNKNOWN_STAGE')).toBe('Đang được chăm sóc');
  });

  it('always returns a safe next action', () => {
    expect(actionFor('COMPLETE_INTAKE').label).toBe('Tiếp tục hồ sơ');
    expect(actionFor('UNSUPPORTED').label).toBe('Xem hành trình');
    expect(actionHref('REVIEW_OPTIONS')).toBe('/discover');
  });

  it('formats Vietnamese patient-facing values', () => {
    expect(firstName('Nguyễn Thu Linh')).toBe('Linh');
    expect(firstName(null)).toBe('bạn');
    expect(formatMoney('20000000', 'VND')).toBe('20 triệu');
  });

  it('presents notification contracts in patient language', () => {
    expect(notificationCopy('AFTERCARE', 'aftercare.check-in-due').title).toContain('kiểm tra');
    expect(notificationHref('CASE', 'case-1')).toBe('/journey?caseId=case-1');
    expect(formatDateTime('not-a-date')).toBe('Thời gian chưa xác định');
  });
});
