import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/202607120001_initial_foundation/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('scheduling and secure messaging migration invariants', () => {
  it('enforces dentist and patient-case appointment conflict prevention in PostgreSQL', () => {
    expect(migration).toContain('appointments_dentist_no_overlap');
    expect(migration).toContain('appointments_case_no_overlap');
    expect(migration).toContain('appointments_time_range_check');
    expect(migration).toContain('appointments_version_check');
  });

  it('keeps message content encrypted and internal notes structurally separate', () => {
    expect(migration).toContain('message_threads_subject_encrypted_check');
    expect(migration).toContain('messages_body_encrypted_check');
    expect(migration).toContain('messages_participant_visibility_check');
    expect(migration).toContain('internal_notes_body_encrypted_check');
    expect(migration).toContain('CREATE TABLE "message_read_receipts"');
  });
});
