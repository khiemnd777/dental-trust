-- Patient profile completion and truthful stepwise intake drafts. Sensitive
-- free text remains application-encrypted; structured codes stay queryable.

ALTER TABLE "patient_profiles"
  ADD COLUMN "encrypted_identity_data" TEXT,
  ADD COLUMN "encrypted_contact_data" TEXT,
  ADD COLUMN "encrypted_preferences" TEXT,
  ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(6),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "emergency_contacts"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "intake_questionnaire_versions"
  ADD COLUMN "encrypted_existing_diagnosis" TEXT,
  ADD COLUMN "current_step" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 1,
  ALTER COLUMN "desired_procedure_code" DROP NOT NULL,
  ALTER COLUMN "dental_concerns" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "treatment_goals" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "current_country" DROP NOT NULL,
  ALTER COLUMN "current_city" DROP NOT NULL,
  ALTER COLUMN "preferred_language" DROP NOT NULL,
  ALTER COLUMN "existing_implant_systems" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "smoking_status" DROP NOT NULL,
  ALTER COLUMN "pregnancy_status" DROP NOT NULL,
  ALTER COLUMN "accessibility_needs" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "preferred_consultation_times" DROP NOT NULL;

UPDATE "intake_questionnaire_versions" SET
  "dental_concerns" = COALESCE("dental_concerns", ARRAY[]::TEXT[]),
  "treatment_goals" = COALESCE("treatment_goals", ARRAY[]::TEXT[]),
  "existing_implant_systems" = COALESCE("existing_implant_systems", ARRAY[]::TEXT[]),
  "accessibility_needs" = COALESCE("accessibility_needs", ARRAY[]::TEXT[]);

ALTER TABLE "intake_questionnaire_versions"
  ALTER COLUMN "dental_concerns" SET NOT NULL,
  ALTER COLUMN "treatment_goals" SET NOT NULL,
  ALTER COLUMN "existing_implant_systems" SET NOT NULL,
  ALTER COLUMN "accessibility_needs" SET NOT NULL;

CREATE UNIQUE INDEX "intake_questionnaire_versions_one_draft_key"
  ON "intake_questionnaire_versions"("questionnaire_id") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "intake_questionnaire_versions_one_submitted_key"
  ON "intake_questionnaire_versions"("questionnaire_id") WHERE "status" = 'SUBMITTED';
CREATE UNIQUE INDEX "emergency_contacts_one_per_patient_key"
  ON "emergency_contacts"("patient_id");
CREATE INDEX "patient_profiles_onboarding_completed_at_idx"
  ON "patient_profiles"("onboarding_completed_at");

ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_onboarding_security_check" CHECK (
  "version" > 0
  AND ("encrypted_identity_data" IS NULL OR "encrypted_identity_data" LIKE 'v1.%')
  AND ("encrypted_contact_data" IS NULL OR "encrypted_contact_data" LIKE 'v1.%')
  AND ("encrypted_preferences" IS NULL OR "encrypted_preferences" LIKE 'v1.%')
  AND ("encrypted_medical_data" IS NULL OR "encrypted_medical_data" LIKE 'v1.%')
  AND ("onboarding_completed_at" IS NULL OR (
    "encrypted_identity_data" IS NOT NULL
    AND "encrypted_contact_data" IS NOT NULL
    AND "encrypted_preferences" IS NOT NULL
  ))
);

ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_security_check" CHECK (
  "version" > 0
  AND btrim("relationship") <> ''
  AND "encrypted_name" LIKE 'v1.%'
  AND "encrypted_phone" LIKE 'v1.%'
);

ALTER TABLE "intake_questionnaire_versions" ADD CONSTRAINT "intake_questionnaire_draft_check" CHECK (
  "version" > 0
  AND "draft_revision" > 0
  AND "current_step" BETWEEN 1 AND 6
  AND ("cosmetic_expectations" IS NULL OR "cosmetic_expectations" LIKE 'v1.%')
  AND ("encrypted_existing_diagnosis" IS NULL OR "encrypted_existing_diagnosis" LIKE 'v1.%')
  AND ("prior_dental_work" IS NULL OR "prior_dental_work" LIKE 'v1.%')
  AND ("available_treatment_days" IS NULL OR "available_treatment_days" BETWEEN 1 AND 365)
  AND ("budget_minimum_minor" IS NULL OR "budget_minimum_minor" >= 0)
  AND ("budget_maximum_minor" IS NULL OR "budget_maximum_minor" >= 0)
  AND ("budget_minimum_minor" IS NULL OR "budget_maximum_minor" >= "budget_minimum_minor")
  AND ("expected_arrival_date" IS NULL OR "expected_departure_date" IS NULL
    OR "expected_departure_date" >= "expected_arrival_date")
  AND (("budget_minimum_minor" IS NULL AND "budget_maximum_minor" IS NULL AND "budget_currency" IS NULL)
    OR ("budget_minimum_minor" IS NOT NULL AND "budget_maximum_minor" IS NOT NULL AND "budget_currency" IS NOT NULL))
);

ALTER TABLE "intake_medical_conditions" ADD CONSTRAINT "intake_medical_conditions_encryption_check" CHECK (
  btrim("code") <> '' AND ("encrypted_details" IS NULL OR "encrypted_details" LIKE 'v1.%')
);
ALTER TABLE "intake_medications" ADD CONSTRAINT "intake_medications_encryption_check" CHECK (
  "encrypted_name" LIKE 'v1.%' AND ("encrypted_dosage" IS NULL OR "encrypted_dosage" LIKE 'v1.%')
);
ALTER TABLE "intake_allergies" ADD CONSTRAINT "intake_allergies_encryption_check" CHECK (
  "encrypted_substance" LIKE 'v1.%' AND ("encrypted_reaction" IS NULL OR "encrypted_reaction" LIKE 'v1.%')
);

CREATE FUNCTION "enforce_questionnaire_consent_identity"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "intake_questionnaire_versions" v
    JOIN "intake_questionnaires" q ON q."id" = v."questionnaire_id"
    JOIN "dental_cases" dc ON dc."id" = q."case_id"
    JOIN "patient_profiles" pp ON pp."id" = dc."patient_profile_id"
    JOIN "consent_records" cr ON cr."id" = NEW."consent_record_id"
    JOIN "consent_text_versions" ctv ON ctv."id" = cr."consent_text_version_id"
    JOIN "sessions" s ON s."id" = cr."session_id"
    WHERE v."id" = NEW."questionnaire_version_id"
      AND v."status" = 'DRAFT'
      AND cr."user_id" = pp."user_id"
      AND cr."withdrawn_at" IS NULL
      AND cr."granted_at" >= ctv."published_at"
      AND ctv."purpose" IN ('INTAKE_HEALTH_INFORMATION', 'INTAKE_MEDICAL_DISCLAIMER')
      AND s."user_id" = pp."user_id"
      AND s."revoked_at" IS NULL
      AND s."expires_at" > CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'questionnaire consent is not attributable to the current patient session' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "questionnaire_consents_identity_integrity"
  BEFORE INSERT OR UPDATE ON "questionnaire_consents"
  FOR EACH ROW EXECUTE FUNCTION "enforce_questionnaire_consent_identity"();

CREATE FUNCTION "enforce_intake_submission_integrity"() RETURNS trigger AS $$
DECLARE
  valid_consent_count integer;
BEGIN
  IF NEW."status" = 'SUBMITTED' THEN
    IF NEW."desired_procedure_code" IS NULL OR btrim(NEW."desired_procedure_code") = ''
       OR cardinality(NEW."dental_concerns") = 0
       OR cardinality(NEW."treatment_goals") = 0
       OR NEW."current_country" IS NULL OR btrim(NEW."current_country") = ''
       OR NEW."current_city" IS NULL OR btrim(NEW."current_city") = ''
       OR NEW."expected_arrival_date" IS NULL OR NEW."expected_departure_date" IS NULL
       OR NEW."expected_departure_date" < NEW."expected_arrival_date"
       OR NEW."preferred_location" IS NULL OR btrim(NEW."preferred_location") = ''
       OR NEW."available_treatment_days" IS NULL
       OR NEW."budget_minimum_minor" IS NULL OR NEW."budget_maximum_minor" IS NULL OR NEW."budget_currency" IS NULL
       OR NEW."preferred_language" IS NULL OR btrim(NEW."preferred_language") = ''
       OR NEW."smoking_status" IS NULL OR NEW."pregnancy_status" IS NULL
       OR NEW."preferred_consultation_times" IS NULL
       OR jsonb_typeof(NEW."preferred_consultation_times") <> 'array'
       OR jsonb_array_length(NEW."preferred_consultation_times") = 0
       OR NEW."submitted_at" IS NULL
       OR NEW."content_checksum" IS NULL
       OR NEW."current_step" <> 6 THEN
      RAISE EXCEPTION 'submitted intake questionnaire is incomplete' USING ERRCODE = '23514';
    END IF;

    SELECT COUNT(DISTINCT ctv."purpose") INTO valid_consent_count
    FROM "questionnaire_consents" qc
    JOIN "consent_records" cr ON cr."id" = qc."consent_record_id"
    JOIN "consent_text_versions" ctv ON ctv."id" = cr."consent_text_version_id"
    WHERE qc."questionnaire_version_id" = NEW."id"
      AND cr."withdrawn_at" IS NULL
      AND ctv."purpose" IN ('INTAKE_HEALTH_INFORMATION', 'INTAKE_MEDICAL_DISCLAIMER');
    IF valid_consent_count <> 2 THEN
      RAISE EXCEPTION 'submitted intake questionnaire requires both explicit consent purposes' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "intake_questionnaire_submission_integrity"
  BEFORE INSERT OR UPDATE ON "intake_questionnaire_versions"
  FOR EACH ROW EXECUTE FUNCTION "enforce_intake_submission_integrity"();
