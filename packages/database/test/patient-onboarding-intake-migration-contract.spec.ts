import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/202607120007_patient_onboarding_intake/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const foundation = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/202607120001_initial_foundation/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('patient onboarding and intake migration invariants', () => {
  it('allows truthful drafts while requiring complete submitted snapshots', () => {
    expect(migration).toContain('ALTER COLUMN "desired_procedure_code" DROP NOT NULL');
    expect(migration).toContain('"current_step" BETWEEN 1 AND 6');
    expect(migration).toContain('submitted intake questionnaire is incomplete');
    expect(migration).toContain('jsonb_array_length(NEW."preferred_consultation_times") = 0');
  });

  it('limits each patient and questionnaire to one active mutable record', () => {
    expect(migration).toContain('emergency_contacts_one_per_patient_key');
    expect(migration).toContain('intake_questionnaire_versions_one_draft_key');
    expect(migration).toContain('intake_questionnaire_versions_one_submitted_key');
  });

  it('requires encrypted sensitive fields and attributable patient-session consent', () => {
    expect(migration).toContain('patient_profiles_onboarding_security_check');
    expect(migration).toContain('"encrypted_name" LIKE \'v1.%\'');
    expect(migration).toContain('questionnaire_consents_identity_integrity');
    expect(migration).toContain(
      "ctv.\"purpose\" IN ('INTAKE_HEALTH_INFORMATION', 'INTAKE_MEDICAL_DISCLAIMER')",
    );
    expect(migration).toContain('s."revoked_at" IS NULL');
  });

  it('retains the foundation append-only submitted-version and child protections', () => {
    expect(foundation).toContain('intake_questionnaire_versions_immutable');
    expect(foundation).toContain('intake_medical_conditions_parent_immutable');
    expect(foundation).toContain('questionnaire_consents_parent_immutable');
    expect(migration).toContain('requires both explicit consent purposes');
  });
});
