import { type z, type ZodType } from 'zod';

export interface ValidationFailure {
  readonly code: 'VALIDATION_ERROR';
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}

export class RequestValidationError extends Error {
  readonly failure: ValidationFailure;

  constructor(error: z.ZodError) {
    super('The request did not pass validation.');
    this.name = 'RequestValidationError';
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.length > 0 ? issue.path.join('.') : '$';
      fieldErrors[key] ??= [];
      fieldErrors[key].push(issue.message);
    }
    this.failure = { code: 'VALIDATION_ERROR', fieldErrors };
  }
}

export function parseWithSchema<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RequestValidationError(result.error);
  return result.data;
}
