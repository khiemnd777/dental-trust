import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  bookingCheckoutRequestSchema,
  bookingListQuerySchema,
  cancelBookingRequestSchema,
  completeBookingRequestSchema,
  idempotencyKeySchema,
  type BookingCheckoutRequest,
  type BookingListQuery,
  type CancelBookingRequest,
  type CompleteBookingRequest,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BookingsService } from './bookings.service.js';

const uuidSchema = z.uuid();

@Controller('bookings')
@UseGuards(SessionAuthGuard)
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Get('checkout-options')
  async checkoutOptions(@CurrentAccess() access: AccessContext) {
    return { data: await this.bookings.checkoutOptions(access), requestId: access.requestId };
  }

  @Post('checkout')
  async checkout(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(bookingCheckoutRequestSchema)) body: BookingCheckoutRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return { data: await this.bookings.checkout(access, body, key), requestId: access.requestId };
  }

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(bookingListQuerySchema)) query: BookingListQuery,
  ) {
    const page = await this.bookings.list(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Get(':bookingId')
  async get(
    @CurrentAccess() access: AccessContext,
    @Param('bookingId', new ZodValidationPipe(uuidSchema)) bookingId: string,
  ) {
    return { data: await this.bookings.get(access, bookingId), requestId: access.requestId };
  }

  @Post(':bookingId/cancel')
  async cancel(
    @CurrentAccess() access: AccessContext,
    @Param('bookingId', new ZodValidationPipe(uuidSchema)) bookingId: string,
    @Body(new ZodValidationPipe(cancelBookingRequestSchema)) body: CancelBookingRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.bookings.cancel(access, bookingId, body, key),
      requestId: access.requestId,
    };
  }

  @Post(':bookingId/complete')
  async complete(
    @CurrentAccess() access: AccessContext,
    @Param('bookingId', new ZodValidationPipe(uuidSchema)) bookingId: string,
    @Body(new ZodValidationPipe(completeBookingRequestSchema)) body: CompleteBookingRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.bookings.complete(access, bookingId, body, key),
      requestId: access.requestId,
    };
  }
}
