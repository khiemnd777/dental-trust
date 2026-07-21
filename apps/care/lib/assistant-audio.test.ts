import { describe, expect, it, vi } from 'vitest';

import {
  extensionFor,
  maxAssistantAudioRequestBytes,
  preferredRecordingType,
  validateAssistantAudioUploadHeaders,
} from './assistant-audio';

describe('assistant audio compatibility', () => {
  it('prefers the Edge-compatible Opus recording format', () => {
    const isSupported = vi.fn((type: string) => type.startsWith('audio/webm'));

    expect(preferredRecordingType(isSupported)).toBe('audio/webm;codecs=opus');
  });

  it('falls back to the browser default when no preferred type is supported', () => {
    expect(preferredRecordingType(() => false)).toBe('');
  });

  it('uses an upload extension that matches the recorded content type', () => {
    expect(extensionFor('audio/mp4')).toBe('mp4');
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
  });

  it('requires a bounded multipart request before parsing audio', () => {
    expect(validateAssistantAudioUploadHeaders(new Headers())).toBe('length_required');
    expect(
      validateAssistantAudioUploadHeaders(
        new Headers({
          'content-length': String(maxAssistantAudioRequestBytes + 1),
          'content-type': 'multipart/form-data; boundary=upload',
        }),
      ),
    ).toBe('payload_too_large');
    expect(
      validateAssistantAudioUploadHeaders(
        new Headers({ 'content-length': '512', 'content-type': 'application/json' }),
      ),
    ).toBe('unsupported_media_type');
    expect(
      validateAssistantAudioUploadHeaders(
        new Headers({
          'content-length': '512',
          'content-type': 'multipart/form-data; boundary=upload',
        }),
      ),
    ).toBeNull();
  });
});
