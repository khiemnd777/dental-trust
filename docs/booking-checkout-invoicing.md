# Booking checkout, invoices, and receipts

Checkout is anchored to one `TreatmentPlanAcceptance`, not merely to a case or the latest plan. The accepted plan must still be published, unexpired, checksummed, and owned by the authenticated patient. A unique database constraint allows one booking for that acceptance.

Before confirmation, `GET /bookings/checkout-options` returns the server-calculated deposit and bilingual cancellation policy. `POST /bookings/checkout` requires the preview's deposit basis points and policy version. If either changed, checkout rejects with `BOOKING_CHECKOUT_PREVIEW_STALE` so the patient must review current terms.

The booking transaction snapshots:

- accepted plan total and currency (`VND` or `USD`);
- deposit basis points and calculated minor-unit amount;
- clinic scheduling-policy version, cutoff, terms version, and Vietnamese/English display text;
- an issued deposit invoice.

The default deposit is 20%. A non-secret integer system configuration named `booking.deposit-percent` may set 1–100%. Calculations use integer minor units and round up; the client never supplies an amount or currency.

## Ledger and lifecycle

`Payment` and `Refund` remain the only payment ledger. `Invoice` and `Receipt` are document projections and cannot introduce independent charges.

1. Checkout creates `Booking(PENDING_DEPOSIT)` and `Invoice(ISSUED)` atomically with audit and outbox evidence.
2. The existing `PaymentsService` reserves one idempotent payment row and calls the configured provider.
3. Only signed provider webhook evidence can settle the payment.
4. A PostgreSQL trigger confirms the booking, marks the invoice paid, and issues one receipt in the same transaction as `Payment(SUCCEEDED)`.
5. Successful partial/full refunds change the existing payment status; the same trigger projects the invoice and receipt to `PARTIALLY_REFUNDED` or `REFUNDED`.

A failed provider intent can be retried through `POST /payments/deposit-intents/recover`. Recovery is patient-scoped, idempotent, and optimistic: it clears only the failed provider binding, advances the same `Payment` aggregate back to `REQUIRES_PAYMENT_METHOD`, records audit/outbox evidence, and creates a fresh provider attempt. Amount, currency, booking, and ledger identity cannot change.

Booking, invoice, receipt, payment, and refund monetary identities are immutable. Booking cancellation/completion uses expected versions. Database checks reject invalid state transitions and cross-booking document/payment links. Repository queries scope patients by case ownership and clinics by the selected organization.

## Provider configuration

Local and automated test environments may use `PAYMENT_ADAPTER=development`. Production startup rejects that adapter and requires Stripe live credentials and a webhook secret. The web checkout additionally requires `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; if it is absent, the Payment Element stops safely before card entry.

Stripe card fields are mounted from Stripe.js and submitted directly to Stripe. DENTAL TRUST receives only provider identifiers, status evidence, and reconciled amounts. Raw card data must never be logged or stored.

Required production settings include:

```text
PAYMENT_ADAPTER=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

The content-security policy permits only Stripe's script, API, and payment frames in addition to existing application origins.
