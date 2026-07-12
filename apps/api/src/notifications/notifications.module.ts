import { Module } from '@nestjs/common';

import { InfrastructureModule } from '../common/infrastructure.module.js';
import {
  NotificationPreferencesController,
  NotificationsController,
} from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
