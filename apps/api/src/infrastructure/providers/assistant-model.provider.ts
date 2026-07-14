import type { ServerEnvironment } from '@dental-trust/config/server';
import { assistantModelOutputSchema, type AssistantModelOutput } from '@dental-trust/contracts';

export interface AssistantHistoryItem {
  readonly role: 'USER' | 'ASSISTANT';
  readonly content: string;
}

export interface AssistantModelInput {
  readonly locale: 'vi-VN' | 'en-US';
  readonly message: string;
  readonly history: readonly AssistantHistoryItem[];
  readonly context: {
    readonly hasCase: boolean;
    readonly stage?: string;
    readonly caseStatus?: string;
    readonly hasAppointment: boolean;
    readonly hasCheckoutOption: boolean;
  };
  readonly safetyIdentifier: string;
}

export interface AssistantModelResult {
  readonly output: AssistantModelOutput;
  readonly responseId: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface AssistantModelProvider {
  readonly model: string;
  respond(input: AssistantModelInput): Promise<AssistantModelResult>;
}

export class AssistantModelUnavailableError extends Error {
  constructor(message = 'The AI assistant model is not configured or temporarily unavailable.') {
    super(message);
    this.name = 'AssistantModelUnavailableError';
  }
}

export function createAssistantModelProvider(
  environment: ServerEnvironment,
): AssistantModelProvider {
  if (!environment.OPENAI_API_KEY) {
    return {
      model: environment.OPENAI_MODEL,
      respond: () => Promise.reject(new AssistantModelUnavailableError()),
    };
  }
  return new OpenAiAssistantModelProvider(environment);
}

class OpenAiAssistantModelProvider implements AssistantModelProvider {
  readonly model: string;

  constructor(private readonly environment: ServerEnvironment) {
    this.model = environment.OPENAI_MODEL;
  }

  async respond(input: AssistantModelInput): Promise<AssistantModelResult> {
    let response: Response;
    try {
      response = await fetch(`${this.environment.OPENAI_BASE_URL.replace(/\/$/u, '')}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.environment.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          instructions: systemInstructions(input.locale),
          input: [
            ...input.history.map((item) => ({
              role: item.role === 'USER' ? 'user' : 'assistant',
              content: item.content,
            })),
            {
              role: 'user',
              content: JSON.stringify({
                message: input.message,
                journeyContext: input.context,
              }),
            },
          ],
          reasoning: { effort: 'none' },
          max_output_tokens: 300,
          safety_identifier: input.safetyIdentifier,
          text: {
            verbosity: 'low',
            format: {
              type: 'json_schema',
              name: 'care_assistant_response',
              strict: true,
              schema: assistantOutputJsonSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(this.environment.OPENAI_TIMEOUT_MS),
      });
    } catch {
      throw new AssistantModelUnavailableError();
    }

    if (!response.ok) throw new AssistantModelUnavailableError();

    const payload = (await response.json()) as OpenAiResponsePayload;
    const outputText = payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === 'output_text')?.text;
    if (!outputText) throw new AssistantModelUnavailableError('The AI assistant returned no text.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new AssistantModelUnavailableError(
        'The AI assistant returned invalid structured data.',
      );
    }
    const output = assistantModelOutputSchema.safeParse(parsed);
    if (!output.success) {
      throw new AssistantModelUnavailableError('The AI assistant response failed validation.');
    }
    return {
      output: output.data,
      responseId: payload.id,
      ...(payload.usage?.input_tokens === undefined
        ? {}
        : { inputTokens: payload.usage.input_tokens }),
      ...(payload.usage?.output_tokens === undefined
        ? {}
        : { outputTokens: payload.usage.output_tokens }),
    };
  }
}

interface OpenAiResponsePayload {
  readonly id: string;
  readonly output?: readonly {
    readonly content?: readonly { readonly type: string; readonly text?: string }[];
  }[];
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
}

function systemInstructions(locale: 'vi-VN' | 'en-US'): string {
  const language = locale === 'vi-VN' ? 'Vietnamese' : 'English';
  return `You are Dental Trust Care Guide. Reply in ${language} with calm, plain language and keep the reply under 90 words. You provide general navigation and education, never diagnosis, prescriptions, guarantees, rankings, prices not present in context, or emergency treatment. Ask at most one useful follow-up question. Never claim to have booked, contacted, paid, or changed data. Suggested actions must reflect the supplied journey context. Use HUMAN_SUPPORT when the user requests a person or the situation is ambiguous. Return only the requested structured output.`;
}

const nullableProcedure = [
  'DENTAL_IMPLANT',
  'CROWN',
  'ORTHODONTICS',
  'VENEER',
  'GENERAL_CONSULTATION',
  null,
] as const;

const assistantOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'reply',
    'intent',
    'safetyLevel',
    'suggestedAction',
    'collectedFields',
    'missingFields',
  ],
  properties: {
    reply: { type: 'string' },
    intent: {
      type: 'string',
      enum: [
        'GENERAL_GUIDANCE',
        'START_CARE_REQUEST',
        'MATCHING_HELP',
        'CONSULTATION_BOOKING',
        'TREATMENT_PLAN',
        'TREATMENT_BOOKING',
        'HUMAN_SUPPORT',
        'OTHER',
      ],
    },
    safetyLevel: { type: 'string', enum: ['ROUTINE', 'ATTENTION', 'URGENT'] },
    suggestedAction: {
      type: 'string',
      enum: [
        'NONE',
        'START_REQUEST',
        'COMPLETE_INTAKE',
        'VIEW_MATCHES',
        'REQUEST_CONSULTATION',
        'REVIEW_PLAN',
        'OPEN_BOOKING',
        'VIEW_JOURNEY',
        'HUMAN_SUPPORT',
        'EMERGENCY_CARE',
      ],
    },
    collectedFields: {
      type: 'object',
      additionalProperties: false,
      required: ['procedureCode', 'preferredLocation', 'timingPreference', 'decisionPriority'],
      properties: {
        procedureCode: { enum: nullableProcedure },
        preferredLocation: { type: ['string', 'null'] },
        timingPreference: { enum: ['FLEXIBLE', 'ONE_MONTH', 'THREE_MONTHS', null] },
        decisionPriority: { enum: ['TRUST', 'COST', 'TIME', 'AFTERCARE', null] },
      },
    },
    missingFields: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['PROCEDURE', 'LOCATION', 'TIMING', 'PRIORITY', 'MEDICAL_CONTEXT', 'NONE'],
      },
    },
  },
} as const;
