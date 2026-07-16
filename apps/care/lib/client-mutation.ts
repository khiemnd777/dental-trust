export type CareMutationErrorKind =
  | 'authentication'
  | 'permission'
  | 'validation'
  | 'conflict'
  | 'timeout'
  | 'unavailable'
  | 'unexpected';

export interface CareMutationError {
  readonly kind: CareMutationErrorKind;
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
}

export type CareMutationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: CareMutationError };

interface ErrorPayload {
  readonly error?: {
    readonly code?: string;
    readonly retryable?: boolean;
    readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  };
}

export async function careMutation<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 8_000,
): Promise<CareMutationResult<T>> {
  const idempotencyKey = crypto.randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('x-idempotency-key', idempotencyKey);
      const response = await fetch(input, { ...init, headers, signal: controller.signal });
      const payload = (await response.json().catch(() => null)) as
        ({ readonly data?: T } & ErrorPayload) | null;
      if (response.ok && payload && Object.hasOwn(payload, 'data'))
        return { ok: true, data: payload.data as T };
      const retryable =
        payload?.error?.retryable === true || response.status === 502 || response.status === 504;
      if (retryable && attempt === 0) continue;
      return {
        ok: false,
        error: {
          kind: mutationErrorKind(response.status),
          status: response.status,
          code: payload?.error?.code ?? `HTTP_${response.status}`,
          ...(payload?.error?.fieldErrors ? { fieldErrors: payload.error.fieldErrors } : {}),
        },
      };
    } catch (error) {
      if (attempt === 0) continue;
      const timedOut = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        error: {
          kind: timedOut ? 'timeout' : 'unavailable',
          status: timedOut ? 504 : 502,
          code: timedOut ? 'CARE_UPSTREAM_TIMEOUT' : 'CARE_UPSTREAM_UNAVAILABLE',
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    ok: false,
    error: { kind: 'unexpected', status: 500, code: 'CARE_UNEXPECTED_ERROR' },
  };
}

export function careMutationErrorMessage(error: CareMutationError, fallback: string): string {
  if (error.kind === 'authentication') return 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang.';
  if (error.kind === 'permission') return 'Bạn không có quyền thực hiện thao tác này.';
  if (error.kind === 'validation') return 'Thông tin chưa hợp lệ. Hãy kiểm tra lại.';
  if (error.kind === 'conflict') return 'Dữ liệu vừa thay đổi. Hãy tải lại và thử lần nữa.';
  if (error.kind === 'timeout') return 'Kết nối mất quá nhiều thời gian. Vui lòng thử lại.';
  if (error.kind === 'unavailable') return 'Dịch vụ đang tạm gián đoạn. Vui lòng thử lại.';
  return fallback;
}

function mutationErrorKind(status: number): CareMutationErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'authentication';
  if (status === 403) return 'permission';
  if (status === 409) return 'conflict';
  if (status === 504) return 'timeout';
  if (status >= 500) return 'unavailable';
  return 'unexpected';
}
