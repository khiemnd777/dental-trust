import Stripe from 'stripe';

import type { ServerEnvironment } from '@dental-trust/config/server';

export interface PayoutOnboardingCommand {
  readonly clinicId: string;
  readonly existingAccountId?: string;
  readonly returnUrl: string;
  readonly refreshUrl: string;
  readonly idempotencyKey: string;
}

export interface PayoutOnboardingResult {
  readonly provider: 'stripe-connect' | 'development';
  readonly accountId: string;
  readonly onboardingUrl: string;
  readonly expiresAt: Date;
  readonly status: 'INCOMPLETE' | 'PENDING_REVIEW' | 'ACTIVE' | 'RESTRICTED';
}

export interface PayoutAccountStatus {
  readonly provider: 'stripe-connect' | 'development';
  readonly accountId: string;
  readonly status: 'INCOMPLETE' | 'PENDING_REVIEW' | 'ACTIVE' | 'RESTRICTED';
}

export interface PayoutProvider {
  createOnboardingSession(command: PayoutOnboardingCommand): Promise<PayoutOnboardingResult>;
  retrieveAccount(accountId: string): Promise<PayoutAccountStatus>;
}

export function createPayoutProvider(environment: ServerEnvironment): PayoutProvider {
  if (environment.PAYMENT_ADAPTER === 'stripe') {
    if (!environment.STRIPE_SECRET_KEY) throw new Error('Stripe Connect configuration is missing.');
    return new StripeConnectPayoutProvider(environment.STRIPE_SECRET_KEY, environment.APP_URL);
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('The development payout adapter is prohibited in production.');
  }
  return new DevelopmentPayoutProvider(environment.APP_URL);
}

class StripeConnectPayoutProvider implements PayoutProvider {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly applicationUrl: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createOnboardingSession(command: PayoutOnboardingCommand): Promise<PayoutOnboardingResult> {
    assertApplicationReturnUrl(command.returnUrl, this.applicationUrl);
    assertApplicationReturnUrl(command.refreshUrl, this.applicationUrl);
    const accountId =
      command.existingAccountId ??
      (
        await this.stripe.accounts.create(
          {
            type: 'express',
            capabilities: { transfers: { requested: true } },
            metadata: { dentalTrustClinicId: command.clinicId },
          },
          { idempotencyKey: `${command.idempotencyKey}:account` },
        )
      ).id;
    const link = await this.stripe.accountLinks.create(
      {
        account: accountId,
        refresh_url: command.refreshUrl,
        return_url: command.returnUrl,
        type: 'account_onboarding',
      },
      { idempotencyKey: `${command.idempotencyKey}:link` },
    );
    const status = await this.retrieveAccount(accountId);
    return {
      provider: 'stripe-connect',
      accountId,
      onboardingUrl: link.url,
      expiresAt: new Date(link.expires_at * 1_000),
      status: status.status,
    };
  }

  async retrieveAccount(accountId: string): Promise<PayoutAccountStatus> {
    const account = await this.stripe.accounts.retrieve(accountId);
    let status: PayoutAccountStatus['status'];
    if (account.charges_enabled && account.payouts_enabled) status = 'ACTIVE';
    else if (account.requirements?.disabled_reason) status = 'RESTRICTED';
    else if (account.details_submitted) status = 'PENDING_REVIEW';
    else status = 'INCOMPLETE';
    return { provider: 'stripe-connect', accountId, status };
  }
}

class DevelopmentPayoutProvider implements PayoutProvider {
  constructor(private readonly applicationUrl: string) {}

  async createOnboardingSession(command: PayoutOnboardingCommand): Promise<PayoutOnboardingResult> {
    assertApplicationReturnUrl(command.returnUrl, this.applicationUrl);
    assertApplicationReturnUrl(command.refreshUrl, this.applicationUrl);
    const accountId = command.existingAccountId ?? `dev_connect_${command.clinicId}`;
    return {
      provider: 'development',
      accountId,
      onboardingUrl: new URL(
        '/clinic/onboarding?developmentPayout=1',
        this.applicationUrl,
      ).toString(),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      status: 'ACTIVE',
    };
  }

  async retrieveAccount(accountId: string): Promise<PayoutAccountStatus> {
    return { provider: 'development', accountId, status: 'ACTIVE' };
  }
}

function assertApplicationReturnUrl(candidate: string, applicationUrl: string): void {
  const expected = new URL(applicationUrl);
  const actual = new URL(candidate);
  if (actual.origin !== expected.origin || actual.username || actual.password || actual.hash) {
    throw new Error('Payout onboarding return URLs must use the configured application origin.');
  }
}
