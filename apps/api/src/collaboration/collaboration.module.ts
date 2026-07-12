import { Module } from '@nestjs/common';

import {
  AppointmentsController,
  InternalNotesController,
  MessagesController,
  MessageThreadsController,
} from './collaboration.controllers.js';
import { CollaborationService } from './collaboration.service.js';

@Module({
  controllers: [
    AppointmentsController,
    MessageThreadsController,
    MessagesController,
    InternalNotesController,
  ],
  providers: [CollaborationService],
})
export class CollaborationModule {}
