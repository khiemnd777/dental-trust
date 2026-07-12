-- Clinic operating portal: onboarding, team governance, opportunities,
-- availability, payout state, and immutable service-price history.

CREATE TYPE "PayoutOnboardingStatus" AS ENUM ('NOT_STARTED', 'INCOMPLETE', 'PENDING_REVIEW', 'ACTIVE', 'RESTRICTED');
CREATE TYPE "ClinicDeclarationKind" AS ENUM ('EQUIPMENT', 'SERVICE_CAPABILITY', 'WARRANTY', 'AFTERCARE');
CREATE TYPE "ClinicOnboardingDocumentKind" AS ENUM ('OPERATING_LICENSE', 'PROFESSIONAL_LICENSE', 'INSURANCE', 'EQUIPMENT_CERTIFICATE');
CREATE TYPE "ClinicInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "ClinicOpportunityStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'DECLINED', 'ADDITIONAL_RECORDS_REQUESTED');
CREATE TYPE "AvailabilitySlotKind" AS ENUM ('CONSULTATION', 'TREATMENT', 'BOTH');
CREATE TYPE "AvailabilityBlockKind" AS ENUM ('BLOCK', 'TIME_OFF');
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('DISCONNECTED', 'PENDING', 'ACTIVE', 'ERROR');

ALTER TABLE "clinic_staff"
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "permissions_configured_at" TIMESTAMPTZ(6),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "suspended_at" TIMESTAMPTZ(6),
  ADD COLUMN "removed_at" TIMESTAMPTZ(6);

ALTER TABLE "clinic_locations"
  ADD COLUMN "encrypted_business_contact" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "price_versions"
  ADD COLUMN "brand_options" JSONB,
  ADD COLUMN "service_snapshot" JSONB,
  ADD COLUMN "created_by_user_id" UUID;

ALTER TABLE "appointments" ADD COLUMN "clinic_location_id" UUID;

CREATE TABLE "clinic_onboarding_profiles" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "registration_number" TEXT,
  "registration_country" CHAR(2),
  "encrypted_business_contact" TEXT,
  "responsible_clinical_leader_dentist_id" UUID,
  "aftercare_policy" JSONB,
  "payout_status" "PayoutOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "payout_provider" TEXT,
  "encrypted_payout_account_id" TEXT,
  "terms_version" TEXT,
  "terms_accepted_by_user_id" UUID,
  "terms_accepted_at" TIMESTAMPTZ(6),
  "verification_case_id" UUID,
  "submitted_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_onboarding_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinic_declarations" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "kind" "ClinicDeclarationKind" NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_declarations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinic_file_assets" (
  "file_asset_id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_file_assets_pkey" PRIMARY KEY ("file_asset_id")
);

CREATE TABLE "clinic_onboarding_documents" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "kind" "ClinicOnboardingDocumentKind" NOT NULL,
  "file_asset_id" UUID NOT NULL,
  "professional_license_id" UUID,
  "label" TEXT NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_onboarding_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinic_team_invitations" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "encrypted_email" TEXT NOT NULL,
  "email_hash" CHAR(64) NOT NULL,
  "role" "SystemRole" NOT NULL,
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "job_title" TEXT,
  "status" "ClinicInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "token_hash" CHAR(64) NOT NULL,
  "invited_by_user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_team_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinic_team_invitation_locations" (
  "invitation_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  CONSTRAINT "clinic_team_invitation_locations_pkey" PRIMARY KEY ("invitation_id", "location_id")
);

CREATE TABLE "clinic_staff_locations" (
  "clinic_staff_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  CONSTRAINT "clinic_staff_locations_pkey" PRIMARY KEY ("clinic_staff_id", "location_id")
);

CREATE TABLE "clinic_case_opportunities" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "status" "ClinicOpportunityStatus" NOT NULL DEFAULT 'ASSIGNED',
  "encrypted_decline_reason" TEXT,
  "encrypted_records_request" TEXT,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL,
  "responded_at" TIMESTAMPTZ(6),
  "responded_by_user_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_case_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "availability_rules" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "dentist_id" UUID,
  "slot_kind" "AvailabilitySlotKind" NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "starts_at_minute" INTEGER NOT NULL,
  "ends_at_minute" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "procedure_duration_minutes" INTEGER NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "availability_blocks" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "location_id" UUID,
  "dentist_id" UUID,
  "kind" "AvailabilityBlockKind" NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "encrypted_reason" TEXT NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinic_scheduling_policies" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "minimum_notice_minutes" INTEGER NOT NULL DEFAULT 1440,
  "maximum_advance_days" INTEGER NOT NULL DEFAULT 180,
  "reschedule_cutoff_minutes" INTEGER NOT NULL DEFAULT 1440,
  "cancellation_cutoff_minutes" INTEGER NOT NULL DEFAULT 1440,
  "default_consultation_minutes" INTEGER NOT NULL DEFAULT 60,
  "default_treatment_minutes" INTEGER NOT NULL DEFAULT 120,
  "overbooking_allowed" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_scheduling_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinic_calendar_connections" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "dentist_id" UUID,
  "provider" TEXT NOT NULL,
  "external_calendar_reference_hash" CHAR(64) NOT NULL,
  "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "last_synced_at" TIMESTAMPTZ(6),
  "last_error_code" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_calendar_connections_pkey" PRIMARY KEY ("id")
);

INSERT INTO "clinic_onboarding_profiles" ("id", "clinic_id", "version", "created_at", "updated_at")
SELECT gen_random_uuid(), c."id", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "clinics" c;

INSERT INTO "clinic_scheduling_policies" ("id", "clinic_id", "created_at", "updated_at")
SELECT gen_random_uuid(), c."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "clinics" c;

INSERT INTO "clinic_staff_locations" ("clinic_staff_id", "location_id")
SELECT cs."id", cs."clinic_location_id"
FROM "clinic_staff" cs
WHERE cs."clinic_location_id" IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE "price_versions" pv
SET "brand_options" = COALESCE(pv."brand_options", '[]'::jsonb),
    "service_snapshot" = COALESCE(
      pv."service_snapshot",
      jsonb_build_object(
        'displayNames', cs."display_names",
        'includedServices', to_jsonb(cs."included_services"),
        'exclusions', to_jsonb(cs."exclusions"),
        'estimatedDurationDays', cs."estimated_duration_days",
        'warrantyPolicyId', cs."warranty_policy_id"
      )
    )
FROM "clinic_services" cs
WHERE cs."id" = pv."clinic_service_id";

CREATE UNIQUE INDEX "clinic_onboarding_profiles_clinic_id_key" ON "clinic_onboarding_profiles"("clinic_id");
CREATE UNIQUE INDEX "clinic_onboarding_profiles_verification_case_id_key" ON "clinic_onboarding_profiles"("verification_case_id");
CREATE INDEX "clinic_onboarding_profiles_payout_status_submitted_at_idx" ON "clinic_onboarding_profiles"("payout_status", "submitted_at");
CREATE UNIQUE INDEX "clinic_declarations_clinic_id_kind_code_key" ON "clinic_declarations"("clinic_id", "kind", "code");
CREATE INDEX "clinic_declarations_clinic_id_kind_active_idx" ON "clinic_declarations"("clinic_id", "kind", "active");
CREATE INDEX "clinic_file_assets_clinic_id_category_created_at_idx" ON "clinic_file_assets"("clinic_id", "category", "created_at");
CREATE UNIQUE INDEX "clinic_onboarding_documents_clinic_id_kind_file_asset_id_key" ON "clinic_onboarding_documents"("clinic_id", "kind", "file_asset_id");
CREATE INDEX "clinic_onboarding_documents_clinic_id_kind_created_at_idx" ON "clinic_onboarding_documents"("clinic_id", "kind", "created_at");
CREATE UNIQUE INDEX "clinic_team_invitations_token_hash_key" ON "clinic_team_invitations"("token_hash");
CREATE INDEX "clinic_team_invitations_clinic_id_status_expires_at_idx" ON "clinic_team_invitations"("clinic_id", "status", "expires_at");
CREATE INDEX "clinic_team_invitations_organization_id_email_hash_status_idx" ON "clinic_team_invitations"("organization_id", "email_hash", "status");
CREATE INDEX "clinic_staff_locations_location_id_clinic_staff_id_idx" ON "clinic_staff_locations"("location_id", "clinic_staff_id");
CREATE UNIQUE INDEX "clinic_case_opportunities_clinic_id_case_id_key" ON "clinic_case_opportunities"("clinic_id", "case_id");
CREATE INDEX "clinic_case_opportunities_clinic_id_status_assigned_at_idx" ON "clinic_case_opportunities"("clinic_id", "status", "assigned_at");
CREATE INDEX "availability_rules_clinic_id_location_id_day_of_week_active_idx" ON "availability_rules"("clinic_id", "location_id", "day_of_week", "active");
CREATE INDEX "availability_rules_dentist_id_day_of_week_active_idx" ON "availability_rules"("dentist_id", "day_of_week", "active");
CREATE INDEX "availability_blocks_clinic_id_starts_at_deleted_at_idx" ON "availability_blocks"("clinic_id", "starts_at", "deleted_at");
CREATE INDEX "availability_blocks_dentist_id_starts_at_deleted_at_idx" ON "availability_blocks"("dentist_id", "starts_at", "deleted_at");
CREATE UNIQUE INDEX "clinic_scheduling_policies_clinic_id_key" ON "clinic_scheduling_policies"("clinic_id");
CREATE UNIQUE INDEX "clinic_calendar_connections_clinic_id_provider_external_calendar_ref_key" ON "clinic_calendar_connections"("clinic_id", "provider", "external_calendar_reference_hash");
CREATE INDEX "clinic_calendar_connections_clinic_id_status_last_synced_at_idx" ON "clinic_calendar_connections"("clinic_id", "status", "last_synced_at");
CREATE INDEX "appointments_clinic_location_id_starts_at_status_idx" ON "appointments"("clinic_location_id", "starts_at", "status");

ALTER TABLE "clinic_onboarding_profiles" ADD CONSTRAINT "clinic_onboarding_profiles_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_onboarding_profiles" ADD CONSTRAINT "clinic_onboarding_profiles_clinical_leader_fkey" FOREIGN KEY ("responsible_clinical_leader_dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_onboarding_profiles" ADD CONSTRAINT "clinic_onboarding_profiles_terms_user_fkey" FOREIGN KEY ("terms_accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_onboarding_profiles" ADD CONSTRAINT "clinic_onboarding_profiles_verification_case_fkey" FOREIGN KEY ("verification_case_id") REFERENCES "verification_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_declarations" ADD CONSTRAINT "clinic_declarations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_file_assets" ADD CONSTRAINT "clinic_file_assets_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_file_assets" ADD CONSTRAINT "clinic_file_assets_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_onboarding_documents" ADD CONSTRAINT "clinic_onboarding_documents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_onboarding_documents" ADD CONSTRAINT "clinic_onboarding_documents_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_onboarding_documents" ADD CONSTRAINT "clinic_onboarding_documents_professional_license_fkey" FOREIGN KEY ("professional_license_id") REFERENCES "professional_licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_onboarding_documents" ADD CONSTRAINT "clinic_onboarding_documents_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_team_invitations" ADD CONSTRAINT "clinic_team_invitations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_team_invitations" ADD CONSTRAINT "clinic_team_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_team_invitations" ADD CONSTRAINT "clinic_team_invitations_invited_by_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_team_invitation_locations" ADD CONSTRAINT "clinic_team_invitation_locations_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "clinic_team_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinic_team_invitation_locations" ADD CONSTRAINT "clinic_team_invitation_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "clinic_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_staff_locations" ADD CONSTRAINT "clinic_staff_locations_clinic_staff_id_fkey" FOREIGN KEY ("clinic_staff_id") REFERENCES "clinic_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinic_staff_locations" ADD CONSTRAINT "clinic_staff_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "clinic_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_case_opportunities" ADD CONSTRAINT "clinic_case_opportunities_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_case_opportunities" ADD CONSTRAINT "clinic_case_opportunities_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_case_opportunities" ADD CONSTRAINT "clinic_case_opportunities_responded_by_fkey" FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "clinic_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "clinic_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_scheduling_policies" ADD CONSTRAINT "clinic_scheduling_policies_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_calendar_connections" ADD CONSTRAINT "clinic_calendar_connections_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_calendar_connections" ADD CONSTRAINT "clinic_calendar_connections_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_location_id_fkey" FOREIGN KEY ("clinic_location_id") REFERENCES "clinic_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clinic_staff" ADD CONSTRAINT "clinic_staff_governance_check" CHECK (
  "version" > 0
  AND "permissions" <@ ARRAY['CASE_INBOX','CASE_ASSIGN_DENTIST','TREATMENT_PLAN','SCHEDULING','CLINICAL_RECORDS','AFTERCARE','INCIDENT_RESPONSE','REVIEW_RESPONSE','ANALYTICS_READ']::TEXT[]
  AND NOT ("active" AND ("suspended_at" IS NOT NULL OR "removed_at" IS NOT NULL))
);
ALTER TABLE "clinic_onboarding_profiles" ADD CONSTRAINT "clinic_onboarding_profiles_state_check" CHECK (
  "version" > 0
  AND ("encrypted_business_contact" IS NULL OR "encrypted_business_contact" LIKE 'v1.%')
  AND ("encrypted_payout_account_id" IS NULL OR "encrypted_payout_account_id" LIKE 'v1.%')
  AND (("terms_version" IS NULL AND "terms_accepted_by_user_id" IS NULL AND "terms_accepted_at" IS NULL)
    OR ("terms_version" IS NOT NULL AND "terms_accepted_by_user_id" IS NOT NULL AND "terms_accepted_at" IS NOT NULL))
  AND (("payout_provider" IS NULL AND "encrypted_payout_account_id" IS NULL)
    OR ("payout_provider" IS NOT NULL AND "encrypted_payout_account_id" IS NOT NULL))
  AND ("submitted_at" IS NULL OR "verification_case_id" IS NOT NULL)
);
ALTER TABLE "clinic_locations" ADD CONSTRAINT "clinic_locations_contact_encryption_check" CHECK (
  "encrypted_business_contact" IS NULL OR "encrypted_business_contact" LIKE 'v1.%'
);
ALTER TABLE "clinic_declarations" ADD CONSTRAINT "clinic_declarations_code_check" CHECK ("code" ~ '^[A-Z0-9_:-]{1,100}$');
ALTER TABLE "clinic_team_invitations" ADD CONSTRAINT "clinic_team_invitations_state_check" CHECK (
  "role" IN ('DENTIST','CLINIC_STAFF','CLINIC_ADMIN')
  AND "encrypted_email" LIKE 'v1.%'
  AND "expires_at" > "created_at"
  AND "permissions" <@ ARRAY['CASE_INBOX','CASE_ASSIGN_DENTIST','TREATMENT_PLAN','SCHEDULING','CLINICAL_RECORDS','AFTERCARE','INCIDENT_RESPONSE','REVIEW_RESPONSE','ANALYTICS_READ']::TEXT[]
);
ALTER TABLE "clinic_case_opportunities" ADD CONSTRAINT "clinic_case_opportunities_state_check" CHECK (
  "version" > 0
  AND ("encrypted_decline_reason" IS NULL OR "encrypted_decline_reason" LIKE 'v1.%')
  AND ("encrypted_records_request" IS NULL OR "encrypted_records_request" LIKE 'v1.%')
  AND ("status" <> 'DECLINED' OR "encrypted_decline_reason" IS NOT NULL)
  AND ("status" <> 'ADDITIONAL_RECORDS_REQUESTED' OR "encrypted_records_request" IS NOT NULL)
  AND ("status" = 'ASSIGNED' OR ("responded_at" IS NOT NULL AND "responded_by_user_id" IS NOT NULL))
);
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_window_check" CHECK (
  "day_of_week" BETWEEN 0 AND 6
  AND "starts_at_minute" BETWEEN 0 AND 1439
  AND "ends_at_minute" BETWEEN 1 AND 1440
  AND "ends_at_minute" > "starts_at_minute"
  AND "capacity" BETWEEN 1 AND 100
  AND "procedure_duration_minutes" BETWEEN 15 AND 720
  AND "procedure_duration_minutes" <= "ends_at_minute" - "starts_at_minute"
  AND ("effective_until" IS NULL OR "effective_until" >= "effective_from")
  AND "version" > 0
);
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_window_check" CHECK (
  "ends_at" > "starts_at"
  AND ("location_id" IS NOT NULL OR "dentist_id" IS NOT NULL)
  AND "encrypted_reason" LIKE 'v1.%'
);
ALTER TABLE "clinic_scheduling_policies" ADD CONSTRAINT "clinic_scheduling_policies_bounds_check" CHECK (
  "minimum_notice_minutes" BETWEEN 0 AND 43200
  AND "maximum_advance_days" BETWEEN 1 AND 730
  AND "reschedule_cutoff_minutes" BETWEEN 0 AND 43200
  AND "cancellation_cutoff_minutes" BETWEEN 0 AND 43200
  AND "default_consultation_minutes" BETWEEN 15 AND 480
  AND "default_treatment_minutes" BETWEEN 15 AND 720
  AND "version" > 0
);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinical_location_check" CHECK ("kind" <> 'CLINICAL_VISIT' OR "clinic_location_id" IS NOT NULL);

ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_dentist_overlap_excl"
  EXCLUDE USING gist (
    "dentist_id" WITH =,
    "day_of_week" WITH =,
    int4range("starts_at_minute", "ends_at_minute", '[)') WITH &&,
    daterange("effective_from", COALESCE("effective_until", 'infinity'::date), '[]') WITH &&
  ) WHERE ("active" AND "dentist_id" IS NOT NULL);
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_location_overlap_excl"
  EXCLUDE USING gist (
    "location_id" WITH =,
    "day_of_week" WITH =,
    int4range("starts_at_minute", "ends_at_minute", '[)') WITH &&,
    daterange("effective_from", COALESCE("effective_until", 'infinity'::date), '[]') WITH &&
  ) WHERE ("active" AND "dentist_id" IS NULL);
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_dentist_overlap_excl"
  EXCLUDE USING gist ("dentist_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("deleted_at" IS NULL AND "dentist_id" IS NOT NULL);

CREATE FUNCTION "enforce_clinic_operations_tenant_integrity"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'clinic_onboarding_profiles' THEN
    IF NEW."responsible_clinical_leader_dentist_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "dentist_clinic_affiliations" a
      WHERE a."clinic_id" = NEW."clinic_id"
        AND a."dentist_id" = NEW."responsible_clinical_leader_dentist_id"
        AND a."active" = true AND a."ended_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'clinical leader is not actively affiliated with clinic' USING ERRCODE = '23514';
    END IF;
    IF NEW."verification_case_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "verification_cases" v
      WHERE v."id" = NEW."verification_case_id"
        AND v."subject_type" = 'CLINIC' AND v."clinic_id" = NEW."clinic_id"
    ) THEN
      RAISE EXCEPTION 'verification case does not belong to onboarding clinic' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_file_assets' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "clinics" c
      JOIN "organization_memberships" m ON m."organization_id" = c."organization_id" AND m."status" = 'ACTIVE'
      JOIN "file_assets" f ON f."owner_user_id" = m."user_id"
      WHERE c."id" = NEW."clinic_id" AND f."id" = NEW."file_asset_id"
    ) THEN
      RAISE EXCEPTION 'clinic file owner is outside clinic tenant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_onboarding_documents' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "clinic_file_assets" cfa
      JOIN "file_assets" f ON f."id" = cfa."file_asset_id"
      WHERE cfa."clinic_id" = NEW."clinic_id" AND cfa."file_asset_id" = NEW."file_asset_id"
        AND f."status" = 'AVAILABLE' AND f."scan_status" = 'CLEAN'
    ) THEN
      RAISE EXCEPTION 'onboarding document is not a clean clinic file' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_team_invitations' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "clinics" c
      JOIN "organization_memberships" m ON m."organization_id" = c."organization_id" AND m."status" = 'ACTIVE'
      JOIN "role_definitions" r ON r."id" = m."role_id" AND r."code" = 'CLINIC_ADMIN'
      WHERE c."id" = NEW."clinic_id" AND c."organization_id" = NEW."organization_id"
        AND m."user_id" = NEW."invited_by_user_id"
    ) THEN
      RAISE EXCEPTION 'team invitation is outside clinic tenant or inviter is not an active admin' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_team_invitation_locations' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "clinic_team_invitations" i
      JOIN "clinic_locations" l ON l."clinic_id" = i."clinic_id"
      WHERE i."id" = NEW."invitation_id" AND l."id" = NEW."location_id"
    ) THEN
      RAISE EXCEPTION 'invitation location is outside clinic tenant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_staff_locations' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "clinic_staff" s
      JOIN "clinic_locations" l ON l."clinic_id" = s."clinic_id"
      WHERE s."id" = NEW."clinic_staff_id" AND l."id" = NEW."location_id"
    ) THEN
      RAISE EXCEPTION 'staff location is outside clinic tenant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_case_opportunities' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "clinics" c
      JOIN "case_assignments" a ON a."organization_id" = c."organization_id"
      WHERE c."id" = NEW."clinic_id" AND a."case_id" = NEW."case_id"
        AND a."kind" = 'CLINIC' AND a."ended_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'case opportunity has no active clinic assignment' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'availability_rules' THEN
    IF NOT EXISTS (SELECT 1 FROM "clinic_locations" l WHERE l."id" = NEW."location_id" AND l."clinic_id" = NEW."clinic_id")
      OR (NEW."dentist_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "dentist_clinic_affiliations" a
        WHERE a."clinic_id" = NEW."clinic_id" AND a."dentist_id" = NEW."dentist_id"
          AND a."active" = true AND a."ended_at" IS NULL
      )) THEN
      RAISE EXCEPTION 'availability scope is outside clinic tenant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'availability_blocks' THEN
    IF (NEW."location_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "clinic_locations" l WHERE l."id" = NEW."location_id" AND l."clinic_id" = NEW."clinic_id"
    )) OR (NEW."dentist_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "dentist_clinic_affiliations" a
      WHERE a."clinic_id" = NEW."clinic_id" AND a."dentist_id" = NEW."dentist_id"
        AND a."active" = true AND a."ended_at" IS NULL
    )) THEN
      RAISE EXCEPTION 'availability block scope is outside clinic tenant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_calendar_connections' THEN
    IF NEW."dentist_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "dentist_clinic_affiliations" a
      WHERE a."clinic_id" = NEW."clinic_id" AND a."dentist_id" = NEW."dentist_id"
        AND a."active" = true AND a."ended_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'calendar connection dentist is outside clinic tenant' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "clinic_onboarding_profiles_tenant_integrity" BEFORE INSERT OR UPDATE ON "clinic_onboarding_profiles" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "clinic_file_assets_tenant_integrity" BEFORE INSERT OR UPDATE ON "clinic_file_assets" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "clinic_onboarding_documents_tenant_integrity" BEFORE INSERT OR UPDATE ON "clinic_onboarding_documents" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "clinic_team_invitations_tenant_integrity" BEFORE INSERT OR UPDATE ON "clinic_team_invitations" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "clinic_team_invitation_locations_tenant_integrity" BEFORE INSERT OR UPDATE ON "clinic_team_invitation_locations" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "clinic_staff_locations_tenant_integrity" BEFORE INSERT OR UPDATE ON "clinic_staff_locations" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "clinic_case_opportunities_tenant_integrity" BEFORE INSERT OR UPDATE ON "clinic_case_opportunities" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "availability_rules_tenant_integrity" BEFORE INSERT OR UPDATE ON "availability_rules" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "availability_blocks_tenant_integrity" BEFORE INSERT OR UPDATE ON "availability_blocks" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();
CREATE TRIGGER "clinic_calendar_connections_tenant_integrity" BEFORE INSERT OR UPDATE ON "clinic_calendar_connections" FOR EACH ROW EXECUTE FUNCTION "enforce_clinic_operations_tenant_integrity"();

CREATE FUNCTION "protect_price_version_history"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'price versions are immutable history' USING ERRCODE = '23514';
  END IF;
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'price versions are immutable history' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "price_versions_immutable" BEFORE UPDATE OR DELETE ON "price_versions" FOR EACH ROW EXECUTE FUNCTION "protect_price_version_history"();

CREATE FUNCTION "enforce_appointment_clinic_availability"() RETURNS trigger AS $$
DECLARE
  policy RECORD;
  allow_overbooking BOOLEAN := false;
  fitting_capacity INTEGER;
  overlapping_count INTEGER;
BEGIN
  IF NEW."status" NOT IN ('TENTATIVE', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;
  IF NEW."clinic_location_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "clinic_locations" l
    WHERE l."id" = NEW."clinic_location_id" AND l."clinic_id" = NEW."clinic_id" AND l."active" = true
  ) THEN
    RAISE EXCEPTION 'appointment location is outside clinic tenant' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "availability_blocks" b
    WHERE b."clinic_id" = NEW."clinic_id" AND b."deleted_at" IS NULL
      AND (b."dentist_id" IS NULL OR b."dentist_id" = NEW."dentist_id")
      AND (b."location_id" IS NULL OR b."location_id" = NEW."clinic_location_id")
      AND tstzrange(b."starts_at", b."ends_at", '[)') && tstzrange(NEW."starts_at", NEW."ends_at", '[)')
  ) THEN
    RAISE EXCEPTION 'appointment overlaps blocked clinic time' USING ERRCODE = '23P01';
  END IF;
  SELECT * INTO policy FROM "clinic_scheduling_policies" p WHERE p."clinic_id" = NEW."clinic_id";
  IF FOUND THEN
    allow_overbooking := policy."overbooking_allowed";
    IF NEW."starts_at" < CURRENT_TIMESTAMP + make_interval(mins => policy."minimum_notice_minutes")
      OR NEW."starts_at" > CURRENT_TIMESTAMP + make_interval(days => policy."maximum_advance_days") THEN
      RAISE EXCEPTION 'appointment violates clinic notice or advance policy' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW."starts_at" IS DISTINCT FROM OLD."starts_at" OR NEW."ends_at" IS DISTINCT FROM OLD."ends_at")
      AND OLD."starts_at" < CURRENT_TIMESTAMP + make_interval(mins => policy."reschedule_cutoff_minutes") THEN
      RAISE EXCEPTION 'appointment is inside clinic reschedule cutoff' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM "availability_rules" r WHERE r."clinic_id" = NEW."clinic_id" AND r."active" = true) THEN
    SELECT MAX(r."capacity") INTO fitting_capacity
    FROM "availability_rules" r
    WHERE r."clinic_id" = NEW."clinic_id" AND r."active" = true
      AND (r."dentist_id" IS NULL OR r."dentist_id" = NEW."dentist_id")
      AND (NEW."clinic_location_id" IS NULL OR r."location_id" = NEW."clinic_location_id")
      AND r."effective_from" <= (NEW."starts_at" AT TIME ZONE r."timezone")::date
      AND (r."effective_until" IS NULL OR r."effective_until" >= (NEW."starts_at" AT TIME ZONE r."timezone")::date)
      AND r."day_of_week" = EXTRACT(DOW FROM NEW."starts_at" AT TIME ZONE r."timezone")::integer
      AND (NEW."ends_at" AT TIME ZONE r."timezone")::date = (NEW."starts_at" AT TIME ZONE r."timezone")::date
      AND r."starts_at_minute" <= EXTRACT(HOUR FROM NEW."starts_at" AT TIME ZONE r."timezone")::integer * 60 + EXTRACT(MINUTE FROM NEW."starts_at" AT TIME ZONE r."timezone")::integer
      AND r."ends_at_minute" >= EXTRACT(HOUR FROM NEW."ends_at" AT TIME ZONE r."timezone")::integer * 60 + EXTRACT(MINUTE FROM NEW."ends_at" AT TIME ZONE r."timezone")::integer
      AND (r."slot_kind" = 'BOTH' OR r."slot_kind"::text = CASE WHEN NEW."kind" = 'CONSULTATION' THEN 'CONSULTATION' ELSE 'TREATMENT' END);
    IF fitting_capacity IS NULL THEN
      RAISE EXCEPTION 'appointment is outside governed clinic availability' USING ERRCODE = '23514';
    END IF;
    IF NEW."clinic_location_id" IS NOT NULL AND allow_overbooking = false THEN
      SELECT COUNT(*) INTO overlapping_count FROM "appointments" a
      WHERE a."id" <> NEW."id" AND a."clinic_location_id" = NEW."clinic_location_id"
        AND a."status" IN ('TENTATIVE','CONFIRMED')
        AND tstzrange(a."starts_at", a."ends_at", '[)') && tstzrange(NEW."starts_at", NEW."ends_at", '[)');
      IF overlapping_count >= fitting_capacity THEN
        RAISE EXCEPTION 'appointment exceeds location capacity' USING ERRCODE = '23P01';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "appointments_clinic_availability"
  BEFORE INSERT OR UPDATE OF "clinic_id", "clinic_location_id", "dentist_id", "kind", "starts_at", "ends_at" ON "appointments"
  FOR EACH ROW EXECUTE FUNCTION "enforce_appointment_clinic_availability"();
