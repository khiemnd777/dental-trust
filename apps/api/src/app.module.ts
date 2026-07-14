import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { ApiExceptionFilter } from './common/http-exception.filter.js';
import { InfrastructureModule } from './common/infrastructure.module.js';
import { RequestContextMiddleware } from './common/request-context.middleware.js';
import { CsrfProtectionMiddleware, NoStoreMiddleware } from './common/security.middleware.js';
import { HealthController } from './health/health.controller.js';
import { FilesModule } from './files/files.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CasesModule } from './cases/cases.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { ClinicalModule } from './clinical/clinical.module.js';
import { PublicModule } from './public/public.module.js';
import { TrustSafetyModule } from './trust-safety/trust-safety.module.js';
import { CollaborationModule } from './collaboration/collaboration.module.js';
import { JourneyModule } from './journey/journey.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { VerificationModule } from './verification/verification.module.js';
import { AdminOperationsModule } from './admin-operations/admin-operations.module.js';
import { ClinicOperationsModule } from './clinic-operations/clinic-operations.module.js';
import { MatchingConciergeModule } from './matching-concierge/matching-concierge.module.js';
import { IntakeModule } from './intake/intake.module.js';
import { AssistantModule } from './assistant/assistant.module.js';

@Module({
  imports: [
    InfrastructureModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AuthModule,
    CasesModule,
    ClinicalModule,
    FilesModule,
    PaymentsModule,
    BookingsModule,
    PublicModule,
    TrustSafetyModule,
    CollaborationModule,
    JourneyModule,
    NotificationsModule,
    VerificationModule,
    AdminOperationsModule,
    ClinicOperationsModule,
    MatchingConciergeModule,
    IntakeModule,
    AssistantModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, NoStoreMiddleware, CsrfProtectionMiddleware)
      .forRoutes('*');
  }
}
