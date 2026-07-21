export const defaultRequestBodyMaxBytes = 256 * 1024;
export const careAssistantAudioRequestMaxBytes = 10 * 1024 * 1024 + 64 * 1024;

const bodyMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const careAssistantAudioPath = /^\/api\/care\/assistant\/transcriptions\/?$/u;

export interface RequestBodyPolicyRejection {
  readonly allowed: false;
  readonly code: 'LENGTH_REQUIRED' | 'INVALID_CONTENT_LENGTH' | 'PAYLOAD_TOO_LARGE';
  readonly status: 400 | 411 | 413;
  readonly maxBytes: number;
}

export type RequestBodyPolicyDecision =
  | {
      readonly allowed: true;
      readonly maxBytes: number | null;
    }
  | RequestBodyPolicyRejection;

export function requestBodyMaxBytes(pathname: string): number {
  return careAssistantAudioPath.test(pathname)
    ? careAssistantAudioRequestMaxBytes
    : defaultRequestBodyMaxBytes;
}

/**
 * Validates body metadata without consuming the request stream. This is intended
 * for a reverse-proxy/middleware boundary, before a route handler can buffer the
 * body with json(), text(), or formData().
 */
export function evaluateRequestBodyPolicy(input: {
  readonly method: string;
  readonly pathname: string;
  readonly contentLength: string | null;
}): RequestBodyPolicyDecision {
  if (!bodyMethods.has(input.method.toUpperCase())) {
    return { allowed: true, maxBytes: null };
  }

  const maxBytes = requestBodyMaxBytes(input.pathname);
  if (input.contentLength === null || input.contentLength === '') {
    return { allowed: false, code: 'LENGTH_REQUIRED', status: 411, maxBytes };
  }
  if (!/^(?:0|[1-9]\d*)$/u.test(input.contentLength)) {
    return { allowed: false, code: 'INVALID_CONTENT_LENGTH', status: 400, maxBytes };
  }

  const contentLength = Number(input.contentLength);
  if (!Number.isSafeInteger(contentLength)) {
    return { allowed: false, code: 'INVALID_CONTENT_LENGTH', status: 400, maxBytes };
  }
  if (contentLength > maxBytes) {
    return { allowed: false, code: 'PAYLOAD_TOO_LARGE', status: 413, maxBytes };
  }

  return { allowed: true, maxBytes };
}
