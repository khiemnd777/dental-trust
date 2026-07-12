import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  contactIdempotencyKeySchema,
  contactRequestSchema,
  clinicDiscoveryQuerySchema,
  type ContactRequest,
  type ClinicDiscoveryQuery,
  publicDentistParamsSchema,
  type PublicDentistParams,
  publicDirectoryQuerySchema,
  type PublicDirectoryQuery,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import type { AuthenticatedRequest } from '../common/http.js';
import { requestIdOf } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PublicService } from './public.service.js';

@Controller()
export class PublicController {
  constructor(@Inject(PublicService) private readonly publicService: PublicService) {}

  @Get('public/clinics')
  async clinics(
    @Query(new ZodValidationPipe(clinicDiscoveryQuerySchema)) query: ClinicDiscoveryQuery,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const page = await this.publicService.clinics(query);
    return {
      data: page.items,
      page: { nextCursor: page.nextCursor, count: page.items.length },
      requestId: requestIdOf(request),
    };
  }

  @Get('public/dentists')
  async dentists(
    @Query(new ZodValidationPipe(publicDirectoryQuerySchema)) query: PublicDirectoryQuery,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const page = await this.publicService.dentists(query);
    return {
      data: page.items,
      page: { nextCursor: page.nextCursor, count: page.items.length },
      requestId: requestIdOf(request),
    };
  }

  @Get('public/clinics/:slug')
  async clinic(
    @Param(new ZodValidationPipe(publicDentistParamsSchema)) params: PublicDentistParams,
    @Query('locale', new ZodValidationPipe(publicDirectoryQuerySchema.shape.locale))
    locale: 'vi-VN' | 'en-US',
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    return {
      data: await this.publicService.clinic(params.slug, locale),
      requestId: requestIdOf(request),
    };
  }

  @Get('public/dentists/:slug')
  async dentist(
    @Param(new ZodValidationPipe(publicDentistParamsSchema)) params: PublicDentistParams,
    @Query('locale', new ZodValidationPipe(publicDirectoryQuerySchema.shape.locale))
    locale: 'vi-VN' | 'en-US',
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    return {
      data: await this.publicService.dentist(params.slug, locale),
      requestId: requestIdOf(request),
    };
  }

  @Post('contact')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async contact(
    @Body(new ZodValidationPipe(contactRequestSchema)) body: ContactRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const requestId = requestIdOf(request);
    const idempotencyKey = parseWithSchema(contactIdempotencyKeySchema, rawIdempotencyKey);
    return {
      data: await this.publicService.contact(body, idempotencyKey, requestId),
      requestId,
    };
  }
}
