import {
  apiErrorSchema,
  authSessionSchema,
  caseListQuerySchema,
  createCaseRequestSchema,
  dentalCaseViewSchema,
  loginRequestSchema,
  registerRequestSchema,
  transitionCaseRequestSchema,
  type AuthSession,
  type CaseListQuery,
  type CreateCaseRequest,
  type DentalCaseView,
  type LoginRequest,
  type RegisterRequest,
  type TransitionCaseRequest,
} from '@dental-trust/contracts';
import { z, type ZodType } from 'zod';

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly accessToken?: () => string | undefined | Promise<string | undefined>;
  readonly fetch?: typeof globalThis.fetch;
}

export interface CasePage {
  readonly data: readonly DentalCaseView[];
  readonly nextCursor: string | null;
  readonly count: number;
  readonly requestId: string;
}

export class DentalTrustApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly fieldErrors: Readonly<Record<string, readonly string[]>> | undefined;

  constructor(input: {
    readonly status: number;
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly retryable: boolean;
    readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  }) {
    super(input.message);
    this.name = 'DentalTrustApiError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
    this.retryable = input.retryable;
    this.fieldErrors = input.fieldErrors;
  }
}

const registrationResultSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  emailVerificationRequired: z.boolean(),
});

const casePageSchema = z.object({
  data: z.array(dentalCaseViewSchema),
  page: z.object({ nextCursor: z.uuid().nullable(), count: z.number().int().nonnegative() }),
  requestId: z.string().min(8),
});

export function createDentalTrustApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  const fetcher = options.fetch ?? globalThis.fetch;

  async function request<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
    const token = await options.accessToken?.();
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body) headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);

    const response = await fetcher(`${baseUrl}${path}`, { ...init, headers });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw toApiError(response.status, payload);
    return schema.parse(payload);
  }

  return {
    async register(input: RegisterRequest) {
      const body = registerRequestSchema.parse(input);
      const envelope = await request(
        '/auth/register',
        z.object({ data: registrationResultSchema, requestId: z.string().min(8) }),
        { method: 'POST', body: JSON.stringify(body) },
      );
      return envelope.data;
    },

    async login(input: LoginRequest): Promise<AuthSession> {
      const body = loginRequestSchema.parse(input);
      const envelope = await request(
        '/auth/login',
        z.object({ data: authSessionSchema, requestId: z.string().min(8) }),
        { method: 'POST', body: JSON.stringify(body) },
      );
      return envelope.data;
    },

    async listCases(query: Partial<CaseListQuery> = {}): Promise<CasePage> {
      const parsed = caseListQuerySchema.parse(query);
      const search = new URLSearchParams({ limit: String(parsed.limit) });
      if (parsed.cursor) search.set('cursor', parsed.cursor);
      if (parsed.status) search.set('status', parsed.status);
      const page = await request(`/cases?${search.toString()}`, casePageSchema);
      return {
        data: page.data,
        nextCursor: page.page.nextCursor,
        count: page.page.count,
        requestId: page.requestId,
      };
    },

    async getCase(caseId: string): Promise<DentalCaseView> {
      const id = z.uuid().parse(caseId);
      const envelope = await request(
        `/cases/${encodeURIComponent(id)}`,
        z.object({ data: dentalCaseViewSchema, requestId: z.string().min(8) }),
      );
      return envelope.data;
    },

    async createCase(input: CreateCaseRequest, idempotencyKey: string): Promise<DentalCaseView> {
      const body = createCaseRequestSchema.parse(input);
      const envelope = await request(
        '/cases',
        z.object({ data: dentalCaseViewSchema, requestId: z.string().min(8) }),
        {
          method: 'POST',
          headers: { 'x-idempotency-key': idempotencyKey },
          body: JSON.stringify(body),
        },
      );
      return envelope.data;
    },

    async transitionCase(
      caseId: string,
      input: TransitionCaseRequest,
      idempotencyKey: string,
    ): Promise<DentalCaseView> {
      const id = z.uuid().parse(caseId);
      const body = transitionCaseRequestSchema.parse(input);
      const envelope = await request(
        `/cases/${encodeURIComponent(id)}/transitions`,
        z.object({ data: dentalCaseViewSchema, requestId: z.string().min(8) }),
        {
          method: 'POST',
          headers: { 'x-idempotency-key': idempotencyKey },
          body: JSON.stringify(body),
        },
      );
      return envelope.data;
    },
  };
}

function toApiError(status: number, payload: unknown): DentalTrustApiError {
  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new DentalTrustApiError({
      status,
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      requestId: parsed.data.error.requestId,
      retryable: parsed.data.error.retryable,
      ...(parsed.data.error.fieldErrors ? { fieldErrors: parsed.data.error.fieldErrors } : {}),
    });
  }
  return new DentalTrustApiError({
    status,
    code: 'INVALID_ERROR_RESPONSE',
    message: 'The service returned an invalid error response.',
    requestId: 'request-unknown',
    retryable: status >= 500,
  });
}
