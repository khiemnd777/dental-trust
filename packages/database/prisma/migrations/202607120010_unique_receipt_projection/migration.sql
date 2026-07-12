-- Use the full payment UUID in projected receipt numbers. Truncating to the
-- first 16 hex characters can collide for deterministic or time-ordered IDs.
CREATE OR REPLACE FUNCTION "project_payment_documents"() RETURNS trigger AS $$
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
    'DTR-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-'
      || upper(replace(NEW."id"::text, '-', '')),
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
