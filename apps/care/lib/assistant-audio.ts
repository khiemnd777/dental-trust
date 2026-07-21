export const supportedRecordingTypes = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
] as const;

export const maxAssistantAudioFileBytes = 10 * 1024 * 1024;
// Allows bounded multipart framing around the API's 10 MiB file limit.
export const maxAssistantAudioRequestBytes = maxAssistantAudioFileBytes + 64 * 1024;

export type AssistantAudioUploadHeaderError =
  'length_required' | 'invalid_length' | 'payload_too_large' | 'unsupported_media_type';

export function validateAssistantAudioUploadHeaders(
  headers: Headers,
): AssistantAudioUploadHeaderError | null {
  const rawLength = headers.get('content-length');
  if (!rawLength) return 'length_required';
  if (!/^\d+$/u.test(rawLength)) return 'invalid_length';

  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) return 'invalid_length';
  if (contentLength > maxAssistantAudioRequestBytes) return 'payload_too_large';

  const contentType = headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('multipart/form-data; boundary=')) return 'unsupported_media_type';
  return null;
}

export function preferredRecordingType(isSupported: (type: string) => boolean): string {
  return supportedRecordingTypes.find((type) => isSupported(type)) ?? '';
}

export function extensionFor(contentType: string): string {
  if (contentType.startsWith('audio/mp4')) return 'mp4';
  if (contentType.startsWith('audio/mpeg')) return 'mp3';
  if (contentType.startsWith('audio/wav')) return 'wav';
  if (contentType.startsWith('audio/ogg')) return 'ogg';
  return 'webm';
}
