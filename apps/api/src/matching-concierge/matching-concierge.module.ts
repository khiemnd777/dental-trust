import { Module } from '@nestjs/common';

import { ConciergeController, PatientMatchingController } from './matching-concierge.controller.js';
import { MatchingConciergeService } from './matching-concierge.service.js';

@Module({
  controllers: [PatientMatchingController, ConciergeController],
  providers: [MatchingConciergeService],
})
export class MatchingConciergeModule {}
