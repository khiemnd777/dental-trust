import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';

import type { AccessContext } from '@dental-trust/auth';
import {
  assistantLocaleSchema,
  assistantMessageRequestSchema,
  assistantSpeechRequestSchema,
  type AssistantLocale,
  type AssistantMessageRequest,
  type AssistantSpeechRequest,
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

  @Post('transcriptions')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 10 * 1024 * 1024 } }))
  async transcription(
    @CurrentAccess() access: AccessContext,
    @UploadedFile() file: UploadedAudioFile | undefined,
    @Body('locale') localeValue: unknown,
  ) {
    if (!file) throw new BadRequestException('Vui lòng cung cấp bản ghi âm.');
    const locale = parseLocale(localeValue);
    return {
      data: await this.assistant.transcribe(
        access,
        {
          bytes: file.buffer,
          contentType: file.mimetype,
          filename: safeAudioFilename(file.originalname, file.mimetype),
        },
        locale,
      ),
      requestId: access.requestId,
    };
  }

  @Post('speech')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async speech(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(assistantSpeechRequestSchema)) body: AssistantSpeechRequest,
  ) {
    const audio = await this.assistant.speech(access, body);
    return new StreamableFile(audio, {
      type: 'audio/mpeg',
      length: audio.byteLength,
      disposition: 'inline; filename="dental-trust-ai.mp3"',
    });
  }
}

interface UploadedAudioFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly originalname: string;
}

function parseLocale(value: unknown): AssistantLocale {
  const result = assistantLocaleSchema.safeParse(value ?? 'vi-VN');
  if (!result.success) throw new BadRequestException('Ngôn ngữ không được hỗ trợ.');
  return result.data;
}

function safeAudioFilename(filename: string, contentType: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/gu, '-').slice(-120);
  if (sanitized) return sanitized;
  return contentType.startsWith('audio/mp4') ? 'voice.mp4' : 'voice.webm';
}
