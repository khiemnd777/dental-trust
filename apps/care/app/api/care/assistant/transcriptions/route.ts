import { forwardCareFormData } from '@/lib/care-actions';
import { validateAssistantAudioUploadHeaders } from '@/lib/assistant-audio';

export async function POST(request: Request) {
  const error = validateAssistantAudioUploadHeaders(request.headers);
  if (error) {
    const status =
      error === 'length_required'
        ? 411
        : error === 'payload_too_large'
          ? 413
          : error === 'unsupported_media_type'
            ? 415
            : 400;
    return Response.json(
      { error: { code: error.toUpperCase(), message: 'The audio upload was rejected.' } },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  }

  return forwardCareFormData('/assistant/transcriptions', () => request.formData(), 35_000);
}
