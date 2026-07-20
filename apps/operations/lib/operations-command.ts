'use client';

export type OperationsCommand =
  | 'coordination_assign'
  | 'coordination_update'
  | 'coordination_note'
  | 'coordination_travel_note'
  | 'coordination_communication'
  | 'coordination_recommendations'
  | 'coordination_task_create'
  | 'coordination_task_transition'
  | 'coordination_handoff'
  | 'coordination_handoff_accept'
  | 'coordination_supervisor_review'
  | 'verification_assign'
  | 'verification_review_evidence'
  | 'verification_decide'
  | 'verification_second_approve'
  | 'verification_site_audit_create'
  | 'verification_site_audit_complete'
  | 'verification_corrective_create'
  | 'verification_corrective_respond'
  | 'verification_corrective_decide'
  | 'admin_retry_outbox'
  | 'admin_retry_notification'
  | 'admin_change_user_status'
  | 'admin_change_user_role'
  | 'admin_governance_mutate'
  | 'finance_refund'
  | 'trust_incident_triage'
  | 'trust_incident_close'
  | 'trust_incident_reopen'
  | 'trust_review_report_decide'
  | 'trust_privacy_process'
  | 'trust_privacy_retry'
  | 'trust_support_elevation_create'
  | 'trust_support_elevation_revoke';

export class OperationsCommandError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'OperationsCommandError';
  }
}

const ambiguousCommandKeys = new Map<string, string>();

export async function sendOperationsCommand<T = unknown>(input: {
  readonly command: OperationsCommand;
  readonly resourceId?: string;
  readonly secondaryId?: string;
  readonly payload: Record<string, unknown>;
  readonly idempotencyKey?: string;
}): Promise<T> {
  const { idempotencyKey: explicitKey, ...command } = input;
  const signature = JSON.stringify(command);
  const idempotencyKey = explicitKey ?? ambiguousCommandKeys.get(signature) ?? crypto.randomUUID();
  ambiguousCommandKeys.set(signature, idempotencyKey);
  let response: Response;
  try {
    response = await fetch('/api/operations/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...command, idempotencyKey }),
    });
  } catch {
    throw new OperationsCommandError('service_unavailable');
  }
  const envelope = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok || envelope.data === undefined) {
    if (response.status < 500) ambiguousCommandKeys.delete(signature);
    throw new OperationsCommandError(envelope.error ?? 'command_failed');
  }
  ambiguousCommandKeys.delete(signature);
  return envelope.data;
}

export function commandErrorMessage(error: unknown): string {
  const code = error instanceof OperationsCommandError ? error.code : 'command_failed';
  const normalized = code.toUpperCase();
  if (['MFA_REQUIRED', 'MFA_VERIFICATION_REQUIRED'].includes(normalized))
    return 'Cần hoàn tất MFA trước thao tác đặc quyền này.';
  if (['FORBIDDEN', 'AUTHORIZATION_DENIED'].includes(normalized))
    return 'Tài khoản hiện tại không có quyền thực hiện thao tác.';
  if (['CONFLICT', 'OPTIMISTIC_CONCURRENCY_FAILURE', 'VERSION_CONFLICT'].includes(normalized))
    return 'Dữ liệu đã thay đổi. Hãy tải lại trước khi tiếp tục.';
  if (['INVALID_COMMAND_PAYLOAD', 'VALIDATION_FAILED'].includes(normalized))
    return 'Thông tin chưa hợp lệ hoặc thiếu lý do bắt buộc.';
  if (['SERVICE_UNAVAILABLE', 'OPERATIONS_API_UNAVAILABLE'].includes(normalized))
    return 'Dịch vụ đang gián đoạn. Có thể thử lại an toàn mà không lặp thao tác.';
  return 'Không thể hoàn tất thao tác. Không có thay đổi nào được ghi nhận.';
}
