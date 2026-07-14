import { describe, expect, it } from 'vitest';

import { parseServerEnvironment } from '../src/server.js';

describe('server environment', () => {
  it('uses safe local provider defaults in development', () => {
    const environment = parseServerEnvironment({
      NODE_ENV: 'development',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      ERROR_TRACKING_DSN: '',
    });

    expect(environment.PAYMENT_ADAPTER).toBe('development');
    expect(environment.MEETING_ADAPTER).toBe('development');
    expect(environment.PASSPORT_PDF_ADAPTER).toBe('builtin');
    expect(environment.S3_FORCE_PATH_STYLE).toBe(false);
    expect(environment.SMTP_SECURE).toBe(false);
    expect(environment.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(environment.OPENAI_MODEL).toBe('gpt-5.6-luna');
  });

  it('fails closed when an external passport renderer is incomplete', () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: 'development',
        PASSPORT_PDF_ADAPTER: 'external',
        PASSPORT_PDF_SERVICE_URL: 'https://pdf.example',
      }),
    ).toThrow();
  });

  it('rejects unsafe meeting provider allowlist entries', () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: 'development',
        MEETING_ADAPTER: 'manual',
        MEETING_ALLOWED_HOSTS: 'https://meet.example.com,localhost',
      }),
    ).toThrow();
  });

  it('rejects development credentials and adapters in production', () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: 'production',
        PAYMENT_ADAPTER: 'development',
      }),
    ).toThrow();
  });

  it('accepts a configured production payment adapter', () => {
    const environment = parseServerEnvironment({
      NODE_ENV: 'production',
      AUTH_SECRET: 'a-production-auth-secret-with-ample-entropy',
      FIELD_ENCRYPTION_KEY: 'a-production-field-key-with-ample-entropy',
      APP_URL: 'https://dentaltrust.example',
      API_URL: 'https://api.dentaltrust.example',
      CORS_ORIGINS: 'https://dentaltrust.example',
      DATABASE_URL: 'postgresql://app:secret@postgres.internal:5432/dental_trust',
      REDIS_URL: 'rediss://redis.internal:6379',
      S3_ENDPOINT: 'https://objects.example',
      S3_ACCESS_KEY: 'production-object-access',
      S3_SECRET_KEY: 'production-object-secret',
      SMTP_HOST: 'smtp.example',
      SMTP_SECURE: 'true',
      SMTP_USERNAME: 'smtp-production-user',
      SMTP_PASSWORD: 'smtp-production-password',
      CLAMAV_HOST: 'clamav.internal',
      PAYMENT_ADAPTER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_live_configured-externally',
      STRIPE_WEBHOOK_SECRET: 'whsec_configured-externally',
      MEETING_ADAPTER: 'manual',
      MEETING_ALLOWED_HOSTS: 'meet.dentaltrust.example',
      CALENDAR_ADAPTER: 'external',
      CALENDAR_PROVIDER_URL: 'https://calendar-sync.dentaltrust.example',
      CALENDAR_PROVIDER_TOKEN: 'calendar-provider-production-token',
      OPENAI_API_KEY: 'sk-proj-production-configured',
    });

    expect(environment.PAYMENT_ADAPTER).toBe('stripe');
    expect(environment.MEETING_ADAPTER).toBe('manual');
    expect(environment.CALENDAR_ADAPTER).toBe('external');
    expect(environment.SMTP_SECURE).toBe(true);
  });

  it('requires an AI provider credential in production', () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: 'production',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      }),
    ).toThrow();
  });

  it('rejects partially configured optional messaging providers in production', () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: 'production',
        SMS_PROVIDER_URL: 'https://sms.example',
      }),
    ).toThrow();
  });

  it('rejects local provider endpoints in production', () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: 'production',
        AUTH_SECRET: 'a-production-auth-secret-with-ample-entropy',
        FIELD_ENCRYPTION_KEY: 'a-production-field-key-with-ample-entropy',
        PAYMENT_ADAPTER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_configured-externally',
        STRIPE_WEBHOOK_SECRET: 'whsec_configured-externally',
      }),
    ).toThrow();
  });

  it('rejects Stripe test-mode keys in production', () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: 'production',
        AUTH_SECRET: 'a-production-auth-secret-with-ample-entropy',
        FIELD_ENCRYPTION_KEY: 'a-production-field-key-with-ample-entropy',
        APP_URL: 'https://dentaltrust.example',
        API_URL: 'https://api.dentaltrust.example',
        CORS_ORIGINS: 'https://dentaltrust.example',
        DATABASE_URL: 'postgresql://app:secret@postgres.internal:5432/dental_trust',
        REDIS_URL: 'rediss://redis.internal:6379',
        S3_ENDPOINT: 'https://objects.example',
        S3_ACCESS_KEY: 'production-object-access',
        S3_SECRET_KEY: 'production-object-secret',
        SMTP_HOST: 'smtp.example',
        CLAMAV_HOST: 'clamav.internal',
        PAYMENT_ADAPTER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test_not-valid-in-production',
        STRIPE_WEBHOOK_SECRET: 'whsec_configured-externally',
      }),
    ).toThrow();
  });
});
