import { careAssistantAudioRequestMaxBytes } from '@dental-trust/security';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from '@/proxy';

function post(pathname: string, contentLength: number) {
  return proxy(
    new NextRequest(`http://localhost:3000${pathname}`, {
      method: 'POST',
      headers: { 'content-length': String(contentLength) },
    }),
  );
}

describe('care request body proxy', () => {
  it('allows the bounded audio route exception through to route-level media validation', () => {
    const response = post('/api/care/assistant/transcriptions', careAssistantAudioRequestMaxBytes);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('does not apply the audio allowance to another care route', async () => {
    const response = post('/api/care/assistant', careAssistantAudioRequestMaxBytes);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
  });
});
