import { describe, expect, it, vi } from 'vitest';

import { extensionFor, preferredRecordingType } from './assistant-audio';

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
});
