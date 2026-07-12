import { Module } from '@nestjs/common';

import {
  AftercareController,
  CaregiversController,
  CaseDocumentsController,
  TreatmentPlansController,
} from './clinical.controllers.js';
import { ClinicalService } from './clinical.service.js';

@Module({
  controllers: [
    CaregiversController,
    TreatmentPlansController,
    AftercareController,
    CaseDocumentsController,
  ],
  providers: [ClinicalService],
})
export class ClinicalModule {}
