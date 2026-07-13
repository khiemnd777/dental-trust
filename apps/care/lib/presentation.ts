export const stageLabels: Readonly<Record<string, string>> = {
  DISCOVERY: 'Tìm hiểu nhu cầu',
  INTAKE: 'Hoàn thiện hồ sơ',
  MATCHING: 'Tìm lựa chọn phù hợp',
  PLAN_REVIEW: 'Xem phương án điều trị',
  BOOKING: 'Xác nhận lịch hẹn',
  PREPARATION: 'Chuẩn bị điều trị',
  TREATMENT: 'Đang điều trị',
  RECOVERY: 'Hồi phục',
  AFTERCARE: 'Chăm sóc sau điều trị',
  COMPLETE: 'Hoàn thành',
};

export const actionCopy: Readonly<
  Record<string, { readonly title: string; readonly description: string; readonly label: string }>
> = {
  COMPLETE_INTAKE: {
    title: 'Bổ sung một vài thông tin sức khỏe',
    description: 'Khoảng 4 phút. Bạn có thể dừng và tiếp tục bất cứ lúc nào.',
    label: 'Tiếp tục hồ sơ',
  },
  REVIEW_OPTIONS: {
    title: 'Các lựa chọn đã sẵn sàng để xem',
    description: 'So sánh chi phí, thời gian và mức độ phù hợp trước khi quyết định.',
    label: 'Xem lựa chọn',
  },
  REVIEW_PLAN: {
    title: 'Phương án điều trị đã sẵn sàng',
    description: 'Xem phần tóm tắt dễ hiểu trước, rồi mở chi tiết khi bạn cần.',
    label: 'Xem phương án',
  },
  CONFIRM_BOOKING: {
    title: 'Xác nhận lịch tư vấn của bạn',
    description: 'Kiểm tra múi giờ và cách tham gia trước khi xác nhận.',
    label: 'Kiểm tra lịch',
  },
  PREPARE_FOR_VISIT: {
    title: 'Chuẩn bị cho buổi hẹn sắp tới',
    description: 'Chúng tôi đã gom giấy tờ và hướng dẫn vào một nơi.',
    label: 'Xem hướng dẫn',
  },
  VIEW_AFTERCARE: {
    title: 'Hôm nay bạn cảm thấy thế nào?',
    description: 'Theo dõi hồi phục và báo cho đội ngũ chăm sóc nếu có điều bất thường.',
    label: 'Cập nhật hồi phục',
  },
  NONE: {
    title: 'Bạn chưa cần làm gì lúc này',
    description: 'Chúng tôi đang xử lý bước tiếp theo và sẽ báo ngay khi cần bạn.',
    label: 'Xem hành trình',
  },
};

export function actionFor(code: string) {
  return (
    actionCopy[code] ?? {
      title: 'Bạn chưa cần làm gì lúc này',
      description: 'Chúng tôi đang xử lý bước tiếp theo và sẽ báo ngay khi cần bạn.',
      label: 'Xem hành trình',
    }
  );
}

export function actionHref(code: string) {
  if (code === 'COMPLETE_INTAKE') return '/start';
  if (code === 'REVIEW_OPTIONS') return '/discover';
  if (code === 'NONE') return '/journey';
  return '/messages';
}

export function stageLabel(stage: string) {
  return stageLabels[stage] ?? 'Đang được chăm sóc';
}

export function firstName(fullName?: string | null) {
  const normalized = fullName?.trim();
  if (!normalized) return 'bạn';
  return normalized.split(/\s+/u).at(-1) ?? normalized;
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
  if (target === 'INCIDENTS') return '/messages';
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
