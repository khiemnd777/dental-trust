import { Module } from '@nestjs/common';

import { JourneyController, PassportShareController } from './journey.controller.js';
import { JourneyService } from './journey.service.js';

@Module({
  controllers: [JourneyController, PassportShareController],
  providers: [JourneyService],
})
export class JourneyModule {}
