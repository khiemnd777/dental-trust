import type { ServerEnvironment } from '@dental-trust/config/server';
import type { AssistantLocale } from '@dental-trust/contracts';

export interface AssistantAudioInput {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly filename: string;
}

export interface AssistantAudioProvider {
  transcribe(input: AssistantAudioInput, localeHint: AssistantLocale): Promise<string>;
  synthesize(text: string, locale: AssistantLocale): Promise<Buffer>;
}

export class AssistantAudioUnavailableError extends Error {
  constructor(message = 'The AI audio service is not configured or temporarily unavailable.') {
    super(message);
    this.name = 'AssistantAudioUnavailableError';
  }
}

export function createAssistantAudioProvider(
  environment: ServerEnvironment,
): AssistantAudioProvider {
  if (!environment.OPENAI_API_KEY) {
    return {
      transcribe: () => Promise.reject(new AssistantAudioUnavailableError()),
      synthesize: () => Promise.reject(new AssistantAudioUnavailableError()),
    };
  }
  return new OpenAiAssistantAudioProvider(environment);
}

class OpenAiAssistantAudioProvider implements AssistantAudioProvider {
  constructor(private readonly environment: ServerEnvironment) {}

  async transcribe(input: AssistantAudioInput, localeHint: AssistantLocale): Promise<string> {
    const form = new FormData();
    const audioBuffer = new ArrayBuffer(input.bytes.byteLength);
    new Uint8Array(audioBuffer).set(input.bytes);
    form.append('file', new Blob([audioBuffer], { type: input.contentType }), input.filename);
    form.append('model', this.environment.OPENAI_TRANSCRIPTION_MODEL);
    form.append('response_format', 'json');
    form.append('prompt', transcriptionPrompt(localeHint));

    let response: Response;
    try {
      response = await fetch(
        `${this.environment.OPENAI_BASE_URL.replace(/\/$/u, '')}/audio/transcriptions`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${this.environment.OPENAI_API_KEY}` },
          body: form,
          signal: AbortSignal.timeout(this.environment.OPENAI_AUDIO_TIMEOUT_MS),
        },
      );
    } catch {
      throw new AssistantAudioUnavailableError();
    }

    if (!response.ok) throw new AssistantAudioUnavailableError();
    const payload = (await response.json()) as { readonly text?: unknown };
    if (typeof payload.text !== 'string' || !payload.text.trim()) {
      throw new AssistantAudioUnavailableError('The transcription service returned no text.');
    }
    return payload.text.trim();
  }

  async synthesize(text: string, locale: AssistantLocale): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(
        `${this.environment.OPENAI_BASE_URL.replace(/\/$/u, '')}/audio/speech`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.environment.OPENAI_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.environment.OPENAI_TTS_MODEL,
            voice: this.environment.OPENAI_TTS_VOICE,
            input: text,
            instructions: speechInstructions(locale),
            response_format: 'mp3',
          }),
          signal: AbortSignal.timeout(this.environment.OPENAI_AUDIO_TIMEOUT_MS),
        },
      );
    } catch {
      throw new AssistantAudioUnavailableError();
    }

    if (!response.ok) throw new AssistantAudioUnavailableError();
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new AssistantAudioUnavailableError('The speech service returned no audio.');
    }
    return Buffer.from(bytes);
  }
}

export function inferAssistantLocale(
  transcript: string,
  fallback: AssistantLocale,
): AssistantLocale {
  const normalized = transcript.toLocaleLowerCase('en-US');
  const tokens = normalized.match(/[\p{L}]+/gu) ?? [];
  const vietnameseWords = new Set([
    'bác',
    'bị',
    'có',
    'đau',
    'được',
    'khám',
    'không',
    'làm',
    'lịch',
    'muốn',
    'răng',
    'tôi',
    'và',
  ]);
  const englishWords = new Set([
    'appointment',
    'book',
    'can',
    'dental',
    'dentist',
    'help',
    'pain',
    'tooth',
    'want',
    'when',
  ]);
  let vietnameseScore = /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/iu.test(normalized) ? 2 : 0;
  let englishScore = 0;
  for (const token of tokens) {
    if (vietnameseWords.has(token)) vietnameseScore += 1;
    if (englishWords.has(token)) englishScore += 1;
  }
  if (vietnameseScore > englishScore) return 'vi-VN';
  if (englishScore > vietnameseScore) return 'en-US';
  return fallback;
}

function transcriptionPrompt(localeHint: AssistantLocale): string {
  const dentalTerms =
    'Dental Trust, nha khoa, Implant, trồng răng, mão răng, niềng răng, veneer, consultation, appointment.';
  return localeHint === 'vi-VN'
    ? `Cuộc trò chuyện nha khoa bằng tiếng Việt hoặc tiếng Anh. Viết đúng dấu câu và các thuật ngữ: ${dentalTerms}`
    : `A dental-care conversation in English or Vietnamese. Use clear punctuation and preserve these terms: ${dentalTerms}`;
}

function speechInstructions(locale: AssistantLocale): string {
  return locale === 'vi-VN'
    ? 'Nói tiếng Việt rõ ràng, ấm áp, chậm rãi và tự nhiên như một điều phối viên chăm sóc đang hỗ trợ người lớn tuổi. Ngắt câu rõ, không đọc quá nhanh.'
    : 'Speak clear, warm English at a calm, slightly slower pace for an older adult. Use natural pauses and do not sound rushed.';
}
