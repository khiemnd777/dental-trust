import {
  journeyActionCodes,
  journeyStages,
  type JourneyActionCode,
  type JourneyStage,
} from '@dental-trust/domain';

interface JourneyStageCopy {
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}

const stageCopy = {
  INTAKE: {
    label: 'Hoàn thiện hồ sơ',
    shortLabel: 'Hồ sơ',
    description: 'Thông tin sức khỏe và mong muốn',
  },
  MATCHING: {
    label: 'Tìm lựa chọn phù hợp',
    shortLabel: 'Lựa chọn',
    description: 'Tìm nơi phù hợp và đáng tin',
  },
  PLAN_REVIEW: {
    label: 'Xem phương án điều trị',
    shortLabel: 'Phương án',
    description: 'Hiểu điều trị, thời gian và chi phí',
  },
  CONSULTATION: {
    label: 'Tư vấn với nha sĩ',
    shortLabel: 'Tư vấn',
    description: 'Trao đổi trực tiếp và làm rõ phương án',
  },
  BOOKING: {
    label: 'Xác nhận lịch hẹn',
    shortLabel: 'Đặt lịch',
    description: 'Kiểm tra lịch, múi giờ và xác nhận',
  },
  TREATMENT: {
    label: 'Đang điều trị',
    shortLabel: 'Điều trị',
    description: 'Hướng dẫn trong từng buổi hẹn',
  },
  AFTERCARE: {
    label: 'Chăm sóc sau điều trị',
    shortLabel: 'Hồi phục',
    description: 'Theo dõi hồi phục và hồ sơ nha khoa',
  },
  WARRANTY: {
    label: 'Hỗ trợ bảo hành',
    shortLabel: 'Bảo hành',
    description: 'Theo dõi vấn đề và phản hồi của đội ngũ',
  },
  CLOSED: {
    label: 'Hành trình đã hoàn thành',
    shortLabel: 'Hoàn thành',
    description: 'Hồ sơ và các mốc chăm sóc đã được lưu lại',
  },
} satisfies Readonly<Record<JourneyStage, JourneyStageCopy>>;

export const journeyStageSteps = journeyStages.map((key) => ({ key, ...stageCopy[key] }));

interface JourneyActionCopy {
  readonly title: string;
  readonly description: string;
  readonly label: string;
}

export const actionCopy = {
  COMPLETE_INTAKE: {
    title: 'Bổ sung thông tin sức khỏe',
    description: 'Khoảng 4 phút, có thể tiếp tục sau.',
    label: 'Tiếp tục hồ sơ',
  },
  UPLOAD_RECORDS: {
    title: 'Thêm hồ sơ nha khoa',
    description: 'Tải ảnh hoặc tài liệu hiện có.',
    label: 'Bổ sung hồ sơ',
  },
  ADD_INFORMATION: {
    title: 'Cần thêm thông tin',
    description: 'Bổ sung nội dung còn thiếu.',
    label: 'Xem yêu cầu',
  },
  REVIEW_CASE: {
    title: 'Hồ sơ của bạn đang được xem xét',
    description: 'Chúng tôi sẽ báo khi có cập nhật.',
    label: 'Xem hành trình',
  },
  VIEW_MATCHES: {
    title: 'Lựa chọn đã sẵn sàng',
    description: 'So sánh chi phí, thời gian và độ phù hợp.',
    label: 'Xem lựa chọn',
  },
  COMPARE_CLINICS: {
    title: 'So sánh phòng khám',
    description: 'Xem xác minh, chi phí và hỗ trợ.',
    label: 'So sánh lựa chọn',
  },
  REVIEW_INTAKE: {
    title: 'Hồ sơ đang được kiểm tra',
    description: 'Chúng tôi sẽ báo nếu cần bổ sung.',
    label: 'Xem hành trình',
  },
  PREPARE_PLAN: {
    title: 'Đang chuẩn bị phương án',
    description: 'Sẽ báo khi phương án sẵn sàng.',
    label: 'Xem hành trình',
  },
  REVIEW_PLANS: {
    title: 'Phương án đã sẵn sàng',
    description: 'Xem tóm tắt trước khi mở chi tiết.',
    label: 'Xem phương án',
  },
  VIEW_APPOINTMENT: {
    title: 'Kiểm tra lịch tư vấn',
    description: 'Xem thời gian, múi giờ và cách tham gia.',
    label: 'Xem lịch tư vấn',
  },
  VIEW_SCHEDULE: {
    title: 'Lịch chăm sóc đã cập nhật',
    description: 'Xem lịch và nội dung cần chuẩn bị.',
    label: 'Xem lịch',
  },
  CONFIRM_BOOKING: {
    title: 'Xác nhận lịch tư vấn',
    description: 'Kiểm tra múi giờ và cách tham gia.',
    label: 'Kiểm tra lịch',
  },
  REVIEW_BOOKING: {
    title: 'Lịch hẹn đang được xác nhận',
    description: 'Sẽ báo khi lịch được xác nhận.',
    label: 'Xem lịch',
  },
  VIEW_JOURNEY: {
    title: 'Theo dõi hành trình',
    description: 'Xem mốc hiện tại và lịch sắp tới.',
    label: 'Xem hành trình',
  },
  UPDATE_TREATMENT: {
    title: 'Điều trị đang được cập nhật',
    description: 'Xem mốc và hướng dẫn mới nhất.',
    label: 'Xem hành trình',
  },
  COMPLETE_CHECK_IN: {
    title: 'Hôm nay bạn cảm thấy thế nào?',
    description: 'Cập nhật hồi phục hoặc dấu hiệu bất thường.',
    label: 'Cập nhật hồi phục',
  },
  REVIEW_AFTERCARE: {
    title: 'Đang theo dõi hồi phục',
    description: 'Xem hướng dẫn chăm sóc mới nhất.',
    label: 'Xem hậu mãi',
  },
  VIEW_INCIDENT: {
    title: 'Đang xử lý yêu cầu hỗ trợ',
    description: 'Xem trạng thái và thời hạn phản hồi.',
    label: 'Xem yêu cầu hỗ trợ',
  },
  REVIEW_INCIDENT: {
    title: 'Vấn đề đang được xem xét',
    description: 'Xem tiến độ xử lý.',
    label: 'Xem hành trình',
  },
  VIEW_CASE: {
    title: 'Xem lại hành trình',
    description: 'Các mốc được lưu tại đây.',
    label: 'Xem hành trình',
  },
  NONE: {
    title: 'Chưa cần làm gì lúc này',
    description: 'Sẽ báo khi cần bạn.',
    label: 'Xem hành trình',
  },
} satisfies Readonly<Record<JourneyActionCode | 'NONE', JourneyActionCopy>>;

const actionHrefs = {
  COMPLETE_INTAKE: '/start',
  UPLOAD_RECORDS: '/journey',
  ADD_INFORMATION: '/journey',
  REVIEW_CASE: '/journey',
  VIEW_MATCHES: '/discover',
  COMPARE_CLINICS: '/discover',
  REVIEW_INTAKE: '/journey',
  PREPARE_PLAN: '/journey',
  REVIEW_PLANS: '/journey',
  VIEW_APPOINTMENT: '/booking',
  VIEW_SCHEDULE: '/booking',
  CONFIRM_BOOKING: '/booking',
  REVIEW_BOOKING: '/booking',
  VIEW_JOURNEY: '/journey',
  UPDATE_TREATMENT: '/journey',
  COMPLETE_CHECK_IN: '/journey',
  REVIEW_AFTERCARE: '/journey',
  VIEW_INCIDENT: '/journey',
  REVIEW_INCIDENT: '/journey',
  VIEW_CASE: '/journey',
} satisfies Readonly<Record<JourneyActionCode, string>>;

export function actionFor(code: string) {
  return isJourneyActionCode(code) ? actionCopy[code] : actionCopy.NONE;
}

export function actionHref(code: string, caseId?: string) {
  const href = isJourneyActionCode(code) ? actionHrefs[code] : '/journey';
  return href === '/journey' && caseId ? `${href}?caseId=${encodeURIComponent(caseId)}` : href;
}

export function stageLabel(stage: string) {
  return isJourneyStage(stage) ? stageCopy[stage].label : 'Đang được chăm sóc';
}

export function journeyStageIndex(stage: string): number | null {
  const index = journeyStages.indexOf(stage as JourneyStage);
  return index >= 0 ? index : null;
}

function isJourneyStage(value: string): value is JourneyStage {
  return journeyStages.includes(value as JourneyStage);
}

function isJourneyActionCode(value: string): value is JourneyActionCode {
  return journeyActionCodes.includes(value as JourneyActionCode);
}

export function firstName(fullName?: string | null) {
  const normalized = fullName?.trim();
  if (!normalized) return 'bạn';
  return normalized.split(/\s+/u).at(-1) ?? normalized;
}

export function dayPeriodGreeting(date = new Date(), timezone = 'Asia/Ho_Chi_Minh'): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(date),
  );
  if (hour < 11) return 'Chào buổi sáng';
  if (hour < 14) return 'Chào buổi trưa';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function formatMoney(minor: string, currency: string) {
  const value = Number(minor);
  if (!Number.isFinite(value)) return 'Liên hệ';
  if (currency === 'VND') return `${Math.round(value / 1_000_000)} triệu`;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatDateTime(value: string, timezone = 'Asia/Ho_Chi_Minh') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Thời gian chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

const notificationCopies: Record<string, { title: string; body: string }> = {
  ACCOUNT_SECURITY: {
    title: 'Cập nhật bảo mật tài khoản',
    body: 'Có thay đổi quan trọng liên quan đến tài khoản Dental Trust của bạn.',
  },
  CASE_UPDATES: {
    title: 'Hành trình của bạn có cập nhật',
    body: 'Mở hành trình để xem tiến độ và việc bạn cần làm tiếp theo.',
  },
  MISSING_DOCUMENTS: {
    title: 'Bạn cần bổ sung hồ sơ',
    body: 'Một vài thông tin đang cần bạn hoàn thiện để hành trình không bị gián đoạn.',
  },
  TREATMENT_PLANS: {
    title: 'Kế hoạch điều trị đã sẵn sàng',
    body: 'Bạn có thể xem lại kế hoạch và nhờ điều phối viên giải thích thêm.',
  },
  CONSULTATIONS: {
    title: 'Cập nhật lịch tư vấn',
    body: 'Thông tin mới về buổi tư vấn của bạn đã sẵn sàng.',
  },
  APPOINTMENTS: {
    title: 'Cập nhật lịch hẹn',
    body: 'Kiểm tra thời gian và hướng dẫn cho lịch hẹn sắp tới.',
  },
  PAYMENTS: {
    title: 'Cập nhật thanh toán',
    body: 'Có thông tin mới liên quan đến khoản thanh toán của bạn.',
  },
  TRAVEL_PREPARATION: {
    title: 'Chuẩn bị cho chuyến đi',
    body: 'Danh sách chuẩn bị cho lịch điều trị của bạn vừa được cập nhật.',
  },
  TREATMENT_MILESTONES: {
    title: 'Bạn vừa hoàn thành một cột mốc',
    body: 'Xem tiến độ mới nhất trong hành trình chăm sóc của bạn.',
  },
  AFTERCARE: {
    title: 'Đến lúc kiểm tra sau điều trị',
    body: 'Cho chúng tôi biết tình trạng hiện tại để đội ngũ có thể hỗ trợ kịp thời.',
  },
  INCIDENTS: {
    title: 'Yêu cầu hỗ trợ đã được cập nhật',
    body: 'Đội ngũ Dental Trust đang theo dõi vấn đề bạn đã báo.',
  },
  WARRANTY: {
    title: 'Cập nhật yêu cầu bảo hành',
    body: 'Có diễn biến mới trong yêu cầu bảo hành của bạn.',
  },
};

export function notificationCopy(category: string, templateKey: string) {
  return (
    notificationCopies[category] ?? {
      title: 'Bạn có một cập nhật mới',
      body: templateKey.includes('privacy')
        ? 'Có cập nhật mới về quyền riêng tư và dữ liệu của bạn.'
        : 'Mở Dental Trust để xem thông tin mới nhất.',
    }
  );
}

export function notificationHref(target?: string | null, resourceId?: string | null) {
  if (target === 'CASE') return resourceId ? `/journey?caseId=${resourceId}` : '/journey';
  if (target === 'TODAY') return '/';
  if (target === 'APPOINTMENTS' || target === 'AFTERCARE') return '/journey';
  if (target === 'INCIDENTS') return resourceId ? `/journey?caseId=${resourceId}` : '/journey';
  if (target === 'PAYMENTS') return '/account';
  return '/journey';
}

export function initials(value: string) {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('vi');
}

export function isMessageMine(authorUserId: string, currentUserId: string) {
  return authorUserId === currentUserId;
}
