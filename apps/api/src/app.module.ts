import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';

import type { ServerEnvironment } from '@dental-trust/config/server';

import { ApiExceptionFilter } from './common/http-exception.filter.js';
import { InfrastructureModule } from './common/infrastructure.module.js';
import { RequestContextMiddleware } from './common/request-context.middleware.js';
import {
  createRateLimitTracker,
  globalNetworkRateLimitKey,
  networkRateLimitTracker,
} from './common/rate-limit-tracker.js';
import { CsrfProtectionMiddleware, NoStoreMiddleware } from './common/security.middleware.js';
import { RATE_LIMIT_STORAGE, SERVER_ENV } from './common/tokens.js';
import { HealthController } from './health/health.controller.js';
import { HealthDependencyProbe } from './health/health-dependency-probe.js';
import { HealthNetworkGuard } from './health/health-network.guard.js';
import { InternalHealthGuard } from './health/internal-health.guard.js';
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
    ThrottlerModule.forRootAsync({
      imports: [InfrastructureModule],
      inject: [RATE_LIMIT_STORAGE, SERVER_ENV],
      useFactory: (storage: ThrottlerStorage, environment: ServerEnvironment) => {
        const tracker = createRateLimitTracker(environment.BFF_CLIENT_CONTEXT_SECRET);
        return {
          storage,
          throttlers: [
            { name: 'default', ttl: 60_000, limit: 120 },
            {
              name: 'network',
              ttl: 60_000,
              limit: environment.RATE_LIMIT_NETWORK_PER_MINUTE,
              getTracker: (request: Record<string, unknown>) =>
                networkRateLimitTracker(request as unknown as Request),
              // This secondary ceiling is deliberately global per ingress IP,
              // not multiplied by controller/handler like the fairness budget.
              generateKey: (_context, suffix, name) => globalNetworkRateLimitKey(suffix, name),
            },
          ],
          getTracker: (request: Record<string, unknown>) => tracker(request as unknown as Request),
        };
      },
    }),
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
    HealthDependencyProbe,
    HealthNetworkGuard,
    InternalHealthGuard,
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
