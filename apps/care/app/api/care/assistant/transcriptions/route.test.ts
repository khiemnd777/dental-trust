import { beforeEach, describe, expect, it, vi } from 'vitest';

const { forwardCareFormData } = vi.hoisted(() => ({
  forwardCareFormData: vi.fn(),
}));

vi.mock('@/lib/care-actions', () => ({ forwardCareFormData }));

import { maxAssistantAudioRequestBytes } from '@/lib/assistant-audio';

import { POST } from './route';

function uploadRequest(
  contentLength?: string,
  contentType = 'multipart/form-data; boundary=upload',
) {
  const formData = vi.fn().mockResolvedValue(new FormData());
  return {
    request: {
      headers: new Headers({
        ...(contentLength ? { 'content-length': contentLength } : {}),
        'content-type': contentType,
      }),
      formData,
    } as unknown as Request,
    formData,
  };
}

describe('assistant transcription BFF route', () => {
  beforeEach(() => {
    forwardCareFormData.mockReset();
    forwardCareFormData.mockResolvedValue(new Response(null, { status: 202 }));
  });

  it('rejects missing and oversized lengths without parsing multipart data', async () => {
    const missing = uploadRequest();
    expect((await POST(missing.request)).status).toBe(411);
    expect(missing.formData).not.toHaveBeenCalled();

    const oversized = uploadRequest(String(maxAssistantAudioRequestBytes + 1));
    expect((await POST(oversized.request)).status).toBe(413);
    expect(oversized.formData).not.toHaveBeenCalled();
    expect(forwardCareFormData).not.toHaveBeenCalled();
  });

  it('defers parsing a bounded multipart request to the authenticated forwarder', async () => {
    const bounded = uploadRequest('1024');
    expect((await POST(bounded.request)).status).toBe(202);

    expect(forwardCareFormData).toHaveBeenCalledWith(
      '/assistant/transcriptions',
      expect.any(Function),
      35_000,
    );
    expect(bounded.formData).not.toHaveBeenCalled();
    const readBody = forwardCareFormData.mock.calls[0]?.[1] as () => Promise<FormData>;
    await readBody();
    expect(bounded.formData).toHaveBeenCalledOnce();
  });
});
