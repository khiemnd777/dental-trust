'use client';

export type ProviderCommand =
  | 'clinic_case_decision'
  | 'clinic_assign_dentist'
  | 'create_appointment'
  | 'create_message_thread'
  | 'send_message'
  | 'create_treatment_plan'
  | 'publish_treatment_plan'
  | 'clinic_create_availability_rule'
  | 'clinic_create_availability_block'
  | 'clinic_update_scheduling_policy'
  | 'clinic_invite_team'
  | 'clinic_publish_service'
  | 'clinic_archive_service'
  | 'clinic_update_profile'
  | 'clinic_submit_onboarding';

export class ProviderCommandError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProviderCommandError';
  }
}

export async function sendProviderCommand<T = unknown>(input: {
  readonly command: ProviderCommand;
  readonly resourceId?: string;
  readonly secondaryId?: string;
  readonly payload: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch('/api/provider/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, idempotencyKey: crypto.randomUUID() }),
  });
  const envelope = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok || envelope.data === undefined) {
    throw new ProviderCommandError(envelope.error ?? 'command_failed');
  }
  return envelope.data;
}

export function commandErrorMessage(error: unknown): string {
  const code = error instanceof ProviderCommandError ? error.code : 'command_failed';
  if (code === 'mfa_required') return 'Bạn cần hoàn tất MFA trước khi thực hiện thao tác này.';
  if (code === 'forbidden') return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.';
  if (code === 'conflict') return 'Dữ liệu đã thay đổi. Hãy tải lại và thử lại.';
  if (code === 'invalid_command_payload') return 'Một số thông tin chưa hợp lệ. Hãy kiểm tra lại.';
  return 'Không thể hoàn tất thao tác. Dữ liệu trên máy chủ chưa bị thay đổi.';
}
