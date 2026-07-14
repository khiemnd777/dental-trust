import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { AccessContext } from '@dental-trust/auth';
import {
  assistantMessageRequestSchema,
  type AssistantMessageRequest,
} from '@dental-trust/contracts';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AssistantService } from './assistant.service.js';

@Controller('assistant')
@UseGuards(SessionAuthGuard)
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}

  @Post('messages')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async message(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(assistantMessageRequestSchema)) body: AssistantMessageRequest,
  ) {
    return { data: await this.assistant.message(access, body), requestId: access.requestId };
  }
}
