import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { IntakeController } from './intake.controller.js';
import { IntakeService } from './intake.service.js';

@Module({
  imports: [AuthModule],
  controllers: [IntakeController],
  providers: [IntakeService],
})
export class IntakeModule {}
