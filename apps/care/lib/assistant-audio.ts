export const supportedRecordingTypes = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
] as const;

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
