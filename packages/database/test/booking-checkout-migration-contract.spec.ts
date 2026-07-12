import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/202607120006_booking_checkout_invoicing/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const receiptProjectionCorrection = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/202607120010_unique_receipt_projection/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('booking checkout and billing migration', () => {
  it('binds one patient acceptance and immutable money/policy snapshots', () => {
    expect(migration).toContain('bookings_treatment_plan_acceptance_id_key');
    expect(migration).toContain('booking must bind the patient exact treatment-plan acceptance');
    expect(migration).toContain(
      'booking money must be server-derived from the accepted plan snapshot',
    );
    expect(migration).toContain('booking checkout identity and snapshots are immutable');
  });

  it('enforces optimistic booking transitions and exact invoice/payment identity', () => {
    expect(migration).toContain('booking status transitions require optimistic version increment');
    expect(migration).toContain('invoice payment must belong to the same booking and amount');
    expect(migration).toContain(
      'billing document transitions require optimistic version increment',
    );
  });

  it('projects documents from the existing payment ledger instead of creating another ledger', () => {
    expect(migration).toContain('CREATE TRIGGER "payment_document_projection"');
    expect(migration).toContain('CREATE TABLE "invoices"');
    expect(migration).toContain('CREATE TABLE "receipts"');
    expect(migration).not.toContain('CREATE TABLE "payment_ledger"');
    expect(migration).toContain(
      "NEW.\"status\" NOT IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')",
    );
  });

  it('projects collision-resistant receipt numbers from the complete payment identifier', () => {
    expect(receiptProjectionCorrection).toContain(`upper(replace(NEW."id"::text, '-', ''))`);
    expect(receiptProjectionCorrection).not.toContain(
      `substr(replace(NEW."id"::text, '-', ''), 1, 16)`,
    );
  });

  it('permits only an audited optimistic reset of a failed provider intent', () => {
    expect(migration).toContain('OLD."status" = \'FAILED\'');
    expect(migration).toContain('NEW."status" = \'REQUIRES_PAYMENT_METHOD\'');
    expect(migration).toContain('NEW."version" = OLD."version" + 1');
    expect(migration).toContain('NEW."provider_payment_intent_id" IS NULL');
  });
});
