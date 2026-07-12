import Stripe from 'stripe';

import type { ServerEnvironment } from '@dental-trust/config/server';

export interface PaymentIntentCommand {
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly currency: 'VND' | 'USD';
  readonly idempotencyKey: string;
}

export interface PaymentIntentResult {
  readonly provider: 'stripe' | 'development';
  readonly providerIntentId: string;
  readonly status:
    'REQUIRES_PAYMENT_METHOD' | 'REQUIRES_ACTION' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  readonly clientSecret?: string;
}

export interface RefundCommand {
  readonly refundId: string;
  readonly providerIntentId: string;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
}

export interface RefundResult {
  readonly providerRefundId: string;
  readonly status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
}

export interface PaymentProvider {
  readonly name: 'stripe' | 'development';
  createIntent(command: PaymentIntentCommand): Promise<PaymentIntentResult>;
  retrieveIntent(providerIntentId: string): Promise<PaymentIntentResult>;
  createRefund(command: RefundCommand): Promise<RefundResult>;
  verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event;
}

export function createPaymentProvider(environment: ServerEnvironment): PaymentProvider {
  if (environment.PAYMENT_ADAPTER === 'stripe') {
    if (!environment.STRIPE_SECRET_KEY || !environment.STRIPE_WEBHOOK_SECRET) {
      throw new Error('Stripe payment configuration is incomplete.');
    }
    return new StripePaymentProvider(
      environment.STRIPE_SECRET_KEY,
      environment.STRIPE_WEBHOOK_SECRET,
    );
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('The development payment adapter is prohibited in production.');
  }
  return new DevelopmentPaymentProvider();
}

class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async retrieveIntent(providerIntentId: string): Promise<PaymentIntentResult> {
    const intent = await this.stripe.paymentIntents.retrieve(providerIntentId);
    return toPaymentIntentResult(intent, this.name);
  }

  async createRefund(command: RefundCommand): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: command.providerIntentId,
        amount: command.amountMinor,
        reason: 'requested_by_customer',
        metadata: { dentalTrustRefundId: command.refundId },
      },
      { idempotencyKey: command.idempotencyKey },
    );
    return {
      providerRefundId: refund.id,
      status: mapStripeRefundStatus(refund.status),
    };
  }

  async createIntent(command: PaymentIntentCommand): Promise<PaymentIntentResult> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: command.amountMinor,
        currency: command.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { dentalTrustPaymentId: command.paymentId },
      },
      { idempotencyKey: command.idempotencyKey },
    );
    return {
      provider: 'stripe',
      providerIntentId: intent.id,
      status: mapStripeStatus(intent.status),
      ...(intent.client_secret ? { clientSecret: intent.client_secret } : {}),
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}

class DevelopmentPaymentProvider implements PaymentProvider {
  readonly name = 'development' as const;

  async createIntent(command: PaymentIntentCommand): Promise<PaymentIntentResult> {
    return {
      provider: 'development',
      providerIntentId: `dev_requires_action_${command.paymentId}`,
      status: 'REQUIRES_ACTION',
    };
  }

  async retrieveIntent(providerIntentId: string): Promise<PaymentIntentResult> {
    return {
      provider: this.name,
      providerIntentId,
      status: 'REQUIRES_ACTION',
    };
  }

  async createRefund(command: RefundCommand): Promise<RefundResult> {
    return {
      providerRefundId: `dev_processing_${command.refundId}`,
      status: 'PROCESSING',
    };
  }

  verifyWebhook(): Stripe.Event {
    throw new Error('Development payment webhooks must use the explicit test harness.');
  }
}

function mapStripeStatus(status: Stripe.PaymentIntent.Status): PaymentIntentResult['status'] {
  if (status === 'succeeded') return 'SUCCEEDED';
  if (status === 'processing') return 'PROCESSING';
  if (status === 'canceled') return 'FAILED';
  if (status === 'requires_payment_method') return 'REQUIRES_PAYMENT_METHOD';
  return 'REQUIRES_ACTION';
}

function mapStripeRefundStatus(status: string | null): RefundResult['status'] {
  if (status === 'succeeded') return 'SUCCEEDED';
  if (status === 'failed' || status === 'canceled') return 'FAILED';
  return 'PROCESSING';
}

function toPaymentIntentResult(
  intent: Stripe.PaymentIntent,
  provider: PaymentIntentResult['provider'],
): PaymentIntentResult {
  return {
    provider,
    providerIntentId: intent.id,
    status: mapStripeStatus(intent.status),
    ...(intent.client_secret ? { clientSecret: intent.client_secret } : {}),
  };
}
