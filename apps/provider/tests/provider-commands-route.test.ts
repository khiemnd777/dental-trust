import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(),
  providerApiForSession: vi.fn(),
  readProviderSession: vi.fn(),
}));

vi.mock('@/lib/request-origin', () => ({
  isSameOriginRequest: routeMocks.isSameOriginRequest,
}));
vi.mock('@/lib/require-session', () => ({
  readProviderSession: routeMocks.readProviderSession,
}));
vi.mock('@/lib/provider-api', () => ({
  ProviderApiError: class ProviderApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
    ) {
      super(code);
    }
  },
  providerApiForSession: routeMocks.providerApiForSession,
}));

import { POST } from '@/app/api/provider/commands/route';
import { ProviderApiError } from '@/lib/provider-api';

const caseId = '00000000-0000-4000-8000-000000000001';
const secondaryId = '00000000-0000-4000-8000-000000000002';
const clinicId = '00000000-0000-4000-8000-000000000003';
const locationId = '00000000-0000-4000-8000-000000000004';
const dentistId = '00000000-0000-4000-8000-000000000005';
const procedureId = '00000000-0000-4000-8000-000000000006';
const idempotencyKey = '00000000-0000-4000-8000-000000000007';
const session = {
  token: 'token',
  organizationId: clinicId,
  userId: dentistId,
  roles: ['CLINIC_ADMIN'],
  mfaVerified: true,
  mfaRequired: true,
};

function commandRequest(body: unknown = {}) {
  return new Request('https://provider.example.test/api/provider/commands', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://provider.example.test',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  });
}

const commands = [
  {
    command: 'clinic_case_decision',
    resourceId: caseId,
    payload: { expectedVersion: 1, decision: 'ACCEPT' },
    path: `clinic-operations/cases/${caseId}/decision`,
  },
  {
    command: 'clinic_assign_dentist',
    resourceId: caseId,
    payload: { dentistId },
    path: `clinic-operations/cases/${caseId}/assign-dentist`,
  },
  {
    command: 'create_appointment',
    resourceId: caseId,
    payload: {
      clinicId,
      dentistId,
      startsAt: '2026-08-10T02:00:00.000Z',
      endsAt: '2026-08-10T03:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      kind: 'CONSULTATION',
    },
    path: `cases/${caseId}/appointments`,
  },
  {
    command: 'reschedule_appointment',
    resourceId: caseId,
    secondaryId,
    payload: {
      expectedVersion: 1,
      startsAt: '2026-08-11T02:00:00.000Z',
      endsAt: '2026-08-11T03:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
    },
    path: `cases/${caseId}/appointments/${secondaryId}/reschedule`,
  },
  {
    command: 'cancel_appointment',
    resourceId: caseId,
    secondaryId,
    payload: { expectedVersion: 1, reason: 'Bệnh nhân yêu cầu đổi kế hoạch' },
    path: `cases/${caseId}/appointments/${secondaryId}/cancel`,
  },
  {
    command: 'record_appointment_attendance',
    resourceId: caseId,
    secondaryId,
    payload: { expectedVersion: 1, outcome: 'COMPLETED' },
    path: `cases/${caseId}/appointments/${secondaryId}/attendance`,
  },
  {
    command: 'create_message_thread',
    resourceId: caseId,
    payload: {
      threadSubject: 'Trao đổi điều trị',
      messageBody: 'Nội dung trao đổi',
      fileAssetIds: [],
    },
    path: `cases/${caseId}/threads`,
  },
  {
    command: 'send_message',
    resourceId: caseId,
    secondaryId,
    payload: { messageBody: 'Nội dung phản hồi', fileAssetIds: [] },
    path: `cases/${caseId}/threads/${secondaryId}/messages`,
  },
  {
    command: 'mark_message_read',
    resourceId: caseId,
    secondaryId,
    payload: { messageId: procedureId },
    path: `cases/${caseId}/threads/${secondaryId}/messages/read`,
  },
  {
    command: 'create_internal_note',
    resourceId: caseId,
    secondaryId,
    payload: { internalNote: 'Ghi chú nội bộ dành cho đội ngũ lâm sàng.' },
    path: `cases/${caseId}/threads/${secondaryId}/internal-notes`,
  },
  {
    command: 'incident_clinic_response',
    resourceId: secondaryId,
    payload: { expectedVersion: 1, message: 'Phòng khám đã tiếp nhận và đang xử lý sự cố.' },
    path: `trust/incidents/${secondaryId}/clinic-responses`,
  },
  {
    command: 'incident_internal_note',
    resourceId: secondaryId,
    payload: { expectedVersion: 1, note: 'Ghi chú chỉ dành cho đội ngũ xử lý sự cố.' },
    path: `trust/incidents/${secondaryId}/internal-notes`,
  },
  {
    command: 'create_treatment_plan',
    resourceId: caseId,
    payload: {
      authoringDentistId: dentistId,
      preliminaryAssessment: 'Đánh giá sơ bộ',
      diagnosisStatement: 'Chẩn đoán lâm sàng',
      risks: 'Các rủi ro đã giải thích',
      limitations: 'Các giới hạn đã giải thích',
      warrantyTerms: 'Điều khoản bảo hành',
      exclusions: 'Các trường hợp loại trừ',
      currency: 'VND',
      expiresAt: '2026-09-10T00:00:00.000Z',
      items: [
        {
          procedureCode: 'IMPLANT',
          toothNumbers: [11],
          quantity: 1,
          unitPriceMinor: 20_000_000,
        },
      ],
    },
    path: `cases/${caseId}/treatment-plans/drafts`,
  },
  {
    command: 'publish_treatment_plan',
    resourceId: caseId,
    secondaryId,
    payload: { expectedVersion: 1, contentChecksum: 'a'.repeat(64) },
    path: `cases/${caseId}/treatment-plans/${secondaryId}/publish`,
  },
  {
    command: 'complete_journey_milestone',
    resourceId: caseId,
    secondaryId,
    payload: { expectedVersion: 1, providerNote: 'Đã hoàn tất và kiểm tra lâm sàng.' },
    path: `cases/${caseId}/journey/milestones/${secondaryId}/complete`,
  },
  {
    command: 'create_treatment_instruction',
    resourceId: caseId,
    payload: {
      milestoneId: secondaryId,
      type: 'DISCHARGE',
      locale: 'vi-VN',
      content: 'Giữ vệ sinh vùng điều trị và liên hệ khi có triệu chứng bất thường.',
    },
    path: `cases/${caseId}/journey/instructions`,
  },
  {
    command: 'create_plan_change',
    resourceId: caseId,
    payload: {
      fromPlanVersionId: procedureId,
      kind: 'TREATMENT_AND_PRICE',
      reason: 'Điều chỉnh theo kết quả thăm khám trực tiếp',
      changes: [
        {
          field: 'MATERIAL',
          beforeValue: 'Titanium grade 4',
          afterValue: 'Titanium grade 5',
        },
      ],
    },
    path: `cases/${caseId}/journey/changes`,
  },
  {
    command: 'create_passport_draft',
    resourceId: caseId,
    payload: {
      treatingDentistId: dentistId,
      treatmentCompletedAt: '2026-08-20',
      treatmentSummary: 'Hoàn tất điều trị implant răng 11.',
      dischargeInstructions: 'Giữ vệ sinh và tránh nhai cứng trong bảy ngày.',
      followUpInstructions: 'Tái khám sau bảy ngày và ba tháng.',
      implants: [
        {
          toothNumber: 11,
          system: 'NobelActive',
          manufacturer: 'Nobel Biocare',
          dimensions: '4.3 x 10 mm',
          lotNumber: 'LOT-2026-001',
        },
      ],
      materials: [
        {
          procedureCode: 'IMPLANT',
          material: 'Titanium grade 5',
          manufacturer: 'Nobel Biocare',
        },
      ],
      prescriptions: [
        {
          medication: 'Amoxicillin',
          dosage: '500 mg',
          instructions: 'Uống sau ăn, ngày ba lần trong năm ngày.',
          prescribedAt: '2026-08-20',
        },
      ],
    },
    path: `cases/${caseId}/passport/drafts`,
  },
  {
    command: 'publish_passport',
    resourceId: caseId,
    secondaryId,
    payload: {},
    path: `cases/${caseId}/passport/versions/${secondaryId}/publish`,
  },
  {
    command: 'clinic_create_availability_rule',
    payload: {
      locationId,
      dentistId,
      slotKind: 'BOTH',
      dayOfWeek: 1,
      startsAtLocal: '08:00',
      endsAtLocal: '17:00',
      timezone: 'Asia/Ho_Chi_Minh',
      capacity: 2,
      procedureDurationMinutes: 60,
      effectiveFrom: '2026-08-01',
      active: true,
    },
    path: 'clinic-operations/availability/rules',
  },
  {
    command: 'clinic_create_availability_block',
    payload: {
      locationId,
      kind: 'TIME_OFF',
      startsAt: '2026-08-10T02:00:00.000Z',
      endsAt: '2026-08-10T03:00:00.000Z',
      reason: 'Đào tạo chuyên môn',
    },
    path: 'clinic-operations/availability/blocks',
  },
  {
    command: 'clinic_update_scheduling_policy',
    payload: {
      expectedVersion: 1,
      minimumNoticeMinutes: 60,
      maximumAdvanceDays: 90,
      rescheduleCutoffMinutes: 1_440,
      cancellationCutoffMinutes: 1_440,
      defaultConsultationMinutes: 30,
      defaultTreatmentMinutes: 90,
      overbookingAllowed: false,
    },
    path: 'clinic-operations/availability/policy',
  },
  {
    command: 'clinic_invite_team',
    payload: {
      email: 'staff@example.test',
      role: 'CLINIC_STAFF',
      locationIds: [locationId],
      permissions: ['CASE_INBOX', 'SCHEDULING'],
      jobTitle: 'Điều phối viên',
    },
    path: 'clinic-operations/team/invitations',
  },
  {
    command: 'clinic_upsert_location',
    payload: {
      name: 'Cơ sở Quận 1',
      address: '123 Nguyễn Huệ',
      city: 'Hồ Chí Minh',
      district: 'Quận 1',
      coordinates: { latitude: 10.7769, longitude: 106.7009 },
      timezone: 'Asia/Ho_Chi_Minh',
      businessContact: {
        email: 'location@example.test',
        phone: '+84901234567',
        contactName: 'Nguyễn An',
      },
      active: true,
    },
    path: 'clinic-operations/onboarding/locations',
  },
  {
    command: 'clinic_add_dentist',
    payload: { dentistId },
    path: 'clinic-operations/dentists',
  },
  {
    command: 'clinic_update_dentist',
    resourceId: dentistId,
    payload: { active: false, reason: 'Tạm ngừng cộng tác theo yêu cầu' },
    path: `clinic-operations/dentists/${dentistId}`,
  },
  {
    command: 'clinic_update_team_access',
    resourceId: secondaryId,
    payload: {
      expectedVersion: 1,
      role: 'CLINIC_STAFF',
      locationIds: [locationId],
      permissions: ['CASE_INBOX', 'SCHEDULING'],
      jobTitle: 'Điều phối viên chính',
    },
    path: `clinic-operations/team/${secondaryId}/access`,
  },
  {
    command: 'clinic_suspend_team_member',
    resourceId: secondaryId,
    payload: { expectedVersion: 1, reason: 'Tạm khóa trong thời gian nghỉ phép' },
    path: `clinic-operations/team/${secondaryId}/suspend`,
  },
  {
    command: 'clinic_remove_team_member',
    resourceId: secondaryId,
    payload: { expectedVersion: 1, reason: 'Thành viên đã kết thúc hợp đồng' },
    path: `clinic-operations/team/${secondaryId}/remove`,
  },
  {
    command: 'clinic_connect_calendar',
    payload: {
      provider: 'google',
      externalCalendarReference: 'primary',
      dentistId,
    },
    path: 'clinic-operations/availability/calendars',
  },
  {
    command: 'clinic_sync_calendar',
    resourceId: secondaryId,
    payload: { expectedStatus: 'ACTIVE' },
    path: `clinic-operations/availability/calendars/${secondaryId}/sync`,
  },
  {
    command: 'clinic_disconnect_calendar',
    resourceId: secondaryId,
    payload: { reason: 'Chuyển sang lịch làm việc khác' },
    path: `clinic-operations/availability/calendars/${secondaryId}/disconnect`,
  },
  {
    command: 'clinic_publish_service',
    payload: {
      procedureDefinitionId: procedureId,
      displayNames: { 'vi-VN': 'Trồng răng implant', 'en-US': 'Dental implant' },
      includedServices: ['Tư vấn'],
      exclusions: ['Ghép xương'],
      estimatedDurationDays: 3,
      warrantyPolicy: { name: 'Bảo hành tiêu chuẩn', terms: {} },
      minimumMinor: 15_000_000,
      maximumMinor: 25_000_000,
      currency: 'VND',
      materialOptions: ['Titanium'],
      brandOptions: ['Nobel'],
      effectiveAt: '2026-08-01T00:00:00.000Z',
    },
    path: 'clinic-operations/services',
  },
  {
    command: 'clinic_archive_service',
    resourceId: secondaryId,
    payload: { reason: 'Dịch vụ tạm ngừng cung cấp' },
    path: `clinic-operations/services/${secondaryId}/archive`,
  },
  {
    command: 'clinic_update_profile',
    payload: {
      expectedVersion: 1,
      legalEntityName: 'Dental Trust Clinic Company',
      registrationNumber: '0312345678',
      registrationCountry: 'VN',
      businessContact: {
        email: 'clinic@example.test',
        phone: '+84901234567',
        website: 'https://clinic.example.test',
        contactName: 'Nguyễn An',
      },
      responsibleClinicalLeaderDentistId: dentistId,
      aftercarePolicy: {
        responseTargetHours: 24,
        emergencyProtocol: 'Liên hệ hotline trực 24 giờ.',
        remoteFollowUpAvailable: true,
      },
    },
    path: 'clinic-operations/onboarding/profile',
  },
  {
    command: 'clinic_begin_payout',
    payload: {
      expectedVersion: 1,
      returnUrl: 'https://provider.example.test/clinic?tab=billing&payout=returned',
      refreshUrl: 'https://provider.example.test/clinic?tab=billing&payout=refresh',
    },
    path: 'clinic-operations/onboarding/payout',
  },
  {
    command: 'clinic_refresh_payout',
    payload: { expectedVersion: 1 },
    path: 'clinic-operations/onboarding/payout/refresh',
  },
  {
    command: 'clinic_submit_onboarding',
    payload: { expectedVersion: 1, attestation: 'Tôi xác nhận các thông tin trên là chính xác.' },
    path: 'clinic-operations/onboarding/submit',
  },
] as const;

describe('Provider command BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.isSameOriginRequest.mockReturnValue(true);
    routeMocks.readProviderSession.mockResolvedValue(session);
    routeMocks.providerApiForSession.mockResolvedValue({ accepted: true });
  });

  it.each(commands)('validates and forwards $command to $path', async (fixture) => {
    const response = await POST(
      commandRequest({
        command: fixture.command,
        ...('resourceId' in fixture ? { resourceId: fixture.resourceId } : {}),
        ...('secondaryId' in fixture ? { secondaryId: fixture.secondaryId } : {}),
        payload: fixture.payload,
        idempotencyKey,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { accepted: true } });
    expect(routeMocks.providerApiForSession).toHaveBeenCalledWith(session, fixture.path, {
      method: 'POST',
      body: fixture.payload,
      idempotencyKey,
    });
  });

  it('rejects cross-origin requests before loading a session', async () => {
    routeMocks.isSameOriginRequest.mockReturnValue(false);

    const response = await POST(commandRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_origin' });
    expect(routeMocks.readProviderSession).not.toHaveBeenCalled();
  });

  it('rejects an absent session and an unverified MFA session', async () => {
    routeMocks.readProviderSession.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...session,
      mfaVerified: false,
    });

    const unauthorized = await POST(commandRequest());
    const mfaRequired = await POST(commandRequest());

    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(mfaRequired.status).toBe(403);
    await expect(mfaRequired.json()).resolves.toEqual({ error: 'mfa_required' });
    expect(routeMocks.providerApiForSession).not.toHaveBeenCalled();
  });

  it('distinguishes an invalid command envelope from an invalid command payload', async () => {
    const invalidCommand = await POST(commandRequest({ command: 'delete_everything' }));
    const invalidPayload = await POST(
      commandRequest({
        command: 'clinic_case_decision',
        resourceId: caseId,
        payload: { expectedVersion: 1, decision: 'DECLINE' },
        idempotencyKey,
      }),
    );

    expect(invalidCommand.status).toBe(400);
    await expect(invalidCommand.json()).resolves.toEqual({ error: 'invalid_command' });
    expect(invalidPayload.status).toBe(400);
    await expect(invalidPayload.json()).resolves.toEqual({ error: 'invalid_command_payload' });
    expect(routeMocks.providerApiForSession).not.toHaveBeenCalled();
  });

  it('rejects commands that omit a required resource identifier', async () => {
    const response = await POST(
      commandRequest({
        command: 'send_message',
        payload: { messageBody: 'Nội dung', fileAssetIds: [] },
        idempotencyKey,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_command_payload' });
  });

  it('preserves known API errors and masks unexpected failures', async () => {
    const validRequestBody = {
      command: 'clinic_submit_onboarding',
      payload: { expectedVersion: 1, attestation: 'Tôi xác nhận thông tin này là chính xác.' },
      idempotencyKey,
    };
    routeMocks.providerApiForSession
      .mockRejectedValueOnce(new ProviderApiError(409, 'conflict'))
      .mockRejectedValueOnce(new Error('database connection string'));

    const conflict = await POST(commandRequest(validRequestBody));
    const unavailable = await POST(commandRequest(validRequestBody));

    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({ error: 'conflict' });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: 'service_unavailable' });
  });
});
