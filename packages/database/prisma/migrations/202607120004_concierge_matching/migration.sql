-- Explainable organic clinic matching, patient shortlists, consented
-- introductions, and concierge operations. No commercial-ranking field exists
-- in the algorithm persistence contract.

CREATE TYPE "CaseComplexityCategory" AS ENUM ('UNKNOWN', 'STANDARD', 'COMPLEX');
CREATE TYPE "MatchingCriteriaSource" AS ENUM ('PATIENT', 'CONCIERGE');
CREATE TYPE "ShortlistStatus" AS ENUM ('PROPOSED', 'SHARED', 'INTERESTED', 'INTRO_REQUESTED', 'INTRODUCED', 'DECLINED', 'REMOVED');
CREATE TYPE "IntroductionRequestStatus" AS ENUM ('REQUESTED', 'CONTACTED', 'INTRODUCED', 'CLOSED', 'CANCELLED');
CREATE TYPE "ConciergePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "ConciergeWorkStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PATIENT', 'WAITING_CLINIC', 'SUPERVISOR_REVIEW', 'HANDED_OFF', 'RESOLVED');
CREATE TYPE "ConciergeTaskKind" AS ENUM ('MISSING_DOCUMENT', 'MATCHING', 'APPOINTMENT', 'TRAVEL', 'AFTERCARE', 'INCIDENT', 'FOLLOW_UP', 'OTHER');
CREATE TYPE "ConciergeTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');
CREATE TYPE "ConciergeCommunicationChannel" AS ENUM ('PHONE', 'EMAIL', 'MESSAGE', 'VIDEO', 'IN_PERSON', 'SYSTEM');
CREATE TYPE "ConciergeCommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');
CREATE TYPE "ConciergeHandoffStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED');
CREATE TYPE "ConciergeReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

CREATE TABLE "clinic_discovery_profiles" (
  "clinic_id" UUID NOT NULL,
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "equipment" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "accessibility_features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "supported_complexities" "CaseComplexityCategory"[] NOT NULL DEFAULT ARRAY[]::"CaseComplexityCategory"[],
  "aftercare_supported" BOOLEAN NOT NULL DEFAULT false,
  "follow_up_data_available" BOOLEAN NOT NULL DEFAULT false,
  "earliest_consultation_at" TIMESTAMPTZ(6),
  "evidence_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_discovery_profiles_pkey" PRIMARY KEY ("clinic_id")
);

CREATE TABLE "saved_clinics" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_clinics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_matching_criteria" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "source" "MatchingCriteriaSource" NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "procedure_code" TEXT NOT NULL,
  "preferred_city" TEXT,
  "preferred_district" TEXT,
  "arrival_date" DATE,
  "departure_date" DATE,
  "preferred_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "budget_minimum_minor" BIGINT,
  "budget_maximum_minor" BIGINT,
  "budget_currency" "Currency",
  "complexity_category" "CaseComplexityCategory" NOT NULL DEFAULT 'UNKNOWN',
  "requires_aftercare" BOOLEAN NOT NULL DEFAULT false,
  "requires_warranty" BOOLEAN NOT NULL DEFAULT false,
  "accessibility_needs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferred_equipment" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferences" JSONB NOT NULL,
  "input_checksum" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_matching_criteria_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "matching_results"
  ADD COLUMN "criteria_version_id" UUID,
  ADD COLUMN "organic_rank" INTEGER;

CREATE TABLE "case_shortlist_entries" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "matching_result_id" UUID NOT NULL,
  "organic_rank" INTEGER NOT NULL,
  "displayed_rank" INTEGER NOT NULL,
  "status" "ShortlistStatus" NOT NULL DEFAULT 'PROPOSED',
  "encrypted_override_reason" TEXT,
  "override_by_user_id" UUID,
  "overridden_at" TIMESTAMPTZ(6),
  "shared_at" TIMESTAMPTZ(6),
  "patient_interested_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "case_shortlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "introduction_requests" (
  "id" UUID NOT NULL,
  "shortlist_entry_id" UUID NOT NULL,
  "consent_record_id" UUID NOT NULL,
  "patient_user_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "handled_by_user_id" UUID,
  "status" "IntroductionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "encrypted_patient_note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "handled_at" TIMESTAMPTZ(6),
  CONSTRAINT "introduction_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concierge_case_workspaces" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "concierge_organization_id" UUID NOT NULL,
  "assigned_agent_user_id" UUID,
  "supervisor_user_id" UUID,
  "priority" "ConciergePriority" NOT NULL DEFAULT 'NORMAL',
  "status" "ConciergeWorkStatus" NOT NULL DEFAULT 'UNASSIGNED',
  "sla_due_at" TIMESTAMPTZ(6) NOT NULL,
  "encrypted_patient_summary" TEXT,
  "missing_document_categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "version" INTEGER NOT NULL DEFAULT 1,
  "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "concierge_case_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concierge_internal_notes" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "encrypted_body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "concierge_internal_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concierge_travel_notes" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "encrypted_body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "concierge_travel_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concierge_communication_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "channel" "ConciergeCommunicationChannel" NOT NULL,
  "direction" "ConciergeCommunicationDirection" NOT NULL,
  "encrypted_summary" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "concierge_communication_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concierge_tasks" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "kind" "ConciergeTaskKind" NOT NULL,
  "status" "ConciergeTaskStatus" NOT NULL DEFAULT 'TODO',
  "encrypted_title" TEXT NOT NULL,
  "encrypted_details" TEXT,
  "assigned_user_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "due_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "concierge_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concierge_handoffs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "from_user_id" UUID NOT NULL,
  "to_user_id" UUID NOT NULL,
  "encrypted_reason" TEXT NOT NULL,
  "status" "ConciergeHandoffStatus" NOT NULL DEFAULT 'PENDING',
  "request_id" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at" TIMESTAMPTZ(6),
  CONSTRAINT "concierge_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concierge_supervisor_reviews" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "reviewer_user_id" UUID NOT NULL,
  "decision" "ConciergeReviewDecision" NOT NULL,
  "encrypted_note" TEXT NOT NULL,
  "workspace_version" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "concierge_supervisor_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_clinics_user_id_clinic_id_key" ON "saved_clinics"("user_id", "clinic_id");
CREATE INDEX "saved_clinics_user_id_created_at_idx" ON "saved_clinics"("user_id", "created_at");
CREATE INDEX "clinic_discovery_profiles_earliest_consultation_at_idx" ON "clinic_discovery_profiles"("earliest_consultation_at");
CREATE UNIQUE INDEX "case_matching_criteria_case_id_version_key" ON "case_matching_criteria"("case_id", "version");
CREATE INDEX "case_matching_criteria_case_id_created_at_idx" ON "case_matching_criteria"("case_id", "created_at");
CREATE UNIQUE INDEX "matching_results_criteria_version_id_clinic_id_key" ON "matching_results"("criteria_version_id", "clinic_id");
CREATE UNIQUE INDEX "case_shortlist_entries_case_id_clinic_id_key" ON "case_shortlist_entries"("case_id", "clinic_id");
CREATE INDEX "case_shortlist_entries_case_id_status_displayed_rank_idx" ON "case_shortlist_entries"("case_id", "status", "displayed_rank");
CREATE UNIQUE INDEX "introduction_requests_shortlist_entry_id_key" ON "introduction_requests"("shortlist_entry_id");
CREATE INDEX "introduction_requests_status_created_at_idx" ON "introduction_requests"("status", "created_at");
CREATE UNIQUE INDEX "concierge_case_workspaces_case_id_key" ON "concierge_case_workspaces"("case_id");
CREATE INDEX "concierge_case_workspaces_org_status_priority_sla_idx" ON "concierge_case_workspaces"("concierge_organization_id", "status", "priority", "sla_due_at");
CREATE INDEX "concierge_case_workspaces_agent_status_sla_idx" ON "concierge_case_workspaces"("assigned_agent_user_id", "status", "sla_due_at");
CREATE INDEX "concierge_internal_notes_workspace_id_created_at_idx" ON "concierge_internal_notes"("workspace_id", "created_at");
CREATE INDEX "concierge_travel_notes_workspace_id_created_at_idx" ON "concierge_travel_notes"("workspace_id", "created_at");
CREATE INDEX "concierge_communication_events_workspace_id_occurred_at_idx" ON "concierge_communication_events"("workspace_id", "occurred_at");
CREATE INDEX "concierge_tasks_workspace_id_status_due_at_idx" ON "concierge_tasks"("workspace_id", "status", "due_at");
CREATE INDEX "concierge_tasks_assigned_user_id_status_due_at_idx" ON "concierge_tasks"("assigned_user_id", "status", "due_at");
CREATE INDEX "concierge_handoffs_workspace_id_status_created_at_idx" ON "concierge_handoffs"("workspace_id", "status", "created_at");
CREATE INDEX "concierge_handoffs_to_user_id_status_created_at_idx" ON "concierge_handoffs"("to_user_id", "status", "created_at");
CREATE INDEX "concierge_supervisor_reviews_workspace_id_created_at_idx" ON "concierge_supervisor_reviews"("workspace_id", "created_at");

ALTER TABLE "clinic_discovery_profiles" ADD CONSTRAINT "clinic_discovery_profiles_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_clinics" ADD CONSTRAINT "saved_clinics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_clinics" ADD CONSTRAINT "saved_clinics_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_matching_criteria" ADD CONSTRAINT "case_matching_criteria_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_matching_criteria" ADD CONSTRAINT "case_matching_criteria_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "matching_results" ADD CONSTRAINT "matching_results_criteria_version_id_fkey" FOREIGN KEY ("criteria_version_id") REFERENCES "case_matching_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_shortlist_entries" ADD CONSTRAINT "case_shortlist_entries_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_shortlist_entries" ADD CONSTRAINT "case_shortlist_entries_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_shortlist_entries" ADD CONSTRAINT "case_shortlist_entries_matching_result_id_fkey" FOREIGN KEY ("matching_result_id") REFERENCES "matching_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_shortlist_entries" ADD CONSTRAINT "case_shortlist_entries_override_by_user_id_fkey" FOREIGN KEY ("override_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_shortlist_entry_id_fkey" FOREIGN KEY ("shortlist_entry_id") REFERENCES "case_shortlist_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_case_workspaces" ADD CONSTRAINT "concierge_case_workspaces_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_case_workspaces" ADD CONSTRAINT "concierge_case_workspaces_organization_id_fkey" FOREIGN KEY ("concierge_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_case_workspaces" ADD CONSTRAINT "concierge_case_workspaces_assigned_agent_user_id_fkey" FOREIGN KEY ("assigned_agent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_case_workspaces" ADD CONSTRAINT "concierge_case_workspaces_supervisor_user_id_fkey" FOREIGN KEY ("supervisor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_internal_notes" ADD CONSTRAINT "concierge_internal_notes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "concierge_case_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_internal_notes" ADD CONSTRAINT "concierge_internal_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_travel_notes" ADD CONSTRAINT "concierge_travel_notes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "concierge_case_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_travel_notes" ADD CONSTRAINT "concierge_travel_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_communication_events" ADD CONSTRAINT "concierge_communication_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "concierge_case_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_communication_events" ADD CONSTRAINT "concierge_communication_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_tasks" ADD CONSTRAINT "concierge_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "concierge_case_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_tasks" ADD CONSTRAINT "concierge_tasks_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_tasks" ADD CONSTRAINT "concierge_tasks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_handoffs" ADD CONSTRAINT "concierge_handoffs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "concierge_case_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_handoffs" ADD CONSTRAINT "concierge_handoffs_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_handoffs" ADD CONSTRAINT "concierge_handoffs_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_supervisor_reviews" ADD CONSTRAINT "concierge_supervisor_reviews_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "concierge_case_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concierge_supervisor_reviews" ADD CONSTRAINT "concierge_supervisor_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "case_matching_criteria" ADD CONSTRAINT "case_matching_criteria_values_check" CHECK (
  "version" > 0
  AND "input_checksum" ~ '^[a-f0-9]{64}$'
  AND ("departure_date" IS NULL OR "arrival_date" IS NULL OR "departure_date" >= "arrival_date")
  AND ("budget_minimum_minor" IS NULL OR "budget_minimum_minor" >= 0)
  AND ("budget_maximum_minor" IS NULL OR "budget_maximum_minor" >= 0)
  AND ("budget_minimum_minor" IS NULL OR "budget_maximum_minor" IS NULL OR "budget_maximum_minor" >= "budget_minimum_minor")
  AND (("budget_minimum_minor" IS NULL AND "budget_maximum_minor" IS NULL) OR "budget_currency" IS NOT NULL)
);
ALTER TABLE "matching_results" ADD CONSTRAINT "matching_results_organic_metadata_check" CHECK (
  ("criteria_version_id" IS NULL AND "organic_rank" IS NULL)
  OR ("criteria_version_id" IS NOT NULL AND "organic_rank" > 0)
);
ALTER TABLE "case_shortlist_entries" ADD CONSTRAINT "case_shortlist_entries_rank_override_check" CHECK (
  "organic_rank" > 0 AND "displayed_rank" > 0
  AND (
    ("organic_rank" = "displayed_rank" AND "encrypted_override_reason" IS NULL AND "override_by_user_id" IS NULL AND "overridden_at" IS NULL)
    OR ("organic_rank" <> "displayed_rank" AND "encrypted_override_reason" LIKE 'v1.%' AND "override_by_user_id" IS NOT NULL AND "overridden_at" IS NOT NULL)
  )
  AND ("status" IN ('PROPOSED', 'REMOVED') OR "shared_at" IS NOT NULL)
);
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_state_check" CHECK (
  ("encrypted_patient_note" IS NULL OR "encrypted_patient_note" LIKE 'v1.%')
  AND (("handled_at" IS NULL AND "handled_by_user_id" IS NULL) OR ("handled_at" IS NOT NULL AND "handled_by_user_id" IS NOT NULL))
);
ALTER TABLE "concierge_case_workspaces" ADD CONSTRAINT "concierge_case_workspaces_state_check" CHECK (
  "version" > 0 AND "sla_due_at" >= "created_at"
  AND ("encrypted_patient_summary" IS NULL OR "encrypted_patient_summary" LIKE 'v1.%')
  AND (("status" = 'UNASSIGNED' AND "assigned_agent_user_id" IS NULL) OR ("status" <> 'UNASSIGNED' AND "assigned_agent_user_id" IS NOT NULL))
);
ALTER TABLE "concierge_tasks" ADD CONSTRAINT "concierge_tasks_state_check" CHECK (
  "version" > 0 AND "encrypted_title" LIKE 'v1.%'
  AND ("encrypted_details" IS NULL OR "encrypted_details" LIKE 'v1.%')
  AND (("status" = 'DONE' AND "completed_at" IS NOT NULL) OR ("status" <> 'DONE' AND "completed_at" IS NULL))
);
ALTER TABLE "concierge_handoffs" ADD CONSTRAINT "concierge_handoffs_state_check" CHECK (
  "from_user_id" <> "to_user_id" AND "encrypted_reason" LIKE 'v1.%'
  AND (("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL) OR ("status" <> 'ACCEPTED' AND "accepted_at" IS NULL))
);
ALTER TABLE "concierge_supervisor_reviews" ADD CONSTRAINT "concierge_supervisor_reviews_values_check" CHECK (
  "workspace_version" > 0 AND "encrypted_note" LIKE 'v1.%'
);
ALTER TABLE "concierge_internal_notes" ADD CONSTRAINT "concierge_internal_notes_body_check" CHECK ("encrypted_body" LIKE 'v1.%');
ALTER TABLE "concierge_travel_notes" ADD CONSTRAINT "concierge_travel_notes_body_check" CHECK ("encrypted_body" LIKE 'v1.%');
ALTER TABLE "concierge_communication_events" ADD CONSTRAINT "concierge_communication_events_summary_check" CHECK ("encrypted_summary" LIKE 'v1.%');

CREATE TRIGGER "case_matching_criteria_append_only" BEFORE UPDATE OR DELETE ON "case_matching_criteria" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "matching_results_append_only" BEFORE UPDATE OR DELETE ON "matching_results" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "concierge_internal_notes_append_only" BEFORE UPDATE OR DELETE ON "concierge_internal_notes" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "concierge_travel_notes_append_only" BEFORE UPDATE OR DELETE ON "concierge_travel_notes" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "concierge_communication_events_append_only" BEFORE UPDATE OR DELETE ON "concierge_communication_events" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "concierge_supervisor_reviews_append_only" BEFORE UPDATE OR DELETE ON "concierge_supervisor_reviews" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();

CREATE FUNCTION "protect_concierge_handoff"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'concierge handoffs cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF OLD."status" <> 'PENDING'
     OR NEW."status" NOT IN ('ACCEPTED', 'CANCELLED')
     OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
     OR NEW."from_user_id" IS DISTINCT FROM OLD."from_user_id"
     OR NEW."to_user_id" IS DISTINCT FROM OLD."to_user_id"
     OR NEW."encrypted_reason" IS DISTINCT FROM OLD."encrypted_reason"
     OR NEW."request_id" IS DISTINCT FROM OLD."request_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'concierge handoff evidence is immutable outside its first decision' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "concierge_handoffs_protected"
  BEFORE UPDATE OR DELETE ON "concierge_handoffs"
  FOR EACH ROW EXECUTE FUNCTION "protect_concierge_handoff"();

CREATE FUNCTION "enforce_matching_shortlist_integrity"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'matching_results' THEN
    IF NEW."criteria_version_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "case_matching_criteria" c
      JOIN "clinics" cl ON cl."id" = NEW."clinic_id"
      WHERE c."id" = NEW."criteria_version_id" AND c."case_id" = NEW."case_id"
        AND cl."verification_status" = 'VERIFIED' AND cl."deleted_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'organic match criteria, case, or verified clinic is inconsistent' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'case_shortlist_entries' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "matching_results" r
      WHERE r."id" = NEW."matching_result_id"
        AND r."case_id" = NEW."case_id" AND r."clinic_id" = NEW."clinic_id"
        AND r."organic_rank" = NEW."organic_rank"
    ) THEN
      RAISE EXCEPTION 'shortlist entry does not match its organic result' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'introduction_requests' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "case_shortlist_entries" se
      JOIN "dental_cases" dc ON dc."id" = se."case_id"
      JOIN "patient_profiles" pp ON pp."id" = dc."patient_profile_id"
      JOIN "consent_records" cr ON cr."id" = NEW."consent_record_id"
      JOIN "consent_text_versions" ctv ON ctv."id" = cr."consent_text_version_id"
      JOIN "sessions" s ON s."id" = NEW."session_id"
      WHERE se."id" = NEW."shortlist_entry_id" AND se."status" IN ('INTERESTED', 'INTRO_REQUESTED')
        AND pp."user_id" = NEW."patient_user_id"
        AND cr."user_id" = NEW."patient_user_id" AND cr."withdrawn_at" IS NULL
        AND ctv."purpose" = 'CLINIC_INTRODUCTION'
        AND s."user_id" = NEW."patient_user_id" AND s."revoked_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'clinic introduction lacks attributable active patient consent' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "matching_results_case_integrity" BEFORE INSERT ON "matching_results" FOR EACH ROW EXECUTE FUNCTION "enforce_matching_shortlist_integrity"();
CREATE TRIGGER "case_shortlist_entries_result_integrity" BEFORE INSERT OR UPDATE ON "case_shortlist_entries" FOR EACH ROW EXECUTE FUNCTION "enforce_matching_shortlist_integrity"();
CREATE TRIGGER "introduction_requests_consent_integrity" BEFORE INSERT OR UPDATE ON "introduction_requests" FOR EACH ROW EXECUTE FUNCTION "enforce_matching_shortlist_integrity"();

CREATE FUNCTION "enforce_concierge_workspace_integrity"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "organizations" o
    JOIN "case_assignments" ca ON ca."organization_id" = o."id"
    WHERE o."id" = NEW."concierge_organization_id" AND o."type" = 'CONCIERGE' AND o."deleted_at" IS NULL
      AND ca."case_id" = NEW."case_id" AND ca."kind" = 'CONCIERGE' AND ca."ended_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'concierge workspace lacks an active concierge organization assignment' USING ERRCODE = '23514';
  END IF;
  IF NEW."assigned_agent_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "organization_memberships" om
    JOIN "role_definitions" rd ON rd."id" = om."role_id"
    WHERE om."organization_id" = NEW."concierge_organization_id"
      AND om."user_id" = NEW."assigned_agent_user_id" AND om."status" = 'ACTIVE'
      AND rd."code" = 'CONCIERGE_AGENT'
  ) THEN
    RAISE EXCEPTION 'assigned concierge agent is not an active organization member' USING ERRCODE = '23514';
  END IF;
  IF NEW."supervisor_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "organization_memberships" om
    JOIN "role_definitions" rd ON rd."id" = om."role_id"
    WHERE om."organization_id" = NEW."concierge_organization_id"
      AND om."user_id" = NEW."supervisor_user_id" AND om."status" = 'ACTIVE'
      AND rd."code" = 'CONCIERGE_AGENT'
  ) THEN
    RAISE EXCEPTION 'concierge supervisor is not an active organization member' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "concierge_case_workspaces_assignment_integrity"
  BEFORE INSERT OR UPDATE ON "concierge_case_workspaces"
  FOR EACH ROW EXECUTE FUNCTION "enforce_concierge_workspace_integrity"();
