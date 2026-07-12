import { describe, expect, it } from 'vitest';

import type { ServerEnvironment } from '@dental-trust/config/server';

import { createPayoutProvider } from './payout.provider.js';

describe('clinic payout provider boundary', () => {
  it('fails closed when production Stripe Connect credentials are absent', () => {
    expect(() =>
      createPayoutProvider(
        environment({ NODE_ENV: 'production', PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: '' }),
      ),
    ).toThrow('configuration is missing');
  });

  it('never permits the development adapter in production', () => {
    expect(() =>
      createPayoutProvider(environment({ NODE_ENV: 'production', PAYMENT_ADAPTER: 'development' })),
    ).toThrow('prohibited in production');
  });

  it('uses a visibly local onboarding result only outside production', async () => {
    const provider = createPayoutProvider(environment());
    await expect(
      provider.createOnboardingSession({
        clinicId: 'clinic-a',
        returnUrl: 'http://localhost:3000/en/clinic/onboarding',
        refreshUrl: 'http://localhost:3000/en/clinic/onboarding',
        idempotencyKey: 'operation-a',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'development',
        accountId: 'dev_connect_clinic-a',
        status: 'ACTIVE',
      }),
    );
  });

  it('rejects payout return URLs outside the configured application origin', async () => {
    const provider = createPayoutProvider(environment());
    await expect(
      provider.createOnboardingSession({
        clinicId: 'clinic-a',
        returnUrl: 'https://evil.example/return',
        refreshUrl: 'http://localhost:3000/en/clinic/onboarding',
        idempotencyKey: 'operation-a',
      }),
    ).rejects.toThrow('configured application origin');
  });
});

function environment(overrides: Partial<ServerEnvironment> = {}): ServerEnvironment {
  return {
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:3000',
    PAYMENT_ADAPTER: 'development',
    ...overrides,
  } as ServerEnvironment;
}
