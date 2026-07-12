import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PaymentsController, StripeWebhooksController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, StripeWebhooksController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
