import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AuthController } from './auth/auth.controller.js';
import { CasesController } from './cases/cases.controller.js';
import { FilesController } from './files/files.controller.js';
import { PublicController } from './public/public.controller.js';
import { PaymentsController, StripeWebhooksController } from './payments/payments.controller.js';
import { BookingsController } from './bookings/bookings.controller.js';
import {
  AppointmentsController,
  InternalNotesController,
  MessagesController,
  MessageThreadsController,
} from './collaboration/collaboration.controllers.js';

describe('AppModule dependency injection', () => {
  it('boots the full Nest module graph with resolvable controller services', async () => {
    const { AppModule } = await import('./app.module.js');
    const app = await NestFactory.create(AppModule, { logger: false });

    try {
      await app.init();
      expect(app.get(AuthController)).toBeInstanceOf(AuthController);
      expect(app.get(CasesController)).toBeInstanceOf(CasesController);
      expect(app.get(FilesController)).toBeInstanceOf(FilesController);
      expect(app.get(PublicController)).toBeInstanceOf(PublicController);
      expect(app.get(PaymentsController)).toBeInstanceOf(PaymentsController);
      expect(app.get(BookingsController)).toBeInstanceOf(BookingsController);
      expect(app.get(StripeWebhooksController)).toBeInstanceOf(StripeWebhooksController);
      expect(app.get(AppointmentsController)).toBeInstanceOf(AppointmentsController);
      expect(app.get(MessageThreadsController)).toBeInstanceOf(MessageThreadsController);
      expect(app.get(MessagesController)).toBeInstanceOf(MessagesController);
      expect(app.get(InternalNotesController)).toBeInstanceOf(InternalNotesController);
    } finally {
      await app.close();
    }
  });
});
