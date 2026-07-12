export interface NotificationTemplateInput {
  readonly category: string;
  readonly templateKey: string;
  readonly locale: string;
  readonly payload: unknown;
  readonly appUrl: string;
}

export interface RenderedNotification {
  readonly subject: string;
  readonly text: string;
}

const securityEvents: Readonly<Record<string, readonly [string, string]>> = {
  'account.email-verification-requested': [
    'Verify your Dental Trust email',
    'Complete email verification using the secure, time-limited link in this message.',
  ],
  'account.password-reset-requested': [
    'Dental Trust password reset',
    'A password reset was requested. Use the secure, time-limited link only if you made this request.',
  ],
  'account.password-reset-completed': [
    'Your Dental Trust password changed',
    'Your password was changed and other active sessions were revoked. Contact support immediately if this was not you.',
  ],
  'account.mfa-enabled': [
    'Multi-factor authentication enabled',
    'Multi-factor authentication is now enabled for your Dental Trust account.',
  ],
  'account.mfa-recovery-code-used': [
    'A recovery code was used',
    'A multi-factor recovery code was used. Review your active sessions if you did not perform this action.',
  ],
  'privacy.deletion-execution-notice': [
    'Your Dental Trust deletion request is ready for execution',
    'Your verified deletion request is entering its final execution stage. Sign in now if you need to contact the privacy team before access is revoked.',
  ],
  'privacy.export-ready': [
    'Your Dental Trust data export is ready',
    'Your verified data export is available for a limited time in the secure portal.',
  ],
};

const securityEventsVi: Readonly<Record<string, readonly [string, string]>> = {
  'account.email-verification-requested': [
    'Xác minh email Dental Trust',
    'Hoàn tất xác minh email bằng liên kết bảo mật có thời hạn trong thư này.',
  ],
  'account.password-reset-requested': [
    'Đặt lại mật khẩu Dental Trust',
    'Có yêu cầu đặt lại mật khẩu. Chỉ sử dụng liên kết bảo mật có thời hạn nếu chính bạn đã yêu cầu.',
  ],
  'account.password-reset-completed': [
    'Mật khẩu Dental Trust đã thay đổi',
    'Mật khẩu đã được đổi và các phiên đăng nhập khác đã bị thu hồi. Hãy liên hệ hỗ trợ ngay nếu không phải bạn thực hiện.',
  ],
  'account.mfa-enabled': [
    'Đã bật xác thực đa yếu tố',
    'Xác thực đa yếu tố hiện đã được bật cho tài khoản Dental Trust của bạn.',
  ],
  'account.mfa-recovery-code-used': [
    'Đã sử dụng mã khôi phục',
    'Một mã khôi phục xác thực đa yếu tố vừa được sử dụng. Hãy kiểm tra các phiên đăng nhập nếu không phải bạn thực hiện.',
  ],
  'privacy.deletion-execution-notice': [
    'Yêu cầu xóa dữ liệu Dental Trust sắp được thực thi',
    'Yêu cầu xóa đã xác minh đang bước vào giai đoạn thực thi cuối. Hãy đăng nhập ngay nếu bạn cần liên hệ nhóm quyền riêng tư trước khi quyền truy cập bị thu hồi.',
  ],
  'privacy.export-ready': [
    'Bản xuất dữ liệu Dental Trust đã sẵn sàng',
    'Bản xuất dữ liệu đã xác minh của bạn chỉ khả dụng trong thời gian giới hạn tại cổng bảo mật.',
  ],
};

const categoryCopy: Readonly<Record<string, readonly [string, string]>> = {
  CASE_UPDATES: ['Dental Trust case update', 'There is a new update on your dental care case.'],
  MISSING_DOCUMENTS: [
    'Dental Trust records required',
    'Your care team needs additional records before the case can progress.',
  ],
  TREATMENT_PLANS: [
    'Dental Trust treatment plan update',
    'A treatment plan has been added or changed. Review the exact version before making a decision.',
  ],
  CONSULTATIONS: [
    'Dental Trust consultation update',
    'There is an update to your consultation schedule.',
  ],
  APPOINTMENTS: ['Dental Trust appointment update', 'There is an update to your appointment.'],
  PAYMENTS: [
    'Dental Trust payment update',
    'There is an update to a payment or refund. Dental Trust will never request full card details by email.',
  ],
  TRAVEL_PREPARATION: [
    'Dental Trust travel preparation',
    'A travel preparation task is ready for your review.',
  ],
  TREATMENT_MILESTONES: [
    'Dental Trust treatment milestone',
    'Your clinic recorded a treatment milestone. Review the record in the secure portal.',
  ],
  AFTERCARE: [
    'Dental Trust aftercare update',
    'An aftercare reminder or follow-up is ready in the secure portal.',
  ],
  INCIDENTS: [
    'Dental Trust incident update',
    'There is an update to an incident. If you have urgent symptoms, contact local emergency services.',
  ],
  WARRANTY: ['Dental Trust warranty update', 'There is an update to your warranty request.'],
  VERIFICATION_EXPIRY: [
    'Dental Trust verification evidence expiring',
    'Approved verification evidence is approaching expiry and requires review.',
  ],
  ADMINISTRATIVE_ALERTS: [
    'Dental Trust administrative alert',
    'An administrative task requires authorized review.',
  ],
};

const categoryCopyVi: Readonly<Record<string, readonly [string, string]>> = {
  CASE_UPDATES: ['Cập nhật hồ sơ Dental Trust', 'Hồ sơ chăm sóc nha khoa của bạn có cập nhật mới.'],
  MISSING_DOCUMENTS: [
    'Cần bổ sung hồ sơ Dental Trust',
    'Nhóm chăm sóc cần thêm hồ sơ trước khi tiếp tục xử lý ca.',
  ],
  TREATMENT_PLANS: [
    'Cập nhật phương án điều trị',
    'Một phương án điều trị đã được thêm hoặc thay đổi. Hãy xem đúng phiên bản trước khi quyết định.',
  ],
  CONSULTATIONS: ['Cập nhật lịch tư vấn', 'Lịch tư vấn của bạn có thay đổi mới.'],
  APPOINTMENTS: ['Cập nhật lịch hẹn', 'Lịch hẹn của bạn có cập nhật mới.'],
  PAYMENTS: [
    'Cập nhật thanh toán Dental Trust',
    'Một khoản thanh toán hoặc hoàn tiền có cập nhật. Dental Trust không bao giờ yêu cầu đầy đủ thông tin thẻ qua email.',
  ],
  TRAVEL_PREPARATION: [
    'Chuẩn bị hành trình Dental Trust',
    'Có một đầu việc chuẩn bị chuyến đi đang chờ bạn xem xét.',
  ],
  TREATMENT_MILESTONES: [
    'Cột mốc điều trị Dental Trust',
    'Phòng khám đã ghi nhận một cột mốc điều trị. Hãy xem hồ sơ trong cổng bảo mật.',
  ],
  AFTERCARE: [
    'Cập nhật chăm sóc sau điều trị',
    'Có nhắc việc hoặc theo dõi sau điều trị trong cổng bảo mật.',
  ],
  INCIDENTS: [
    'Cập nhật sự cố Dental Trust',
    'Một sự cố có cập nhật mới. Nếu có triệu chứng khẩn cấp, hãy liên hệ dịch vụ cấp cứu tại nơi bạn đang ở.',
  ],
  WARRANTY: ['Cập nhật bảo hành Dental Trust', 'Yêu cầu bảo hành của bạn có cập nhật mới.'],
  VERIFICATION_EXPIRY: [
    'Bằng chứng xác minh sắp hết hạn',
    'Bằng chứng xác minh đã duyệt sắp hết hạn và cần được rà soát.',
  ],
  ADMINISTRATIVE_ALERTS: [
    'Cảnh báo quản trị Dental Trust',
    'Một đầu việc quản trị cần người có thẩm quyền xem xét.',
  ],
};

export const criticalNotificationCategories = new Set(['ACCOUNT_SECURITY', 'PRIVACY_REQUEST']);

export function renderNotificationTemplate(input: NotificationTemplateInput): RenderedNotification {
  const vietnamese = input.locale.toLowerCase().startsWith('vi');
  const security = (vietnamese ? securityEventsVi : securityEvents)[input.templateKey];
  const category = (vietnamese ? categoryCopyVi : categoryCopy)[input.category];
  const copy = security ?? category ?? fallbackCopy(vietnamese);
  const securePortal = vietnamese
    ? `Mở cổng bảo mật để xem chi tiết: ${input.appUrl}`
    : `Open the secure portal to review details: ${input.appUrl}`;
  const privacy = vietnamese
    ? 'Vì lý do bảo mật, email này không chứa hồ sơ y tế hoặc nội dung tin nhắn riêng tư.'
    : 'For your privacy, this email does not contain medical records or private message content.';
  return { subject: copy[0], text: `${copy[1]}\n\n${securePortal}\n\n${privacy}` };
}

export function renderManagedNotificationTemplate(
  subject: string,
  body: string,
  locale: string,
  appUrl: string,
): RenderedNotification {
  const vietnamese = locale.toLowerCase().startsWith('vi');
  const securePortal = vietnamese
    ? `Mở cổng bảo mật để xem chi tiết: ${appUrl}`
    : `Open the secure portal to review details: ${appUrl}`;
  const privacy = vietnamese
    ? 'Vì lý do bảo mật, email này không chứa hồ sơ y tế hoặc nội dung tin nhắn riêng tư.'
    : 'For your privacy, this email does not contain medical records or private message content.';
  return { subject, text: `${body}\n\n${securePortal}\n\n${privacy}` };
}

function fallbackCopy(vietnamese: boolean): readonly [string, string] {
  return vietnamese
    ? ['Thông báo Dental Trust', 'Có một cập nhật mới đang chờ bạn trong cổng bảo mật.']
    : ['Dental Trust notification', 'A new update is waiting for you in the secure portal.'];
}
