-- CreateEnum
CREATE TYPE "VerificationSubjectType" AS ENUM ('CLINIC', 'DENTIST');

-- CreateEnum
CREATE TYPE "VerificationRiskLevel" AS ENUM ('STANDARD', 'HIGH');

-- CreateEnum
CREATE TYPE "VerificationRequirementStatus" AS ENUM ('NOT_PROVIDED', 'PROVIDED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WAIVED');

-- CreateEnum
CREATE TYPE "VerificationReviewStatus" AS ENUM ('PENDING_SECOND_APPROVAL', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SiteAuditStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'FINDINGS_ISSUED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CorrectiveActionStatus" AS ENUM ('OPEN', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CLOSED');

-- DropIndex
DROP INDEX "verification_cases_status_expires_at_idx";

-- DropIndex
DROP INDEX "verification_evidence_verification_case_id_category_idx";

-- AlterTable
ALTER TABLE "verification_cases" ADD COLUMN     "assigned_reviewer_user_id" UUID,
ADD COLUMN     "dentist_id" UUID,
ADD COLUMN     "encrypted_status_reason" TEXT,
ADD COLUMN     "methodology_version" TEXT NOT NULL DEFAULT '2026-01',
ADD COLUMN     "risk_level" "VerificationRiskLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "subject_type" "VerificationSubjectType" NOT NULL DEFAULT 'CLINIC',
ADD COLUMN     "submitted_by_user_id" UUID,
ALTER COLUMN "clinic_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "verification_evidence" ADD COLUMN     "approved_by_user_id" UUID,
ADD COLUMN     "content_hash" CHAR(64),
ADD COLUMN     "issued_at" DATE,
ADD COLUMN     "requirement_id" UUID,
ADD COLUMN     "submitted_by_user_id" UUID,
ALTER COLUMN "expires_at" SET DATA TYPE DATE;

-- CreateTable
CREATE TABLE "verification_requirement_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "subject_type" "VerificationSubjectType" NOT NULL,
    "category" TEXT NOT NULL,
    "names" JSONB NOT NULL,
    "descriptions" JSONB NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "high_risk" BOOLEAN NOT NULL DEFAULT false,
    "validity_days" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verification_requirement_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requirements" (
    "id" UUID NOT NULL,
    "verification_case_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "status" "VerificationRequirementStatus" NOT NULL DEFAULT 'NOT_PROVIDED',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "high_risk" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verification_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_reviews" (
    "id" UUID NOT NULL,
    "verification_case_id" UUID NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "second_approver_user_id" UUID,
    "case_version" INTEGER NOT NULL,
    "from_status" "VerificationStatus" NOT NULL,
    "to_status" "VerificationStatus" NOT NULL,
    "status" "VerificationReviewStatus" NOT NULL DEFAULT 'APPLIED',
    "four_eyes_required" BOOLEAN NOT NULL DEFAULT false,
    "encrypted_notes" TEXT NOT NULL,
    "encrypted_second_approval_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6),

    CONSTRAINT "verification_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_audits" (
    "id" UUID NOT NULL,
    "verification_case_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "clinic_location_id" UUID NOT NULL,
    "scheduled_by_user_id" UUID NOT NULL,
    "auditor_user_id" UUID NOT NULL,
    "status" "SiteAuditStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "checklist" JSONB NOT NULL,
    "encrypted_findings" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_audit_attachments" (
    "site_audit_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_audit_attachments_pkey" PRIMARY KEY ("site_audit_id","file_asset_id")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" UUID NOT NULL,
    "verification_case_id" UUID NOT NULL,
    "requirement_id" UUID,
    "requested_by_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "encrypted_description" TEXT NOT NULL,
    "encrypted_response" TEXT,
    "encrypted_decision_notes" TEXT,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_action_attachments" (
    "corrective_action_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corrective_action_attachments_pkey" PRIMARY KEY ("corrective_action_id","file_asset_id")
);

-- Seed the versioned bilingual checklist. These rows are platform-controlled
-- reference data; applicants can provide evidence but cannot alter requirements.
INSERT INTO "verification_requirement_templates"
  ("id", "code", "subject_type", "category", "names", "descriptions", "required", "high_risk", "validity_days", "version", "active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'clinic.operating-license.v1', 'CLINIC', 'CLINIC_OPERATING_LICENSE', '{"vi-VN":"Giấy phép hoạt động phòng khám","en-US":"Clinic operating license"}', '{"vi-VN":"Giấy phép hoạt động còn hiệu lực do cơ quan có thẩm quyền cấp.","en-US":"A current operating license issued by the competent authority."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.dentist-practice-license.v1', 'CLINIC', 'DENTIST_PRACTICE_LICENSE', '{"vi-VN":"Giấy phép hành nghề nha sĩ","en-US":"Dentist practice license"}', '{"vi-VN":"Giấy phép hành nghề của nha sĩ chịu trách nhiệm.","en-US":"Practice license for the responsible dentist."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.scope-of-practice.v1', 'CLINIC', 'SCOPE_OF_PRACTICE', '{"vi-VN":"Phạm vi hành nghề","en-US":"Scope of practice"}', '{"vi-VN":"Phạm vi kỹ thuật được phê duyệt.","en-US":"Approved clinical scope and procedures."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.affiliation.v1', 'CLINIC', 'DENTIST_CLINIC_AFFILIATION', '{"vi-VN":"Quan hệ nha sĩ - phòng khám","en-US":"Dentist-clinic affiliation"}', '{"vi-VN":"Bằng chứng về quan hệ hành nghề hiện tại.","en-US":"Evidence of the current practice affiliation."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.clinical-leader.v1', 'CLINIC', 'RESPONSIBLE_CLINICAL_LEADER', '{"vi-VN":"Người phụ trách chuyên môn","en-US":"Responsible clinical leader"}', '{"vi-VN":"Quyết định bổ nhiệm người phụ trách chuyên môn.","en-US":"Appointment of the accountable clinical leader."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.location.v1', 'CLINIC', 'LOCATION', '{"vi-VN":"Địa điểm hoạt động","en-US":"Operating location"}', '{"vi-VN":"Địa chỉ và quyền sử dụng địa điểm.","en-US":"Address and evidence of the operating location."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.services.v1', 'CLINIC', 'SERVICE_CAPABILITIES', '{"vi-VN":"Năng lực dịch vụ","en-US":"Service capabilities"}', '{"vi-VN":"Danh mục kỹ thuật và năng lực cung cấp.","en-US":"Declared procedures and delivery capability."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.infection-control.v1', 'CLINIC', 'INFECTION_CONTROL_PROCESS', '{"vi-VN":"Kiểm soát nhiễm khuẩn","en-US":"Infection control process"}', '{"vi-VN":"Quy trình kiểm soát nhiễm khuẩn hiện hành.","en-US":"Current infection prevention and control process."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.equipment.v1', 'CLINIC', 'EQUIPMENT', '{"vi-VN":"Trang thiết bị","en-US":"Equipment"}', '{"vi-VN":"Danh mục, bảo trì và hiệu chuẩn thiết bị.","en-US":"Equipment inventory, maintenance, and calibration."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.emergency.v1', 'CLINIC', 'EMERGENCY_PROCEDURES', '{"vi-VN":"Quy trình cấp cứu","en-US":"Emergency procedures"}', '{"vi-VN":"Quy trình ứng phó cấp cứu và chuyển viện.","en-US":"Emergency response and transfer procedure."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.material-traceability.v1', 'CLINIC', 'MATERIAL_TRACEABILITY', '{"vi-VN":"Truy xuất vật liệu","en-US":"Material traceability"}', '{"vi-VN":"Quy trình truy xuất vật liệu và lô sản phẩm.","en-US":"Material and batch traceability process."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.clinical-records.v1', 'CLINIC', 'CLINICAL_RECORD_PROCESS', '{"vi-VN":"Quy trình hồ sơ lâm sàng","en-US":"Clinical record process"}', '{"vi-VN":"Quy trình tạo, bảo vệ và lưu trữ hồ sơ.","en-US":"Process for creating, protecting, and retaining records."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.warranty.v1', 'CLINIC', 'WARRANTY_PROCESS', '{"vi-VN":"Quy trình bảo hành","en-US":"Warranty process"}', '{"vi-VN":"Điều kiện và quy trình xử lý bảo hành.","en-US":"Warranty terms and claim handling process."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.international-support.v1', 'CLINIC', 'INTERNATIONAL_PATIENT_SUPPORT', '{"vi-VN":"Hỗ trợ bệnh nhân quốc tế","en-US":"International patient support"}', '{"vi-VN":"Năng lực hỗ trợ trước, trong và sau chuyến đi.","en-US":"Support capability before, during, and after travel."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'clinic.english-records.v1', 'CLINIC', 'ENGLISH_RECORDS_CAPABILITY', '{"vi-VN":"Hồ sơ tiếng Anh","en-US":"English-language records"}', '{"vi-VN":"Khả năng cung cấp hồ sơ lâm sàng bằng tiếng Anh.","en-US":"Capability to provide clinical records in English."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'dentist.practice-license.v1', 'DENTIST', 'DENTIST_PRACTICE_LICENSE', '{"vi-VN":"Giấy phép hành nghề nha sĩ","en-US":"Dentist practice license"}', '{"vi-VN":"Giấy phép hành nghề còn hiệu lực.","en-US":"A current dentist practice license."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'dentist.scope-of-practice.v1', 'DENTIST', 'SCOPE_OF_PRACTICE', '{"vi-VN":"Phạm vi hành nghề","en-US":"Scope of practice"}', '{"vi-VN":"Phạm vi chuyên môn được cấp phép.","en-US":"Licensed professional scope."}', true, true, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'dentist.affiliation.v1', 'DENTIST', 'DENTIST_CLINIC_AFFILIATION', '{"vi-VN":"Quan hệ với phòng khám","en-US":"Clinic affiliation"}', '{"vi-VN":"Bằng chứng quan hệ hành nghề đang hoạt động.","en-US":"Evidence of an active clinic affiliation."}', true, false, 365, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Preserve legacy verification history by attaching each pre-existing evidence
-- item to the matching versioned requirement and deriving its accountable owner.
UPDATE "verification_cases" vc
SET "submitted_by_user_id" = COALESCE(
  vc."submitted_by_user_id",
  (
    SELECT om."user_id"
    FROM "clinics" c
    JOIN "organization_memberships" om ON om."organization_id" = c."organization_id" AND om."status" = 'ACTIVE'
    JOIN "role_definitions" rd ON rd."id" = om."role_id"
    WHERE c."id" = vc."clinic_id" AND rd."code" = 'CLINIC_ADMIN'
    ORDER BY om."accepted_at" NULLS LAST, om."user_id"
    LIMIT 1
  ),
  (SELECT d."user_id" FROM "dentists" d WHERE d."id" = vc."dentist_id"),
  (
    SELECT ur."user_id"
    FROM "user_roles" ur
    JOIN "role_definitions" rd ON rd."id" = ur."role_id"
    JOIN "users" u ON u."id" = ur."user_id"
    WHERE rd."code" IN ('PLATFORM_ADMIN', 'SUPER_ADMIN') AND u."deleted_at" IS NULL
    ORDER BY ur."user_id"
    LIMIT 1
  )
);

INSERT INTO "verification_requirements"
  ("id", "verification_case_id", "template_id", "status", "required", "high_risk", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  vc."id",
  t."id",
  CASE
    WHEN bool_or(ve."approved_at" IS NOT NULL AND ve."revoked_at" IS NULL AND (ve."expires_at" IS NULL OR ve."expires_at" >= CURRENT_DATE)) THEN 'APPROVED'::"VerificationRequirementStatus"
    ELSE 'PROVIDED'::"VerificationRequirementStatus"
  END,
  true,
  t."high_risk",
  MIN(ve."created_at"),
  CURRENT_TIMESTAMP
FROM "verification_cases" vc
JOIN "verification_evidence" ve ON ve."verification_case_id" = vc."id"
JOIN "verification_requirement_templates" t
  ON t."subject_type" = vc."subject_type" AND t."category" = ve."category" AND t."active" = true
GROUP BY vc."id", t."id", t."high_risk";

UPDATE "verification_evidence" ve
SET
  "requirement_id" = vr."id",
  "submitted_by_user_id" = COALESCE(
    ve."submitted_by_user_id",
    (SELECT fa."owner_user_id" FROM "file_assets" fa WHERE fa."id" = ve."file_asset_id"),
    vc."submitted_by_user_id"
  )
FROM "verification_cases" vc
JOIN "verification_requirements" vr ON vr."verification_case_id" = vc."id"
JOIN "verification_requirement_templates" t ON t."id" = vr."template_id"
WHERE vc."id" = ve."verification_case_id" AND t."category" = ve."category";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "verification_evidence" WHERE "requirement_id" IS NULL OR "submitted_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'legacy verification evidence could not be attributed to a requirement and submitter';
  END IF;
END;
$$;

ALTER TABLE "verification_evidence" ALTER COLUMN "requirement_id" SET NOT NULL;
ALTER TABLE "verification_evidence" ALTER COLUMN "submitted_by_user_id" SET NOT NULL;

-- Attribute legacy VERIFIED decisions to two independent privileged reviewers so
-- migrated public badges retain a complete, reviewer-controlled history.
UPDATE "verification_cases"
SET "version" = GREATEST("version", 2)
WHERE "status" = 'VERIFIED';

INSERT INTO "verification_reviews"
  ("id", "verification_case_id", "reviewer_user_id", "second_approver_user_id", "case_version", "from_status", "to_status", "status", "four_eyes_required", "encrypted_notes", "encrypted_second_approval_notes", "created_at", "applied_at")
SELECT
  gen_random_uuid(), vc."id", primary_reviewer."user_id", second_reviewer."user_id", vc."version",
  'APPROVED', 'VERIFIED', 'APPLIED', true,
  'v1.legacy-migrated.primary-review', 'v1.legacy-migrated.second-approval',
  COALESCE(vc."decided_at", vc."updated_at"), COALESCE(vc."decided_at", vc."updated_at")
FROM "verification_cases" vc
CROSS JOIN LATERAL (
  SELECT ur."user_id"
  FROM "user_roles" ur
  JOIN "role_definitions" rd ON rd."id" = ur."role_id"
  JOIN "users" u ON u."id" = ur."user_id"
  WHERE rd."code" IN ('VERIFICATION_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
    AND u."deleted_at" IS NULL
    AND ur."user_id" IS DISTINCT FROM vc."submitted_by_user_id"
  ORDER BY CASE rd."code" WHEN 'VERIFICATION_OFFICER' THEN 0 WHEN 'PLATFORM_ADMIN' THEN 1 ELSE 2 END, ur."user_id"
  LIMIT 1
) primary_reviewer
CROSS JOIN LATERAL (
  SELECT ur."user_id"
  FROM "user_roles" ur
  JOIN "role_definitions" rd ON rd."id" = ur."role_id"
  JOIN "users" u ON u."id" = ur."user_id"
  WHERE rd."code" IN ('PLATFORM_ADMIN', 'SUPER_ADMIN', 'VERIFICATION_OFFICER')
    AND u."deleted_at" IS NULL
    AND ur."user_id" <> primary_reviewer."user_id"
    AND ur."user_id" IS DISTINCT FROM vc."submitted_by_user_id"
  ORDER BY CASE rd."code" WHEN 'PLATFORM_ADMIN' THEN 0 WHEN 'SUPER_ADMIN' THEN 1 ELSE 2 END, ur."user_id"
  LIMIT 1
) second_reviewer
WHERE vc."status" = 'VERIFIED'
  AND NOT EXISTS (SELECT 1 FROM "verification_reviews" r WHERE r."verification_case_id" = vc."id");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "verification_cases" vc
    WHERE vc."status" = 'VERIFIED'
      AND NOT EXISTS (SELECT 1 FROM "verification_reviews" r WHERE r."verification_case_id" = vc."id")
  ) THEN
    RAISE EXCEPTION 'legacy verified cases require two independent privileged reviewers';
  END IF;
END;
$$;

-- CreateIndex
CREATE UNIQUE INDEX "verification_requirement_templates_code_key" ON "verification_requirement_templates"("code");

-- CreateIndex
CREATE INDEX "verification_requirement_templates_subject_type_active_code_idx" ON "verification_requirement_templates"("subject_type", "active", "code");

-- CreateIndex
CREATE INDEX "verification_requirements_verification_case_id_status_requi_idx" ON "verification_requirements"("verification_case_id", "status", "required");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requirements_verification_case_id_template_id_key" ON "verification_requirements"("verification_case_id", "template_id");

-- CreateIndex
CREATE INDEX "verification_reviews_status_created_at_id_idx" ON "verification_reviews"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "verification_reviews_reviewer_user_id_created_at_idx" ON "verification_reviews"("reviewer_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_reviews_verification_case_id_case_version_key" ON "verification_reviews"("verification_case_id", "case_version");

-- CreateIndex
CREATE INDEX "site_audits_verification_case_id_scheduled_at_idx" ON "site_audits"("verification_case_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "site_audits_auditor_user_id_status_scheduled_at_idx" ON "site_audits"("auditor_user_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "corrective_actions_verification_case_id_status_due_at_idx" ON "corrective_actions"("verification_case_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "corrective_actions_requirement_id_status_idx" ON "corrective_actions"("requirement_id", "status");

-- CreateIndex
CREATE INDEX "verification_cases_status_expires_at_id_idx" ON "verification_cases"("status", "expires_at", "id");

-- CreateIndex
CREATE INDEX "verification_cases_subject_type_status_updated_at_id_idx" ON "verification_cases"("subject_type", "status", "updated_at", "id");

-- CreateIndex
CREATE INDEX "verification_cases_dentist_id_created_at_idx" ON "verification_cases"("dentist_id", "created_at");

-- CreateIndex
CREATE INDEX "verification_cases_assigned_reviewer_user_id_status_updated_idx" ON "verification_cases"("assigned_reviewer_user_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "verification_evidence_verification_case_id_category_created_idx" ON "verification_evidence"("verification_case_id", "category", "created_at");

-- CreateIndex
CREATE INDEX "verification_evidence_requirement_id_approved_at_revoked_at_idx" ON "verification_evidence"("requirement_id", "approved_at", "revoked_at", "expires_at");

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_assigned_reviewer_user_id_fkey" FOREIGN KEY ("assigned_reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requirements" ADD CONSTRAINT "verification_requirements_verification_case_id_fkey" FOREIGN KEY ("verification_case_id") REFERENCES "verification_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requirements" ADD CONSTRAINT "verification_requirements_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "verification_requirement_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "verification_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_verification_case_id_fkey" FOREIGN KEY ("verification_case_id") REFERENCES "verification_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_second_approver_user_id_fkey" FOREIGN KEY ("second_approver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_verification_case_id_fkey" FOREIGN KEY ("verification_case_id") REFERENCES "verification_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_clinic_location_id_fkey" FOREIGN KEY ("clinic_location_id") REFERENCES "clinic_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_scheduled_by_user_id_fkey" FOREIGN KEY ("scheduled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_auditor_user_id_fkey" FOREIGN KEY ("auditor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_audit_attachments" ADD CONSTRAINT "site_audit_attachments_site_audit_id_fkey" FOREIGN KEY ("site_audit_id") REFERENCES "site_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_audit_attachments" ADD CONSTRAINT "site_audit_attachments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_verification_case_id_fkey" FOREIGN KEY ("verification_case_id") REFERENCES "verification_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "verification_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_action_attachments" ADD CONSTRAINT "corrective_action_attachments_corrective_action_id_fkey" FOREIGN KEY ("corrective_action_id") REFERENCES "corrective_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_action_attachments" ADD CONSTRAINT "corrective_action_attachments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Structural invariants and bounded active-case lookup paths.
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_subject_check"
  CHECK (
    ("subject_type" = 'CLINIC' AND "clinic_id" IS NOT NULL AND "dentist_id" IS NULL)
    OR ("subject_type" = 'DENTIST' AND "dentist_id" IS NOT NULL AND "clinic_id" IS NULL)
  );
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_version_check"
  CHECK ("version" > 0 AND length(btrim("methodology_version")) > 0);
ALTER TABLE "verification_requirement_templates" ADD CONSTRAINT "verification_requirement_templates_check"
  CHECK (
    "version" > 0
    AND ("validity_days" IS NULL OR "validity_days" > 0)
    AND jsonb_typeof("names") = 'object'
    AND jsonb_typeof("descriptions") = 'object'
    AND "names" ? 'vi-VN' AND "names" ? 'en-US'
    AND "descriptions" ? 'vi-VN' AND "descriptions" ? 'en-US'
    AND "category" IN (
      'CLINIC_OPERATING_LICENSE', 'DENTIST_PRACTICE_LICENSE', 'SCOPE_OF_PRACTICE',
      'DENTIST_CLINIC_AFFILIATION', 'RESPONSIBLE_CLINICAL_LEADER', 'LOCATION',
      'SERVICE_CAPABILITIES', 'INFECTION_CONTROL_PROCESS', 'EQUIPMENT',
      'EMERGENCY_PROCEDURES', 'MATERIAL_TRACEABILITY', 'CLINICAL_RECORD_PROCESS',
      'WARRANTY_PROCESS', 'INTERNATIONAL_PATIENT_SUPPORT', 'ENGLISH_RECORDS_CAPABILITY'
    )
  );
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_provenance_check"
  CHECK (
    ("file_asset_id" IS NOT NULL OR length(btrim("source_reference")) >= 5)
    AND ("content_hash" IS NULL OR "content_hash" ~ '^[a-f0-9]{64}$')
    AND ("issued_at" IS NULL OR "expires_at" IS NULL OR "expires_at" > "issued_at")
    AND (("approved_at" IS NULL) = ("approved_by_user_id" IS NULL))
    AND ("revoked_at" IS NULL OR "approved_at" IS NOT NULL)
  );
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_state_check"
  CHECK (
    "case_version" > 1
    AND "from_status" <> "to_status"
    AND "reviewer_user_id" IS DISTINCT FROM "second_approver_user_id"
    AND (
      ("status" = 'PENDING_SECOND_APPROVAL' AND "four_eyes_required" = true AND "second_approver_user_id" IS NULL AND "applied_at" IS NULL)
      OR ("status" = 'APPLIED' AND "applied_at" IS NOT NULL AND ("four_eyes_required" = false OR "second_approver_user_id" IS NOT NULL))
      OR ("status" = 'REJECTED' AND "four_eyes_required" = true AND "second_approver_user_id" IS NOT NULL AND "applied_at" IS NULL)
    )
  );
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_state_check"
  CHECK (
    jsonb_typeof("checklist") = 'object'
    AND ("encrypted_findings" IS NULL OR "encrypted_findings" LIKE 'v1.%')
    AND (
      ("status" IN ('SCHEDULED', 'IN_PROGRESS', 'CANCELLED') AND "completed_at" IS NULL)
      OR ("status" IN ('FINDINGS_ISSUED', 'COMPLETED') AND "completed_at" IS NOT NULL AND "encrypted_findings" IS NOT NULL)
    )
  );
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_state_check"
  CHECK (
    "version" > 0
    AND "encrypted_description" LIKE 'v1.%'
    AND ("encrypted_response" IS NULL OR "encrypted_response" LIKE 'v1.%')
    AND ("encrypted_decision_notes" IS NULL OR "encrypted_decision_notes" LIKE 'v1.%')
    AND (("status" = 'OPEN' AND "submitted_at" IS NULL) OR ("status" <> 'OPEN' AND "submitted_at" IS NOT NULL))
    AND (("status" IN ('ACCEPTED', 'CLOSED') AND "resolved_at" IS NOT NULL) OR ("status" NOT IN ('ACCEPTED', 'CLOSED') AND "resolved_at" IS NULL))
  );

CREATE UNIQUE INDEX "verification_cases_one_active_clinic_case_key"
  ON "verification_cases" ("clinic_id")
  WHERE "clinic_id" IS NOT NULL AND "status" NOT IN ('EXPIRED', 'REJECTED');
CREATE UNIQUE INDEX "verification_cases_one_active_dentist_case_key"
  ON "verification_cases" ("dentist_id")
  WHERE "dentist_id" IS NOT NULL AND "status" NOT IN ('EXPIRED', 'REJECTED');

-- A case is publishable only when every required item is approved and backed by
-- at least one approved, non-revoked, non-expired evidence item.
CREATE FUNCTION "verification_case_is_publishable"("case_id" uuid, "at_date" date DEFAULT CURRENT_DATE)
RETURNS boolean AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM "verification_requirements" r
      WHERE r."verification_case_id" = "case_id" AND r."required" = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "verification_requirements" r
      WHERE r."verification_case_id" = "case_id"
        AND r."required" = true
        AND (
          r."status" <> 'APPROVED'
          OR NOT EXISTS (
            SELECT 1
            FROM "verification_evidence" e
            WHERE e."requirement_id" = r."id"
              AND e."approved_at" IS NOT NULL
              AND e."revoked_at" IS NULL
              AND (e."expires_at" IS NULL OR e."expires_at" >= "at_date")
          )
        )
    );
$$ LANGUAGE sql STABLE;

CREATE FUNCTION "enforce_verification_record_integrity"() RETURNS trigger AS $$
DECLARE
  target_case "verification_cases"%ROWTYPE;
  target_requirement "verification_requirements"%ROWTYPE;
  target_template "verification_requirement_templates"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'verification_requirements' THEN
    SELECT * INTO target_case FROM "verification_cases" WHERE "id" = NEW."verification_case_id";
    SELECT * INTO target_template FROM "verification_requirement_templates" WHERE "id" = NEW."template_id";
    IF target_case."id" IS NULL OR target_template."id" IS NULL
      OR target_case."subject_type" <> target_template."subject_type"
      OR NEW."required" <> target_template."required"
      OR NEW."high_risk" <> target_template."high_risk" THEN
      RAISE EXCEPTION 'verification requirement does not match its case template' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'verification_evidence' THEN
    SELECT * INTO target_requirement FROM "verification_requirements" WHERE "id" = NEW."requirement_id";
    SELECT * INTO target_template FROM "verification_requirement_templates" WHERE "id" = target_requirement."template_id";
    IF target_requirement."id" IS NULL
      OR target_requirement."verification_case_id" <> NEW."verification_case_id"
      OR target_template."category" <> NEW."category" THEN
      RAISE EXCEPTION 'verification evidence does not match its case requirement' USING ERRCODE = '23514';
    END IF;
    IF NEW."approved_by_user_id" IS NOT NULL AND NEW."approved_by_user_id" = NEW."submitted_by_user_id" THEN
      RAISE EXCEPTION 'verification evidence submitter cannot approve their own evidence' USING ERRCODE = '23514';
    END IF;
    IF NEW."file_asset_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "file_assets" f
      WHERE f."id" = NEW."file_asset_id"
        AND f."owner_user_id" = NEW."submitted_by_user_id"
        AND f."status" = 'AVAILABLE'
        AND f."scan_status" = 'CLEAN'
        AND f."deleted_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'verification evidence file is not clean, available, and owned by the submitter' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW."verification_case_id" IS DISTINCT FROM OLD."verification_case_id"
      OR NEW."requirement_id" IS DISTINCT FROM OLD."requirement_id"
      OR NEW."submitted_by_user_id" IS DISTINCT FROM OLD."submitted_by_user_id"
      OR NEW."category" IS DISTINCT FROM OLD."category"
      OR NEW."file_asset_id" IS DISTINCT FROM OLD."file_asset_id"
      OR NEW."source_reference" IS DISTINCT FROM OLD."source_reference"
      OR NEW."content_hash" IS DISTINCT FROM OLD."content_hash"
      OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
      OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
      OR NEW."approved_at" IS DISTINCT FROM OLD."approved_at" AND OLD."approved_at" IS NOT NULL
      OR NEW."revoked_at" IS DISTINCT FROM OLD."revoked_at" AND OLD."revoked_at" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'verification evidence provenance and completed decisions are immutable' USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'verification_reviews' THEN
    SELECT * INTO target_case FROM "verification_cases" WHERE "id" = NEW."verification_case_id";
    IF target_case."id" IS NULL
      OR target_case."status" <> NEW."from_status"
      OR target_case."version" + 1 <> NEW."case_version"
      OR (target_case."submitted_by_user_id" IS NOT NULL AND target_case."submitted_by_user_id" = NEW."reviewer_user_id")
      OR (target_case."submitted_by_user_id" IS NOT NULL AND target_case."submitted_by_user_id" = NEW."second_approver_user_id")
      OR (target_case."assigned_reviewer_user_id" IS NOT NULL AND target_case."assigned_reviewer_user_id" <> NEW."reviewer_user_id") THEN
      RAISE EXCEPTION 'verification review actor, status, or case version is inconsistent' USING ERRCODE = '23514';
    END IF;
    IF NEW."to_status" IN ('VERIFIED', 'SUSPENDED') AND NEW."four_eyes_required" = false THEN
      RAISE EXCEPTION 'high-risk verification decisions require four-eyes approval' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      OLD."status" <> 'PENDING_SECOND_APPROVAL'
      OR NEW."verification_case_id" IS DISTINCT FROM OLD."verification_case_id"
      OR NEW."reviewer_user_id" IS DISTINCT FROM OLD."reviewer_user_id"
      OR NEW."case_version" IS DISTINCT FROM OLD."case_version"
      OR NEW."from_status" IS DISTINCT FROM OLD."from_status"
      OR NEW."to_status" IS DISTINCT FROM OLD."to_status"
      OR NEW."four_eyes_required" IS DISTINCT FROM OLD."four_eyes_required"
      OR NEW."encrypted_notes" IS DISTINCT FROM OLD."encrypted_notes"
    ) THEN
      RAISE EXCEPTION 'completed verification reviews are immutable' USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'site_audits' THEN
    SELECT * INTO target_case FROM "verification_cases" WHERE "id" = NEW."verification_case_id";
    IF target_case."subject_type" <> 'CLINIC'
      OR target_case."clinic_id" <> NEW."clinic_id"
      OR NOT EXISTS (SELECT 1 FROM "clinic_locations" l WHERE l."id" = NEW."clinic_location_id" AND l."clinic_id" = NEW."clinic_id") THEN
      RAISE EXCEPTION 'site audit case, clinic, and location are inconsistent' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'corrective_actions' THEN
    IF NEW."requirement_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "verification_requirements" r
      WHERE r."id" = NEW."requirement_id" AND r."verification_case_id" = NEW."verification_case_id"
    ) THEN
      RAISE EXCEPTION 'corrective action requirement belongs to another case' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "verification_requirements_integrity"
  BEFORE INSERT OR UPDATE ON "verification_requirements"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verification_record_integrity"();
CREATE TRIGGER "verification_evidence_integrity"
  BEFORE INSERT OR UPDATE ON "verification_evidence"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verification_record_integrity"();
CREATE TRIGGER "verification_reviews_integrity"
  BEFORE INSERT OR UPDATE ON "verification_reviews"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verification_record_integrity"();
CREATE TRIGGER "site_audits_integrity"
  BEFORE INSERT OR UPDATE ON "site_audits"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verification_record_integrity"();
CREATE TRIGGER "corrective_actions_integrity"
  BEFORE INSERT OR UPDATE ON "corrective_actions"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verification_record_integrity"();

-- Status changes are accepted only after an applied review for the exact next
-- optimistic version. VERIFIED additionally fails closed on stale evidence.
CREATE FUNCTION "enforce_verification_case_transition"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."version" <> 1 THEN
      RAISE EXCEPTION 'new verification cases must start as draft version one' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NEW."version" <> OLD."version" + 1 THEN
      RAISE EXCEPTION 'verification status change must increment the version exactly once' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD."status" IN ('DRAFT', 'ADDITIONAL_INFORMATION_REQUIRED') AND NEW."status" = 'SUBMITTED')
      OR (OLD."status" = 'VERIFIED' AND NEW."status" IN ('VERIFICATION_EXPIRING', 'EXPIRED'))
      OR (OLD."status" = 'VERIFICATION_EXPIRING' AND NEW."status" = 'EXPIRED')
    ) AND NOT EXISTS (
        SELECT 1 FROM "verification_reviews" r
        WHERE r."verification_case_id" = NEW."id"
          AND r."case_version" = NEW."version"
          AND r."from_status" = OLD."status"
          AND r."to_status" = NEW."status"
          AND r."status" = 'APPLIED'
          AND r."applied_at" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'verification status change lacks an applied review for the next version' USING ERRCODE = '23514';
    END IF;
    IF NEW."status" = 'VERIFIED' AND NOT "verification_case_is_publishable"(NEW."id", CURRENT_DATE) THEN
      RAISE EXCEPTION 'verification case lacks approved non-expired evidence for every required item' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW."version" < OLD."version" THEN
    RAISE EXCEPTION 'verification case version cannot move backwards' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "verification_cases_transition_integrity"
  BEFORE UPDATE ON "verification_cases"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verification_case_transition"();
CREATE TRIGGER "verification_cases_insert_integrity"
  BEFORE INSERT ON "verification_cases"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verification_case_transition"();

-- Public verification badges are projections of reviewer-controlled cases;
-- direct clinic or dentist writes cannot self-publish a verified status.
CREATE FUNCTION "enforce_verified_subject_projection"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'clinics' THEN
    IF NEW."verification_status" = 'VERIFIED' AND (
      NEW."verified_at" IS NULL OR NOT EXISTS (
        SELECT 1 FROM "verification_cases" vc
        WHERE vc."subject_type" = 'CLINIC'
          AND vc."clinic_id" = NEW."id"
          AND vc."status" = 'VERIFIED'
          AND (vc."expires_at" IS NULL OR vc."expires_at" > CURRENT_TIMESTAMP)
          AND "verification_case_is_publishable"(vc."id", CURRENT_DATE)
          AND EXISTS (
            SELECT 1 FROM "verification_reviews" vr
            WHERE vr."verification_case_id" = vc."id"
              AND vr."to_status" = 'VERIFIED'
              AND vr."status" = 'APPLIED'
              AND vr."applied_at" IS NOT NULL
          )
      )
    ) THEN
      RAISE EXCEPTION 'clinic verified badge requires a current reviewer-approved case' USING ERRCODE = '23514';
    END IF;
    IF NEW."verification_status" = 'SUSPENDED' AND NOT EXISTS (
      SELECT 1 FROM "verification_cases" vc
      WHERE vc."subject_type" = 'CLINIC' AND vc."clinic_id" = NEW."id" AND vc."status" = 'SUSPENDED'
    ) THEN
      RAISE EXCEPTION 'clinic suspension requires a reviewer-controlled case' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'dentists' THEN
    IF NEW."license_status" = 'VERIFIED' AND NOT EXISTS (
      SELECT 1 FROM "verification_cases" vc
      WHERE vc."subject_type" = 'DENTIST'
        AND vc."dentist_id" = NEW."id"
        AND vc."status" = 'VERIFIED'
        AND (vc."expires_at" IS NULL OR vc."expires_at" > CURRENT_TIMESTAMP)
        AND "verification_case_is_publishable"(vc."id", CURRENT_DATE)
        AND EXISTS (
          SELECT 1 FROM "verification_reviews" vr
          WHERE vr."verification_case_id" = vc."id"
            AND vr."to_status" = 'VERIFIED'
            AND vr."status" = 'APPLIED'
            AND vr."applied_at" IS NOT NULL
        )
    ) THEN
      RAISE EXCEPTION 'dentist verified badge requires a current reviewer-approved case' USING ERRCODE = '23514';
    END IF;
    IF NEW."license_status" = 'SUSPENDED' AND NOT EXISTS (
      SELECT 1 FROM "verification_cases" vc
      WHERE vc."subject_type" = 'DENTIST' AND vc."dentist_id" = NEW."id" AND vc."status" = 'SUSPENDED'
    ) THEN
      RAISE EXCEPTION 'dentist suspension requires a reviewer-controlled case' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "clinics_verified_projection_integrity"
  BEFORE INSERT OR UPDATE OF "verification_status", "verified_at" ON "clinics"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verified_subject_projection"();
CREATE TRIGGER "dentists_verified_projection_integrity"
  BEFORE INSERT OR UPDATE OF "license_status" ON "dentists"
  FOR EACH ROW EXECUTE FUNCTION "enforce_verified_subject_projection"();
