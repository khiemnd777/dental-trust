import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { ClinicOperationsController } from './clinic-operations.controller.js';
import { ClinicOperationsService } from './clinic-operations.service.js';

@Module({
  imports: [AuthModule, VerificationModule],
  controllers: [ClinicOperationsController],
  providers: [ClinicOperationsService],
})
export class ClinicOperationsModule {}
