import { isIP } from 'node:net';
import { resolve } from 'node:path';

import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const productionSecret = z.string().min(32);
const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional());
const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(4001),
    APP_URL: z.url().default('http://localhost:3000'),
    API_URL: z.url().default('http://localhost:4000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://dental_trust:dental_trust@localhost:5432/dental_trust'),
    DIRECT_DATABASE_URL: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    AUTH_SECRET: z.string().min(32).default('development-only-auth-secret-change-me'),
    AUTH_ISSUER: z.string().min(1).default('dental-trust'),
    AUTH_AUDIENCE: z.string().min(1).default('dental-trust-web'),
    FIELD_ENCRYPTION_KEY: z.string().min(32).default('development-only-field-key-change-me'),
    S3_ENDPOINT: z.url().default('http://localhost:9000'),
    S3_REGION: z.string().min(1).default('ap-southeast-1'),
    S3_BUCKET: z.string().min(3).default('dental-trust-private'),
    S3_ACCESS_KEY: z.string().min(1).default('dental-trust'),
    S3_SECRET_KEY: z.string().min(8).default('dental-trust-development'),
    S3_FORCE_PATH_STYLE: booleanString,
    CLAMAV_HOST: z.string().min(1).default('localhost'),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3310),
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_FROM: z.email().default('care@dentaltrust.local'),
    SMTP_SECURE: booleanString,
    SMTP_USERNAME: optionalString,
    SMTP_PASSWORD: optionalString,
    SMS_PROVIDER_URL: optionalUrl,
    SMS_PROVIDER_TOKEN: optionalString,
    MESSAGING_PROVIDER_URL: optionalUrl,
    MESSAGING_PROVIDER_TOKEN: optionalString,
    PAYMENT_ADAPTER: z.enum(['development', 'stripe']).default('development'),
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    MEETING_ADAPTER: z.enum(['development', 'manual']).default('development'),
    MEETING_ALLOWED_HOSTS: z.string().default(''),
    CALENDAR_ADAPTER: z.enum(['development', 'external']).default('development'),
    CALENDAR_PROVIDER_URL: optionalUrl,
    CALENDAR_PROVIDER_TOKEN: optionalString,
    PRIVACY_EXPORT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),
    PRIVACY_EXPORT_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(5 * 1024 * 1024)
      .max(2_000_000_000)
      .default(512 * 1024 * 1024),
    PASSPORT_PDF_ADAPTER: z.enum(['builtin', 'external']).default('builtin'),
    PASSPORT_PDF_SERVICE_URL: optionalUrl,
    PASSPORT_PDF_SERVICE_TOKEN: optionalString,
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
    ERROR_TRACKING_DSN: optionalUrl,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((environment, context) => {
    const meetingAllowedHosts = environment.MEETING_ALLOWED_HOSTS.split(',')
      .map((host) => host.trim())
      .filter(Boolean);
    if (environment.MEETING_ADAPTER === 'manual' && meetingAllowedHosts.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'The manual meeting adapter requires an explicit provider host allowlist',
        path: ['MEETING_ALLOWED_HOSTS'],
      });
    }
    if (meetingAllowedHosts.some((host) => !isBarePublicHostname(host))) {
      context.addIssue({
        code: 'custom',
        message: 'Meeting provider allowlist entries must be bare public DNS hostnames',
        path: ['MEETING_ALLOWED_HOSTS'],
      });
    }
    if (
      environment.PASSPORT_PDF_ADAPTER === 'external' &&
      (!environment.PASSPORT_PDF_SERVICE_URL || !environment.PASSPORT_PDF_SERVICE_TOKEN)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The external passport PDF adapter requires its HTTPS URL and credential',
        path: ['PASSPORT_PDF_SERVICE_URL'],
      });
    }
    if (
      environment.CALENDAR_ADAPTER === 'external' &&
      (!environment.CALENDAR_PROVIDER_URL || !environment.CALENDAR_PROVIDER_TOKEN)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The external calendar adapter requires its HTTPS URL and credential',
        path: ['CALENDAR_PROVIDER_URL'],
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      (environment.CALENDAR_ADAPTER !== 'external' ||
        !environment.CALENDAR_PROVIDER_URL?.startsWith('https://'))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Production requires an HTTPS external calendar synchronization adapter',
        path: ['CALENDAR_ADAPTER'],
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.PASSPORT_PDF_ADAPTER === 'external' &&
      !environment.PASSPORT_PDF_SERVICE_URL?.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Production passport PDF service must use HTTPS',
        path: ['PASSPORT_PDF_SERVICE_URL'],
      });
    }
    if (environment.NODE_ENV === 'production') {
      for (const [field, value] of [
        ['AUTH_SECRET', environment.AUTH_SECRET],
        ['FIELD_ENCRYPTION_KEY', environment.FIELD_ENCRYPTION_KEY],
      ] as const) {
        const result = productionSecret.safeParse(value);
        if (!result.success || value.includes('development-only')) {
          context.addIssue({
            code: 'custom',
            message: `${field} must be a unique production secret`,
            path: [field],
          });
        }
      }

      if (environment.PAYMENT_ADAPTER !== 'stripe') {
        context.addIssue({
          code: 'custom',
          message: 'Production requires the Stripe payment adapter',
          path: ['PAYMENT_ADAPTER'],
        });
      }

      if (!environment.STRIPE_SECRET_KEY || !environment.STRIPE_WEBHOOK_SECRET) {
        context.addIssue({
          code: 'custom',
          message: 'Production Stripe credentials are required',
          path: ['STRIPE_SECRET_KEY'],
        });
      } else if (!/^(?:sk|rk)_live_/u.test(environment.STRIPE_SECRET_KEY)) {
        context.addIssue({
          code: 'custom',
          message: 'Production requires a Stripe live-mode or restricted live-mode secret key',
          path: ['STRIPE_SECRET_KEY'],
        });
      }

      if (!environment.SMTP_SECURE) {
        context.addIssue({
          code: 'custom',
          message: 'Production SMTP transport must use TLS',
          path: ['SMTP_SECURE'],
        });
      }
      if (!environment.SMTP_USERNAME || !environment.SMTP_PASSWORD) {
        context.addIssue({
          code: 'custom',
          message: 'Production SMTP credentials are required',
          path: ['SMTP_USERNAME'],
        });
      }

      for (const [urlField, tokenField] of [
        ['SMS_PROVIDER_URL', 'SMS_PROVIDER_TOKEN'],
        ['MESSAGING_PROVIDER_URL', 'MESSAGING_PROVIDER_TOKEN'],
      ] as const) {
        const providerUrl = environment[urlField];
        const providerToken = environment[tokenField];
        if ((providerUrl && !providerToken) || (!providerUrl && providerToken)) {
          context.addIssue({
            code: 'custom',
            message: `${urlField} and ${tokenField} must be configured together`,
            path: [urlField],
          });
        }
        if (providerUrl && !providerUrl.startsWith('https://')) {
          context.addIssue({
            code: 'custom',
            message: `${urlField} must use HTTPS in production`,
            path: [urlField],
          });
        }
      }

      if (environment.MEETING_ADAPTER !== 'manual') {
        context.addIssue({
          code: 'custom',
          message: 'Production requires the fail-closed manual meeting adapter',
          path: ['MEETING_ADAPTER'],
        });
      }
      const productionValues: readonly (readonly [
        keyof typeof environment,
        string | number,
        (value: string) => boolean,
      ])[] = [
        ['DATABASE_URL', environment.DATABASE_URL, isDevelopmentEndpoint],
        ['REDIS_URL', environment.REDIS_URL, isDevelopmentEndpoint],
        ['S3_ENDPOINT', environment.S3_ENDPOINT, isDevelopmentEndpoint],
        ['S3_ACCESS_KEY', environment.S3_ACCESS_KEY, isDevelopmentCredential],
        ['S3_SECRET_KEY', environment.S3_SECRET_KEY, isDevelopmentCredential],
        ['SMTP_HOST', environment.SMTP_HOST, isDevelopmentEndpoint],
        ['CLAMAV_HOST', environment.CLAMAV_HOST, isDevelopmentEndpoint],
      ];

      for (const [field, value, isInvalid] of productionValues) {
        if (isInvalid(String(value))) {
          context.addIssue({
            code: 'custom',
            message: `${field} must be explicitly configured for production`,
            path: [field],
          });
        }
      }

      for (const field of ['APP_URL', 'API_URL'] as const) {
        if (!environment[field].startsWith('https://')) {
          context.addIssue({
            code: 'custom',
            message: `${field} must use HTTPS in production`,
            path: [field],
          });
        }
      }

      const invalidCorsOrigin = environment.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .some((origin) => !origin.startsWith('https://'));
      if (invalidCorsOrigin) {
        context.addIssue({
          code: 'custom',
          message: 'Every production CORS origin must use HTTPS',
          path: ['CORS_ORIGINS'],
        });
      }
    }
  });

function isDevelopmentEndpoint(value: string): boolean {
  return /(^|[/@.:])(localhost|127\.0\.0\.1|0\.0\.0\.0)(?:[/.:]|$)/iu.test(value);
}

function isDevelopmentCredential(value: string): boolean {
  return /development|dev-only|dental-trust/iu.test(value);
}

function isBarePublicHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  if (
    hostname.length > 253 ||
    !hostname.includes('.') ||
    hostname.startsWith('.') ||
    hostname.endsWith('.') ||
    isIP(hostname) !== 0 ||
    isDevelopmentEndpoint(hostname)
  ) {
    return false;
  }
  try {
    const parsed = new URL(`https://${hostname}`);
    return (
      parsed.hostname === hostname &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.port === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  environment: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(environment);
}

export function loadWorkspaceEnvironment(): void {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') return;
  const environmentPath = process.env.DENTAL_TRUST_ENV_FILE ?? resolve(process.cwd(), '../../.env');
  try {
    process.loadEnvFile(environmentPath);
  } catch (error) {
    if (!isMissingEnvironmentFile(error)) throw error;
  }
}

function isMissingEnvironmentFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { readonly code?: string }).code === 'ENOENT'
  );
}
