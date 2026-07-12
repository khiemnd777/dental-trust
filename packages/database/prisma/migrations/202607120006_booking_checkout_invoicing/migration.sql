-- Booking checkout binds one immutable treatment-plan acceptance to a server-priced
-- deposit. Payment/refund tables remain the ledger; invoices and receipts are
-- document projections maintained from that ledger in the same transaction.
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOID');
CREATE TYPE "ReceiptStatus" AS ENUM ('ISSUED', 'PARTIALLY_REFUNDED', 'REFUNDED');

ALTER TABLE "bookings"
  ADD COLUMN "treatment_plan_acceptance_id" UUID,
  ADD COLUMN "plan_total_minor" BIGINT,
  ADD COLUMN "deposit_basis_points" INTEGER,
  ADD COLUMN "cancellation_policy_snapshot" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "completed_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_reason" TEXT;

UPDATE "bookings" b
SET
  "treatment_plan_acceptance_id" = (
    SELECT acceptance."id"
    FROM "treatment_plan_acceptances" acceptance
    JOIN "dental_cases" dental_case ON dental_case."id" = b."case_id"
    JOIN "patient_profiles" patient ON patient."id" = dental_case."patient_profile_id"
    WHERE acceptance."treatment_plan_version_id" = b."treatment_plan_version_id"
      AND acceptance."user_id" = patient."user_id"
    ORDER BY acceptance."accepted_at" ASC
    LIMIT 1
  ),
  "plan_total_minor" = plan."total_minor",
  "deposit_basis_points" = LEAST(
    10000,
    GREATEST(1, ROUND((b."deposit_minor"::numeric * 10000) / plan."total_minor")::integer)
  ),
  "cancellation_policy_snapshot" = jsonb_build_object(
    'policyVersion', COALESCE(policy."version", 0),
    'cancellationCutoffMinutes', COALESCE(policy."cancellation_cutoff_minutes", 1440),
    'termsVersion', '2026-07-12',
    'source', CASE WHEN policy."id" IS NULL THEN 'PLATFORM_DEFAULT' ELSE 'CLINIC_POLICY' END,
    'display', jsonb_build_object(
      'vi-VN', 'Yêu cầu hủy hoặc đổi lịch theo chính sách được lưu tại thời điểm đặt chỗ.',
      'en-US', 'Cancellation or rescheduling follows the policy captured when the booking was placed.'
    )
  ),
  "confirmed_at" = CASE WHEN b."status" IN ('CONFIRMED', 'COMPLETED') THEN b."updated_at" ELSE NULL END,
  "cancelled_at" = CASE WHEN b."status" = 'CANCELLED' THEN b."updated_at" ELSE NULL END,
  "completed_at" = CASE WHEN b."status" = 'COMPLETED' THEN b."updated_at" ELSE NULL END
FROM "treatment_plan_versions" plan
JOIN "treatment_plans" treatment_plan ON treatment_plan."id" = plan."treatment_plan_id"
LEFT JOIN "clinic_scheduling_policies" policy ON policy."clinic_id" = treatment_plan."clinic_id"
WHERE plan."id" = b."treatment_plan_version_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "bookings"
    WHERE "treatment_plan_acceptance_id" IS NULL
      OR "plan_total_minor" IS NULL
      OR "deposit_basis_points" IS NULL
      OR "cancellation_policy_snapshot" IS NULL
      OR "deposit_minor" <> CEIL(("plan_total_minor"::numeric * "deposit_basis_points") / 10000)::bigint
  ) THEN
    RAISE EXCEPTION 'legacy bookings must have an explicit patient treatment-plan acceptance before migration 006';
  END IF;
END;
$$;

ALTER TABLE "bookings"
  ALTER COLUMN "treatment_plan_acceptance_id" SET NOT NULL,
  ALTER COLUMN "plan_total_minor" SET NOT NULL,
  ALTER COLUMN "deposit_basis_points" SET NOT NULL,
  ALTER COLUMN "cancellation_policy_snapshot" SET NOT NULL;

CREATE UNIQUE INDEX "bookings_treatment_plan_acceptance_id_key"
  ON "bookings"("treatment_plan_acceptance_id");
CREATE INDEX "bookings_status_updated_at_idx" ON "bookings"("status", "updated_at");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_treatment_plan_acceptance_id_fkey"
  FOREIGN KEY ("treatment_plan_acceptance_id") REFERENCES "treatment_plan_acceptances"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "invoices" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "payment_id" UUID,
  "invoice_number" VARCHAR(80) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "amount_minor" BIGINT NOT NULL,
  "currency" "Currency" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMPTZ(6),
  "voided_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receipts" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "receipt_number" VARCHAR(80) NOT NULL,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'ISSUED',
  "amount_minor" BIGINT NOT NULL,
  "currency" "Currency" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_booking_id_key" ON "invoices"("booking_id");
CREATE UNIQUE INDEX "invoices_payment_id_key" ON "invoices"("payment_id");
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
CREATE INDEX "invoices_status_issued_at_idx" ON "invoices"("status", "issued_at");
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");
CREATE INDEX "receipts_status_issued_at_idx" ON "receipts"("status", "issued_at");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkout_values_check" CHECK (
  "plan_total_minor" > 0
  AND "deposit_minor" > 0
  AND "deposit_minor" <= "plan_total_minor"
  AND "deposit_basis_points" BETWEEN 1 AND 10000
  AND "version" > 0
  AND jsonb_typeof("cancellation_policy_snapshot") = 'object'
  AND ("cancellation_policy_snapshot"->>'cancellationCutoffMinutes') ~ '^[0-9]+$'
  AND ("cancellation_policy_snapshot"->>'policyVersion') ~ '^[0-9]+$'
  AND "cancellation_policy_snapshot"->>'source' IN ('CLINIC_POLICY', 'PLATFORM_DEFAULT')
  AND jsonb_typeof("cancellation_policy_snapshot"->'display') = 'object'
  AND COALESCE("cancellation_policy_snapshot"->'display'->>'vi-VN', '') <> ''
  AND COALESCE("cancellation_policy_snapshot"->'display'->>'en-US', '') <> ''
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_values_check" CHECK (
  "amount_minor" > 0 AND "version" > 0
  AND (("status" = 'ISSUED' AND "paid_at" IS NULL AND "voided_at" IS NULL)
    OR ("status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND "paid_at" IS NOT NULL AND "voided_at" IS NULL)
    OR ("status" = 'VOID' AND "paid_at" IS NULL AND "voided_at" IS NOT NULL))
);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_values_check"
  CHECK ("amount_minor" > 0 AND "version" > 0);

INSERT INTO "invoices" (
  "id", "booking_id", "payment_id", "invoice_number", "status", "amount_minor", "currency",
  "version", "issued_at", "paid_at", "voided_at", "updated_at"
)
SELECT
  md5('invoice:' || b."id"::text)::uuid,
  b."id",
  p."id",
  'DTI-LEGACY-' || upper(substr(replace(b."id"::text, '-', ''), 1, 16)),
  CASE
    WHEN p."status" = 'REFUNDED' THEN 'REFUNDED'::"InvoiceStatus"
    WHEN p."status" = 'PARTIALLY_REFUNDED' THEN 'PARTIALLY_REFUNDED'::"InvoiceStatus"
    WHEN p."status" = 'SUCCEEDED' THEN 'PAID'::"InvoiceStatus"
    WHEN b."status" = 'CANCELLED' THEN 'VOID'::"InvoiceStatus"
    ELSE 'ISSUED'::"InvoiceStatus"
  END,
  b."deposit_minor",
  b."currency",
  1,
  b."created_at",
  CASE WHEN p."status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN p."updated_at" END,
  CASE
    WHEN b."status" = 'CANCELLED'
      AND (p."id" IS NULL OR p."status" NOT IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'))
    THEN b."updated_at"
  END,
  b."updated_at"
FROM "bookings" b
LEFT JOIN "payments" p ON p."booking_id" = b."id";

INSERT INTO "receipts" (
  "id", "payment_id", "receipt_number", "status", "amount_minor", "currency", "version",
  "issued_at", "updated_at"
)
SELECT
  md5('receipt:' || p."id"::text)::uuid,
  p."id",
  'DTR-LEGACY-' || upper(substr(replace(p."id"::text, '-', ''), 1, 16)),
  CASE
    WHEN p."status" = 'REFUNDED' THEN 'REFUNDED'::"ReceiptStatus"
    WHEN p."status" = 'PARTIALLY_REFUNDED' THEN 'PARTIALLY_REFUNDED'::"ReceiptStatus"
    ELSE 'ISSUED'::"ReceiptStatus"
  END,
  p."amount_minor",
  p."currency",
  1,
  p."updated_at",
  p."updated_at"
FROM "payments" p
WHERE p."status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED');

CREATE FUNCTION "enforce_booking_checkout_integrity"() RETURNS trigger AS $$
DECLARE
  accepted_plan_id uuid;
  accepted_case_id uuid;
  accepted_total bigint;
  accepted_currency text;
  accepted_status text;
  accepted_expires_at timestamptz;
  accepted_checksum text;
BEGIN
  SELECT
    acceptance."treatment_plan_version_id",
    treatment_plan."case_id",
    plan."total_minor",
    plan."currency"::text,
    plan."status"::text,
    plan."expires_at",
    plan."content_checksum"
  INTO
    accepted_plan_id, accepted_case_id, accepted_total, accepted_currency,
    accepted_status, accepted_expires_at, accepted_checksum
  FROM "treatment_plan_acceptances" acceptance
  JOIN "treatment_plan_versions" plan ON plan."id" = acceptance."treatment_plan_version_id"
  JOIN "treatment_plans" treatment_plan ON treatment_plan."id" = plan."treatment_plan_id"
  JOIN "dental_cases" dental_case ON dental_case."id" = treatment_plan."case_id"
  JOIN "patient_profiles" patient ON patient."id" = dental_case."patient_profile_id"
  WHERE acceptance."id" = NEW."treatment_plan_acceptance_id"
    AND patient."user_id" = acceptance."user_id"
  FOR KEY SHARE OF acceptance, plan, treatment_plan, dental_case, patient;

  IF accepted_plan_id IS NULL
    OR accepted_plan_id <> NEW."treatment_plan_version_id"
    OR accepted_case_id <> NEW."case_id" THEN
    RAISE EXCEPTION 'booking must bind the patient exact treatment-plan acceptance' USING ERRCODE = '23514';
  END IF;
  IF accepted_total <> NEW."plan_total_minor"
    OR accepted_currency <> NEW."currency"::text
    OR NEW."deposit_minor" <> CEIL((accepted_total::numeric * NEW."deposit_basis_points") / 10000)::bigint THEN
    RAISE EXCEPTION 'booking money must be server-derived from the accepted plan snapshot' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF accepted_status <> 'PUBLISHED' OR accepted_expires_at <= CURRENT_TIMESTAMP OR accepted_checksum IS NULL THEN
      RAISE EXCEPTION 'booking requires a current immutable published treatment plan' USING ERRCODE = '23514';
    END IF;
    IF NEW."status" <> 'PENDING_DEPOSIT' OR NEW."version" <> 1
      OR NEW."confirmed_at" IS NOT NULL OR NEW."cancelled_at" IS NOT NULL
      OR NEW."completed_at" IS NOT NULL OR NEW."cancellation_reason" IS NOT NULL THEN
      RAISE EXCEPTION 'new bookings must begin pending deposit at version one' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."case_id" IS DISTINCT FROM OLD."case_id"
    OR NEW."treatment_plan_version_id" IS DISTINCT FROM OLD."treatment_plan_version_id"
    OR NEW."treatment_plan_acceptance_id" IS DISTINCT FROM OLD."treatment_plan_acceptance_id"
    OR NEW."plan_total_minor" IS DISTINCT FROM OLD."plan_total_minor"
    OR NEW."deposit_minor" IS DISTINCT FROM OLD."deposit_minor"
    OR NEW."deposit_basis_points" IS DISTINCT FROM OLD."deposit_basis_points"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."cancellation_policy_snapshot" IS DISTINCT FROM OLD."cancellation_policy_snapshot" THEN
    RAISE EXCEPTION 'booking checkout identity and snapshots are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NEW."version" <> OLD."version" + 1 THEN
      RAISE EXCEPTION 'booking status transitions require optimistic version increment' USING ERRCODE = '40001';
    END IF;
    IF NOT (
      (OLD."status" = 'PENDING_DEPOSIT' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
      OR (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('CANCELLED', 'COMPLETED'))
    ) THEN
      RAISE EXCEPTION 'invalid booking status transition' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."version" <> OLD."version" THEN
    RAISE EXCEPTION 'booking version may change only with its state' USING ERRCODE = '40001';
  END IF;
  IF NEW."status" = 'CONFIRMED' AND NEW."confirmed_at" IS NULL THEN
    RAISE EXCEPTION 'confirmed booking requires confirmation time' USING ERRCODE = '23514';
  ELSIF NEW."status" = 'CANCELLED' AND (NEW."cancelled_at" IS NULL OR NEW."cancellation_reason" IS NULL) THEN
    RAISE EXCEPTION 'cancelled booking requires time and reason' USING ERRCODE = '23514';
  ELSIF NEW."status" = 'COMPLETED' AND NEW."completed_at" IS NULL THEN
    RAISE EXCEPTION 'completed booking requires completion time' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "booking_checkout_integrity"
  BEFORE INSERT OR UPDATE ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION "enforce_booking_checkout_integrity"();

CREATE FUNCTION "enforce_billing_document_integrity"() RETURNS trigger AS $$
DECLARE
  expected_booking_id uuid;
  expected_amount bigint;
  expected_currency text;
  ledger_status text;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    SELECT b."id", b."deposit_minor", b."currency"::text
      INTO expected_booking_id, expected_amount, expected_currency
      FROM "bookings" b WHERE b."id" = NEW."booking_id" FOR KEY SHARE;
    IF expected_booking_id IS NULL OR NEW."amount_minor" <> expected_amount
      OR NEW."currency"::text <> expected_currency THEN
      RAISE EXCEPTION 'invoice must match the booking deposit snapshot' USING ERRCODE = '23514';
    END IF;
    IF NEW."payment_id" IS NOT NULL THEN
      SELECT p."booking_id", p."amount_minor", p."currency"::text, p."status"::text
        INTO expected_booking_id, expected_amount, expected_currency, ledger_status
        FROM "payments" p WHERE p."id" = NEW."payment_id" FOR KEY SHARE;
      IF expected_booking_id <> NEW."booking_id" OR NEW."amount_minor" <> expected_amount
        OR NEW."currency"::text <> expected_currency THEN
        RAISE EXCEPTION 'invoice payment must belong to the same booking and amount' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW."booking_id" IS DISTINCT FROM OLD."booking_id"
      OR (OLD."payment_id" IS NOT NULL AND NEW."payment_id" IS DISTINCT FROM OLD."payment_id")
      OR NEW."invoice_number" IS DISTINCT FROM OLD."invoice_number"
      OR NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor"
      OR NEW."currency" IS DISTINCT FROM OLD."currency"
      OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
    ) THEN
      RAISE EXCEPTION 'invoice identity and monetary snapshot are immutable' USING ERRCODE = '55000';
    END IF;
  ELSE
    SELECT p."booking_id", p."amount_minor", p."currency"::text, p."status"::text
      INTO expected_booking_id, expected_amount, expected_currency, ledger_status
      FROM "payments" p WHERE p."id" = NEW."payment_id" FOR KEY SHARE;
    IF expected_booking_id IS NULL OR NEW."amount_minor" <> expected_amount
      OR NEW."currency"::text <> expected_currency
      OR ledger_status NOT IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN
      RAISE EXCEPTION 'receipt requires a settled matching payment' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
      OR NEW."receipt_number" IS DISTINCT FROM OLD."receipt_number"
      OR NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor"
      OR NEW."currency" IS DISTINCT FROM OLD."currency"
      OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
    ) THEN
      RAISE EXCEPTION 'receipt identity and monetary snapshot are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."status" IS DISTINCT FROM OLD."status"
    AND NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'billing document transitions require optimistic version increment' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_integrity"
  BEFORE INSERT OR UPDATE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION "enforce_billing_document_integrity"();
CREATE TRIGGER "receipt_integrity"
  BEFORE INSERT OR UPDATE ON "receipts"
  FOR EACH ROW EXECUTE FUNCTION "enforce_billing_document_integrity"();

CREATE FUNCTION "project_payment_documents"() RETURNS trigger AS $$
DECLARE
  projected_invoice "InvoiceStatus";
  projected_receipt "ReceiptStatus";
BEGIN
  UPDATE "invoices"
  SET "payment_id" = NEW."id", "updated_at" = CURRENT_TIMESTAMP
  WHERE "booking_id" = NEW."booking_id" AND "payment_id" IS NULL;

  IF TG_OP = 'INSERT' OR NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;
  IF NEW."status" NOT IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN
    RETURN NEW;
  END IF;

  IF NEW."status" = 'SUCCEEDED' THEN
    projected_invoice := 'PAID';
    projected_receipt := 'ISSUED';
    UPDATE "bookings"
      SET "status" = 'CONFIRMED', "confirmed_at" = CURRENT_TIMESTAMP,
        "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = NEW."booking_id" AND "status" = 'PENDING_DEPOSIT';
  ELSIF NEW."status" = 'PARTIALLY_REFUNDED' THEN
    projected_invoice := 'PARTIALLY_REFUNDED';
    projected_receipt := 'PARTIALLY_REFUNDED';
  ELSE
    projected_invoice := 'REFUNDED';
    projected_receipt := 'REFUNDED';
  END IF;

  UPDATE "invoices"
  SET "status" = projected_invoice,
    "paid_at" = COALESCE("paid_at", CURRENT_TIMESTAMP),
    "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "payment_id" = NEW."id" AND "status" IS DISTINCT FROM projected_invoice;

  INSERT INTO "receipts" (
    "id", "payment_id", "receipt_number", "status", "amount_minor", "currency",
    "version", "issued_at", "updated_at"
  ) VALUES (
    md5('receipt:' || NEW."id"::text)::uuid,
    NEW."id",
    'DTR-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || upper(substr(replace(NEW."id"::text, '-', ''), 1, 16)),
    projected_receipt,
    NEW."amount_minor",
    NEW."currency",
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("payment_id") DO UPDATE SET
    "status" = EXCLUDED."status",
    "version" = CASE
      WHEN "receipts"."status" IS DISTINCT FROM EXCLUDED."status" THEN "receipts"."version" + 1
      ELSE "receipts"."version"
    END,
    "updated_at" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payment_document_projection"
  AFTER INSERT OR UPDATE OF "status" ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "project_payment_documents"();

-- A failed provider intent may be cleared only as part of an audited optimistic
-- transition back to REQUIRES_PAYMENT_METHOD. The Payment row and money remain
-- immutable, allowing recovery without inventing a second ledger.
CREATE OR REPLACE FUNCTION "enforce_payment_integrity"() RETURNS trigger AS $$
DECLARE
  expected_amount bigint;
  expected_currency text;
  payment_status text;
  reserved_amount bigint;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    SELECT b."deposit_minor", b."currency"::text
      INTO expected_amount, expected_currency
      FROM "bookings" b WHERE b."id" = NEW."booking_id" FOR KEY SHARE;
    IF expected_amount IS NULL
       OR NEW."amount_minor" <> expected_amount
       OR NEW."currency"::text <> expected_currency THEN
      RAISE EXCEPTION 'payment amount and currency must match the booking deposit' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW."booking_id" IS DISTINCT FROM OLD."booking_id"
      OR NEW."provider" IS DISTINCT FROM OLD."provider"
      OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
      OR NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor"
      OR NEW."currency" IS DISTINCT FROM OLD."currency"
      OR (
        OLD."provider_payment_intent_id" IS NOT NULL
        AND NEW."provider_payment_intent_id" IS DISTINCT FROM OLD."provider_payment_intent_id"
        AND NOT (
          OLD."status" = 'FAILED'
          AND NEW."status" = 'REQUIRES_PAYMENT_METHOD'
          AND NEW."provider_payment_intent_id" IS NULL
          AND NEW."provider_event_created_at" IS NULL
          AND NEW."version" = OLD."version" + 1
        )
      )
    ) THEN
      RAISE EXCEPTION 'payment ledger identity is immutable' USING ERRCODE = '55000';
    END IF;
  ELSE
    SELECT p."amount_minor", p."status"::text
      INTO expected_amount, payment_status
      FROM "payments" p WHERE p."id" = NEW."payment_id" FOR UPDATE;
    IF expected_amount IS NULL
       OR (TG_OP = 'INSERT' AND payment_status NOT IN ('SUCCEEDED', 'PARTIALLY_REFUNDED'))
       OR (TG_OP = 'UPDATE' AND payment_status NOT IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')) THEN
      RAISE EXCEPTION 'refund requires a settled payment' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
      OR NEW."requested_by_user_id" IS DISTINCT FROM OLD."requested_by_user_id"
      OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
      OR NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor"
      OR NEW."reason" IS DISTINCT FROM OLD."reason"
      OR (OLD."provider_refund_id" IS NOT NULL
        AND NEW."provider_refund_id" IS DISTINCT FROM OLD."provider_refund_id")
    ) THEN
      RAISE EXCEPTION 'refund ledger identity is immutable' USING ERRCODE = '55000';
    END IF;
    IF NEW."status" NOT IN ('FAILED', 'REJECTED')
       AND (TG_OP = 'INSERT' OR OLD."status" IN ('FAILED', 'REJECTED')) THEN
      SELECT COALESCE(SUM(r."amount_minor"), 0)
        INTO reserved_amount FROM "refunds" r
        WHERE r."payment_id" = NEW."payment_id"
          AND r."id" <> NEW."id"
          AND r."status" NOT IN ('FAILED', 'REJECTED');
      IF reserved_amount + NEW."amount_minor" > expected_amount THEN
        RAISE EXCEPTION 'refund reservations exceed the payment amount' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
