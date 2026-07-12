-- Production privacy request execution, legal holds, and immutable outcome evidence.
CREATE TYPE "PrivacyExecutionStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'NOTICE_PENDING',
  'SUCCEEDED',
  'FAILED',
  'BLOCKED'
);

CREATE TYPE "PrivacyExecutionOutcome" AS ENUM (
  'EXPORT_READY',
  'DEIDENTIFIED_WITH_RETENTION',
  'RETAINED_LEGAL_HOLD'
);

CREATE TYPE "PrivacyIdentityVerificationMethod" AS ENUM (
  'ACCOUNT_MFA',
  'VERIFIED_COMMUNICATION',
  'DOCUMENT_REVIEW'
);

CREATE TYPE "PrivacyLegalHoldScope" AS ENUM (
  'ALL',
  'IDENTITY',
  'CLINICAL',
  'FINANCIAL',
  'TRUST_SAFETY',
  'AUDIT_SECURITY',
  'FILES'
);

CREATE TABLE "privacy_request_executions" (
  "id" UUID NOT NULL,
  "privacy_request_id" UUID NOT NULL,
  "status" "PrivacyExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "outcome" "PrivacyExecutionOutcome",
  "identity_verification_method" "PrivacyIdentityVerificationMethod" NOT NULL,
  "encrypted_verification_reference" TEXT NOT NULL,
  "verified_by_user_id" UUID NOT NULL,
  "verified_at" TIMESTAMPTZ(6) NOT NULL,
  "notice_notification_id" UUID,
  "artifact_file_asset_id" UUID,
  "artifact_expires_at" TIMESTAMPTZ(6),
  "artifact_purged_at" TIMESTAMPTZ(6),
  "archive_checksum_sha256" CHAR(64),
  "manifest_checksum_sha256" CHAR(64),
  "archive_size_bytes" BIGINT,
  "record_count" INTEGER,
  "category_disposition" JSONB,
  "blocker_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "lease_expires_at" TIMESTAMPTZ(6),
  "last_error_code" VARCHAR(120),
  "version" INTEGER NOT NULL DEFAULT 1,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "privacy_request_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "privacy_legal_holds" (
  "id" UUID NOT NULL,
  "subject_user_id" UUID NOT NULL,
  "scopes" "PrivacyLegalHoldScope"[] NOT NULL,
  "encrypted_reason" TEXT NOT NULL,
  "encrypted_authority_reference" TEXT NOT NULL,
  "placed_by_user_id" UUID NOT NULL,
  "released_by_user_id" UUID,
  "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "released_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "privacy_legal_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "privacy_request_executions_privacy_request_id_key"
  ON "privacy_request_executions"("privacy_request_id");
CREATE UNIQUE INDEX "privacy_request_executions_notice_notification_id_key"
  ON "privacy_request_executions"("notice_notification_id");
CREATE UNIQUE INDEX "privacy_request_executions_artifact_file_asset_id_key"
  ON "privacy_request_executions"("artifact_file_asset_id");
CREATE INDEX "privacy_request_executions_status_lease_expires_at_idx"
  ON "privacy_request_executions"("status", "lease_expires_at");
CREATE INDEX "privacy_request_executions_artifact_expires_at_artifact_purged_at_idx"
  ON "privacy_request_executions"("artifact_expires_at", "artifact_purged_at");
CREATE INDEX "privacy_legal_holds_subject_user_id_released_at_expires_at_idx"
  ON "privacy_legal_holds"("subject_user_id", "released_at", "expires_at");

ALTER TABLE "privacy_request_executions"
  ADD CONSTRAINT "privacy_request_executions_privacy_request_id_fkey"
  FOREIGN KEY ("privacy_request_id") REFERENCES "privacy_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_request_executions"
  ADD CONSTRAINT "privacy_request_executions_verified_by_user_id_fkey"
  FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_request_executions"
  ADD CONSTRAINT "privacy_request_executions_notice_notification_id_fkey"
  FOREIGN KEY ("notice_notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_request_executions"
  ADD CONSTRAINT "privacy_request_executions_artifact_file_asset_id_fkey"
  FOREIGN KEY ("artifact_file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_legal_holds"
  ADD CONSTRAINT "privacy_legal_holds_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_legal_holds"
  ADD CONSTRAINT "privacy_legal_holds_placed_by_user_id_fkey"
  FOREIGN KEY ("placed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_legal_holds"
  ADD CONSTRAINT "privacy_legal_holds_released_by_user_id_fkey"
  FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "privacy_request_executions"
  ADD CONSTRAINT "privacy_request_executions_version_attempt_check"
  CHECK ("version" > 0 AND "attempt_count" >= 0 AND ("record_count" IS NULL OR "record_count" >= 0)
    AND ("archive_size_bytes" IS NULL OR "archive_size_bytes" > 0));
ALTER TABLE "privacy_request_executions"
  ADD CONSTRAINT "privacy_request_executions_encryption_check"
  CHECK ("encrypted_verification_reference" LIKE 'v1.%');
ALTER TABLE "privacy_request_executions"
  ADD CONSTRAINT "privacy_request_executions_checksum_check"
  CHECK (("archive_checksum_sha256" IS NULL OR "archive_checksum_sha256" ~ '^[a-f0-9]{64}$')
    AND ("manifest_checksum_sha256" IS NULL OR "manifest_checksum_sha256" ~ '^[a-f0-9]{64}$'));
ALTER TABLE "privacy_legal_holds"
  ADD CONSTRAINT "privacy_legal_holds_integrity_check"
  CHECK (cardinality("scopes") > 0
    AND "version" > 0
    AND "encrypted_reason" LIKE 'v1.%'
    AND "encrypted_authority_reference" LIKE 'v1.%'
    AND ("expires_at" IS NULL OR "expires_at" > "starts_at")
    AND (("released_at" IS NULL AND "released_by_user_id" IS NULL)
      OR ("released_at" IS NOT NULL AND "released_by_user_id" IS NOT NULL)));

CREATE FUNCTION "enforce_privacy_execution_integrity"() RETURNS trigger AS $$
DECLARE
  request_type "PrivacyRequestType";
BEGIN
  SELECT "type" INTO request_type
  FROM "privacy_requests"
  WHERE "id" = NEW."privacy_request_id";
  IF request_type IS NULL THEN
    RAISE EXCEPTION 'privacy execution requires an existing request' USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'PROCESSING' AND NEW."lease_expires_at" IS NULL THEN
    RAISE EXCEPTION 'processing privacy execution requires a bounded lease' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'NOTICE_PENDING'
     AND (request_type <> 'DELETE' OR NEW."notice_notification_id" IS NULL) THEN
    RAISE EXCEPTION 'notice pending is valid only for deletion with a delivery record' USING ERRCODE = '23514';
  END IF;

  IF request_type = 'EXPORT' AND NEW."notice_notification_id" IS NOT NULL THEN
    RAISE EXCEPTION 'export execution cannot own a pre-deletion notice' USING ERRCODE = '23514';
  END IF;
  IF request_type = 'DELETE' AND NEW."artifact_file_asset_id" IS NOT NULL THEN
    RAISE EXCEPTION 'deletion execution cannot own an export artifact' USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'SUCCEEDED' THEN
    IF NEW."completed_at" IS NULL OR NEW."outcome" IS NULL OR NEW."category_disposition" IS NULL THEN
      RAISE EXCEPTION 'successful privacy execution requires immutable outcome evidence' USING ERRCODE = '23514';
    END IF;
    IF request_type = 'EXPORT' AND (
      NEW."outcome" <> 'EXPORT_READY'
      OR NEW."artifact_file_asset_id" IS NULL
      OR NEW."artifact_expires_at" IS NULL
      OR NEW."archive_checksum_sha256" IS NULL
      OR NEW."manifest_checksum_sha256" IS NULL
      OR NEW."archive_size_bytes" IS NULL
      OR NEW."record_count" IS NULL
    ) THEN
      RAISE EXCEPTION 'successful export requires a verified expiring artifact' USING ERRCODE = '23514';
    END IF;
    IF request_type = 'DELETE' AND NEW."outcome" NOT IN (
      'DEIDENTIFIED_WITH_RETENTION', 'RETAINED_LEGAL_HOLD'
    ) THEN
      RAISE EXCEPTION 'successful deletion requires an allowed retention outcome' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "privacy_execution_integrity"
  BEFORE INSERT OR UPDATE ON "privacy_request_executions"
  FOR EACH ROW EXECUTE FUNCTION "enforce_privacy_execution_integrity"();

CREATE FUNCTION "enforce_privacy_request_execution_state"() RETURNS trigger AS $$
DECLARE
  execution_status "PrivacyExecutionStatus";
BEGIN
  IF NEW."status" IN ('PROCESSING', 'COMPLETED') THEN
    SELECT "status" INTO execution_status
    FROM "privacy_request_executions"
    WHERE "privacy_request_id" = NEW."id";
    IF NEW."status" = 'PROCESSING'
       AND (execution_status IS NULL
         OR execution_status NOT IN ('PROCESSING', 'NOTICE_PENDING', 'FAILED')) THEN
      RAISE EXCEPTION 'processing privacy request requires an active execution' USING ERRCODE = '23514';
    END IF;
    IF NEW."status" = 'COMPLETED'
       AND (execution_status IS NULL OR execution_status <> 'SUCCEEDED') THEN
      RAISE EXCEPTION 'completed privacy request requires successful execution evidence' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "privacy_request_execution_state_integrity"
  BEFORE INSERT OR UPDATE ON "privacy_requests"
  FOR EACH ROW EXECUTE FUNCTION "enforce_privacy_request_execution_state"();

CREATE FUNCTION "protect_privacy_execution_evidence"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'privacy execution evidence is append-only' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'SUCCEEDED' THEN
    IF (to_jsonb(NEW) - 'artifact_purged_at' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'artifact_purged_at' - 'updated_at')
       OR (OLD."artifact_purged_at" IS NOT NULL AND NEW."artifact_purged_at" IS DISTINCT FROM OLD."artifact_purged_at") THEN
      RAISE EXCEPTION 'successful privacy execution evidence is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "privacy_execution_evidence_append_only"
  BEFORE UPDATE OR DELETE ON "privacy_request_executions"
  FOR EACH ROW EXECUTE FUNCTION "protect_privacy_execution_evidence"();

CREATE FUNCTION "protect_privacy_legal_hold"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'privacy legal holds cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD."released_at" IS NOT NULL THEN
    RAISE EXCEPTION 'released privacy legal holds are immutable' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - 'released_at' - 'released_by_user_id' - 'version' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'released_at' - 'released_by_user_id' - 'version' - 'updated_at') THEN
    RAISE EXCEPTION 'privacy legal hold placement evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "privacy_legal_hold_append_only"
  BEFORE UPDATE OR DELETE ON "privacy_legal_holds"
  FOR EACH ROW EXECUTE FUNCTION "protect_privacy_legal_hold"();
