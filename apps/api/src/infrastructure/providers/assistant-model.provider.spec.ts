import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseServerEnvironment } from '@dental-trust/config/server';

import {
  AssistantModelUnavailableError,
  createAssistantModelProvider,
} from './assistant-model.provider.js';

afterEach(() => vi.unstubAllGlobals());

describe('assistant model provider', () => {
  it('uses non-stored Responses API calls with strict structured output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_test',
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    reply: 'Tôi có thể giúp bạn chuẩn bị yêu cầu.',
                    intent: 'START_CARE_REQUEST',
                    safetyLevel: 'ROUTINE',
                    suggestedAction: 'START_REQUEST',
                    collectedFields: {
                      procedureCode: 'DENTAL_IMPLANT',
                      preferredLocation: 'TP. Hồ Chí Minh',
                      timingPreference: 'ONE_MONTH',
                      decisionPriority: 'TRUST',
                    },
                    missingFields: ['NONE'],
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 30, output_tokens: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createAssistantModelProvider(
      parseServerEnvironment({ NODE_ENV: 'test', OPENAI_API_KEY: 'unit-test-key' }),
    );

    const result = await provider.respond({
      locale: 'vi-VN',
      message: 'Tôi muốn trồng răng trong tháng tới.',
      history: [],
      context: {
        hasCase: false,
        hasAppointment: false,
        hasCheckoutOption: false,
      },
      safetyIdentifier: 'hashed-user-id',
    });

    expect(result.output.suggestedAction).toBe('START_REQUEST');
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.store).toBe(false);
    expect(body.safety_identifier).toBe('hashed-user-id');
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(body.max_output_tokens).toBe(300);
    expect(body.text).toMatchObject({ format: { type: 'json_schema', strict: true } });
  });

  it('fails closed when no credential is configured', async () => {
    const provider = createAssistantModelProvider(parseServerEnvironment({ NODE_ENV: 'test' }));
    await expect(
      provider.respond({
        locale: 'vi-VN',
        message: 'Xin chào',
        history: [],
        context: { hasCase: false, hasAppointment: false, hasCheckoutOption: false },
        safetyIdentifier: 'hashed-user-id',
      }),
    ).rejects.toBeInstanceOf(AssistantModelUnavailableError);
  });
});
