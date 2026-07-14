-- AI care-assistant conversations, consent evidence, and patient preference capture.
CREATE TYPE "CaseTimingPreference" AS ENUM ('FLEXIBLE', 'ONE_MONTH', 'THREE_MONTHS');
CREATE TYPE "CaseDecisionPriority" AS ENUM ('TRUST', 'COST', 'TIME', 'AFTERCARE');
CREATE TYPE "AssistantSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "AssistantSafetyLevel" AS ENUM ('ROUTINE', 'ATTENTION', 'URGENT');

ALTER TABLE "dental_cases"
  ADD COLUMN "timing_preference" "CaseTimingPreference",
  ADD COLUMN "decision_priority" "CaseDecisionPriority";

CREATE TABLE "assistant_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "case_id" UUID,
  "locale" TEXT NOT NULL DEFAULT 'vi-VN',
  "status" "AssistantSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "model" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "notice_version" TEXT NOT NULL,
  "notice_acknowledged_at" TIMESTAMPTZ(6) NOT NULL,
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "assistant_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assistant_messages" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "exchange_id" UUID NOT NULL,
  "role" "AssistantMessageRole" NOT NULL,
  "encrypted_content" TEXT NOT NULL,
  "safety_level" "AssistantSafetyLevel",
  "suggested_action" TEXT,
  "model_response_id" TEXT,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistant_sessions_user_id_status_updated_at_idx"
  ON "assistant_sessions"("user_id", "status", "updated_at");
CREATE INDEX "assistant_sessions_case_id_updated_at_idx"
  ON "assistant_sessions"("case_id", "updated_at");
CREATE UNIQUE INDEX "assistant_messages_session_id_exchange_id_role_key"
  ON "assistant_messages"("session_id", "exchange_id", "role");
CREATE INDEX "assistant_messages_session_id_created_at_idx"
  ON "assistant_messages"("session_id", "created_at");

ALTER TABLE "assistant_sessions"
  ADD CONSTRAINT "assistant_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_sessions"
  ADD CONSTRAINT "assistant_sessions_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assistant_messages"
  ADD CONSTRAINT "assistant_messages_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "assistant_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assistant_sessions"
  ADD CONSTRAINT "assistant_sessions_locale_check" CHECK ("locale" IN ('vi-VN', 'en-US')),
  ADD CONSTRAINT "assistant_sessions_closed_check"
    CHECK (("status" = 'ACTIVE' AND "closed_at" IS NULL)
      OR ("status" = 'CLOSED' AND "closed_at" IS NOT NULL));
ALTER TABLE "assistant_messages"
  ADD CONSTRAINT "assistant_messages_encryption_check" CHECK ("encrypted_content" LIKE 'v1.%'),
  ADD CONSTRAINT "assistant_messages_tokens_check"
    CHECK (("input_tokens" IS NULL OR "input_tokens" >= 0)
      AND ("output_tokens" IS NULL OR "output_tokens" >= 0));

CREATE FUNCTION "enforce_assistant_case_ownership"() RETURNS trigger AS $$
DECLARE
  case_owner UUID;
BEGIN
  IF NEW."case_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT pp."user_id" INTO case_owner
  FROM "dental_cases" dc
  JOIN "patient_profiles" pp ON pp."id" = dc."patient_profile_id"
  WHERE dc."id" = NEW."case_id";
  IF case_owner IS NULL OR case_owner <> NEW."user_id" THEN
    RAISE EXCEPTION 'assistant session case must belong to the patient'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assistant_session_case_ownership"
BEFORE INSERT OR UPDATE OF "user_id", "case_id" ON "assistant_sessions"
FOR EACH ROW EXECUTE FUNCTION "enforce_assistant_case_ownership"();
