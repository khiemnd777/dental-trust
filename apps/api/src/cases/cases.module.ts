import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CasesController } from './cases.controller.js';
import { CasesService } from './cases.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CasesController],
  providers: [CasesService],
})
export class CasesModule {}
