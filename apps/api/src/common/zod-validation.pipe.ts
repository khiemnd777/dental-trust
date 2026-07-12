import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { parseWithSchema } from '@dental-trust/validation';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return parseWithSchema(this.schema, value);
  }
}
