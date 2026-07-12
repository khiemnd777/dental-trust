import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { TrustSafetyController } from './trust-safety.controller.js';
import { TrustSafetyService } from './trust-safety.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TrustSafetyController],
  providers: [TrustSafetyService],
})
export class TrustSafetyModule {}
