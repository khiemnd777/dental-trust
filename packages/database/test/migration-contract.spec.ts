import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(
  new URL('../prisma/migrations/202607120001_initial_foundation/migration.sql', import.meta.url),
);
const migration = readFileSync(migrationPath, 'utf8');

describe('initial migration security invariants', () => {
  it('protects snapshots and every mutable child collection', () => {
    for (const trigger of [
      'treatment_plan_versions_immutable',
      'dental_passport_versions_immutable',
      'intake_questionnaire_versions_immutable',
      'treatment_plan_items_parent_immutable',
      'implant_records_parent_immutable',
      'intake_medications_parent_immutable',
      'questionnaire_consents_parent_immutable',
    ]) {
      expect(migration).toContain(trigger);
    }
    expect(migration).toContain('snapshot status transition % -> % is prohibited');
  });

  it('enforces tenant combinations and appointment overlap in PostgreSQL', () => {
    expect(migration).toContain('enforce_cross_tenant_integrity');
    expect(migration).toContain('appointments_dentist_no_overlap');
    expect(migration).toContain('reviews_tenant_integrity');
    expect(migration).toContain('clinic_staff_tenant_integrity');
    expect(migration).toContain('"verified" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain(
      'review is not attributable to the patient and completed platform treatment',
    );
    expect(migration).toContain('b."status" = \'COMPLETED\'');
  });

  it('makes audit/history append-only and outbox claims lease-recoverable', () => {
    expect(migration).toContain('audit_logs_append_only');
    expect(migration).toContain('case_status_history_append_only');
    expect(migration).toContain('consent_records_immutable');
    expect(migration).toContain('treatment_plan_acceptances_append_only');
    expect(migration).toContain('locked_at');
    expect(migration).toContain('lock_owner');
  });

  it('enforces payment ledger identity, refund totals, and provider audit attribution', () => {
    expect(migration).toContain('payments_booking_id_key');
    expect(migration).toContain('payments_ledger_integrity');
    expect(migration).toContain('refunds_ledger_integrity');
    expect(migration).toContain('refund reservations exceed the payment amount');
    expect(migration).toContain('audit_logs_actor_check');
    expect(migration).toContain('processing_started_at');
    expect(migration).toContain('treatment_plan_acceptances_identity_integrity');
  });

  it('persists only hashed lifecycle and recovery credentials with bounded contact idempotency', () => {
    expect(migration).toContain('"account_lifecycle_tokens"');
    expect(migration).toContain('"token_hash" CHAR(64) NOT NULL');
    expect(migration).toContain('"mfa_recovery_codes"');
    expect(migration).toContain('"code_hash" CHAR(64) NOT NULL');
    expect(migration).toContain('"pending_encrypted_secret" TEXT');
    expect(migration).toContain('"contact_requests_idempotency_key_key"');
    expect(migration).not.toContain('"token" TEXT');
    expect(migration).not.toContain('"recovery_code" TEXT');
  });

  it('separates patient-visible trust events and constrains elevated support access', () => {
    expect(migration).toContain('incident_events_append_only');
    expect(migration).toContain('incident_attachments_tenant_integrity');
    expect(migration).toContain('review_responses_tenant_integrity');
    expect(migration).toContain("ELSIF TG_TABLE_NAME = 'incidents' THEN");
    expect(migration).toContain("ELSIF TG_TABLE_NAME = 'clinic_staff' THEN");
    expect(migration).toContain('support_elevations_identity_integrity');
    expect(migration).toContain("'PRIVACY_STATUS_READ'");
    expect(migration).toContain('"encrypted_details" LIKE \'v1.%\'');
    expect(migration).toContain('"encrypted_reason" LIKE \'v1.%\'');
    expect(migration).toContain('"approved_by_user_id" UUID NOT NULL');
    expect(migration).not.toContain('"internal_note" TEXT');
  });
});
