export type AssistantFailureKind =
  'SESSION_EXPIRED' | 'RATE_LIMITED' | 'TIMEOUT' | 'UNAVAILABLE' | 'FAILED';

interface ApiErrorEnvelope {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly requestId?: string;
  };
}

export class AssistantRequestError extends Error {
  constructor(
    readonly kind: AssistantFailureKind,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(kind);
    this.name = 'AssistantRequestError';
  }
}

export async function fetchAssistant(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (response.ok) return response;
    throw await responseError(response);
  } catch (error) {
    if (error instanceof AssistantRequestError) throw error;
    if (controller.signal.aborted || isAbortError(error)) {
      throw new AssistantRequestError('TIMEOUT');
    }
    throw new AssistantRequestError('UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

async function responseError(response: Response): Promise<AssistantRequestError> {
  const envelope = await readErrorEnvelope(response);
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'AUTHENTICATION_REQUIRED') {
    return new AssistantRequestError('SESSION_EXPIRED', response.status, requestId);
  }
  if (response.status === 429 || code === 'RATE_LIMITED') {
    return new AssistantRequestError('RATE_LIMITED', response.status, requestId);
  }
  if (response.status === 504 || code === 'CARE_UPSTREAM_TIMEOUT') {
    return new AssistantRequestError('TIMEOUT', response.status, requestId);
  }
  if (
    response.status === 502 ||
    response.status === 503 ||
    code === 'PROVIDER_UNAVAILABLE' ||
    code === 'CARE_UPSTREAM_UNAVAILABLE'
  ) {
    return new AssistantRequestError('UNAVAILABLE', response.status, requestId);
  }
  return new AssistantRequestError('FAILED', response.status, requestId);
}

async function readErrorEnvelope(response: Response): Promise<ApiErrorEnvelope | undefined> {
  if (!response.headers.get('content-type')?.includes('application/json')) return undefined;
  try {
    return (await response.json()) as ApiErrorEnvelope;
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
