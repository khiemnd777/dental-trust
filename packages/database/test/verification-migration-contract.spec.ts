import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/202607120002_verification_compliance/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('verification compliance migration', () => {
  it('enforces subject isolation, versioned checklists, and clean evidence provenance', () => {
    expect(migration).toContain('verification_cases_subject_check');
    expect(migration).toContain('verification_requirement_templates');
    expect(migration).toContain('verification_evidence_provenance_check');
    expect(migration).toContain('verification evidence file is not clean, available, and owned');
    expect(migration).toContain('verification_cases_one_active_clinic_case_key');
    expect(migration).toContain('verification_cases_one_active_dentist_case_key');
  });

  it('prevents self-published badges and unreviewed high-risk state changes', () => {
    expect(migration).toContain('verification_case_is_publishable');
    expect(migration).toContain('verification_cases_transition_integrity');
    expect(migration).toContain('high-risk verification decisions require four-eyes approval');
    expect(migration).toContain('clinics_verified_projection_integrity');
    expect(migration).toContain('dentists_verified_projection_integrity');
    expect(migration).toContain('clinic verified badge requires a current reviewer-approved case');
  });

  it('seeds bilingual requirements and preserves independent legacy review history', () => {
    expect(migration.match(/'clinic\.[^']+\.v1'/gu)).toHaveLength(15);
    expect(migration.match(/'dentist\.[^']+\.v1'/gu)).toHaveLength(3);
    expect(migration).toContain('"vi-VN"');
    expect(migration).toContain('"en-US"');
    expect(migration).toContain(
      'legacy verified cases require two independent privileged reviewers',
    );
  });
});
