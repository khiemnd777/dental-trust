'use client';

export type OperationsCommand =
  | 'coordination_update'
  | 'coordination_note'
  | 'verification_assign'
  | 'verification_review_evidence'
  | 'verification_decide'
  | 'verification_second_approve'
  | 'admin_retry_outbox'
  | 'admin_retry_notification'
  | 'admin_change_user_status';

export class OperationsCommandError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'OperationsCommandError';
  }
}

export async function sendOperationsCommand<T = unknown>(input: {
  readonly command: OperationsCommand;
  readonly resourceId: string;
  readonly secondaryId?: string;
  readonly payload: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch('/api/operations/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, idempotencyKey: crypto.randomUUID() }),
  });
  const envelope = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok || envelope.data === undefined) {
    throw new OperationsCommandError(envelope.error ?? 'command_failed');
  }
  return envelope.data;
}

export function commandErrorMessage(error: unknown): string {
  const code = error instanceof OperationsCommandError ? error.code : 'command_failed';
  if (code === 'mfa_required') return 'Cần hoàn tất MFA trước thao tác đặc quyền này.';
  if (code === 'forbidden') return 'Tài khoản hiện tại không có quyền thực hiện thao tác.';
  if (code === 'conflict') return 'Dữ liệu đã thay đổi. Hãy tải lại trước khi tiếp tục.';
  if (code === 'invalid_command_payload') return 'Thông tin chưa hợp lệ hoặc thiếu lý do bắt buộc.';
  return 'Không thể hoàn tất thao tác. Không có thay đổi nào được ghi nhận.';
}
