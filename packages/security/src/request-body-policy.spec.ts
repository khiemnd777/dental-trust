import { describe, expect, it } from 'vitest';

import {
  careAssistantAudioRequestMaxBytes,
  defaultRequestBodyMaxBytes,
  evaluateRequestBodyPolicy,
} from './request-body-policy.js';

describe('request body policy', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('does not require a body length for %s', (method) => {
    expect(
      evaluateRequestBodyPolicy({ method, pathname: '/api/resource', contentLength: null }),
    ).toEqual({ allowed: true, maxBytes: null });
  });

  it('allows an explicitly body-less mutation', () => {
    expect(
      evaluateRequestBodyPolicy({
        method: 'DELETE',
        pathname: '/api/resource',
        contentLength: '0',
      }),
    ).toEqual({ allowed: true, maxBytes: defaultRequestBodyMaxBytes });
  });

  it('requires a declared length for a mutation body', () => {
    expect(
      evaluateRequestBodyPolicy({ method: 'POST', pathname: '/api/resource', contentLength: null }),
    ).toMatchObject({ allowed: false, code: 'LENGTH_REQUIRED', status: 411 });
  });

  it.each(['-1', '+1', '1.5', '01', '1, 2', '9007199254740992'])(
    'rejects invalid Content-Length %s',
    (contentLength) => {
      expect(
        evaluateRequestBodyPolicy({ method: 'POST', pathname: '/', contentLength }),
      ).toMatchObject({ allowed: false, code: 'INVALID_CONTENT_LENGTH', status: 400 });
    },
  );

  it('rejects a default body above 256 KiB', () => {
    expect(
      evaluateRequestBodyPolicy({
        method: 'PATCH',
        pathname: '/api/resource',
        contentLength: String(defaultRequestBodyMaxBytes + 1),
      }),
    ).toMatchObject({ allowed: false, code: 'PAYLOAD_TOO_LARGE', status: 413 });
  });

  it('keeps the bounded care audio exception path-specific', () => {
    expect(
      evaluateRequestBodyPolicy({
        method: 'POST',
        pathname: '/api/care/assistant/transcriptions',
        contentLength: String(careAssistantAudioRequestMaxBytes),
      }),
    ).toEqual({ allowed: true, maxBytes: careAssistantAudioRequestMaxBytes });
    expect(
      evaluateRequestBodyPolicy({
        method: 'POST',
        pathname: '/api/care/assistant',
        contentLength: String(careAssistantAudioRequestMaxBytes),
      }),
    ).toMatchObject({ allowed: false, code: 'PAYLOAD_TOO_LARGE', status: 413 });
  });
});
