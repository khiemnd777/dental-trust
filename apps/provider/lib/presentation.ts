export type ProviderTone = 'urgent' | 'attention' | 'waiting' | 'success' | 'neutral';

const statusLabels: Readonly<Record<string, string>> = {
  DRAFT: 'Bản nháp',
  INTAKE_REVIEW: 'Đang duyệt hồ sơ',
  ADDITIONAL_INFORMATION_REQUESTED: 'Cần bổ sung hồ sơ',
  MATCHING_IN_PROGRESS: 'Đang điều phối',
  CLINICS_SHORTLISTED: 'Đã vào danh sách',
  TREATMENT_PLANS_PENDING: 'Cần lập phương án',
  TREATMENT_PLANS_READY: 'Phương án đã sẵn sàng',
  CONSULTATION_SCHEDULED: 'Đã đặt tư vấn',
  PLAN_ACCEPTED: 'Đã chấp nhận phương án',
  BOOKED: 'Đã đặt lịch',
  IN_TREATMENT: 'Đang điều trị',
  TREATMENT_COMPLETED: 'Hoàn tất điều trị',
  AFTERCARE_ACTIVE: 'Theo dõi hậu mãi',
  WARRANTY_CASE_ACTIVE: 'Đang xử lý bảo hành',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy',
  ASSIGNED: 'Chờ tiếp nhận',
  ACCEPTED: 'Đã tiếp nhận',
  DECLINED: 'Đã từ chối',
  ADDITIONAL_RECORDS_REQUESTED: 'Đã yêu cầu hồ sơ',
  TENTATIVE: 'Tạm giữ',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn tất',
  NO_SHOW: 'Không đến',
  ACTIVE: 'Hoạt động',
  INVITED: 'Đã mời',
  SUSPENDED: 'Tạm khóa',
  REMOVED: 'Đã xóa',
  PENDING: 'Đang xem xét',
  PENDING_REVIEW: 'Đang xem xét',
  PUBLISHED: 'Đã công bố',
  ARCHIVED: 'Đã lưu trữ',
  VERIFIED: 'Đã xác minh',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Không đạt',
  CONNECTED: 'Đã kết nối',
  DISCONNECTED: 'Chưa kết nối',
  ERROR: 'Cần xử lý',
};

const actionLabels: Readonly<Record<string, string>> = {
  COMPLETE_INTAKE: 'Hoàn tất thông tin đầu vào',
  UPLOAD_RECORDS: 'Tải hồ sơ lâm sàng',
  ADD_INFORMATION: 'Bổ sung thông tin',
  REVIEW_INTAKE: 'Duyệt thông tin đầu vào',
  REVIEW_CASE: 'Mở và duyệt hồ sơ',
  VIEW_MATCHES: 'Xem phòng khám phù hợp',
  COMPARE_CLINICS: 'So sánh phòng khám',
  PREPARE_PLAN: 'Lập phương án điều trị',
  REVIEW_PLANS: 'Kiểm tra phương án',
  VIEW_APPOINTMENT: 'Xem lịch hẹn',
  VIEW_SCHEDULE: 'Xem lịch làm việc',
  CONFIRM_BOOKING: 'Xác nhận đặt lịch',
  REVIEW_BOOKING: 'Kiểm tra đặt lịch',
  VIEW_JOURNEY: 'Xem hành trình điều trị',
  UPDATE_TREATMENT: 'Cập nhật điều trị',
  COMPLETE_CHECK_IN: 'Hoàn tất check-in',
  REVIEW_AFTERCARE: 'Phản hồi hậu mãi',
  VIEW_INCIDENT: 'Xem sự cố',
  REVIEW_INCIDENT: 'Xử lý sự cố',
  VIEW_CASE: 'Mở hồ sơ',
};

export function labelStatus(status: string): string {
  return statusLabels[status] ?? humanize(status);
}

export function labelAction(action: string): string {
  return actionLabels[action] ?? humanize(action);
}

export function toneForStatus(status: string): ProviderTone {
  if (
    [
      'ADDITIONAL_INFORMATION_REQUESTED',
      'TREATMENT_PLANS_PENDING',
      'WARRANTY_CASE_ACTIVE',
    ].includes(status)
  )
    return 'urgent';
  if (['INTAKE_REVIEW', 'MATCHING_IN_PROGRESS', 'ASSIGNED', 'TENTATIVE'].includes(status))
    return 'attention';
  if (['CLINICS_SHORTLISTED', 'TREATMENT_PLANS_READY', 'CONSULTATION_SCHEDULED'].includes(status))
    return 'waiting';
  if (
    [
      'PLAN_ACCEPTED',
      'BOOKED',
      'IN_TREATMENT',
      'TREATMENT_COMPLETED',
      'AFTERCARE_ACTIVE',
      'ACCEPTED',
      'CONFIRMED',
      'COMPLETED',
    ].includes(status)
  )
    return 'success';
  return 'neutral';
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

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./u, (letter) => letter.toUpperCase());
}

export function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
    ...options,
  }).format(new Date(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

export function relativeDue(value: string | null): string {
  if (!value) return 'Chưa có hạn';
  const difference = Date.parse(value) - Date.now();
  const hours = Math.round(Math.abs(difference) / 3_600_000);
  if (difference < 0)
    return hours < 24 ? `Quá hạn ${hours} giờ` : `Quá hạn ${Math.round(hours / 24)} ngày`;
  if (hours < 24) return `Còn ${Math.max(hours, 1)} giờ`;
  return `Còn ${Math.round(hours / 24)} ngày`;
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function formatCurrency(amountMinor: number, currency: 'VND' | 'USD'): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(currency === 'USD' ? amountMinor / 100 : amountMinor);
}
