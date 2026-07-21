import { Global, Module } from '@nestjs/common';

import { parseServerEnvironment } from '@dental-trust/config/server';
import { prisma } from '@dental-trust/database';
import {
  applicationMetrics,
  createErrorReporter,
  createLogger,
  createTraceExporter,
} from '@dental-trust/observability';

import { createPaymentProvider } from '../infrastructure/providers/payment.provider.js';
import { createMeetingProvider } from '../infrastructure/providers/meeting.provider.js';
import { createPayoutProvider } from '../infrastructure/providers/payout.provider.js';
import { createCalendarSyncProvider } from '../infrastructure/providers/calendar-sync.provider.js';
import { createAssistantModelProvider } from '../infrastructure/providers/assistant-model.provider.js';
import { createAssistantAudioProvider } from '../infrastructure/providers/assistant-audio.provider.js';
import {
  ASSISTANT_AUDIO_PROVIDER,
  ASSISTANT_MODEL_PROVIDER,
  CALENDAR_SYNC_PROVIDER,
  ERROR_REPORTER,
  LOGGER,
  MEETING_PROVIDER,
  METRICS,
  PAYMENT_PROVIDER,
  PAYOUT_PROVIDER,
  PRISMA,
  RATE_LIMIT_STORAGE,
  SERVER_ENV,
  TRACE_EXPORTER,
} from './tokens.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

const environment = parseServerEnvironment(process.env);

@Global()
@Module({
  providers: [
    { provide: SERVER_ENV, useValue: environment },
    {
      provide: RATE_LIMIT_STORAGE,
      useFactory: () =>
        new RedisThrottlerStorage(environment.REDIS_URL, environment.RATE_LIMIT_REDIS_PREFIX),
    },
    { provide: PRISMA, useValue: prisma },
    {
      provide: ASSISTANT_MODEL_PROVIDER,
      useFactory: () => createAssistantModelProvider(environment),
    },
    {
      provide: ASSISTANT_AUDIO_PROVIDER,
      useFactory: () => createAssistantAudioProvider(environment),
    },
    { provide: METRICS, useValue: applicationMetrics },
    {
      provide: TRACE_EXPORTER,
      useValue: createTraceExporter(environment.OTEL_EXPORTER_OTLP_ENDPOINT, {
        sampleRate: environment.TRACE_SAMPLE_RATE,
        maxConcurrency: environment.TRACE_MAX_CONCURRENCY,
      }),
    },
    { provide: ERROR_REPORTER, useValue: createErrorReporter(environment.ERROR_TRACKING_DSN) },
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () => createPaymentProvider(environment),
    },
    {
      provide: MEETING_PROVIDER,
      useFactory: () => createMeetingProvider(environment),
    },
    {
      provide: PAYOUT_PROVIDER,
      useFactory: () => createPayoutProvider(environment),
    },
    {
      provide: CALENDAR_SYNC_PROVIDER,
      useFactory: () => createCalendarSyncProvider(environment),
    },
    {
      provide: LOGGER,
      useValue: createLogger({
        service: 'dental-trust-api',
        environment: environment.NODE_ENV,
        ...(process.env.BUILD_VERSION ? { version: process.env.BUILD_VERSION } : {}),
        level: environment.LOG_LEVEL,
      }),
    },
  ],
  exports: [
    SERVER_ENV,
    RATE_LIMIT_STORAGE,
    PRISMA,
    LOGGER,
    METRICS,
    TRACE_EXPORTER,
    ERROR_REPORTER,
    PAYMENT_PROVIDER,
    MEETING_PROVIDER,
    PAYOUT_PROVIDER,
    CALENDAR_SYNC_PROVIDER,
    ASSISTANT_MODEL_PROVIDER,
    ASSISTANT_AUDIO_PROVIDER,
  ],
})
export class InfrastructureModule {}
