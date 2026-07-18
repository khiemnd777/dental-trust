#!/usr/bin/env node

const requiredAlways = [
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'REDIS_URL',
  'APP_URL',
  'API_URL',
  'CORS_ORIGINS',
  'AUTH_SECRET',
  'AUTH_ISSUER',
  'AUTH_AUDIENCE',
  'FIELD_ENCRYPTION_KEY',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'CLAMAV_HOST',
  'CLAMAV_PORT',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_FROM',
];

const requiredProduction = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN',
];

const developmentMarkers = ['development-only', 'dev_only', 'replace_me', 'localhost', '.invalid'];

const missing = requiredAlways.filter((name) => !process.env[name]?.trim());
const production = process.env.NODE_ENV === 'production';

if (production) {
  missing.push(...requiredProduction.filter((name) => !process.env[name]?.trim()));
}

const problems = [];

if ((process.env.AUTH_SECRET?.length ?? 0) < 32) {
  problems.push('AUTH_SECRET must contain at least 32 characters');
}

if ((process.env.FIELD_ENCRYPTION_KEY?.length ?? 0) < 32) {
  problems.push('FIELD_ENCRYPTION_KEY must contain at least 32 characters');
}

for (const name of ['APP_URL', 'API_URL', 'DATABASE_URL', 'DIRECT_DATABASE_URL', 'REDIS_URL']) {
  if (!process.env[name]) continue;
  try {
    new URL(process.env[name]);
  } catch {
    problems.push(`${name} must be a valid absolute URL`);
  }
}

if (production) {
  const productionValues = [...requiredAlways, ...requiredProduction].map((name) => [
    name,
    process.env[name] ?? '',
  ]);

  for (const [name, value] of productionValues) {
    if (developmentMarkers.some((marker) => value.toLowerCase().includes(marker))) {
      problems.push(`${name} contains a development placeholder`);
    }
  }

  if (process.env.PAYMENT_ADAPTER !== 'stripe') {
    problems.push('PAYMENT_ADAPTER must be stripe in production');
  }
  if (!/^(?:sk|rk)_live_/u.test(process.env.STRIPE_SECRET_KEY ?? '')) {
    problems.push('STRIPE_SECRET_KEY must be a live Stripe credential in production');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
    problems.push('STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret');
  }
  if (!/^pk\.[A-Za-z0-9._-]{20,}$/u.test(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '')) {
    problems.push('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN must be a Mapbox public browser token');
  }
}

if (missing.length > 0) {
  problems.unshift(`Missing variables: ${[...new Set(missing)].sort().join(', ')}`);
}

if (problems.length > 0) {
  console.error('Environment validation failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`Environment validation passed for ${production ? 'production' : 'non-production'}.`);
