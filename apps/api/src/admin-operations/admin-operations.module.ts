import { Module } from '@nestjs/common';

import { InfrastructureModule } from '../common/infrastructure.module.js';
import { AdminOperationsController } from './admin-operations.controller.js';
import { AdminOperationsService } from './admin-operations.service.js';
import { AdminDirectoryController } from './admin-directory.controller.js';
import { AdminDirectoryService } from './admin-directory.service.js';
import { AdminGovernanceController } from './admin-governance.controller.js';
import { AdminGovernanceService } from './admin-governance.service.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [AdminOperationsController, AdminDirectoryController, AdminGovernanceController],
  providers: [AdminOperationsService, AdminDirectoryService, AdminGovernanceService],
})
export class AdminOperationsModule {}
