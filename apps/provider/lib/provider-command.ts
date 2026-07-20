'use client';

export type ProviderCommand =
  | 'clinic_case_decision'
  | 'clinic_assign_dentist'
  | 'create_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'record_appointment_attendance'
  | 'create_message_thread'
  | 'send_message'
  | 'mark_message_read'
  | 'create_internal_note'
  | 'incident_clinic_response'
  | 'incident_internal_note'
  | 'create_treatment_plan'
  | 'publish_treatment_plan'
  | 'complete_journey_milestone'
  | 'create_treatment_instruction'
  | 'create_plan_change'
  | 'create_passport_draft'
  | 'publish_passport'
  | 'clinic_create_availability_rule'
  | 'clinic_create_availability_block'
  | 'clinic_update_scheduling_policy'
  | 'clinic_invite_team'
  | 'clinic_upsert_location'
  | 'clinic_add_dentist'
  | 'clinic_update_dentist'
  | 'clinic_update_team_access'
  | 'clinic_suspend_team_member'
  | 'clinic_remove_team_member'
  | 'clinic_connect_calendar'
  | 'clinic_sync_calendar'
  | 'clinic_disconnect_calendar'
  | 'clinic_publish_service'
  | 'clinic_archive_service'
  | 'clinic_update_profile'
  | 'clinic_begin_payout'
  | 'clinic_refresh_payout'
  | 'clinic_submit_onboarding';

export class ProviderCommandError extends Error {
  constructor(
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'ProviderCommandError';
  }
}

const retryKeys = new Map<string, { readonly key: string; readonly createdAt: number }>();
const retryWindowMs = 24 * 60 * 60_000;
const retryStoragePrefix = 'provider-command-retry-v2:';

export async function sendProviderCommand<T = unknown>(input: {
  readonly command: ProviderCommand;
  readonly resourceId?: string;
  readonly secondaryId?: string;
  readonly payload: Record<string, unknown>;
}): Promise<T> {
  const fingerprint = JSON.stringify(input);
  const idempotencyKey = retryKeyFor(fingerprint);
  let response: Response;
  try {
    response = await fetch('/api/provider/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, idempotencyKey }),
    });
  } catch (error) {
    throw new ProviderCommandError('command_result_unknown', { cause: error });
  }
  const envelope = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok || envelope.data === undefined) {
    if (response.status < 500) clearRetryKey(fingerprint);
    throw new ProviderCommandError(
      response.status >= 500 ? 'command_result_unknown' : (envelope.error ?? 'command_failed'),
    );
  }
  clearRetryKey(fingerprint);
  return envelope.data;
}

export function commandErrorMessage(error: unknown): string {
  const code = error instanceof ProviderCommandError ? error.code : 'command_failed';
  if (['mfa_required', 'MFA_REQUIRED'].includes(code)) {
    return 'Bạn cần hoàn tất MFA trước khi thực hiện thao tác này.';
  }
  if (['forbidden', 'FORBIDDEN', 'AUTHORIZATION_DENIED'].includes(code)) {
    return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.';
  }
  if (['conflict', 'CONFLICT', 'OPTIMISTIC_CONCURRENCY_FAILURE'].includes(code)) {
    return 'Dữ liệu đã thay đổi. Hãy tải lại và thử lại.';
  }
  if (['invalid_command_payload', 'VALIDATION_ERROR'].includes(code)) {
    return 'Một số thông tin chưa hợp lệ. Hãy kiểm tra lại.';
  }
  if (code === 'command_result_unknown') {
    return 'Chưa xác nhận được kết quả. Khi thử lại, hệ thống sẽ dùng cùng mã thao tác để tránh tạo trùng.';
  }
  return 'Không thể hoàn tất thao tác. Hãy kiểm tra dữ liệu mới nhất trước khi thử lại.';
}

function retryKeyFor(fingerprint: string): string {
  const now = Date.now();
  for (const [candidate, entry] of retryKeys) {
    if (now - entry.createdAt > retryWindowMs) retryKeys.delete(candidate);
  }
  pruneStoredRetryKeys(now);
  const existing = retryKeys.get(fingerprint);
  if (existing) return existing.key;
  const stored = readStoredRetryKey(fingerprint, now);
  if (stored) {
    retryKeys.set(fingerprint, stored);
    return stored.key;
  }
  const key = crypto.randomUUID();
  const entry = { key, createdAt: now };
  retryKeys.set(fingerprint, entry);
  writeStoredRetryKey(fingerprint, entry);
  return key;
}

function pruneStoredRetryKeys(now: number): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key?.startsWith(retryStoragePrefix)) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as { createdAt?: unknown };
        if (typeof value.createdAt !== 'number' || now - value.createdAt > retryWindowMs) {
          storage.removeItem(key);
        }
      } catch {
        storage.removeItem(key);
      }
    }
  } catch {
    // Storage cleanup is best-effort in hardened browser contexts.
  }
}

function clearRetryKey(fingerprint: string): void {
  retryKeys.delete(fingerprint);
  try {
    globalThis.localStorage?.removeItem(storageKey(fingerprint));
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
  }
}

function readStoredRetryKey(
  fingerprint: string,
  now: number,
): { readonly key: string; readonly createdAt: number } | null {
  try {
    const key = storageKey(fingerprint);
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as { key?: unknown; createdAt?: unknown };
    if (
      typeof value.key !== 'string' ||
      typeof value.createdAt !== 'number' ||
      now - value.createdAt > retryWindowMs
    ) {
      globalThis.localStorage?.removeItem(key);
      return null;
    }
    return { key: value.key, createdAt: value.createdAt };
  } catch {
    return null;
  }
}

function writeStoredRetryKey(
  fingerprint: string,
  entry: { readonly key: string; readonly createdAt: number },
): void {
  try {
    globalThis.localStorage?.setItem(storageKey(fingerprint), JSON.stringify(entry));
  } catch {
    // The in-memory key still protects retries during the current page lifetime.
  }
}

function storageKey(fingerprint: string): string {
  return `${retryStoragePrefix}${fingerprintHash(fingerprint)}`;
}

// Store only a deterministic digest-like key, never command payloads that may contain PHI.
function fingerprintHash(value: string): string {
  return [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((seed) => {
      let hash = seed;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    })
    .join('');
}
