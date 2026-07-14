import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseServerEnvironment } from '@dental-trust/config/server';

import {
  AssistantAudioUnavailableError,
  createAssistantAudioProvider,
  inferAssistantLocale,
} from './assistant-audio.provider.js';

afterEach(() => vi.unstubAllGlobals());

describe('assistant audio provider', () => {
  it('transcribes bounded audio without exposing the API key in the client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'Tôi muốn đặt lịch khám Implant.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createAssistantAudioProvider(
      parseServerEnvironment({ NODE_ENV: 'test', OPENAI_API_KEY: 'unit-test-key' }),
    );

    const text = await provider.transcribe(
      {
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'audio/webm',
        filename: 'voice.webm',
      },
      'vi-VN',
    );

    expect(text).toBe('Tôi muốn đặt lịch khám Implant.');
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/audio/transcriptions')).toBe(true);
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get('model')).toBe('gpt-4o-mini-transcribe');
    expect(request.headers).toEqual({ authorization: 'Bearer unit-test-key' });
  });

  it('generates an MP3 with the configured server-side voice', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createAssistantAudioProvider(
      parseServerEnvironment({ NODE_ENV: 'test', OPENAI_API_KEY: 'unit-test-key' }),
    );

    await expect(provider.synthesize('Xin chào bác.', 'vi-VN')).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      response_format: 'mp3',
    });
  });

  it('detects Vietnamese and English transcripts with a safe fallback', () => {
    expect(inferAssistantLocale('Tôi bị đau răng và muốn đặt lịch khám.', 'en-US')).toBe('vi-VN');
    expect(inferAssistantLocale('I want to book a dental appointment.', 'vi-VN')).toBe('en-US');
    expect(inferAssistantLocale('Implant', 'vi-VN')).toBe('vi-VN');
  });

  it('fails closed when no credential is configured', async () => {
    const provider = createAssistantAudioProvider(parseServerEnvironment({ NODE_ENV: 'test' }));
    await expect(
      provider.transcribe(
        { bytes: new Uint8Array([1]), contentType: 'audio/webm', filename: 'voice.webm' },
        'vi-VN',
      ),
    ).rejects.toBeInstanceOf(AssistantAudioUnavailableError);
  });
});
