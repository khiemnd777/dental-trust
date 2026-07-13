import { describe, expect, it } from 'vitest';

import { auditActionLabel, auditResourceLabel, isRoutineReadAuditAction } from './presentation';

describe('audit presentation', () => {
  it('hides routine read events from the command center feed', () => {
    expect(isRoutineReadAuditAction('concierge.dashboard-read')).toBe(true);
    expect(isRoutineReadAuditAction('patient.profile-read')).toBe(true);
    expect(isRoutineReadAuditAction('verification.case.assigned')).toBe(false);
    expect(isRoutineReadAuditAction('file.download-authorized')).toBe(false);
  });

  it('presents internal audit codes as operator-friendly labels', () => {
    expect(auditActionLabel('concierge.queue-read')).toBe('Đã xem hàng đợi điều phối');
    expect(auditActionLabel('verification.case.assigned')).toBe('Đã phân công hồ sơ xác minh');
    expect(auditResourceLabel('Organization')).toBe('Tổ chức');
  });
});
