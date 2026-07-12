import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/202607120001_initial_foundation/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('journey and Dental Passport persistence contract', () => {
  it('makes provider records, acknowledgements, access logs, and passport content immutable', () => {
    for (const trigger of [
      'treatment_instructions_append_only',
      'plan_change_requests_append_only',
      'plan_change_acknowledgements_append_only',
      'secure_share_access_logs_append_only',
      'dental_passport_version_content_immutable',
      'prescription_records_parent_immutable',
    ]) {
      expect(migration).toContain(trigger);
    }
    expect(migration).toContain('dental passport versions cannot be deleted');
  });

  it('enforces cross-case attribution and published-file share integrity', () => {
    expect(migration).toContain('enforce_journey_passport_integrity');
    expect(migration).toContain("IF TG_TABLE_NAME = 'treatment_instructions' THEN");
    expect(migration).toContain("ELSIF TG_TABLE_NAME = 'dental_passport_versions' THEN");
    expect(migration).toContain('passport share does not reference its published case file');
    expect(migration).toContain('plan change acknowledgement is not attributable');
  });

  it('stores only opaque share hashes and encrypted clinical instructions', () => {
    expect(migration).toContain('"token_hash" CHAR(64) NOT NULL');
    expect(migration).toContain('treatment_instructions_encrypted_content_check');
    expect(migration).toContain('prescription_records_encrypted_fields_check');
    expect(migration).not.toContain('"share_token"');
    expect(migration).not.toContain('"qr_payload"');
  });
});
