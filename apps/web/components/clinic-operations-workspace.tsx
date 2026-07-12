'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  clinicAnalyticsViewSchema,
  clinicAvailabilityViewSchema,
  clinicBillingViewSchema,
  clinicDentistViewSchema,
  clinicOnboardingViewSchema,
  clinicOpportunityViewSchema,
  clinicOverviewViewSchema,
  clinicServicesWorkspaceViewSchema,
  clinicTeamViewSchema,
  type ClinicAnalyticsView,
  type ClinicAvailabilityView,
  type ClinicBillingView,
  type ClinicDentistView,
  type ClinicOnboardingView,
  type ClinicOperationPermission,
  type ClinicOpportunityView,
  type ClinicOverviewView,
  type ClinicServicesWorkspaceView,
  type ClinicTeamView,
} from '@dental-trust/contracts/clinic-operations';
import { formatDate, type Locale, type Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Icon,
  Progress,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';
import type { PortalArea } from '@/lib/routing';

const supported = new Set([
  'dashboard',
  'onboarding',
  'verification',
  'profile',
  'dentists',
  'team',
  'cases',
  'availability',
  'pricing',
  'analytics',
  'billing',
  'settings',
]);

const permissions: readonly ClinicOperationPermission[] = [
  'CASE_INBOX',
  'CASE_ASSIGN_DENTIST',
  'TREATMENT_PLAN',
  'SCHEDULING',
  'CLINICAL_RECORDS',
  'AFTERCARE',
  'INCIDENT_RESPONSE',
  'REVIEW_RESPONSE',
  'ANALYTICS_READ',
];

const text = {
  en: {
    loadError: 'The clinic workspace could not be loaded. No changes were simulated.',
    saved: 'The clinic record was updated and audited.',
    retry: 'Retry',
    onboardingProgress: 'Onboarding progress',
    missing: 'Missing requirements',
    locations: 'Locations',
    declarations: 'Declarations',
    documents: 'Verification documents',
    legalProfile: 'Legal entity and clinical leadership',
    contactName: 'Business contact name',
    contactEmail: 'Business email',
    contactPhone: 'Business phone',
    website: 'Website',
    clinicalLeader: 'Responsible clinical leader',
    aftercareHours: 'Aftercare response target (hours)',
    emergencyProtocol: 'Emergency escalation protocol',
    remoteFollowUp: 'Remote follow-up is available',
    registrationNumber: 'Registration number',
    registrationCountry: 'Registration country',
    legalEntity: 'Legal entity name',
    updateProfile: 'Save legal profile',
    locationName: 'Location name',
    address: 'Address',
    city: 'City',
    district: 'District',
    timezone: 'IANA timezone',
    active: 'Active',
    addLocation: 'Save location',
    declarationKind: 'Declaration type',
    code: 'Governed code',
    name: 'Name',
    details: 'Declaration details',
    saveDeclaration: 'Save declaration',
    upload: 'Upload evidence',
    uploadHint: 'PDF, JPG, PNG, or WebP; private quarantine and malware scanning apply.',
    uploadPending: 'The file is still being scanned. Check again before attaching it.',
    documentKind: 'Document type',
    label: 'Document label',
    checkScan: 'Check scan and attach',
    terms: 'Accept clinic terms',
    payout: 'Configure secure payout',
    submitVerification: 'Submit for verification',
    attestation: 'Authorized attestation',
    verificationStatus: 'Verification status',
    dentistRoster: 'Dentist roster',
    addDentist: 'Add dentist',
    fullName: 'Full name',
    slug: 'Public profile slug',
    licenseNumber: 'License number',
    authority: 'Licensing authority',
    scope: 'Scope of practice',
    expiresAt: 'License expiry',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
    reason: 'Auditable reason',
    team: 'Team access',
    invite: 'Invite team member',
    email: 'Email',
    role: 'Role',
    jobTitle: 'Job title',
    permissions: 'Permissions',
    assignLocations: 'Assigned locations',
    pendingInvitations: 'Pending invitations',
    reviewActivity: 'Recent access activity',
    updateAccess: 'Update access',
    suspend: 'Suspend',
    remove: 'Remove',
    mfaReady: 'MFA enabled',
    mfaMissing: 'MFA required before privileged work',
    opportunities: 'Assigned opportunities',
    decide: 'Record decision',
    assignDentist: 'Assign dentist',
    accept: 'Accept',
    decline: 'Decline',
    requestRecords: 'Request records',
    noPatientDetail: 'Only the minimum assigned-case context is shown here.',
    scheduleRules: 'Recurring schedules',
    blocks: 'Blocks and time off',
    policy: 'Scheduling policy',
    calendar: 'Calendar synchronization',
    saveRule: 'Save schedule rule',
    slotKind: 'Slot type',
    dayOfWeek: 'Day of week',
    startTime: 'Start time',
    endTime: 'End time',
    capacity: 'Appointment capacity',
    duration: 'Procedure duration (minutes)',
    effectiveFrom: 'Effective from',
    effectiveUntil: 'Effective until',
    addBlock: 'Block time',
    blockKind: 'Block type',
    startsAt: 'Starts (your local time)',
    endsAt: 'Ends (your local time)',
    notice: 'Minimum notice (minutes)',
    maxAdvance: 'Maximum advance (days)',
    rescheduleCutoff: 'Reschedule cutoff (minutes)',
    cancellationCutoff: 'Cancellation cutoff (minutes)',
    consultationDuration: 'Default consultation (minutes)',
    treatmentDuration: 'Default treatment (minutes)',
    overbooking: 'Allow overbooking',
    savePolicy: 'Save policy',
    provider: 'Calendar provider',
    calendarReference: 'Calendar reference',
    connectCalendar: 'Connect calendar',
    sync: 'Sync now',
    disconnect: 'Disconnect',
    services: 'Published services and immutable price history',
    publishService: 'Publish service version',
    procedure: 'Standard procedure',
    viName: 'Vietnamese service name',
    enName: 'English service name',
    included: 'Included services (one per line)',
    exclusions: 'Exclusions (one per line)',
    estimatedDays: 'Estimated duration (days)',
    warrantyName: 'Warranty name',
    warrantyTerms: 'Warranty terms',
    minimumPrice: 'Minimum price (minor units)',
    maximumPrice: 'Maximum price (minor units)',
    currency: 'Currency',
    materials: 'Material options (one per line)',
    brands: 'Brand options (one per line)',
    effectiveAt: 'Effective at',
    archive: 'Archive',
    analytics: 'Clinic performance',
    generated: 'Generated',
    billing: 'Revenue and payout summary',
    unavailable: 'Unavailable metrics',
    security: 'Security and governance',
    securityBody:
      'Privileged operations require MFA, selected-organization scope, least-privilege permissions, idempotency, and audit records.',
    empty: 'No records are available for this clinic yet.',
  },
  vi: {
    loadError: 'Không thể tải khu vực phòng khám. Hệ thống không giả lập thay đổi.',
    saved: 'Dữ liệu phòng khám đã được cập nhật và ghi nhật ký.',
    retry: 'Thử lại',
    onboardingProgress: 'Tiến độ đăng ký',
    missing: 'Yêu cầu còn thiếu',
    locations: 'Cơ sở',
    declarations: 'Nội dung công bố',
    documents: 'Tài liệu xác minh',
    legalProfile: 'Pháp nhân và phụ trách chuyên môn',
    contactName: 'Người liên hệ doanh nghiệp',
    contactEmail: 'Email doanh nghiệp',
    contactPhone: 'Điện thoại doanh nghiệp',
    website: 'Website',
    clinicalLeader: 'Người phụ trách chuyên môn',
    aftercareHours: 'Mục tiêu phản hồi hậu mãi (giờ)',
    emergencyProtocol: 'Quy trình nâng cấp khẩn cấp',
    remoteFollowUp: 'Có hỗ trợ theo dõi từ xa',
    registrationNumber: 'Mã đăng ký',
    registrationCountry: 'Quốc gia đăng ký',
    legalEntity: 'Tên pháp nhân',
    updateProfile: 'Lưu hồ sơ pháp nhân',
    locationName: 'Tên cơ sở',
    address: 'Địa chỉ',
    city: 'Thành phố',
    district: 'Quận/huyện',
    timezone: 'Múi giờ IANA',
    active: 'Đang hoạt động',
    addLocation: 'Lưu cơ sở',
    declarationKind: 'Loại công bố',
    code: 'Mã quản trị',
    name: 'Tên',
    details: 'Chi tiết công bố',
    saveDeclaration: 'Lưu công bố',
    upload: 'Tải bằng chứng',
    uploadHint: 'PDF, JPG, PNG hoặc WebP; tệp được cách ly riêng và quét mã độc.',
    uploadPending: 'Tệp đang được quét. Hãy kiểm tra lại trước khi đính kèm.',
    documentKind: 'Loại tài liệu',
    label: 'Nhãn tài liệu',
    checkScan: 'Kiểm tra và đính kèm',
    terms: 'Chấp nhận điều khoản phòng khám',
    payout: 'Cấu hình nhận tiền an toàn',
    submitVerification: 'Gửi xác minh',
    attestation: 'Xác nhận của người có thẩm quyền',
    verificationStatus: 'Trạng thái xác minh',
    dentistRoster: 'Danh sách nha sĩ',
    addDentist: 'Thêm nha sĩ',
    fullName: 'Họ tên',
    slug: 'Đường dẫn hồ sơ công khai',
    licenseNumber: 'Số giấy phép',
    authority: 'Cơ quan cấp phép',
    scope: 'Phạm vi hành nghề',
    expiresAt: 'Ngày hết hạn',
    deactivate: 'Ngừng liên kết',
    reactivate: 'Kích hoạt lại',
    reason: 'Lý do để kiểm toán',
    team: 'Quyền truy cập đội ngũ',
    invite: 'Mời thành viên',
    email: 'Email',
    role: 'Vai trò',
    jobTitle: 'Chức danh',
    permissions: 'Quyền hạn',
    assignLocations: 'Cơ sở được phân công',
    pendingInvitations: 'Lời mời đang chờ',
    reviewActivity: 'Hoạt động truy cập gần đây',
    updateAccess: 'Cập nhật quyền',
    suspend: 'Tạm ngưng',
    remove: 'Gỡ thành viên',
    mfaReady: 'Đã bật MFA',
    mfaMissing: 'Phải bật MFA trước tác vụ đặc quyền',
    opportunities: 'Cơ hội được phân công',
    decide: 'Ghi nhận quyết định',
    assignDentist: 'Phân công nha sĩ',
    accept: 'Nhận hồ sơ',
    decline: 'Từ chối',
    requestRecords: 'Yêu cầu hồ sơ',
    noPatientDetail: 'Chỉ hiển thị ngữ cảnh tối thiểu cần thiết của hồ sơ được phân công.',
    scheduleRules: 'Lịch làm việc định kỳ',
    blocks: 'Khóa lịch và nghỉ phép',
    policy: 'Chính sách lịch hẹn',
    calendar: 'Đồng bộ lịch',
    saveRule: 'Lưu quy tắc lịch',
    slotKind: 'Loại khung giờ',
    dayOfWeek: 'Ngày trong tuần',
    startTime: 'Giờ bắt đầu',
    endTime: 'Giờ kết thúc',
    capacity: 'Sức chứa cuộc hẹn',
    duration: 'Thời lượng thủ thuật (phút)',
    effectiveFrom: 'Hiệu lực từ',
    effectiveUntil: 'Hiệu lực đến',
    addBlock: 'Khóa thời gian',
    blockKind: 'Loại khóa',
    startsAt: 'Bắt đầu (giờ máy của bạn)',
    endsAt: 'Kết thúc (giờ máy của bạn)',
    notice: 'Báo trước tối thiểu (phút)',
    maxAdvance: 'Đặt trước tối đa (ngày)',
    rescheduleCutoff: 'Hạn đổi lịch (phút)',
    cancellationCutoff: 'Hạn hủy lịch (phút)',
    consultationDuration: 'Tư vấn mặc định (phút)',
    treatmentDuration: 'Điều trị mặc định (phút)',
    overbooking: 'Cho phép vượt sức chứa',
    savePolicy: 'Lưu chính sách',
    provider: 'Nhà cung cấp lịch',
    calendarReference: 'Mã lịch',
    connectCalendar: 'Kết nối lịch',
    sync: 'Đồng bộ ngay',
    disconnect: 'Ngắt kết nối',
    services: 'Dịch vụ công bố và lịch sử giá bất biến',
    publishService: 'Công bố phiên bản dịch vụ',
    procedure: 'Thủ thuật chuẩn',
    viName: 'Tên dịch vụ tiếng Việt',
    enName: 'Tên dịch vụ tiếng Anh',
    included: 'Dịch vụ bao gồm (mỗi dòng một mục)',
    exclusions: 'Loại trừ (mỗi dòng một mục)',
    estimatedDays: 'Thời gian dự kiến (ngày)',
    warrantyName: 'Tên bảo hành',
    warrantyTerms: 'Điều khoản bảo hành',
    minimumPrice: 'Giá tối thiểu (đơn vị nhỏ)',
    maximumPrice: 'Giá tối đa (đơn vị nhỏ)',
    currency: 'Tiền tệ',
    materials: 'Vật liệu (mỗi dòng một mục)',
    brands: 'Thương hiệu (mỗi dòng một mục)',
    effectiveAt: 'Hiệu lực lúc',
    archive: 'Lưu trữ',
    analytics: 'Hiệu suất phòng khám',
    generated: 'Tạo lúc',
    billing: 'Tổng hợp doanh thu và nhận tiền',
    unavailable: 'Chỉ số chưa khả dụng',
    security: 'Bảo mật và quản trị',
    securityBody:
      'Tác vụ đặc quyền yêu cầu MFA, đúng tổ chức, quyền tối thiểu, idempotency và nhật ký kiểm toán.',
    empty: 'Chưa có dữ liệu cho phòng khám này.',
  },
} as const;

type Copy = (typeof text)[keyof typeof text];
interface CommandResult {
  readonly data?: unknown;
  readonly accepted?: boolean;
}
type SendCommand = (
  command: string,
  payload: Record<string, unknown>,
) => Promise<CommandResult | null>;

interface AuxiliaryData {
  readonly onboarding?: ClinicOnboardingView;
  readonly dentists?: readonly ClinicDentistView[];
}

export function isClinicOperationsWorkspace(area: PortalArea, pageKey: string): boolean {
  return area === 'clinic' && supported.has(pageKey);
}

export function ClinicOperationsWorkspace({
  pageKey,
  title,
  description,
  locale,
  messages,
  development,
}: {
  readonly pageKey: string;
  readonly title: string;
  readonly description: string;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const copy = text[locale === 'vi' ? 'vi' : 'en'];
  const [data, setData] = useState<unknown>(null);
  const [auxiliary, setAuxiliary] = useState<AuxiliaryData>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const idempotencyKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setNotice(null);
    void Promise.all([
      loadClinicPage(pageKey, controller.signal),
      loadAuxiliary(pageKey, controller.signal),
    ])
      .then(([primary, extra]) => {
        setData(primary);
        setAuxiliary(extra);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setState('error');
      });
    return () => controller.abort();
  }, [pageKey, revision]);

  const send: SendCommand = async (command, payload) => {
    const operation = `${command}:${JSON.stringify(payload)}`;
    const idempotencyKey = idempotencyKeys.current.get(operation) ?? crypto.randomUUID();
    idempotencyKeys.current.set(operation, idempotencyKey);
    setSending(true);
    setNotice(null);
    try {
      const response = await fetch('/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          area: 'clinic',
          pageKey,
          command,
          entityId: `clinic-${pageKey}`,
          payload,
          idempotencyKey,
        }),
      });
      if (!response.ok) throw new Error('clinic_command_rejected');
      const result = (await response.json()) as CommandResult;
      idempotencyKeys.current.delete(operation);
      setNotice(copy.saved);
      setRevision((current) => current + 1);
      return result;
    } catch {
      setState('error');
      return null;
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections.clinic} ·{' '}
            {development ? messages.portal.demo : messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="info">
          <Icon name="shield" />
          {messages.portal.secure}
        </Badge>
      </div>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {state === 'error' ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          <p>{copy.loadError}</p>
          <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
            {copy.retry}
          </Button>
        </Alert>
      ) : null}
      {state === 'loading' ? <LoadingWorkspace /> : null}
      {state === 'ready' ? (
        <ClinicPage
          auxiliary={auxiliary}
          copy={copy}
          data={data}
          locale={locale}
          messages={messages}
          pageKey={pageKey}
          send={send}
          sending={sending}
        />
      ) : null}
    </main>
  );
}

function ClinicPage({
  pageKey,
  data,
  auxiliary,
  copy,
  locale,
  messages,
  send,
  sending,
}: {
  readonly pageKey: string;
  readonly data: unknown;
  readonly auxiliary: AuxiliaryData;
  readonly copy: Copy;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  if (pageKey === 'dashboard')
    return <OverviewPanel copy={copy} data={data as ClinicOverviewView} />;
  if (pageKey === 'onboarding')
    return (
      <OnboardingPanel
        copy={copy}
        data={data as ClinicOnboardingView}
        send={send}
        sending={sending}
      />
    );
  if (pageKey === 'verification')
    return (
      <VerificationPanel
        copy={copy}
        data={data as ClinicOnboardingView}
        send={send}
        sending={sending}
      />
    );
  if (pageKey === 'profile' || pageKey === 'settings')
    return (
      <ProfilePanel
        copy={copy}
        data={data as ClinicOnboardingView}
        dentists={auxiliary.dentists ?? []}
        send={send}
        sending={sending}
        showSecurity={pageKey === 'settings'}
      />
    );
  if (pageKey === 'dentists')
    return (
      <DentistsPanel
        copy={copy}
        data={data as readonly ClinicDentistView[]}
        send={send}
        sending={sending}
      />
    );
  if (pageKey === 'team')
    return (
      <TeamPanel
        copy={copy}
        data={data as ClinicTeamView}
        locations={auxiliary.onboarding?.locations ?? []}
        send={send}
        sending={sending}
      />
    );
  if (pageKey === 'cases')
    return (
      <OpportunitiesPanel
        copy={copy}
        data={data as readonly ClinicOpportunityView[]}
        dentists={auxiliary.dentists ?? []}
        locale={locale}
        send={send}
        sending={sending}
      />
    );
  if (pageKey === 'availability')
    return (
      <AvailabilityPanel
        copy={copy}
        data={data as ClinicAvailabilityView}
        dentists={auxiliary.dentists ?? []}
        locations={auxiliary.onboarding?.locations ?? []}
        locale={locale}
        send={send}
        sending={sending}
      />
    );
  if (pageKey === 'pricing')
    return (
      <ServicesPanel
        copy={copy}
        data={data as ClinicServicesWorkspaceView}
        locale={locale}
        send={send}
        sending={sending}
      />
    );
  if (pageKey === 'analytics')
    return <AnalyticsPanel copy={copy} data={data as ClinicAnalyticsView} locale={locale} />;
  if (pageKey === 'billing')
    return <BillingPanel copy={copy} data={data as ClinicBillingView} locale={locale} />;
  return <EmptyState title={messages.common.emptyTitle} body={copy.empty} />;
}

function OverviewPanel({ copy, data }: { readonly copy: Copy; readonly data: ClinicOverviewView }) {
  const metrics = [
    ['New cases / Hồ sơ mới', data.newCases],
    ['Appointments / Lịch hẹn', data.activeAppointments],
    ['Team / Đội ngũ', data.activeTeam],
    ['Open incidents / Sự cố', data.openIncidents],
    ['Services / Dịch vụ', data.activeServices],
  ] as const;
  return (
    <>
      <div className="portal-metrics">
        {metrics.map(([label, value]) => (
          <Card className="portal-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </Card>
        ))}
      </div>
      {data.onboarding ? (
        <Card className="workspace-card" style={{ padding: '1.2rem' }}>
          <h2>{copy.onboardingProgress}</h2>
          <Progress label={copy.onboardingProgress} value={data.onboarding.progressPercent} />
          <StatusList copy={copy} onboarding={data.onboarding} />
        </Card>
      ) : (
        <EmptyState icon="clinic" title={copy.onboardingProgress} body={copy.empty} />
      )}
    </>
  );
}

function OnboardingPanel({
  copy,
  data,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: ClinicOnboardingView;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.onboardingProgress}</h2>
        <Progress label={copy.onboardingProgress} value={data.progressPercent} />
        <StatusList copy={copy} onboarding={data} />
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send('clinic_accept_terms', {
              expectedVersion: data.version,
              termsVersion: '2026-07-12',
              accepted: true,
            });
          }}
        >
          <Button disabled={sending || Boolean(data.termsAcceptedAt)} type="submit">
            <Icon name="check" /> {copy.terms}
          </Button>
        </form>
        <Button
          disabled={sending || data.payoutStatus === 'ACTIVE'}
          variant="secondary"
          onClick={() =>
            void send('clinic_begin_payout', {
              expectedVersion: data.version,
              returnUrl: window.location.href,
              refreshUrl: window.location.href,
            }).then((result) => {
              const body = result?.data as { onboardingUrl?: unknown } | undefined;
              if (typeof body?.onboardingUrl === 'string')
                window.location.assign(body.onboardingUrl);
            })
          }
        >
          <Icon name="wallet" /> {copy.payout}
        </Button>
      </Card>
      <ClinicDocumentUpload copy={copy} data={data} send={send} sending={sending} />
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.locations}</h2>
        <RecordList
          records={data.locations.map((location) => ({
            id: location.id,
            title: location.name,
            detail: `${location.address}, ${location.city} · ${location.timezone}`,
            status: location.active ? copy.active : 'Inactive',
          }))}
          copy={copy}
        />
      </Card>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.declarations}</h2>
        <RecordList
          records={data.declarations.map((declaration) => ({
            id: declaration.id,
            title: declaration.name,
            detail: `${declaration.kind} · ${declaration.code}`,
            status: declaration.active ? copy.active : 'Inactive',
          }))}
          copy={copy}
        />
      </Card>
    </div>
  );
}

function VerificationPanel({
  copy,
  data,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: ClinicOnboardingView;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.verificationStatus}</h2>
        <Badge tone={data.verificationStatus === 'VERIFIED' ? 'verified' : 'attention'}>
          {data.verificationStatus.replaceAll('_', ' ')}
        </Badge>
        <StatusList copy={copy} onboarding={data} />
      </Card>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.submitVerification}</h2>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void send('clinic_submit_onboarding', {
              expectedVersion: data.version,
              attestation: String(form.get('attestation') ?? ''),
            });
          }}
        >
          <TextAreaField label={copy.attestation} minLength={20} name="attestation" required />
          <Button disabled={sending || data.missingRequirements.length > 0} type="submit">
            <Icon name="shield" /> {copy.submitVerification}
          </Button>
        </form>
      </Card>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.documents}</h2>
        <RecordList
          records={data.documents.map((document) => ({
            id: document.id,
            title: document.label,
            detail: document.kind,
            status: `${document.status} · ${document.scanStatus}`,
          }))}
          copy={copy}
        />
      </Card>
    </div>
  );
}

function ProfilePanel({
  copy,
  data,
  dentists,
  send,
  sending,
  showSecurity,
}: {
  readonly copy: Copy;
  readonly data: ClinicOnboardingView;
  readonly dentists: readonly ClinicDentistView[];
  readonly send: SendCommand;
  readonly sending: boolean;
  readonly showSecurity: boolean;
}) {
  const aftercare = data.aftercarePolicy ?? {};
  return (
    <div className="workspace-grid">
      {showSecurity ? (
        <Alert tone="info" title={copy.security}>
          {copy.securityBody}
        </Alert>
      ) : null}
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.legalProfile}</h2>
        <form
          className="auth-form"
          key={data.version}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void send('clinic_update_profile', {
              expectedVersion: data.version,
              legalEntityName: value(form, 'legalEntityName'),
              registrationNumber: value(form, 'registrationNumber'),
              registrationCountry: value(form, 'registrationCountry').toUpperCase(),
              businessContact: {
                contactName: value(form, 'contactName'),
                email: value(form, 'email'),
                phone: value(form, 'phone'),
                ...(value(form, 'website') ? { website: value(form, 'website') } : {}),
              },
              responsibleClinicalLeaderDentistId: value(form, 'leader'),
              aftercarePolicy: {
                responseTargetHours: Number(value(form, 'responseTargetHours')),
                emergencyProtocol: value(form, 'emergencyProtocol'),
                remoteFollowUpAvailable: form.get('remoteFollowUpAvailable') === 'on',
              },
            });
          }}
        >
          <Field
            defaultValue={data.legalEntityName}
            label={copy.legalEntity}
            name="legalEntityName"
            required
          />
          <Field
            defaultValue={data.registrationNumber ?? ''}
            label={copy.registrationNumber}
            name="registrationNumber"
            required
          />
          <Field
            defaultValue={data.registrationCountry ?? 'VN'}
            label={copy.registrationCountry}
            maxLength={2}
            minLength={2}
            name="registrationCountry"
            required
          />
          <Field
            defaultValue={data.businessContact?.contactName ?? ''}
            label={copy.contactName}
            name="contactName"
            required
          />
          <Field
            defaultValue={data.businessContact?.email ?? ''}
            label={copy.contactEmail}
            name="email"
            required
            type="email"
          />
          <Field
            defaultValue={data.businessContact?.phone ?? ''}
            label={copy.contactPhone}
            name="phone"
            required
            type="tel"
          />
          <Field
            defaultValue={data.businessContact?.website ?? ''}
            label={copy.website}
            name="website"
            type="url"
          />
          <SelectField
            defaultValue={data.responsibleClinicalLeaderDentistId ?? ''}
            label={copy.clinicalLeader}
            name="leader"
            required
          >
            <option value="">—</option>
            {dentists
              .filter((dentist) => dentist.active)
              .map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.fullName}
                </option>
              ))}
          </SelectField>
          <Field
            defaultValue={String(aftercare.responseTargetHours ?? 24)}
            label={copy.aftercareHours}
            max={168}
            min={1}
            name="responseTargetHours"
            required
            type="number"
          />
          <TextAreaField
            defaultValue={String(aftercare.emergencyProtocol ?? '')}
            label={copy.emergencyProtocol}
            name="emergencyProtocol"
            required
          />
          <Checkbox
            defaultChecked={aftercare.remoteFollowUpAvailable === true}
            label={copy.remoteFollowUp}
            name="remoteFollowUpAvailable"
          />
          <Button disabled={sending} type="submit">
            <Icon name="check" /> {copy.updateProfile}
          </Button>
        </form>
      </Card>
      <LocationForm copy={copy} data={data} send={send} sending={sending} />
      <DeclarationForm copy={copy} send={send} sending={sending} />
    </div>
  );
}

function LocationForm({
  copy,
  data,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: ClinicOnboardingView;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  const [selectedId, setSelectedId] = useState('');
  const selected = data.locations.find((location) => location.id === selectedId);
  return (
    <Card className="workspace-card" style={{ padding: '1.2rem' }}>
      <h2>{copy.locations}</h2>
      <SelectField
        label={copy.locations}
        onChange={(event) => setSelectedId(event.currentTarget.value)}
        value={selectedId}
      >
        <option value="">+ {copy.addLocation}</option>
        {data.locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </SelectField>
      <form
        className="auth-form"
        key={selectedId || 'new'}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void send('clinic_upsert_location', {
            ...(selectedId ? { locationId: selectedId } : {}),
            name: value(form, 'name'),
            address: value(form, 'address'),
            city: value(form, 'city'),
            ...(value(form, 'district') ? { district: value(form, 'district') } : {}),
            timezone: value(form, 'timezone'),
            active: form.get('active') === 'on',
            businessContact: {
              contactName: value(form, 'contactName'),
              email: value(form, 'email'),
              phone: value(form, 'phone'),
              ...(value(form, 'website') ? { website: value(form, 'website') } : {}),
            },
          });
        }}
      >
        <Field defaultValue={selected?.name ?? ''} label={copy.locationName} name="name" required />
        <Field
          defaultValue={selected?.address ?? ''}
          label={copy.address}
          name="address"
          required
        />
        <Field defaultValue={selected?.city ?? ''} label={copy.city} name="city" required />
        <Field defaultValue={selected?.district ?? ''} label={copy.district} name="district" />
        <Field
          defaultValue={selected?.timezone ?? 'Asia/Ho_Chi_Minh'}
          label={copy.timezone}
          name="timezone"
          required
        />
        <Field
          defaultValue={selected?.businessContact?.contactName ?? ''}
          label={copy.contactName}
          name="contactName"
          required
        />
        <Field
          defaultValue={selected?.businessContact?.email ?? ''}
          label={copy.contactEmail}
          name="email"
          required
          type="email"
        />
        <Field
          defaultValue={selected?.businessContact?.phone ?? ''}
          label={copy.contactPhone}
          name="phone"
          required
        />
        <Field
          defaultValue={selected?.businessContact?.website ?? ''}
          label={copy.website}
          name="website"
          type="url"
        />
        <Checkbox defaultChecked={selected?.active ?? true} label={copy.active} name="active" />
        <Button disabled={sending} type="submit">
          {copy.addLocation}
        </Button>
      </form>
    </Card>
  );
}

function DeclarationForm({
  copy,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  return (
    <Card className="workspace-card" style={{ padding: '1.2rem' }}>
      <h2>{copy.declarations}</h2>
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void send('clinic_upsert_declaration', {
            kind: value(form, 'kind'),
            code: value(form, 'code').toUpperCase(),
            name: value(form, 'name'),
            details: { description: value(form, 'details') },
            active: true,
          });
        }}
      >
        <SelectField label={copy.declarationKind} name="kind">
          <option value="EQUIPMENT">EQUIPMENT</option>
          <option value="SERVICE_CAPABILITY">SERVICE CAPABILITY</option>
          <option value="WARRANTY">WARRANTY</option>
          <option value="AFTERCARE">AFTERCARE</option>
        </SelectField>
        <Field label={copy.code} name="code" pattern="[A-Za-z0-9_:-]+" required />
        <Field label={copy.name} name="name" required />
        <TextAreaField label={copy.details} name="details" required />
        <Button disabled={sending} type="submit">
          {copy.saveDeclaration}
        </Button>
      </form>
    </Card>
  );
}

function ClinicDocumentUpload({
  copy,
  data,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: ClinicOnboardingView;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  const [pending, setPending] = useState<{ id: string; kind: string; label: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const attach = async (fileAssetId: string, kind: string, label: string) => {
    const status = await fetch(
      `/api/portal/uploads?scope=clinic&resourceId=${encodeURIComponent(data.clinicId)}&fileAssetId=${encodeURIComponent(fileAssetId)}`,
      { cache: 'no-store' },
    );
    if (!status.ok) return;
    const envelope = (await status.json()) as { data?: { status?: string; scanStatus?: string } };
    if (envelope.data?.status !== 'AVAILABLE' || envelope.data.scanStatus !== 'CLEAN') {
      setPending({ id: fileAssetId, kind, label });
      return;
    }
    const result = await send('clinic_add_document', { kind, fileAssetId, label });
    if (result) setPending(null);
  };
  return (
    <Card className="workspace-card" style={{ padding: '1.2rem' }}>
      <h2>{copy.upload}</h2>
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          const fileInput = formElement.elements.namedItem('file');
          const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined;
          if (!file) return;
          const kind = value(form, 'kind');
          const label = value(form, 'label');
          setUploadError(false);
          setUploading(true);
          void fetch('/api/portal/uploads', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'initiate',
              scope: 'clinic',
              resourceId: data.clinicId,
              fileName: file.name,
              declaredMediaType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              category: kind,
            }),
          })
            .then(async (response) => {
              if (!response.ok) throw new Error('upload');
              return response.json() as Promise<{
                data?: {
                  fileAssetId?: string;
                  uploadUrl?: string;
                  requiredHeaders?: Record<string, string>;
                };
              }>;
            })
            .then(async (init) => {
              const asset = init.data;
              if (!asset?.fileAssetId) throw new Error('upload');
              if (asset.uploadUrl) {
                const put = await fetch(asset.uploadUrl, {
                  method: 'PUT',
                  ...(asset.requiredHeaders ? { headers: asset.requiredHeaders } : {}),
                  body: file,
                });
                if (!put.ok) throw new Error('upload');
              }
              const finalized = await fetch('/api/portal/uploads', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  action: 'finalize',
                  scope: 'clinic',
                  resourceId: data.clinicId,
                  fileAssetId: asset.fileAssetId,
                }),
              });
              if (!finalized.ok) throw new Error('upload');
              await attach(asset.fileAssetId, kind, label);
            })
            .catch(() => setUploadError(true))
            .finally(() => setUploading(false));
        }}
      >
        <SelectField label={copy.documentKind} name="kind">
          <option value="OPERATING_LICENSE">OPERATING LICENSE</option>
          <option value="PROFESSIONAL_LICENSE">PROFESSIONAL LICENSE</option>
          <option value="INSURANCE">INSURANCE</option>
          <option value="EQUIPMENT_CERTIFICATE">EQUIPMENT CERTIFICATE</option>
        </SelectField>
        <Field label={copy.label} name="label" required />
        <Field
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          hint={copy.uploadHint}
          label={copy.upload}
          name="file"
          required
          type="file"
        />
        <Button disabled={sending || uploading} type="submit">
          <Icon name="upload" /> {copy.upload}
        </Button>
      </form>
      {uploadError ? (
        <Alert tone="danger" title={copy.loadError}>
          {copy.uploadHint}
        </Alert>
      ) : null}
      {pending ? (
        <Alert tone="warning" title={copy.uploadPending}>
          <Button
            disabled={sending}
            variant="secondary"
            onClick={() => void attach(pending.id, pending.kind, pending.label)}
          >
            {copy.checkScan}
          </Button>
        </Alert>
      ) : null}
    </Card>
  );
}

function DentistsPanel({
  copy,
  data,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: readonly ClinicDentistView[];
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.dentistRoster}</h2>
        <RecordList
          copy={copy}
          records={data.map((dentist) => ({
            id: dentist.id,
            title: dentist.fullName,
            detail: `${dentist.licenseNumber} · ${dentist.licenseStatus}`,
            status: dentist.active ? copy.active : 'Inactive',
            action: (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void send('clinic_update_dentist', {
                    dentistId: dentist.id,
                    active: !dentist.active,
                    reason: value(form, 'reason'),
                  });
                }}
              >
                <Field label={copy.reason} minLength={3} name="reason" required />
                <Button disabled={sending} type="submit" variant="secondary">
                  {dentist.active ? copy.deactivate : copy.reactivate}
                </Button>
              </form>
            ),
          }))}
        />
      </Card>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.addDentist}</h2>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void send('clinic_add_dentist', {
              fullName: value(form, 'fullName'),
              slug: value(form, 'slug'),
              licenseNumber: value(form, 'licenseNumber'),
              authority: value(form, 'authority'),
              ...(value(form, 'scope') ? { scopeOfPractice: value(form, 'scope') } : {}),
              ...(value(form, 'expiresAt') ? { expiresAt: value(form, 'expiresAt') } : {}),
            });
          }}
        >
          <Field label={copy.fullName} name="fullName" required />
          <Field label={copy.slug} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
          <Field label={copy.licenseNumber} name="licenseNumber" required />
          <Field label={copy.authority} name="authority" required />
          <TextAreaField label={copy.scope} name="scope" />
          <Field label={copy.expiresAt} name="expiresAt" type="date" />
          <Button disabled={sending} type="submit">
            {copy.addDentist}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function TeamPanel({
  copy,
  data,
  locations,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: ClinicTeamView;
  readonly locations: ClinicOnboardingView['locations'];
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.team}</h2>
        {data.members.length ? (
          data.members.map((member) => (
            <details key={member.membershipId}>
              <summary>
                <strong>{member.email}</strong> · {member.role}{' '}
                <Badge tone={member.mfaEnabled ? 'verified' : 'attention'}>
                  {member.mfaEnabled ? copy.mfaReady : copy.mfaMissing}
                </Badge>
              </summary>
              <form
                className="auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void send('clinic_update_team_access', {
                    membershipId: member.membershipId,
                    expectedVersion: member.version,
                    role: value(form, 'role'),
                    jobTitle: value(form, 'jobTitle') || null,
                    locationIds: form.getAll('locationIds').map(String),
                    permissions: form.getAll('permissions').map(String),
                  });
                }}
              >
                <SelectField defaultValue={member.role} label={copy.role} name="role">
                  <option value="DENTIST">DENTIST</option>
                  <option value="CLINIC_STAFF">CLINIC STAFF</option>
                  <option value="CLINIC_ADMIN">CLINIC ADMIN</option>
                </SelectField>
                <Field defaultValue={member.jobTitle ?? ''} label={copy.jobTitle} name="jobTitle" />
                <CheckboxGroup
                  checked={member.locationIds}
                  label={copy.assignLocations}
                  name="locationIds"
                  options={locations.map((location) => ({
                    label: location.name,
                    value: location.id,
                  }))}
                />
                <CheckboxGroup
                  checked={member.permissions}
                  label={copy.permissions}
                  name="permissions"
                  options={permissions.map((permission) => ({
                    label: permission,
                    value: permission,
                  }))}
                />
                <Button disabled={sending} type="submit">
                  {copy.updateAccess}
                </Button>
              </form>
              <form
                className="auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const submitter = (event.nativeEvent as SubmitEvent).submitter;
                  const commandName = submitter instanceof HTMLButtonElement ? submitter.value : '';
                  if (commandName)
                    void send(commandName, {
                      membershipId: member.membershipId,
                      expectedVersion: member.version,
                      reason: value(form, 'reason'),
                    });
                }}
              >
                <Field label={copy.reason} minLength={5} name="reason" required />
                <div>
                  <Button
                    disabled={sending || member.status !== 'ACTIVE'}
                    type="submit"
                    value="clinic_suspend_team"
                    variant="secondary"
                  >
                    {copy.suspend}
                  </Button>{' '}
                  <Button
                    disabled={sending || member.status === 'REMOVED'}
                    type="submit"
                    value="clinic_remove_team"
                    variant="quiet"
                  >
                    {copy.remove}
                  </Button>
                </div>
              </form>
            </details>
          ))
        ) : (
          <EmptyState title={copy.team} body={copy.empty} />
        )}
      </Card>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.invite}</h2>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void send('clinic_invite_team', {
              email: value(form, 'email'),
              role: value(form, 'role'),
              jobTitle: value(form, 'jobTitle') || undefined,
              locationIds: form.getAll('locationIds').map(String),
              permissions: form.getAll('permissions').map(String),
            });
          }}
        >
          <Field label={copy.email} name="email" required type="email" />
          <SelectField label={copy.role} name="role">
            <option value="CLINIC_STAFF">CLINIC STAFF</option>
            <option value="DENTIST">DENTIST</option>
            <option value="CLINIC_ADMIN">CLINIC ADMIN</option>
          </SelectField>
          <Field label={copy.jobTitle} name="jobTitle" />
          <CheckboxGroup
            checked={[]}
            label={copy.assignLocations}
            name="locationIds"
            options={locations.map((location) => ({ label: location.name, value: location.id }))}
          />
          <CheckboxGroup
            checked={['CASE_INBOX']}
            label={copy.permissions}
            name="permissions"
            options={permissions.map((permission) => ({ label: permission, value: permission }))}
          />
          <Button disabled={sending} type="submit">
            {copy.invite}
          </Button>
        </form>
        <h3>{copy.pendingInvitations}</h3>
        {data.invitations.map((invite) => (
          <p key={invite.id}>
            {invite.email} · {invite.role} · {formatDate('en', invite.expiresAt)}
          </p>
        ))}
        <h3>{copy.reviewActivity}</h3>
        {data.activity.map((activity) => (
          <p key={activity.id}>
            <code>{activity.action}</code> · {new Date(activity.createdAt).toLocaleString()}
          </p>
        ))}
      </Card>
    </div>
  );
}

function OpportunitiesPanel({
  copy,
  data,
  dentists,
  locale,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: readonly ClinicOpportunityView[];
  readonly dentists: readonly ClinicDentistView[];
  readonly locale: Locale;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  if (!data.length)
    return <EmptyState icon="document" title={copy.opportunities} body={copy.empty} />;
  return (
    <>
      <Alert title={copy.noPatientDetail} />
      <div className="workspace-grid">
        {data.map((item) => (
          <Card className="workspace-card" key={item.caseId} style={{ padding: '1.2rem' }}>
            <div className="workspace-card__head" style={{ padding: 0 }}>
              <div>
                <p className="eyebrow">{item.caseNumber}</p>
                <h2>{item.desiredProcedureCode}</h2>
              </div>
              <Badge
                tone={
                  item.status === 'ACCEPTED'
                    ? 'verified'
                    : item.status === 'DECLINED'
                      ? 'danger'
                      : 'attention'
                }
              >
                {item.status.replaceAll('_', ' ')}
              </Badge>
            </div>
            <p>
              {item.preferredLocation ?? '—'} · {item.expectedArrivalDate ?? '—'}
            </p>
            <Link className="text-link" href={`/${locale}/clinic/cases/${item.caseId}`}>
              Open / Mở <Icon name="arrow" />
            </Link>
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void send('clinic_case_decision', {
                  caseId: item.caseId,
                  expectedVersion: item.version,
                  decision: value(form, 'decision'),
                  ...(value(form, 'reason') ? { reason: value(form, 'reason') } : {}),
                });
              }}
            >
              <SelectField label={copy.decide} name="decision">
                <option value="ACCEPT">{copy.accept}</option>
                <option value="DECLINE">{copy.decline}</option>
                <option value="REQUEST_RECORDS">{copy.requestRecords}</option>
              </SelectField>
              <TextAreaField label={copy.reason} name="reason" />
              <Button disabled={sending} type="submit">
                {copy.decide}
              </Button>
            </form>
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void send('clinic_assign_dentist', {
                  caseId: item.caseId,
                  dentistId: value(form, 'dentistId'),
                });
              }}
            >
              <SelectField
                defaultValue={item.assignedDentistId ?? ''}
                label={copy.assignDentist}
                name="dentistId"
                required
              >
                <option value="">—</option>
                {dentists
                  .filter((dentist) => dentist.active && dentist.licenseStatus === 'VERIFIED')
                  .map((dentist) => (
                    <option key={dentist.id} value={dentist.id}>
                      {dentist.fullName}
                    </option>
                  ))}
              </SelectField>
              <Button disabled={sending} type="submit" variant="secondary">
                {copy.assignDentist}
              </Button>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}

function AvailabilityPanel({
  copy,
  data,
  locations,
  dentists,
  locale,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: ClinicAvailabilityView;
  readonly locations: ClinicOnboardingView['locations'];
  readonly dentists: readonly ClinicDentistView[];
  readonly locale: Locale;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  const policy = data.policy;
  return (
    <div className="workspace-grid">
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.scheduleRules}</h2>
        <RecordList
          copy={copy}
          records={data.rules.map((rule) => ({
            id: rule.id,
            title: `${dayLabel(rule.dayOfWeek, locale)} ${rule.startsAtLocal}–${rule.endsAtLocal}`,
            detail: `${rule.slotKind} · ${rule.timezone} · ${rule.procedureDurationMinutes}m`,
            status: `${copy.capacity}: ${rule.capacity}`,
          }))}
        />
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void send('clinic_upsert_availability_rule', {
              locationId: value(form, 'locationId'),
              ...(value(form, 'dentistId') ? { dentistId: value(form, 'dentistId') } : {}),
              slotKind: value(form, 'slotKind'),
              dayOfWeek: Number(value(form, 'dayOfWeek')),
              startsAtLocal: value(form, 'startsAtLocal'),
              endsAtLocal: value(form, 'endsAtLocal'),
              timezone: value(form, 'timezone'),
              capacity: Number(value(form, 'capacity')),
              procedureDurationMinutes: Number(value(form, 'duration')),
              effectiveFrom: value(form, 'effectiveFrom'),
              ...(value(form, 'effectiveUntil')
                ? { effectiveUntil: value(form, 'effectiveUntil') }
                : {}),
              active: true,
            });
          }}
        >
          <LocationSelect copy={copy} locations={locations} />
          <DentistSelect copy={copy} dentists={dentists} optional />
          <SelectField label={copy.slotKind} name="slotKind">
            <option value="CONSULTATION">CONSULTATION</option>
            <option value="TREATMENT">TREATMENT</option>
            <option value="BOTH">BOTH</option>
          </SelectField>
          <SelectField label={copy.dayOfWeek} name="dayOfWeek">
            {Array.from({ length: 7 }, (_, day) => (
              <option key={day} value={day}>
                {dayLabel(day, locale)}
              </option>
            ))}
          </SelectField>
          <Field label={copy.startTime} name="startsAtLocal" required type="time" />
          <Field label={copy.endTime} name="endsAtLocal" required type="time" />
          <Field defaultValue="Asia/Ho_Chi_Minh" label={copy.timezone} name="timezone" required />
          <Field
            defaultValue="1"
            label={copy.capacity}
            max={100}
            min={1}
            name="capacity"
            required
            type="number"
          />
          <Field
            defaultValue="60"
            label={copy.duration}
            max={720}
            min={15}
            name="duration"
            required
            type="number"
          />
          <Field label={copy.effectiveFrom} name="effectiveFrom" required type="date" />
          <Field label={copy.effectiveUntil} name="effectiveUntil" type="date" />
          <Button disabled={sending} type="submit">
            {copy.saveRule}
          </Button>
        </form>
      </Card>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.blocks}</h2>
        <RecordList
          copy={copy}
          records={data.blocks.map((block) => ({
            id: block.id,
            title: block.kind,
            detail: `${formatDate(locale, block.startsAt)} · ${block.reason}`,
            status: block.dentistId ? 'Dentist' : 'Location',
          }))}
        />
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void send('clinic_create_availability_block', {
              ...(value(form, 'locationId') ? { locationId: value(form, 'locationId') } : {}),
              ...(value(form, 'dentistId') ? { dentistId: value(form, 'dentistId') } : {}),
              kind: value(form, 'kind'),
              startsAt: new Date(value(form, 'startsAt')).toISOString(),
              endsAt: new Date(value(form, 'endsAt')).toISOString(),
              reason: value(form, 'reason'),
            });
          }}
        >
          <LocationSelect copy={copy} locations={locations} optional />
          <DentistSelect copy={copy} dentists={dentists} optional />
          <SelectField label={copy.blockKind} name="kind">
            <option value="BLOCK">BLOCK</option>
            <option value="TIME_OFF">TIME OFF</option>
          </SelectField>
          <Field label={copy.startsAt} name="startsAt" required type="datetime-local" />
          <Field label={copy.endsAt} name="endsAt" required type="datetime-local" />
          <TextAreaField label={copy.reason} minLength={5} name="reason" required />
          <Button disabled={sending} type="submit">
            {copy.addBlock}
          </Button>
        </form>
      </Card>
      {policy ? (
        <Card className="workspace-card" style={{ padding: '1.2rem' }}>
          <h2>{copy.policy}</h2>
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void send('clinic_update_scheduling_policy', {
                expectedVersion: policy.version,
                minimumNoticeMinutes: Number(value(form, 'notice')),
                maximumAdvanceDays: Number(value(form, 'advance')),
                rescheduleCutoffMinutes: Number(value(form, 'reschedule')),
                cancellationCutoffMinutes: Number(value(form, 'cancellation')),
                defaultConsultationMinutes: Number(value(form, 'consultation')),
                defaultTreatmentMinutes: Number(value(form, 'treatment')),
                overbookingAllowed: form.get('overbooking') === 'on',
              });
            }}
          >
            <Field
              defaultValue={String(policy.minimumNoticeMinutes)}
              label={copy.notice}
              min={0}
              name="notice"
              required
              type="number"
            />
            <Field
              defaultValue={String(policy.maximumAdvanceDays)}
              label={copy.maxAdvance}
              min={1}
              name="advance"
              required
              type="number"
            />
            <Field
              defaultValue={String(policy.rescheduleCutoffMinutes)}
              label={copy.rescheduleCutoff}
              min={0}
              name="reschedule"
              required
              type="number"
            />
            <Field
              defaultValue={String(policy.cancellationCutoffMinutes)}
              label={copy.cancellationCutoff}
              min={0}
              name="cancellation"
              required
              type="number"
            />
            <Field
              defaultValue={String(policy.defaultConsultationMinutes)}
              label={copy.consultationDuration}
              min={15}
              name="consultation"
              required
              type="number"
            />
            <Field
              defaultValue={String(policy.defaultTreatmentMinutes)}
              label={copy.treatmentDuration}
              min={15}
              name="treatment"
              required
              type="number"
            />
            <Checkbox
              defaultChecked={policy.overbookingAllowed}
              label={copy.overbooking}
              name="overbooking"
            />
            <Button disabled={sending} type="submit">
              {copy.savePolicy}
            </Button>
          </form>
        </Card>
      ) : null}
      <CalendarPanel
        copy={copy}
        connections={data.calendarConnections}
        dentists={dentists}
        send={send}
        sending={sending}
      />
    </div>
  );
}

function CalendarPanel({
  copy,
  connections,
  dentists,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly connections: ClinicAvailabilityView['calendarConnections'];
  readonly dentists: readonly ClinicDentistView[];
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  return (
    <Card className="workspace-card" style={{ padding: '1.2rem' }}>
      <h2>{copy.calendar}</h2>
      {connections.map((connection) => (
        <div key={connection.id}>
          <p>
            <strong>{connection.provider}</strong> ·{' '}
            <Badge
              tone={
                connection.status === 'ACTIVE'
                  ? 'verified'
                  : connection.status === 'ERROR'
                    ? 'danger'
                    : 'attention'
              }
            >
              {connection.status}
            </Badge>
          </p>
          <Button
            disabled={sending || connection.status === 'DISCONNECTED'}
            onClick={() =>
              void send('clinic_sync_calendar', {
                connectionId: connection.id,
                expectedStatus: connection.status,
              })
            }
            variant="secondary"
          >
            {copy.sync}
          </Button>{' '}
          <Button
            disabled={sending || connection.status === 'DISCONNECTED'}
            onClick={() =>
              void send('clinic_disconnect_calendar', {
                connectionId: connection.id,
                reason: 'Disconnected by an authorized clinic operator.',
              })
            }
            variant="quiet"
          >
            {copy.disconnect}
          </Button>
        </div>
      ))}
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void send('clinic_connect_calendar', {
            provider: value(form, 'provider'),
            externalCalendarReference: value(form, 'reference'),
            ...(value(form, 'dentistId') ? { dentistId: value(form, 'dentistId') } : {}),
          });
        }}
      >
        <SelectField label={copy.provider} name="provider">
          <option value="google">Google Calendar</option>
          <option value="microsoft">Microsoft Outlook</option>
          <option value="caldav">CalDAV</option>
        </SelectField>
        <Field label={copy.calendarReference} name="reference" required />
        <DentistSelect copy={copy} dentists={dentists} optional />
        <Button disabled={sending} type="submit">
          {copy.connectCalendar}
        </Button>
      </form>
    </Card>
  );
}

function ServicesPanel({
  copy,
  data,
  locale,
  send,
  sending,
}: {
  readonly copy: Copy;
  readonly data: ClinicServicesWorkspaceView;
  readonly locale: Locale;
  readonly send: SendCommand;
  readonly sending: boolean;
}) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.services}</h2>
        {data.services.length ? (
          data.services.map((service) => {
            const price = service.versions[0];
            return (
              <details key={service.id}>
                <summary>
                  <strong>
                    {service.displayNames[locale === 'vi' ? 'vi-VN' : 'en-US'] ??
                      service.procedureCode}
                  </strong>{' '}
                  ·{' '}
                  <Badge tone={service.active ? 'verified' : 'neutral'}>
                    {service.active ? copy.active : 'Archived'}
                  </Badge>
                </summary>
                {service.versions.map((version) => (
                  <p key={version.id}>
                    {money(version.minimumMinor, version.currency, locale)} –{' '}
                    {money(version.maximumMinor, version.currency, locale)} ·{' '}
                    {formatDate(locale, version.effectiveAt)}
                  </p>
                ))}
                {service.active ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void send('clinic_archive_service', {
                        clinicServiceId: service.id,
                        reason: value(form, 'reason'),
                      });
                    }}
                  >
                    <Field label={copy.reason} minLength={5} name="reason" required />
                    <Button disabled={sending} type="submit" variant="quiet">
                      {copy.archive}
                    </Button>
                  </form>
                ) : null}
                {price ? (
                  <small>
                    {price.materialOptions.join(', ')} · {price.brandOptions.join(', ')}
                  </small>
                ) : null}
              </details>
            );
          })
        ) : (
          <EmptyState title={copy.services} body={copy.empty} />
        )}
      </Card>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.publishService}</h2>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void send('clinic_publish_service', {
              ...(value(form, 'clinicServiceId')
                ? { clinicServiceId: value(form, 'clinicServiceId') }
                : {}),
              procedureDefinitionId: value(form, 'procedureDefinitionId'),
              displayNames: { 'vi-VN': value(form, 'viName'), 'en-US': value(form, 'enName') },
              includedServices: lines(value(form, 'included')),
              exclusions: lines(value(form, 'exclusions')),
              estimatedDurationDays: Number(value(form, 'duration')),
              warrantyPolicy: {
                name: value(form, 'warrantyName'),
                terms: { description: value(form, 'warrantyTerms') },
              },
              minimumMinor: Number(value(form, 'minimum')),
              maximumMinor: Number(value(form, 'maximum')),
              currency: value(form, 'currency'),
              materialOptions: lines(value(form, 'materials')),
              brandOptions: lines(value(form, 'brands')),
              effectiveAt: new Date(value(form, 'effectiveAt')).toISOString(),
            });
          }}
        >
          <SelectField label={copy.services} name="clinicServiceId">
            <option value="">+ New</option>
            {data.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.procedureCode}
              </option>
            ))}
          </SelectField>
          <SelectField label={copy.procedure} name="procedureDefinitionId" required>
            <option value="">—</option>
            {data.catalog.map((procedure) => (
              <option key={procedure.id} value={procedure.id}>
                {procedure.code} · {procedure.names[locale === 'vi' ? 'vi-VN' : 'en-US'] ?? ''}
              </option>
            ))}
          </SelectField>
          <Field label={copy.viName} name="viName" required />
          <Field label={copy.enName} name="enName" required />
          <TextAreaField label={copy.included} name="included" required />
          <TextAreaField label={copy.exclusions} name="exclusions" required />
          <Field
            defaultValue="1"
            label={copy.estimatedDays}
            min={1}
            name="duration"
            required
            type="number"
          />
          <Field label={copy.warrantyName} name="warrantyName" required />
          <TextAreaField label={copy.warrantyTerms} name="warrantyTerms" required />
          <Field label={copy.minimumPrice} min={0} name="minimum" required type="number" />
          <Field label={copy.maximumPrice} min={0} name="maximum" required type="number" />
          <SelectField label={copy.currency} name="currency">
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </SelectField>
          <TextAreaField label={copy.materials} name="materials" required />
          <TextAreaField label={copy.brands} name="brands" required />
          <Field label={copy.effectiveAt} name="effectiveAt" required type="datetime-local" />
          <Button disabled={sending} type="submit">
            {copy.publishService}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function AnalyticsPanel({
  copy,
  data,
  locale,
}: {
  readonly copy: Copy;
  readonly data: ClinicAnalyticsView;
  readonly locale: Locale;
}) {
  const metrics = Object.entries(data.metrics).filter(([key]) => key !== 'nextVerificationExpiry');
  return (
    <>
      <div className="portal-metrics">
        {metrics.map(([key, raw]) => (
          <Card className="portal-metric" key={key}>
            <span>{humanize(key)}</span>
            <strong>{metric(raw, key)}</strong>
          </Card>
        ))}
      </div>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.analytics}</h2>
        <p>
          {copy.generated}: {formatDate(locale, data.generatedAt)}
        </p>
        <p>Verification expiry / Hết hạn xác minh: {data.metrics.nextVerificationExpiry ?? '—'}</p>
        {data.paymentSummaries.map((summary) => (
          <p key={summary.currency}>
            {summary.currency}: {money(summary.grossAmountMinor, summary.currency, locale)} ·{' '}
            {summary.count}
          </p>
        ))}
        {data.unavailableMetrics.length ? (
          <Alert tone="warning" title={copy.unavailable}>
            {data.unavailableMetrics.join(', ')}
          </Alert>
        ) : null}
      </Card>
    </>
  );
}

function BillingPanel({
  copy,
  data,
  locale,
}: {
  readonly copy: Copy;
  readonly data: ClinicBillingView;
  readonly locale: Locale;
}) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.payout}</h2>
        {data.payout ? (
          <>
            <Badge tone={data.payout.status === 'ACTIVE' ? 'verified' : 'attention'}>
              {data.payout.status}
            </Badge>
            <p>
              {data.payout.provider ?? '—'} · {formatDate(locale, data.payout.updatedAt)}
            </p>
          </>
        ) : (
          <EmptyState title={copy.payout} body={copy.empty} />
        )}
      </Card>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{copy.billing}</h2>
        {data.payments.length ? (
          data.payments.map((payment) => (
            <p key={`${payment.currency}:${payment.status}`}>
              <strong>{money(payment.amountMinor, payment.currency, locale)}</strong> ·{' '}
              {payment.status} · {payment.count}
            </p>
          ))
        ) : (
          <EmptyState title={copy.billing} body={copy.empty} />
        )}
      </Card>
    </div>
  );
}

function StatusList({
  copy,
  onboarding,
}: {
  readonly copy: Copy;
  readonly onboarding: ClinicOnboardingView;
}) {
  return onboarding.missingRequirements.length ? (
    <div>
      <h3>{copy.missing}</h3>
      <ul>
        {onboarding.missingRequirements.map((requirement) => (
          <li key={requirement}>{requirement.replaceAll('_', ' ')}</li>
        ))}
      </ul>
    </div>
  ) : (
    <Alert tone="success" title="Complete / Hoàn tất" />
  );
}

function RecordList({
  records,
  copy,
}: {
  readonly records: readonly {
    readonly id: string;
    readonly title: string;
    readonly detail: string;
    readonly status: string;
    readonly action?: React.ReactNode;
  }[];
  readonly copy: Copy;
}) {
  if (!records.length) return <EmptyState title={copy.empty} body={copy.empty} />;
  return (
    <div className="activity-list">
      {records.map((record) => (
        <div className="activity-item" key={record.id}>
          <span className="activity-item__icon">
            <Icon name="check" />
          </span>
          <div>
            <strong>{record.title}</strong>
            <p>{record.detail}</p>
            {record.action}
          </div>
          <Badge tone="info">{record.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function CheckboxGroup({
  label,
  name,
  options,
  checked,
}: {
  readonly label: string;
  readonly name: string;
  readonly options: readonly { readonly label: string; readonly value: string }[];
  readonly checked: readonly string[];
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {options.map((option) => (
        <Checkbox
          defaultChecked={checked.includes(option.value)}
          key={option.value}
          label={option.label}
          name={name}
          value={option.value}
        />
      ))}
    </fieldset>
  );
}

function LocationSelect({
  copy,
  locations,
  optional = false,
}: {
  readonly copy: Copy;
  readonly locations: ClinicOnboardingView['locations'];
  readonly optional?: boolean;
}) {
  return (
    <SelectField label={copy.locations} name="locationId" required={!optional}>
      <option value="">—</option>
      {locations
        .filter((location) => location.active)
        .map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
    </SelectField>
  );
}

function DentistSelect({
  copy,
  dentists,
  optional = false,
}: {
  readonly copy: Copy;
  readonly dentists: readonly ClinicDentistView[];
  readonly optional?: boolean;
}) {
  return (
    <SelectField label={copy.dentistRoster} name="dentistId" required={!optional}>
      <option value="">—</option>
      {dentists
        .filter((dentist) => dentist.active)
        .map((dentist) => (
          <option key={dentist.id} value={dentist.id}>
            {dentist.fullName}
          </option>
        ))}
    </SelectField>
  );
}

function LoadingWorkspace() {
  return (
    <Card className="workspace-card" style={{ padding: '1.2rem' }}>
      <Skeleton style={{ height: '2rem', width: '45%' }} />
      <Skeleton style={{ height: '18rem', marginTop: '1rem' }} />
    </Card>
  );
}

async function loadClinicPage(pageKey: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(
    `/api/portal/data?${new URLSearchParams({ area: 'clinic', pageKey })}`,
    { cache: 'no-store', signal },
  );
  if (!response.ok) throw new Error('clinic_data_unavailable');
  const envelope = (await response.json()) as { data?: unknown };
  const candidate = envelope.data;
  if (pageKey === 'dashboard') return clinicOverviewViewSchema.parse(candidate);
  if (['onboarding', 'verification', 'profile', 'settings'].includes(pageKey))
    return clinicOnboardingViewSchema.parse(candidate);
  if (pageKey === 'dentists') return clinicDentistViewSchema.array().parse(candidate);
  if (pageKey === 'team') return clinicTeamViewSchema.parse(candidate);
  if (pageKey === 'cases') return clinicOpportunityViewSchema.array().parse(candidate);
  if (pageKey === 'availability') return clinicAvailabilityViewSchema.parse(candidate);
  if (pageKey === 'pricing') return clinicServicesWorkspaceViewSchema.parse(candidate);
  if (pageKey === 'analytics') return clinicAnalyticsViewSchema.parse(candidate);
  if (pageKey === 'billing') return clinicBillingViewSchema.parse(candidate);
  throw new Error('unsupported_clinic_page');
}

async function loadAuxiliary(pageKey: string, signal: AbortSignal): Promise<AuxiliaryData> {
  const needsOnboarding = ['team', 'availability'].includes(pageKey);
  const needsDentists = ['profile', 'settings', 'cases', 'availability'].includes(pageKey);
  const [onboarding, dentists] = await Promise.all([
    needsOnboarding ? loadClinicPage('onboarding', signal) : Promise.resolve(undefined),
    needsDentists ? loadClinicPage('dentists', signal) : Promise.resolve(undefined),
  ]);
  return {
    ...(onboarding ? { onboarding: onboarding as ClinicOnboardingView } : {}),
    ...(dentists ? { dentists: dentists as readonly ClinicDentistView[] } : {}),
  };
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}
function lines(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/\r?\n/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
function dayLabel(day: number, locale: Locale): string {
  const reference = new Date(Date.UTC(2026, 6, 12 + day));
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(reference);
}
function money(amountMinor: number, currency: 'VND' | 'USD', locale: Locale): string {
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(currency === 'USD' ? amountMinor / 100 : amountMinor);
}
function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/^./u, (letter) => letter.toUpperCase());
}
function metric(raw: unknown, key: string): string {
  if (typeof raw !== 'number') return '—';
  if (/Rate$/u.test(key)) return `${(raw * 100).toFixed(1)}%`;
  if (/Hours$/u.test(key)) return `${raw.toFixed(1)}h`;
  return Number.isInteger(raw) ? String(raw) : raw.toFixed(2);
}
