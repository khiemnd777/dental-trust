-- Required PostgreSQL extensions for case-insensitive identity and overlap constraints.
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('PATIENT', 'CAREGIVER', 'DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN', 'CONCIERGE_AGENT', 'VERIFICATION_OFFICER', 'SUPPORT_AGENT', 'FINANCE_ADMIN', 'CONTENT_ADMIN', 'PLATFORM_ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'DELETION_REQUESTED', 'DELETED');

-- CreateEnum
CREATE TYPE "AccountLifecycleTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('CLINIC', 'CONCIERGE', 'PLATFORM');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CaregiverPermission" AS ENUM ('VIEW_CASE_SUMMARY', 'VIEW_APPOINTMENTS', 'VIEW_TREATMENT_PLANS', 'VIEW_FINANCIAL_INFORMATION', 'VIEW_DOCUMENTS', 'UPLOAD_DOCUMENTS', 'PARTICIPATE_IN_MESSAGES', 'APPROVE_NON_CLINICAL_ARRANGEMENTS', 'RECEIVE_NOTIFICATIONS');

-- CreateEnum
CREATE TYPE "DentalCaseStatus" AS ENUM ('DRAFT', 'RECORDS_PENDING', 'INTAKE_REVIEW', 'ADDITIONAL_INFORMATION_REQUESTED', 'MATCHING_IN_PROGRESS', 'CLINICS_SHORTLISTED', 'TREATMENT_PLANS_PENDING', 'TREATMENT_PLANS_READY', 'CONSULTATION_SCHEDULED', 'CONSULTATION_COMPLETED', 'PATIENT_DECISION_PENDING', 'BOOKING_PENDING', 'BOOKED', 'IN_TREATMENT', 'TREATMENT_COMPLETED', 'AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('CLINIC', 'DENTIST', 'CONCIERGE', 'SUPPORT');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('VND', 'USD');

-- CreateEnum
CREATE TYPE "FileAssetStatus" AS ENUM ('QUARANTINED', 'SCANNING', 'AVAILABLE', 'REJECTED', 'DELETION_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "MalwareScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "TreatmentPlanVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('TENTATIVE', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentKind" AS ENUM ('CONSULTATION', 'CLINICAL_VISIT');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_DEPOSIT', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_PAYMENT_METHOD', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'PROVIDER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_SUBMITTED', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'SITE_AUDIT_REQUIRED', 'APPROVED', 'VERIFIED', 'VERIFICATION_EXPIRING', 'EXPIRED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewModerationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageVisibility" AS ENUM ('PARTICIPANTS', 'STAFF_INTERNAL');

-- CreateEnum
CREATE TYPE "JourneyMilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TreatmentInstructionType" AS ENUM ('MEDICATION', 'DISCHARGE', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "PlanChangeKind" AS ENUM ('TREATMENT', 'PRICE', 'TREATMENT_AND_PRICE');

-- CreateEnum
CREATE TYPE "PassportVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SecureShareAccessOutcome" AS ENUM ('GRANTED', 'DENIED_EXPIRED', 'DENIED_REVOKED', 'DENIED_ACCESS_LIMIT');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'AWAITING_CLINIC', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'REMEDIATION_IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'MESSAGING');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('EXPORT', 'DELETE', 'RECTIFY', 'RESTRICT_PROCESSING', 'WITHDRAW_CONSENT');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('SUBMITTED', 'IDENTITY_VERIFICATION_REQUIRED', 'IN_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupportElevationStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "QuestionnaireVersionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SmokingStatus" AS ENUM ('NEVER', 'FORMER', 'CURRENT', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('NOT_APPLICABLE', 'NOT_PREGNANT', 'PREGNANT', 'UNSURE', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "preferred_locale" TEXT NOT NULL DEFAULT 'vi-VN',
    "account_status" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_definitions" (
    "id" UUID NOT NULL,
    "code" "SystemRole" NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_privileged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_definitions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permission_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "mfa_verified_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address_hash" CHAR(64),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_configurations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "encrypted_secret" TEXT,
    "pending_encrypted_secret" TEXT,
    "enabled_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "mfa_configuration_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_lifecycle_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AccountLifecycleTokenType" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_lifecycle_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_entity_name" TEXT NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "verified_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_locations" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "timezone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentists" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "slug" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_status" "VerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dentists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentist_clinic_affiliations" (
    "id" UUID NOT NULL,
    "dentist_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "dentist_clinic_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "preferred_currency" "Currency" NOT NULL DEFAULT 'USD',
    "current_country" TEXT,
    "current_city" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "encrypted_medical_data" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encrypted_name" TEXT NOT NULL,
    "encrypted_phone" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_text_versions" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consent_text_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "consent_text_version_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(6),
    "request_id" TEXT NOT NULL,
    "session_id" UUID,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_cases" (
    "id" UUID NOT NULL,
    "case_number" TEXT NOT NULL,
    "patient_profile_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "desired_procedure_code" TEXT NOT NULL,
    "preferred_location" TEXT,
    "expected_arrival_date" DATE,
    "expected_departure_date" DATE,
    "preferred_currency" "Currency" NOT NULL DEFAULT 'USD',
    "status" "DentalCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "closed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dental_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_status_history" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "from_status" "DentalCaseStatus",
    "to_status" "DentalCaseStatus" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_assignments" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "kind" "AssignmentKind" NOT NULL,
    "organization_id" UUID,
    "assigned_user_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "case_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_grants" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "patient_profile_id" UUID NOT NULL,
    "caregiver_user_id" UUID NOT NULL,
    "permissions" "CaregiverPermission"[],
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "last_accessed_at" TIMESTAMPTZ(6),

    CONSTRAINT "caregiver_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_results" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "fit_score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "evidence_ids" JSONB NOT NULL,
    "algorithm_version" TEXT NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_versions" (
    "id" UUID NOT NULL,
    "treatment_plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TreatmentPlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "authoring_dentist_id" UUID NOT NULL,
    "preliminary_assessment" TEXT NOT NULL,
    "diagnosis_statement" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "warranty_terms" TEXT NOT NULL,
    "exclusions" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "content_checksum" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_items" (
    "id" UUID NOT NULL,
    "treatment_plan_version_id" UUID NOT NULL,
    "procedure_code" TEXT NOT NULL,
    "tooth_numbers" INTEGER[],
    "quantity" INTEGER NOT NULL,
    "material" TEXT,
    "brand" TEXT,
    "unit_price_minor" BIGINT NOT NULL,
    "total_price_minor" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "treatment_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_acceptances" (
    "id" UUID NOT NULL,
    "treatment_plan_version_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "consent_text_version_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plan_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "dentist_id" UUID,
    "kind" "AppointmentKind" NOT NULL DEFAULT 'CONSULTATION',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'TENTATIVE',
    "timezone" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "meeting_provider" TEXT,
    "encrypted_join_url" TEXT,
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "treatment_plan_version_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_DEPOSIT',
    "deposit_minor" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_payment_intent_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT_METHOD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "provider_event_created_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "provider_refund_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "provider_event_created_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "declared_media_type" TEXT NOT NULL,
    "detected_media_type" TEXT,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64),
    "status" "FileAssetStatus" NOT NULL DEFAULT 'QUARANTINED',
    "scan_status" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "retention_until" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secure_shares" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "file_asset_id" UUID,
    "passport_version_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "revoked_by_user_id" UUID,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "max_access_count" INTEGER,
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secure_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secure_share_access_logs" (
    "id" UUID NOT NULL,
    "secure_share_id" UUID NOT NULL,
    "outcome" "SecureShareAccessOutcome" NOT NULL,
    "ip_address_hash" CHAR(64),
    "user_agent_hash" CHAR(64),
    "accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secure_share_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_cases" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verification_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_evidence" (
    "id" UUID NOT NULL,
    "verification_case_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "file_asset_id" UUID,
    "source_reference" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aftercare_plans" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "aftercare_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aftercare_check_ins" (
    "id" UUID NOT NULL,
    "aftercare_plan_id" UUID NOT NULL,
    "pain_scale" INTEGER NOT NULL,
    "symptom_codes" TEXT[],
    "patient_notes" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aftercare_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aftercare_escalations" (
    "id" UUID NOT NULL,
    "aftercare_check_in_id" UUID NOT NULL,
    "severity" TEXT NOT NULL,
    "matched_rule_ids" TEXT[],
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aftercare_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_user_id" UUID NOT NULL,
    "overall_rating" INTEGER NOT NULL,
    "dimension_ratings" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "treatment_date" DATE NOT NULL,
    "follow_up_days" INTEGER NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "moderation_status" "ReviewModerationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_follow_ups" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "follow_up_days" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "overall_rating" INTEGER,
    "moderation_status" "ReviewModerationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_responses" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "moderation_status" "ReviewModerationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_abuse_reports" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reason_code" TEXT NOT NULL,
    "encrypted_details" TEXT NOT NULL,
    "status" "ReviewReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_abuse_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "AuditActorType" NOT NULL DEFAULT 'USER',
    "actor_user_id" UUID,
    "impersonator_user_id" UUID,
    "organization_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "reason" TEXT,
    "success" BOOLEAN NOT NULL,
    "before_metadata" JSONB,
    "after_metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "lock_owner" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "resource_id" TEXT,
    "response" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_started_at" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "visibility" "MessageVisibility" NOT NULL DEFAULT 'PARTICIPANTS',
    "encrypted_body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "message_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("message_id","file_asset_id")
);

-- CreateTable
CREATE TABLE "message_read_receipts" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_read_receipts_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateTable
CREATE TABLE "internal_notes" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "encrypted_body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_milestones" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "JourneyMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_user_id" UUID,
    "sort_order" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "treatment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_instructions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "milestone_id" UUID,
    "author_user_id" UUID NOT NULL,
    "type" "TreatmentInstructionType" NOT NULL,
    "locale" TEXT NOT NULL,
    "encrypted_content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_events" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_change_requests" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "from_plan_version_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "kind" "PlanChangeKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "before_values" JSONB NOT NULL,
    "after_values" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_change_acknowledgements" (
    "id" UUID NOT NULL,
    "plan_change_request_id" UUID NOT NULL,
    "patient_user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_change_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_passports" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dental_passports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_passport_versions" (
    "id" UUID NOT NULL,
    "dental_passport_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "treating_dentist_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "published_by_user_id" UUID,
    "version" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "status" "PassportVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "treatment_completed_at" DATE NOT NULL,
    "encrypted_treatment_summary" TEXT NOT NULL,
    "encrypted_discharge_instructions" TEXT NOT NULL,
    "encrypted_follow_up_instructions" TEXT NOT NULL,
    "content_checksum" CHAR(64) NOT NULL,
    "previous_version_checksum" CHAR(64),
    "generated_file_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dental_passport_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implant_records" (
    "id" UUID NOT NULL,
    "dental_passport_version_id" UUID NOT NULL,
    "tooth_number" INTEGER NOT NULL,
    "system" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "abutment_details" TEXT,
    "lot_number" TEXT,

    CONSTRAINT "implant_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_records" (
    "id" UUID NOT NULL,
    "dental_passport_version_id" UUID NOT NULL,
    "procedure_code" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "manufacturer" TEXT,
    "lot_number" TEXT,

    CONSTRAINT "material_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_records" (
    "id" UUID NOT NULL,
    "dental_passport_version_id" UUID NOT NULL,
    "encrypted_medication" TEXT NOT NULL,
    "encrypted_dosage" TEXT NOT NULL,
    "encrypted_instructions" TEXT NOT NULL,
    "prescribed_at" DATE NOT NULL,

    CONSTRAINT "prescription_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "clinic_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL,
    "encrypted_details" TEXT NOT NULL,
    "sla_due_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "visibility" "MessageVisibility" NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_attachments" (
    "incident_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,

    CONSTRAINT "incident_attachments_pkey" PRIMARY KEY ("incident_id","file_asset_id")
);

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "warranty_terms" TEXT NOT NULL,
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template_key" TEXT NOT NULL,
    "template_locale" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_pages" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_requests" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "encrypted_name" TEXT NOT NULL,
    "encrypted_email" TEXT NOT NULL,
    "encrypted_topic" TEXT NOT NULL,
    "encrypted_message" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi-VN',
    "request_id" VARCHAR(128) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "requester_user_id" UUID NOT NULL,
    "handled_by_user_id" UUID,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "encrypted_reason" TEXT NOT NULL,
    "encrypted_patient_message" TEXT,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_elevations" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "approved_by_user_id" UUID NOT NULL,
    "ticket_reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "capabilities" TEXT[],
    "status" "SupportElevationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_elevations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_staff" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "clinic_location_id" UUID,
    "job_title" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_licenses" (
    "id" UUID NOT NULL,
    "clinic_id" UUID,
    "dentist_id" UUID,
    "authority" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "scope_of_practice" TEXT,
    "issued_at" DATE,
    "expires_at" DATE,
    "status" "VerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "code" TEXT NOT NULL,
    "names" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_definitions" (
    "id" UUID NOT NULL,
    "service_category_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "names" JSONB NOT NULL,
    "descriptions" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "procedure_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_policies" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "warranty_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_services" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "procedure_definition_id" UUID NOT NULL,
    "warranty_policy_id" UUID,
    "display_names" JSONB NOT NULL,
    "included_services" TEXT[],
    "exclusions" TEXT[],
    "estimated_duration_days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_versions" (
    "id" UUID NOT NULL,
    "clinic_service_id" UUID NOT NULL,
    "minimum_minor" BIGINT NOT NULL,
    "maximum_minor" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL,
    "material_options" JSONB,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_questionnaires" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_questionnaire_versions" (
    "id" UUID NOT NULL,
    "questionnaire_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuestionnaireVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "desired_procedure_code" TEXT NOT NULL,
    "dental_concerns" TEXT[],
    "treatment_goals" TEXT[],
    "cosmetic_expectations" TEXT,
    "current_country" TEXT NOT NULL,
    "current_city" TEXT NOT NULL,
    "expected_arrival_date" DATE,
    "expected_departure_date" DATE,
    "preferred_location" TEXT,
    "available_treatment_days" INTEGER,
    "budget_minimum_minor" BIGINT,
    "budget_maximum_minor" BIGINT,
    "budget_currency" "Currency",
    "preferred_language" TEXT NOT NULL,
    "prior_dental_work" TEXT,
    "existing_implant_systems" TEXT[],
    "smoking_status" "SmokingStatus" NOT NULL,
    "pregnancy_status" "PregnancyStatus" NOT NULL,
    "accessibility_needs" TEXT[],
    "preferred_consultation_times" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "content_checksum" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "intake_questionnaire_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_medical_conditions" (
    "id" UUID NOT NULL,
    "questionnaire_version_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "encrypted_details" TEXT,

    CONSTRAINT "intake_medical_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_medications" (
    "id" UUID NOT NULL,
    "questionnaire_version_id" UUID NOT NULL,
    "encrypted_name" TEXT NOT NULL,
    "encrypted_dosage" TEXT,

    CONSTRAINT "intake_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_allergies" (
    "id" UUID NOT NULL,
    "questionnaire_version_id" UUID NOT NULL,
    "encrypted_substance" TEXT NOT NULL,
    "encrypted_reaction" TEXT,

    CONSTRAINT "intake_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_consents" (
    "questionnaire_version_id" UUID NOT NULL,
    "consent_record_id" UUID NOT NULL,

    CONSTRAINT "questionnaire_consents_pkey" PRIMARY KEY ("questionnaire_version_id","consent_record_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_account_status_deleted_at_idx" ON "users"("account_status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "role_definitions_code_key" ON "role_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permission_definitions_code_key" ON "permission_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_expires_at_idx" ON "sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "mfa_configurations_user_id_enabled_at_revoked_at_idx" ON "mfa_configurations"("user_id", "enabled_at", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_configurations_user_id_method_key" ON "mfa_configurations"("user_id", "method");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "mfa_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_mfa_configuration_id_consumed_at_idx" ON "mfa_recovery_codes"("mfa_configuration_id", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "account_lifecycle_tokens_token_hash_key" ON "account_lifecycle_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "account_lifecycle_tokens_user_id_type_consumed_at_expires_at_idx" ON "account_lifecycle_tokens"("user_id", "type", "consumed_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_type_deleted_at_idx" ON "organizations"("type", "deleted_at");

-- CreateIndex
CREATE INDEX "organization_memberships_user_id_status_idx" ON "organization_memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "organization_memberships_organization_id_status_idx" ON "organization_memberships"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_role_id_key" ON "organization_memberships"("organization_id", "user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_organization_id_key" ON "clinics"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_slug_key" ON "clinics"("slug");

-- CreateIndex
CREATE INDEX "clinics_verification_status_verified_at_idx" ON "clinics"("verification_status", "verified_at");

-- CreateIndex
CREATE INDEX "clinic_locations_clinic_id_active_idx" ON "clinic_locations"("clinic_id", "active");

-- CreateIndex
CREATE INDEX "clinic_locations_city_district_idx" ON "clinic_locations"("city", "district");

-- CreateIndex
CREATE UNIQUE INDEX "dentists_user_id_key" ON "dentists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dentists_slug_key" ON "dentists"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "dentists_license_number_key" ON "dentists"("license_number");

-- CreateIndex
CREATE INDEX "dentists_license_status_idx" ON "dentists"("license_status");

-- CreateIndex
CREATE INDEX "dentist_clinic_affiliations_clinic_id_active_idx" ON "dentist_clinic_affiliations"("clinic_id", "active");

-- CreateIndex
CREATE INDEX "dentist_clinic_affiliations_dentist_id_active_idx" ON "dentist_clinic_affiliations"("dentist_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "patient_profiles_user_id_key" ON "patient_profiles"("user_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_patient_id_idx" ON "emergency_contacts"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "consent_text_versions_purpose_version_locale_key" ON "consent_text_versions"("purpose", "version", "locale");

-- CreateIndex
CREATE INDEX "consent_records_user_id_granted_at_idx" ON "consent_records"("user_id", "granted_at");

-- CreateIndex
CREATE UNIQUE INDEX "dental_cases_case_number_key" ON "dental_cases"("case_number");

-- CreateIndex
CREATE INDEX "dental_cases_patient_profile_id_status_updated_at_idx" ON "dental_cases"("patient_profile_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "dental_cases_status_updated_at_idx" ON "dental_cases"("status", "updated_at");

-- CreateIndex
CREATE INDEX "case_status_history_case_id_created_at_idx" ON "case_status_history"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "case_assignments_case_id_ended_at_idx" ON "case_assignments"("case_id", "ended_at");

-- CreateIndex
CREATE INDEX "case_assignments_organization_id_ended_at_idx" ON "case_assignments"("organization_id", "ended_at");

-- CreateIndex
CREATE INDEX "case_assignments_assigned_user_id_ended_at_idx" ON "case_assignments"("assigned_user_id", "ended_at");

-- CreateIndex
CREATE INDEX "caregiver_grants_case_id_caregiver_user_id_revoked_at_idx" ON "caregiver_grants"("case_id", "caregiver_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "matching_results_case_id_fit_score_idx" ON "matching_results"("case_id", "fit_score");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_case_id_clinic_id_key" ON "treatment_plans"("case_id", "clinic_id");

-- CreateIndex
CREATE INDEX "treatment_plan_versions_status_expires_at_idx" ON "treatment_plan_versions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plan_versions_treatment_plan_id_version_key" ON "treatment_plan_versions"("treatment_plan_id", "version");

-- CreateIndex
CREATE INDEX "treatment_plan_items_treatment_plan_version_id_sort_order_idx" ON "treatment_plan_items"("treatment_plan_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plan_acceptances_treatment_plan_version_id_user_i_key" ON "treatment_plan_acceptances"("treatment_plan_version_id", "user_id");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_starts_at_status_idx" ON "appointments"("clinic_id", "starts_at", "status");

-- CreateIndex
CREATE INDEX "appointments_dentist_id_starts_at_status_idx" ON "appointments"("dentist_id", "starts_at", "status");

-- CreateIndex
CREATE INDEX "bookings_case_id_status_idx" ON "bookings"("case_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_booking_id_key" ON "payments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_intent_id_key" ON "payments"("provider_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_booking_id_status_idx" ON "payments"("booking_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

-- CreateIndex
CREATE INDEX "refunds_payment_id_status_idx" ON "refunds"("payment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_object_key_key" ON "file_assets"("object_key");

-- CreateIndex
CREATE INDEX "file_assets_owner_user_id_status_idx" ON "file_assets"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "file_assets_scan_status_created_at_idx" ON "file_assets"("scan_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "case_documents_case_id_file_asset_id_key" ON "case_documents"("case_id", "file_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "secure_shares_token_hash_key" ON "secure_shares"("token_hash");

-- CreateIndex
CREATE INDEX "secure_shares_case_id_expires_at_revoked_at_idx" ON "secure_shares"("case_id", "expires_at", "revoked_at");

-- CreateIndex
CREATE INDEX "secure_shares_passport_version_id_expires_at_revoked_at_idx" ON "secure_shares"("passport_version_id", "expires_at", "revoked_at");

-- CreateIndex
CREATE INDEX "secure_share_access_logs_secure_share_id_accessed_at_idx" ON "secure_share_access_logs"("secure_share_id", "accessed_at");

-- CreateIndex
CREATE INDEX "verification_cases_status_expires_at_idx" ON "verification_cases"("status", "expires_at");

-- CreateIndex
CREATE INDEX "verification_cases_clinic_id_created_at_idx" ON "verification_cases"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "verification_evidence_verification_case_id_category_idx" ON "verification_evidence"("verification_case_id", "category");

-- CreateIndex
CREATE INDEX "verification_evidence_expires_at_approved_at_revoked_at_idx" ON "verification_evidence"("expires_at", "approved_at", "revoked_at");

-- CreateIndex
CREATE INDEX "aftercare_plans_case_id_active_idx" ON "aftercare_plans"("case_id", "active");

-- CreateIndex
CREATE INDEX "aftercare_check_ins_aftercare_plan_id_submitted_at_idx" ON "aftercare_check_ins"("aftercare_plan_id", "submitted_at");

-- CreateIndex
CREATE INDEX "aftercare_escalations_status_due_at_idx" ON "aftercare_escalations"("status", "due_at");

-- CreateIndex
CREATE INDEX "reviews_clinic_id_moderation_status_created_at_idx" ON "reviews"("clinic_id", "moderation_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_case_id_patient_user_id_key" ON "reviews"("case_id", "patient_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_follow_ups_review_id_follow_up_days_key" ON "review_follow_ups"("review_id", "follow_up_days");

-- CreateIndex
CREATE INDEX "review_follow_ups_review_id_created_at_idx" ON "review_follow_ups"("review_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_responses_review_id_key" ON "review_responses"("review_id");

-- CreateIndex
CREATE INDEX "review_responses_moderation_status_created_at_idx" ON "review_responses"("moderation_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_abuse_reports_review_id_reporter_user_id_key" ON "review_abuse_reports"("review_id", "reporter_user_id");

-- CreateIndex
CREATE INDEX "review_abuse_reports_status_created_at_idx" ON "review_abuse_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_idempotency_key_key" ON "outbox_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_locked_at_idx" ON "outbox_events"("status", "available_at", "locked_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_key_key" ON "idempotency_records"("user_id", "key");

-- CreateIndex
CREATE INDEX "idempotency_records_status_expires_at_idx" ON "idempotency_records"("status", "expires_at");

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_provider_event_id_key" ON "webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "message_threads_case_id_updated_at_idx" ON "message_threads"("case_id", "updated_at");

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "message_read_receipts_user_id_read_at_idx" ON "message_read_receipts"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "internal_notes_thread_id_organization_id_created_at_idx" ON "internal_notes"("thread_id", "organization_id", "created_at");

-- CreateIndex
CREATE INDEX "treatment_milestones_case_id_status_sort_order_idx" ON "treatment_milestones"("case_id", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_milestones_case_id_code_key" ON "treatment_milestones"("case_id", "code");

-- CreateIndex
CREATE INDEX "treatment_instructions_case_id_type_created_at_idx" ON "treatment_instructions"("case_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "treatment_instructions_milestone_id_created_at_idx" ON "treatment_instructions"("milestone_id", "created_at");

-- CreateIndex
CREATE INDEX "treatment_events_case_id_occurred_at_idx" ON "treatment_events"("case_id", "occurred_at");

-- CreateIndex
CREATE INDEX "plan_change_requests_case_id_created_at_idx" ON "plan_change_requests"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plan_change_acknowledgements_plan_change_request_id_key" ON "plan_change_acknowledgements"("plan_change_request_id");

-- CreateIndex
CREATE INDEX "plan_change_acknowledgements_patient_user_id_acknowledged_at_idx" ON "plan_change_acknowledgements"("patient_user_id", "acknowledged_at");

-- CreateIndex
CREATE UNIQUE INDEX "dental_passports_case_id_key" ON "dental_passports"("case_id");

-- CreateIndex
CREATE INDEX "dental_passport_versions_status_published_at_idx" ON "dental_passport_versions"("status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "dental_passport_versions_dental_passport_id_version_key" ON "dental_passport_versions"("dental_passport_id", "version");

-- At most one version can be the current published passport. The publication
-- transaction supersedes the previous row before promoting its draft.
CREATE UNIQUE INDEX "dental_passport_versions_one_published_per_passport_key"
  ON "dental_passport_versions"("dental_passport_id") WHERE "status" = 'PUBLISHED';

-- CreateIndex
CREATE INDEX "implant_records_dental_passport_version_id_tooth_number_idx" ON "implant_records"("dental_passport_version_id", "tooth_number");

-- CreateIndex
CREATE INDEX "material_records_dental_passport_version_id_idx" ON "material_records"("dental_passport_version_id");

-- CreateIndex
CREATE INDEX "prescription_records_dental_passport_version_id_idx" ON "prescription_records"("dental_passport_version_id");

-- CreateIndex
CREATE INDEX "incidents_case_id_status_created_at_idx" ON "incidents"("case_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "incidents_clinic_id_status_idx" ON "incidents"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "incidents_owner_user_id_status_sla_due_at_idx" ON "incidents"("owner_user_id", "status", "sla_due_at");

-- CreateIndex
CREATE INDEX "incident_events_incident_id_created_at_idx" ON "incident_events"("incident_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_claims_incident_id_key" ON "warranty_claims"("incident_id");

-- CreateIndex
CREATE INDEX "warranty_claims_clinic_id_status_idx" ON "warranty_claims"("clinic_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_category_channel_key" ON "notification_preferences"("user_id", "category", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_scheduled_at_idx" ON "notifications"("user_id", "read_at", "scheduled_at");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "content_pages_locale_published_at_idx" ON "content_pages"("locale", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_pages_slug_locale_version_key" ON "content_pages"("slug", "locale", "version");

-- CreateIndex
CREATE UNIQUE INDEX "contact_requests_reference_key" ON "contact_requests"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "contact_requests_idempotency_key_key" ON "contact_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "contact_requests_created_at_idx" ON "contact_requests"("created_at");

-- CreateIndex
CREATE INDEX "privacy_requests_status_due_at_idx" ON "privacy_requests"("status", "due_at");

-- CreateIndex
CREATE INDEX "privacy_requests_requester_user_id_created_at_idx" ON "privacy_requests"("requester_user_id", "created_at");

-- CreateIndex
CREATE INDEX "support_elevations_actor_user_id_status_expires_at_idx" ON "support_elevations"("actor_user_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "support_elevations_subject_user_id_status_expires_at_idx" ON "support_elevations"("subject_user_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_staff_membership_id_key" ON "clinic_staff"("membership_id");

-- CreateIndex
CREATE INDEX "clinic_staff_clinic_id_active_idx" ON "clinic_staff"("clinic_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_staff_clinic_id_user_id_key" ON "clinic_staff"("clinic_id", "user_id");

-- CreateIndex
CREATE INDEX "professional_licenses_clinic_id_status_expires_at_idx" ON "professional_licenses"("clinic_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "professional_licenses_dentist_id_status_expires_at_idx" ON "professional_licenses"("dentist_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "professional_licenses_authority_license_number_key" ON "professional_licenses"("authority", "license_number");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_code_key" ON "service_categories"("code");

-- CreateIndex
CREATE INDEX "service_categories_parent_id_active_idx" ON "service_categories"("parent_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_definitions_code_key" ON "procedure_definitions"("code");

-- CreateIndex
CREATE INDEX "procedure_definitions_service_category_id_active_idx" ON "procedure_definitions"("service_category_id", "active");

-- CreateIndex
CREATE INDEX "warranty_policies_clinic_id_effective_at_archived_at_idx" ON "warranty_policies"("clinic_id", "effective_at", "archived_at");

-- CreateIndex
CREATE INDEX "clinic_services_clinic_id_active_idx" ON "clinic_services"("clinic_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_services_clinic_id_procedure_definition_id_key" ON "clinic_services"("clinic_id", "procedure_definition_id");

-- CreateIndex
CREATE INDEX "price_versions_clinic_service_id_expires_at_idx" ON "price_versions"("clinic_service_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "price_versions_clinic_service_id_effective_at_key" ON "price_versions"("clinic_service_id", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "intake_questionnaires_case_id_key" ON "intake_questionnaires"("case_id");

-- CreateIndex
CREATE INDEX "intake_questionnaire_versions_status_updated_at_idx" ON "intake_questionnaire_versions"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "intake_questionnaire_versions_questionnaire_id_version_key" ON "intake_questionnaire_versions"("questionnaire_id", "version");

-- CreateIndex
CREATE INDEX "intake_medical_conditions_questionnaire_version_id_idx" ON "intake_medical_conditions"("questionnaire_version_id");

-- CreateIndex
CREATE INDEX "intake_medications_questionnaire_version_id_idx" ON "intake_medications"("questionnaire_version_id");

-- CreateIndex
CREATE INDEX "intake_allergies_questionnaire_version_id_idx" ON "intake_allergies"("questionnaire_version_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_configurations" ADD CONSTRAINT "mfa_configurations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_mfa_configuration_id_fkey" FOREIGN KEY ("mfa_configuration_id") REFERENCES "mfa_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_lifecycle_tokens" ADD CONSTRAINT "account_lifecycle_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_locations" ADD CONSTRAINT "clinic_locations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentists" ADD CONSTRAINT "dentists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_clinic_affiliations" ADD CONSTRAINT "dentist_clinic_affiliations_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_clinic_affiliations" ADD CONSTRAINT "dentist_clinic_affiliations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_consent_text_version_id_fkey" FOREIGN KEY ("consent_text_version_id") REFERENCES "consent_text_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_cases" ADD CONSTRAINT "dental_cases_patient_profile_id_fkey" FOREIGN KEY ("patient_profile_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_grants" ADD CONSTRAINT "caregiver_grants_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_grants" ADD CONSTRAINT "caregiver_grants_patient_profile_id_fkey" FOREIGN KEY ("patient_profile_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_grants" ADD CONSTRAINT "caregiver_grants_caregiver_user_id_fkey" FOREIGN KEY ("caregiver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_results" ADD CONSTRAINT "matching_results_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_results" ADD CONSTRAINT "matching_results_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_versions" ADD CONSTRAINT "treatment_plan_versions_treatment_plan_id_fkey" FOREIGN KEY ("treatment_plan_id") REFERENCES "treatment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_versions" ADD CONSTRAINT "treatment_plan_versions_authoring_dentist_id_fkey" FOREIGN KEY ("authoring_dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_treatment_plan_version_id_fkey" FOREIGN KEY ("treatment_plan_version_id") REFERENCES "treatment_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_acceptances" ADD CONSTRAINT "treatment_plan_acceptances_treatment_plan_version_id_fkey" FOREIGN KEY ("treatment_plan_version_id") REFERENCES "treatment_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_treatment_plan_version_id_fkey" FOREIGN KEY ("treatment_plan_version_id") REFERENCES "treatment_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_shares" ADD CONSTRAINT "secure_shares_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_shares" ADD CONSTRAINT "secure_shares_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_shares" ADD CONSTRAINT "secure_shares_passport_version_id_fkey" FOREIGN KEY ("passport_version_id") REFERENCES "dental_passport_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_shares" ADD CONSTRAINT "secure_shares_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_shares" ADD CONSTRAINT "secure_shares_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_share_access_logs" ADD CONSTRAINT "secure_share_access_logs_secure_share_id_fkey" FOREIGN KEY ("secure_share_id") REFERENCES "secure_shares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_verification_case_id_fkey" FOREIGN KEY ("verification_case_id") REFERENCES "verification_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aftercare_plans" ADD CONSTRAINT "aftercare_plans_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aftercare_check_ins" ADD CONSTRAINT "aftercare_check_ins_aftercare_plan_id_fkey" FOREIGN KEY ("aftercare_plan_id") REFERENCES "aftercare_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aftercare_escalations" ADD CONSTRAINT "aftercare_escalations_aftercare_check_in_id_fkey" FOREIGN KEY ("aftercare_check_in_id") REFERENCES "aftercare_check_ins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_follow_ups" ADD CONSTRAINT "review_follow_ups_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_abuse_reports" ADD CONSTRAINT "review_abuse_reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_abuse_reports" ADD CONSTRAINT "review_abuse_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_impersonator_user_id_fkey" FOREIGN KEY ("impersonator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_milestones" ADD CONSTRAINT "treatment_milestones_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_milestones" ADD CONSTRAINT "treatment_milestones_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_instructions" ADD CONSTRAINT "treatment_instructions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_instructions" ADD CONSTRAINT "treatment_instructions_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "treatment_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_instructions" ADD CONSTRAINT "treatment_instructions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_events" ADD CONSTRAINT "treatment_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_events" ADD CONSTRAINT "treatment_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_from_plan_version_id_fkey" FOREIGN KEY ("from_plan_version_id") REFERENCES "treatment_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_acknowledgements" ADD CONSTRAINT "plan_change_acknowledgements_plan_change_request_id_fkey" FOREIGN KEY ("plan_change_request_id") REFERENCES "plan_change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_acknowledgements" ADD CONSTRAINT "plan_change_acknowledgements_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_acknowledgements" ADD CONSTRAINT "plan_change_acknowledgements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_passports" ADD CONSTRAINT "dental_passports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_passport_versions" ADD CONSTRAINT "dental_passport_versions_dental_passport_id_fkey" FOREIGN KEY ("dental_passport_id") REFERENCES "dental_passports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_passport_versions" ADD CONSTRAINT "dental_passport_versions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_passport_versions" ADD CONSTRAINT "dental_passport_versions_treating_dentist_id_fkey" FOREIGN KEY ("treating_dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_passport_versions" ADD CONSTRAINT "dental_passport_versions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_passport_versions" ADD CONSTRAINT "dental_passport_versions_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_passport_versions" ADD CONSTRAINT "dental_passport_versions_generated_file_id_fkey" FOREIGN KEY ("generated_file_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implant_records" ADD CONSTRAINT "implant_records_dental_passport_version_id_fkey" FOREIGN KEY ("dental_passport_version_id") REFERENCES "dental_passport_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_records" ADD CONSTRAINT "material_records_dental_passport_version_id_fkey" FOREIGN KEY ("dental_passport_version_id") REFERENCES "dental_passport_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_records" ADD CONSTRAINT "prescription_records_dental_passport_version_id_fkey" FOREIGN KEY ("dental_passport_version_id") REFERENCES "dental_passport_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_staff" ADD CONSTRAINT "clinic_staff_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_staff" ADD CONSTRAINT "clinic_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_staff" ADD CONSTRAINT "clinic_staff_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_staff" ADD CONSTRAINT "clinic_staff_clinic_location_id_fkey" FOREIGN KEY ("clinic_location_id") REFERENCES "clinic_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_licenses" ADD CONSTRAINT "professional_licenses_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_licenses" ADD CONSTRAINT "professional_licenses_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_definitions" ADD CONSTRAINT "procedure_definitions_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_policies" ADD CONSTRAINT "warranty_policies_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_procedure_definition_id_fkey" FOREIGN KEY ("procedure_definition_id") REFERENCES "procedure_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_warranty_policy_id_fkey" FOREIGN KEY ("warranty_policy_id") REFERENCES "warranty_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_clinic_service_id_fkey" FOREIGN KEY ("clinic_service_id") REFERENCES "clinic_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_questionnaires" ADD CONSTRAINT "intake_questionnaires_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "dental_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_questionnaire_versions" ADD CONSTRAINT "intake_questionnaire_versions_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "intake_questionnaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_medical_conditions" ADD CONSTRAINT "intake_medical_conditions_questionnaire_version_id_fkey" FOREIGN KEY ("questionnaire_version_id") REFERENCES "intake_questionnaire_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_medications" ADD CONSTRAINT "intake_medications_questionnaire_version_id_fkey" FOREIGN KEY ("questionnaire_version_id") REFERENCES "intake_questionnaire_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_allergies" ADD CONSTRAINT "intake_allergies_questionnaire_version_id_fkey" FOREIGN KEY ("questionnaire_version_id") REFERENCES "intake_questionnaire_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_consents" ADD CONSTRAINT "questionnaire_consents_questionnaire_version_id_fkey" FOREIGN KEY ("questionnaire_version_id") REFERENCES "intake_questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_consents" ADD CONSTRAINT "questionnaire_consents_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_acceptances" ADD CONSTRAINT "treatment_plan_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_acceptances" ADD CONSTRAINT "treatment_plan_acceptances_consent_text_version_id_fkey" FOREIGN KEY ("consent_text_version_id") REFERENCES "consent_text_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_acceptances" ADD CONSTRAINT "treatment_plan_acceptances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain integrity constraints that Prisma cannot express directly.
ALTER TABLE "dental_cases" ADD CONSTRAINT "dental_cases_travel_dates_check"
  CHECK ("expected_arrival_date" IS NULL OR "expected_departure_date" IS NULL OR "expected_departure_date" >= "expected_arrival_date");
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_principal_check"
  CHECK ("organization_id" IS NOT NULL OR "assigned_user_id" IS NOT NULL);
ALTER TABLE "matching_results" ADD CONSTRAINT "matching_results_fit_score_check"
  CHECK ("fit_score" BETWEEN 0 AND 100);
ALTER TABLE "treatment_plan_versions" ADD CONSTRAINT "treatment_plan_versions_money_check"
  CHECK ("version" > 0 AND "total_minor" > 0);
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_money_check"
  CHECK ("quantity" > 0 AND "unit_price_minor" >= 0 AND "total_price_minor" >= 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_time_range_check"
  CHECK ("ends_at" > "starts_at");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_version_check"
  CHECK ("version" > 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_meeting_pair_check"
  CHECK (("meeting_provider" IS NULL) = ("encrypted_join_url" IS NULL));
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancellation_reason_encrypted_check"
  CHECK ("cancellation_reason" IS NULL OR "cancellation_reason" LIKE 'v1.%');
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dentist_no_overlap"
  EXCLUDE USING gist (
    "dentist_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("dentist_id" IS NOT NULL AND "status" IN ('TENTATIVE', 'CONFIRMED'));
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_no_overlap"
  EXCLUDE USING gist (
    "case_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('TENTATIVE', 'CONFIRMED'));
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_subject_encrypted_check"
  CHECK ("subject" LIKE 'v1.%');
ALTER TABLE "messages" ADD CONSTRAINT "messages_participant_visibility_check"
  CHECK ("visibility" = 'PARTICIPANTS');
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_encrypted_check"
  CHECK ("encrypted_body" LIKE 'v1.%');
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_body_encrypted_check"
  CHECK ("encrypted_body" LIKE 'v1.%');
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deposit_check" CHECK ("deposit_minor" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount_minor" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amount_minor" > 0);
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_check"
  CHECK (("actor_type" = 'USER' AND "actor_user_id" IS NOT NULL)
    OR ("actor_type" IN ('SYSTEM', 'PROVIDER') AND "actor_user_id" IS NULL));
ALTER TABLE "secure_shares" ADD CONSTRAINT "secure_shares_access_limit_check"
  CHECK ("access_count" >= 0 AND ("max_access_count" IS NULL OR "max_access_count" > 0));
ALTER TABLE "aftercare_check_ins" ADD CONSTRAINT "aftercare_check_ins_pain_scale_check"
  CHECK ("pain_scale" BETWEEN 0 AND 10);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check"
  CHECK ("overall_rating" BETWEEN 1 AND 5 AND "follow_up_days" >= 0);
ALTER TABLE "review_follow_ups" ADD CONSTRAINT "review_follow_ups_rating_check"
  CHECK ("follow_up_days" > 0 AND ("overall_rating" IS NULL OR "overall_rating" BETWEEN 1 AND 5));
ALTER TABLE "review_abuse_reports" ADD CONSTRAINT "review_abuse_reports_reason_check"
  CHECK ("reason_code" IN ('PERSONAL_DATA', 'HARASSMENT', 'FALSE_INFORMATION', 'CONFLICT', 'OTHER')
    AND "encrypted_details" LIKE 'v1.%');
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_classification_check"
  CHECK ("type" IN ('CLINICAL_CONCERN', 'SERVICE_COMPLAINT', 'BILLING_DISPUTE', 'SAFETY_CONCERN', 'WARRANTY_CLAIM', 'OTHER')
    AND "severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    AND "version" > 0 AND "sla_due_at" >= "created_at"
    AND "encrypted_details" LIKE 'v1.%');
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_version_check"
  CHECK ("version" > 0
    AND (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL))
    AND "encrypted_reason" LIKE 'v1.%'
    AND ("encrypted_patient_message" IS NULL OR "encrypted_patient_message" LIKE 'v1.%'));
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_scope_check"
  CHECK ("actor_user_id" <> "subject_user_id"
    AND "approved_by_user_id" <> "subject_user_id"
    AND "expires_at" > "created_at"
    AND "use_count" >= 0
    AND cardinality("capabilities") BETWEEN 1 AND 4
    AND "capabilities" <@ ARRAY['CASE_READ', 'INCIDENT_READ', 'INCIDENT_UPDATE', 'PRIVACY_STATUS_READ']::TEXT[]);
ALTER TABLE "professional_licenses" ADD CONSTRAINT "professional_licenses_owner_check"
  CHECK (("clinic_id" IS NOT NULL)::integer + ("dentist_id" IS NOT NULL)::integer = 1);
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_range_check"
  CHECK ("minimum_minor" >= 0 AND "maximum_minor" >= "minimum_minor" AND ("expires_at" IS NULL OR "expires_at" > "effective_at"));
ALTER TABLE "intake_questionnaire_versions" ADD CONSTRAINT "intake_questionnaire_budget_check"
  CHECK ("budget_minimum_minor" IS NULL OR "budget_maximum_minor" IS NULL OR "budget_maximum_minor" >= "budget_minimum_minor");
ALTER TABLE "intake_questionnaire_versions" ADD CONSTRAINT "intake_questionnaire_travel_dates_check"
  CHECK ("expected_arrival_date" IS NULL OR "expected_departure_date" IS NULL OR "expected_departure_date" >= "expected_arrival_date");

-- Payment and refund values are server-owned ledger facts. Cross-row checks use
-- row locks so concurrent refund requests cannot over-reserve a payment.
CREATE FUNCTION "enforce_payment_integrity"() RETURNS trigger AS $$
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
      OR (OLD."provider_payment_intent_id" IS NOT NULL
        AND NEW."provider_payment_intent_id" IS DISTINCT FROM OLD."provider_payment_intent_id")
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

CREATE TRIGGER "payments_ledger_integrity"
  BEFORE INSERT OR UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "enforce_payment_integrity"();
CREATE TRIGGER "refunds_ledger_integrity"
  BEFORE INSERT OR UPDATE ON "refunds"
  FOR EACH ROW EXECUTE FUNCTION "enforce_payment_integrity"();

CREATE FUNCTION "enforce_treatment_plan_acceptance_identity"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "sessions" s
    WHERE s."id" = NEW."session_id" AND s."user_id" = NEW."user_id"
  ) THEN
    RAISE EXCEPTION 'treatment plan acceptance session does not belong to the patient' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "consent_text_versions" c
    WHERE c."id" = NEW."consent_text_version_id"
      AND c."purpose" = 'TREATMENT_PLAN_ACCEPTANCE'
      AND c."published_at" <= NEW."accepted_at"
  ) THEN
    RAISE EXCEPTION 'treatment plan acceptance consent evidence is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "treatment_plan_acceptances_identity_integrity"
  BEFORE INSERT OR UPDATE ON "treatment_plan_acceptances"
  FOR EACH ROW EXECUTE FUNCTION "enforce_treatment_plan_acceptance_identity"();

-- Append-only and immutable-snapshot safeguards.
CREATE FUNCTION "reject_append_only_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "case_status_history_append_only"
  BEFORE UPDATE OR DELETE ON "case_status_history"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE FUNCTION "protect_consent_record"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'consent records cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - 'withdrawn_at') IS DISTINCT FROM (to_jsonb(OLD) - 'withdrawn_at')
     OR OLD."withdrawn_at" IS NOT NULL
     OR NEW."withdrawn_at" IS NULL THEN
    RAISE EXCEPTION 'consent evidence is immutable; only first withdrawal is allowed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "consent_records_immutable"
  BEFORE UPDATE OR DELETE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION "protect_consent_record"();
CREATE TRIGGER "treatment_plan_acceptances_append_only"
  BEFORE UPDATE OR DELETE ON "treatment_plan_acceptances"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "incident_events_append_only"
  BEFORE UPDATE OR DELETE ON "incident_events"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "treatment_events_append_only"
  BEFORE UPDATE OR DELETE ON "treatment_events"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();

CREATE FUNCTION "protect_published_snapshot"() RETURNS trigger AS $$
DECLARE
  old_status text := OLD."status"::text;
  new_status text;
  transition_allowed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' AND old_status <> 'DRAFT' THEN
    RAISE EXCEPTION '% published snapshots cannot be deleted', TG_TABLE_NAME USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    new_status := NEW."status"::text;
    IF old_status <> 'DRAFT'
       AND (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION '% published snapshots are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
    END IF;

    transition_allowed := old_status = new_status OR
      (TG_TABLE_NAME = 'treatment_plan_versions' AND (
        (old_status = 'DRAFT' AND new_status = 'PUBLISHED') OR
        (old_status = 'PUBLISHED' AND new_status IN ('SUPERSEDED', 'EXPIRED'))
      )) OR
      (TG_TABLE_NAME = 'dental_passport_versions' AND (
        (old_status = 'DRAFT' AND new_status = 'PUBLISHED') OR
        (old_status = 'PUBLISHED' AND new_status IN ('SUPERSEDED', 'REVOKED'))
      )) OR
      (TG_TABLE_NAME = 'intake_questionnaire_versions' AND (
        (old_status = 'DRAFT' AND new_status = 'SUBMITTED') OR
        (old_status = 'SUBMITTED' AND new_status = 'SUPERSEDED')
      ));
    IF NOT transition_allowed THEN
      RAISE EXCEPTION '% snapshot status transition % -> % is prohibited', TG_TABLE_NAME, old_status, new_status USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "treatment_plan_versions_immutable"
  BEFORE UPDATE OR DELETE ON "treatment_plan_versions"
  FOR EACH ROW EXECUTE FUNCTION "protect_published_snapshot"();
CREATE TRIGGER "dental_passport_versions_immutable"
  BEFORE UPDATE OR DELETE ON "dental_passport_versions"
  FOR EACH ROW EXECUTE FUNCTION "protect_published_snapshot"();
CREATE TRIGGER "intake_questionnaire_versions_immutable"
  BEFORE UPDATE OR DELETE ON "intake_questionnaire_versions"
  FOR EACH ROW EXECUTE FUNCTION "protect_published_snapshot"();

CREATE FUNCTION "protect_snapshot_child"() RETURNS trigger AS $$
DECLARE
  old_parent_id uuid;
  new_parent_id uuid;
  old_parent_status text;
  new_parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'treatment_plan_items' THEN
    IF TG_OP <> 'INSERT' THEN old_parent_id := OLD."treatment_plan_version_id"; END IF;
    IF TG_OP <> 'DELETE' THEN new_parent_id := NEW."treatment_plan_version_id"; END IF;
    SELECT "status"::text INTO old_parent_status FROM "treatment_plan_versions" WHERE "id" = old_parent_id;
    SELECT "status"::text INTO new_parent_status FROM "treatment_plan_versions" WHERE "id" = new_parent_id;
  ELSIF TG_TABLE_NAME IN ('implant_records', 'material_records', 'prescription_records') THEN
    IF TG_OP <> 'INSERT' THEN old_parent_id := OLD."dental_passport_version_id"; END IF;
    IF TG_OP <> 'DELETE' THEN new_parent_id := NEW."dental_passport_version_id"; END IF;
    SELECT "status"::text INTO old_parent_status FROM "dental_passport_versions" WHERE "id" = old_parent_id;
    SELECT "status"::text INTO new_parent_status FROM "dental_passport_versions" WHERE "id" = new_parent_id;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_parent_id := OLD."questionnaire_version_id"; END IF;
    IF TG_OP <> 'DELETE' THEN new_parent_id := NEW."questionnaire_version_id"; END IF;
    SELECT "status"::text INTO old_parent_status FROM "intake_questionnaire_versions" WHERE "id" = old_parent_id;
    SELECT "status"::text INTO new_parent_status FROM "intake_questionnaire_versions" WHERE "id" = new_parent_id;
  END IF;
  IF (TG_OP <> 'INSERT' AND old_parent_status IS DISTINCT FROM 'DRAFT')
     OR (TG_OP <> 'DELETE' AND new_parent_status IS DISTINCT FROM 'DRAFT') THEN
    RAISE EXCEPTION '% cannot mutate a child of a published snapshot', TG_TABLE_NAME USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "treatment_plan_items_parent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "treatment_plan_items"
  FOR EACH ROW EXECUTE FUNCTION "protect_snapshot_child"();
CREATE TRIGGER "implant_records_parent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "implant_records"
  FOR EACH ROW EXECUTE FUNCTION "protect_snapshot_child"();
CREATE TRIGGER "material_records_parent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "material_records"
  FOR EACH ROW EXECUTE FUNCTION "protect_snapshot_child"();
CREATE TRIGGER "prescription_records_parent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "prescription_records"
  FOR EACH ROW EXECUTE FUNCTION "protect_snapshot_child"();
CREATE TRIGGER "intake_medical_conditions_parent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "intake_medical_conditions"
  FOR EACH ROW EXECUTE FUNCTION "protect_snapshot_child"();
CREATE TRIGGER "intake_medications_parent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "intake_medications"
  FOR EACH ROW EXECUTE FUNCTION "protect_snapshot_child"();
CREATE TRIGGER "intake_allergies_parent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "intake_allergies"
  FOR EACH ROW EXECUTE FUNCTION "protect_snapshot_child"();
CREATE TRIGGER "questionnaire_consents_parent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "questionnaire_consents"
  FOR EACH ROW EXECUTE FUNCTION "protect_snapshot_child"();

CREATE FUNCTION "enforce_cross_tenant_integrity"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'caregiver_grants' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "dental_cases" c
      WHERE c."id" = NEW."case_id" AND c."patient_profile_id" = NEW."patient_profile_id"
    ) THEN
      RAISE EXCEPTION 'caregiver grant patient does not own case' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'bookings' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "treatment_plan_versions" v
      JOIN "treatment_plans" p ON p."id" = v."treatment_plan_id"
      WHERE v."id" = NEW."treatment_plan_version_id"
        AND p."case_id" = NEW."case_id"
        AND v."currency" = NEW."currency"
        AND NEW."deposit_minor" <= v."total_minor"
    ) THEN
      RAISE EXCEPTION 'booking plan, currency, or deposit does not match the case plan' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'treatment_plan_versions' THEN
    IF (TG_OP = 'INSERT' OR NEW."treatment_plan_id" IS DISTINCT FROM OLD."treatment_plan_id"
        OR NEW."authoring_dentist_id" IS DISTINCT FROM OLD."authoring_dentist_id")
      AND NOT EXISTS (
        SELECT 1 FROM "treatment_plans" p
        JOIN "dentist_clinic_affiliations" a ON a."clinic_id" = p."clinic_id"
        WHERE p."id" = NEW."treatment_plan_id"
          AND a."dentist_id" = NEW."authoring_dentist_id"
          AND a."active" = true AND a."ended_at" IS NULL
      ) THEN
      RAISE EXCEPTION 'plan dentist is not actively affiliated with clinic' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'reviews' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "dental_cases" c
      JOIN "patient_profiles" pp ON pp."id" = c."patient_profile_id"
      JOIN "treatment_plans" tp ON tp."case_id" = c."id"
      WHERE c."id" = NEW."case_id"
        AND pp."user_id" = NEW."patient_user_id"
        AND tp."clinic_id" = NEW."clinic_id"
        AND (
          NEW."verified" = false
          OR (
            c."status" IN ('TREATMENT_COMPLETED', 'AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE', 'CLOSED')
            AND EXISTS (
              SELECT 1 FROM "bookings" b
              JOIN "treatment_plan_versions" tpv ON tpv."id" = b."treatment_plan_version_id"
              JOIN "treatment_plans" booked_tp ON booked_tp."id" = tpv."treatment_plan_id"
              WHERE b."case_id" = c."id"
                AND b."status" = 'COMPLETED'
                AND booked_tp."case_id" = c."id"
                AND booked_tp."clinic_id" = NEW."clinic_id"
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'review is not attributable to the patient and completed platform treatment' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'review_responses' THEN
    IF (TG_OP = 'INSERT' OR NEW."review_id" IS DISTINCT FROM OLD."review_id"
        OR NEW."author_user_id" IS DISTINCT FROM OLD."author_user_id")
      AND NOT EXISTS (
        SELECT 1 FROM "reviews" r
        JOIN "clinics" c ON c."id" = r."clinic_id"
        JOIN "clinic_staff" cs ON cs."clinic_id" = c."id"
        JOIN "organization_memberships" m ON m."id" = cs."membership_id"
        WHERE r."id" = NEW."review_id"
          AND cs."user_id" = NEW."author_user_id"
          AND cs."active" = true
          AND m."status" = 'ACTIVE'
      ) THEN
      RAISE EXCEPTION 'review response author is outside the reviewed clinic tenant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'incidents' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "dental_cases" c
      JOIN "patient_profiles" pp ON pp."id" = c."patient_profile_id"
      WHERE c."id" = NEW."case_id"
        AND pp."user_id" = NEW."created_by_user_id"
        AND (
          NEW."clinic_id" IS NULL
          OR EXISTS (
            SELECT 1 FROM "treatment_plans" tp
            WHERE tp."case_id" = c."id" AND tp."clinic_id" = NEW."clinic_id"
          )
        )
        AND (
          NEW."owner_user_id" IS NULL
          OR EXISTS (
            SELECT 1 FROM "case_assignments" ca
            WHERE ca."case_id" = c."id"
              AND ca."assigned_user_id" = NEW."owner_user_id"
              AND ca."ended_at" IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM "user_roles" ur
            JOIN "role_definitions" rd ON rd."id" = ur."role_id"
            WHERE ur."user_id" = NEW."owner_user_id"
              AND rd."code" IN ('PLATFORM_ADMIN', 'SUPER_ADMIN')
          )
        )
    ) THEN
      RAISE EXCEPTION 'incident owner, patient, clinic, and case are not in one resource scope' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'incident_attachments' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "incidents" i
      JOIN "case_documents" cd ON cd."case_id" = i."case_id"
        AND cd."file_asset_id" = NEW."file_asset_id"
      JOIN "file_assets" f ON f."id" = cd."file_asset_id"
      WHERE i."id" = NEW."incident_id"
        AND f."status" = 'AVAILABLE'
        AND f."scan_status" = 'CLEAN'
    ) THEN
      RAISE EXCEPTION 'incident attachment is not a clean document from the incident case' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_staff' THEN
    IF (TG_OP = 'INSERT' OR NEW."clinic_id" IS DISTINCT FROM OLD."clinic_id"
        OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
        OR NEW."membership_id" IS DISTINCT FROM OLD."membership_id"
        OR (NEW."active" = true AND OLD."active" = false))
      AND NOT EXISTS (
        SELECT 1 FROM "clinics" c
        JOIN "organization_memberships" m ON m."organization_id" = c."organization_id"
        WHERE c."id" = NEW."clinic_id"
          AND m."id" = NEW."membership_id"
          AND m."user_id" = NEW."user_id"
          AND m."status" = 'ACTIVE'
      ) THEN
      RAISE EXCEPTION 'clinic staff membership does not match clinic tenant' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "caregiver_grants_tenant_integrity"
  BEFORE INSERT OR UPDATE ON "caregiver_grants"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cross_tenant_integrity"();
CREATE TRIGGER "bookings_tenant_integrity"
  BEFORE INSERT OR UPDATE ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cross_tenant_integrity"();
CREATE TRIGGER "treatment_plan_versions_tenant_integrity"
  BEFORE INSERT OR UPDATE ON "treatment_plan_versions"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cross_tenant_integrity"();
CREATE TRIGGER "reviews_tenant_integrity"
  BEFORE INSERT OR UPDATE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cross_tenant_integrity"();
CREATE TRIGGER "review_responses_tenant_integrity"
  BEFORE INSERT OR UPDATE ON "review_responses"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cross_tenant_integrity"();
CREATE TRIGGER "incidents_tenant_integrity"
  BEFORE INSERT OR UPDATE ON "incidents"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cross_tenant_integrity"();
CREATE TRIGGER "incident_attachments_tenant_integrity"
  BEFORE INSERT OR UPDATE ON "incident_attachments"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cross_tenant_integrity"();
CREATE TRIGGER "clinic_staff_tenant_integrity"
  BEFORE INSERT OR UPDATE ON "clinic_staff"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cross_tenant_integrity"();

CREATE FUNCTION "enforce_support_elevation_integrity"() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT'
      OR NEW."actor_user_id" IS DISTINCT FROM OLD."actor_user_id"
      OR NEW."subject_user_id" IS DISTINCT FROM OLD."subject_user_id"
      OR NEW."approved_by_user_id" IS DISTINCT FROM OLD."approved_by_user_id")
  AND (NOT EXISTS (
    SELECT 1 FROM "users" actor
    JOIN "user_roles" ur ON ur."user_id" = actor."id"
    JOIN "role_definitions" rd ON rd."id" = ur."role_id"
    WHERE actor."id" = NEW."actor_user_id"
      AND actor."account_status" = 'ACTIVE'
      AND actor."deleted_at" IS NULL
      AND rd."code" = 'SUPPORT_AGENT'
  ) OR NOT EXISTS (
    SELECT 1 FROM "users" approver
    JOIN "user_roles" ur ON ur."user_id" = approver."id"
    JOIN "role_definitions" rd ON rd."id" = ur."role_id"
    WHERE approver."id" = NEW."approved_by_user_id"
      AND approver."account_status" = 'ACTIVE'
      AND approver."deleted_at" IS NULL
      AND rd."code" IN ('PLATFORM_ADMIN', 'SUPER_ADMIN')
  ) OR NOT EXISTS (
    SELECT 1 FROM "users" subject
    WHERE subject."id" = NEW."subject_user_id"
      AND subject."account_status" = 'ACTIVE'
      AND subject."deleted_at" IS NULL
  )) THEN
    RAISE EXCEPTION 'support elevation actor, approver, or subject is ineligible' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "support_elevations_identity_integrity"
  BEFORE INSERT OR UPDATE ON "support_elevations"
  FOR EACH ROW EXECUTE FUNCTION "enforce_support_elevation_integrity"();

-- Journey, passport, and opaque-share integrity. Clinical snapshots and
-- acknowledgements remain attributable even when active assignments later end.
ALTER TABLE "treatment_milestones" ADD CONSTRAINT "treatment_milestones_completion_check"
  CHECK (
    ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "completed_by_user_id" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL AND "completed_by_user_id" IS NULL)
  );
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_values_changed_check"
  CHECK ("before_values" <> "after_values");
ALTER TABLE "dental_passport_versions" ADD CONSTRAINT "dental_passport_versions_checksums_check"
  CHECK (
    "version" > 0
    AND "schema_version" > 0
    AND "content_checksum" ~ '^[a-f0-9]{64}$'
    AND ("previous_version_checksum" IS NULL OR "previous_version_checksum" ~ '^[a-f0-9]{64}$')
    AND "encrypted_treatment_summary" LIKE 'v1.%'
    AND "encrypted_discharge_instructions" LIKE 'v1.%'
    AND "encrypted_follow_up_instructions" LIKE 'v1.%'
    AND (
      ("status" = 'DRAFT' AND "generated_file_id" IS NULL AND "published_by_user_id" IS NULL AND "published_at" IS NULL)
      OR ("status" <> 'DRAFT' AND "generated_file_id" IS NOT NULL AND "published_by_user_id" IS NOT NULL AND "published_at" IS NOT NULL)
    )
  );
ALTER TABLE "treatment_instructions" ADD CONSTRAINT "treatment_instructions_encrypted_content_check"
  CHECK ("encrypted_content" LIKE 'v1.%' AND "locale" IN ('vi-VN', 'en-US'));
ALTER TABLE "prescription_records" ADD CONSTRAINT "prescription_records_encrypted_fields_check"
  CHECK (
    "encrypted_medication" LIKE 'v1.%'
    AND "encrypted_dosage" LIKE 'v1.%'
    AND "encrypted_instructions" LIKE 'v1.%'
  );
ALTER TABLE "secure_shares" ADD CONSTRAINT "secure_shares_access_limits_check"
  CHECK (
    "access_count" >= 0
    AND "expires_at" > "created_at"
    AND ("max_access_count" IS NULL OR "max_access_count" > 0)
    AND (("revoked_at" IS NULL) = ("revoked_by_user_id" IS NULL))
    AND ("passport_version_id" IS NULL OR "file_asset_id" IS NOT NULL)
  );

CREATE TRIGGER "treatment_instructions_append_only"
  BEFORE UPDATE OR DELETE ON "treatment_instructions"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "plan_change_requests_append_only"
  BEFORE UPDATE OR DELETE ON "plan_change_requests"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "plan_change_acknowledgements_append_only"
  BEFORE UPDATE OR DELETE ON "plan_change_acknowledgements"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "secure_share_access_logs_append_only"
  BEFORE UPDATE OR DELETE ON "secure_share_access_logs"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();

CREATE FUNCTION "protect_passport_version_content"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dental passport versions cannot be deleted' USING ERRCODE = '55000';
  ELSIF TG_OP = 'UPDATE' AND (
    NEW."dental_passport_id" IS DISTINCT FROM OLD."dental_passport_id"
    OR NEW."clinic_id" IS DISTINCT FROM OLD."clinic_id"
    OR NEW."treating_dentist_id" IS DISTINCT FROM OLD."treating_dentist_id"
    OR NEW."author_user_id" IS DISTINCT FROM OLD."author_user_id"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
    OR NEW."treatment_completed_at" IS DISTINCT FROM OLD."treatment_completed_at"
    OR NEW."encrypted_treatment_summary" IS DISTINCT FROM OLD."encrypted_treatment_summary"
    OR NEW."encrypted_discharge_instructions" IS DISTINCT FROM OLD."encrypted_discharge_instructions"
    OR NEW."encrypted_follow_up_instructions" IS DISTINCT FROM OLD."encrypted_follow_up_instructions"
    OR NEW."content_checksum" IS DISTINCT FROM OLD."content_checksum"
    OR NEW."previous_version_checksum" IS DISTINCT FROM OLD."previous_version_checksum"
  ) THEN
    RAISE EXCEPTION 'dental passport version content is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "dental_passport_version_content_immutable"
  BEFORE UPDATE OR DELETE ON "dental_passport_versions"
  FOR EACH ROW EXECUTE FUNCTION "protect_passport_version_content"();

CREATE FUNCTION "enforce_journey_passport_integrity"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'treatment_instructions' THEN
    IF NEW."milestone_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "treatment_milestones" m
      WHERE m."id" = NEW."milestone_id" AND m."case_id" = NEW."case_id"
    ) THEN
      RAISE EXCEPTION 'treatment instruction milestone belongs to another case' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'plan_change_requests' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "treatment_plan_versions" v
      JOIN "treatment_plans" p ON p."id" = v."treatment_plan_id"
      WHERE v."id" = NEW."from_plan_version_id" AND p."case_id" = NEW."case_id"
    ) THEN
      RAISE EXCEPTION 'plan change baseline version belongs to another case' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'plan_change_acknowledgements' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "plan_change_requests" r
      JOIN "dental_cases" c ON c."id" = r."case_id"
      JOIN "patient_profiles" pp ON pp."id" = c."patient_profile_id"
      JOIN "sessions" s ON s."id" = NEW."session_id"
      WHERE r."id" = NEW."plan_change_request_id"
        AND pp."user_id" = NEW."patient_user_id"
        AND s."user_id" = NEW."patient_user_id"
    ) THEN
      RAISE EXCEPTION 'plan change acknowledgement is not attributable to the case patient session' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'dental_passport_versions' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "dental_passports" dp
      JOIN "dental_cases" dc ON dc."id" = dp."case_id"
      JOIN "dentist_clinic_affiliations" a ON a."clinic_id" = NEW."clinic_id"
      WHERE dp."id" = NEW."dental_passport_id"
        AND dc."status" IN ('TREATMENT_COMPLETED', 'AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE', 'CLOSED')
        AND a."dentist_id" = NEW."treating_dentist_id"
        AND a."active" = true
        AND a."ended_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'passport dentist, clinic, and completed case are inconsistent' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'secure_shares' THEN
    IF NEW."passport_version_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "dental_passport_versions" v
      JOIN "dental_passports" dp ON dp."id" = v."dental_passport_id"
      WHERE v."id" = NEW."passport_version_id"
        AND v."status" = 'PUBLISHED'
        AND v."generated_file_id" = NEW."file_asset_id"
        AND dp."case_id" = NEW."case_id"
    ) THEN
      RAISE EXCEPTION 'passport share does not reference its published case file' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "treatment_instructions_case_integrity"
  BEFORE INSERT ON "treatment_instructions"
  FOR EACH ROW EXECUTE FUNCTION "enforce_journey_passport_integrity"();
CREATE TRIGGER "plan_change_requests_case_integrity"
  BEFORE INSERT ON "plan_change_requests"
  FOR EACH ROW EXECUTE FUNCTION "enforce_journey_passport_integrity"();
CREATE TRIGGER "plan_change_acknowledgements_case_integrity"
  BEFORE INSERT ON "plan_change_acknowledgements"
  FOR EACH ROW EXECUTE FUNCTION "enforce_journey_passport_integrity"();
CREATE TRIGGER "dental_passport_versions_case_integrity"
  BEFORE INSERT ON "dental_passport_versions"
  FOR EACH ROW EXECUTE FUNCTION "enforce_journey_passport_integrity"();
CREATE TRIGGER "secure_shares_passport_integrity"
  BEFORE INSERT OR UPDATE ON "secure_shares"
  FOR EACH ROW EXECUTE FUNCTION "enforce_journey_passport_integrity"();
