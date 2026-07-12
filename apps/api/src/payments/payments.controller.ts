import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  createDepositIntentRequestSchema,
  type CreateDepositIntentRequest,
  idempotencyKeySchema,
  paymentListQuerySchema,
  type PaymentListQuery,
  recoverDepositIntentRequestSchema,
  type RecoverDepositIntentRequest,
  requestRefundRequestSchema,
  type RequestRefundRequest,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import type { AuthenticatedRequest } from '../common/http.js';
import { requestIdOf } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PaymentsService } from './payments.service.js';

const uuidSchema = z.uuid();

@Controller('payments')
@UseGuards(SessionAuthGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post('deposit-intents')
  async createDepositIntent(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createDepositIntentRequestSchema))
    body: CreateDepositIntentRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    const idempotencyKey = parseWithSchema(idempotencyKeySchema, rawIdempotencyKey);
    return {
      data: await this.payments.createDepositIntent(access, body.bookingId, idempotencyKey),
      requestId: access.requestId,
    };
  }

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(paymentListQuerySchema)) query: PaymentListQuery,
  ) {
    const page = await this.payments.list(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Post('deposit-intents/recover')
  async recoverDepositIntent(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(recoverDepositIntentRequestSchema))
    body: RecoverDepositIntentRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    const idempotencyKey = parseWithSchema(idempotencyKeySchema, rawIdempotencyKey);
    return {
      data: await this.payments.recoverDepositIntent(access, body, idempotencyKey),
      requestId: access.requestId,
    };
  }

  @Post(':paymentId/refunds')
  async requestRefund(
    @CurrentAccess() access: AccessContext,
    @Param('paymentId', new ZodValidationPipe(uuidSchema)) paymentId: string,
    @Body(new ZodValidationPipe(requestRefundRequestSchema)) body: RequestRefundRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    const idempotencyKey = parseWithSchema(idempotencyKeySchema, rawIdempotencyKey);
    return {
      data: await this.payments.requestRefund(access, paymentId, body, idempotencyKey),
      requestId: access.requestId,
    };
  }
}

@Controller('payments/webhooks/stripe')
export class StripeWebhooksController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post()
  async receive(
    @Req() request: RawBodyRequest<Request> & AuthenticatedRequest,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!signature || !request.rawBody) {
      throw new BadRequestException('A raw signed Stripe webhook body is required.');
    }
    return this.payments.handleStripeWebhook(request.rawBody, signature, requestIdOf(request));
  }
}
