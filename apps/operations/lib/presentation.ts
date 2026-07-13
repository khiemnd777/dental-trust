export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

export function relativeDue(value: string): string {
  const due = new Date(value).getTime();
  const delta = due - Date.now();
  if (!Number.isFinite(delta)) return '—';
  const absoluteMinutes = Math.max(1, Math.round(Math.abs(delta) / 60_000));
  if (delta < 0) return `Quá hạn ${duration(absoluteMinutes)}`;
  return `Còn ${duration(absoluteMinutes)}`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

export function humanize(value: string): string {
  return value
    .toLocaleLowerCase('vi-VN')
    .replaceAll('_', ' ')
    .replace(/^./u, (letter) => letter.toLocaleUpperCase('vi-VN'));
}

export function initials(value: string): string {
  return (
    value
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'DT'
  );
}

export function statusTone(value: string): 'danger' | 'warning' | 'success' | 'info' | 'neutral' {
  if (/FAILED|OVERDUE|REJECTED|SUSPENDED|DEAD_LETTER|URGENT/u.test(value)) return 'danger';
  if (/PENDING|REVIEW|REQUIRED|EXPIRING|HIGH|BLOCKED|UNASSIGNED/u.test(value)) return 'warning';
  if (/VERIFIED|APPROVED|ACTIVE|DELIVERED|PROCESSED|PUBLISHED|RESOLVED/u.test(value))
    return 'success';
  if (/ASSIGNED|IN_PROGRESS|SUBMITTED|RECEIVED/u.test(value)) return 'info';
  return 'neutral';
}

const auditActionLabels: Readonly<Record<string, string>> = {
  'concierge.dashboard-read': 'Đã xem tổng quan điều phối',
  'concierge.queue-read': 'Đã xem hàng đợi điều phối',
  'concierge.case-read': 'Đã xem hồ sơ điều phối',
  'concierge.case-assigned': 'Đã phân công ca điều phối',
  'concierge.workspace-updated': 'Đã cập nhật ca điều phối',
  'concierge.communication-recorded': 'Đã ghi nhận trao đổi điều phối',
  'concierge.task-created': 'Đã tạo công việc điều phối',
  'concierge.task-transitioned': 'Đã thay đổi trạng thái công việc',
  'concierge.handoff-requested': 'Đã yêu cầu bàn giao ca',
  'concierge.handoff-accepted': 'Đã tiếp nhận bàn giao ca',
  'concierge.supervisor-reviewed': 'Supervisor đã review ca',
  'verification.case.created': 'Đã tạo hồ sơ xác minh',
  'verification.case.assigned': 'Đã phân công hồ sơ xác minh',
  'verification.case.submitted': 'Đã gửi hồ sơ xác minh',
  'verification.evidence.added': 'Đã bổ sung bằng chứng xác minh',
  'verification.evidence.approve': 'Đã duyệt bằng chứng xác minh',
  'verification.evidence.reject': 'Đã từ chối bằng chứng xác minh',
  'verification.site-audit.scheduled': 'Đã lên lịch kiểm tra thực địa',
  'verification.site-audit.completed': 'Đã hoàn tất kiểm tra thực địa',
  'verification.corrective-action.created': 'Đã tạo yêu cầu khắc phục',
  'verification.corrective-action.responded': 'Đã phản hồi yêu cầu khắc phục',
  'admin.user-status-changed': 'Đã thay đổi trạng thái tài khoản',
  'admin.user-role-grant': 'Đã cấp vai trò người dùng',
  'admin.user-role-revoke': 'Đã thu hồi vai trò người dùng',
  'admin.outbox-retry-requested': 'Đã yêu cầu gửi lại outbox event',
  'admin.notification-retry-requested': 'Đã yêu cầu gửi lại thông báo',
  'patient.profile-read': 'Đã xem hồ sơ bệnh nhân',
  'patient.intake-read': 'Đã xem hồ sơ tiếp nhận',
  'message.sent': 'Đã gửi tin nhắn',
  'message.read': 'Đã đọc tin nhắn',
  'internal-note.created': 'Đã tạo ghi chú nội bộ',
  'file.download-authorized': 'Đã cấp quyền tải hồ sơ',
  'clinic-file.download-authorized': 'Đã cấp quyền tải hồ sơ phòng khám',
};

const auditResourceLabels: Readonly<Record<string, string>> = {
  Organization: 'Tổ chức',
  VerificationCase: 'Hồ sơ xác minh',
  PatientProfile: 'Hồ sơ bệnh nhân',
  Message: 'Tin nhắn',
  MessageThread: 'Cuộc trò chuyện',
  ConciergeCaseWorkspace: 'Workspace điều phối',
  User: 'Người dùng',
  OutboxEvent: 'Outbox event',
  Notification: 'Thông báo',
};

export function auditActionLabel(action: string): string {
  return (
    auditActionLabels[action.toLocaleLowerCase('en-US')] ??
    humanize(action.replaceAll('.', '_').replaceAll('-', '_'))
  );
}

export function auditResourceLabel(resourceType: string): string {
  return auditResourceLabels[resourceType] ?? humanize(resourceType);
}

export function isRoutineReadAuditAction(action: string): boolean {
  return /(^|[.-])read($|[.-])/iu.test(action);
}
