import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/202607120004_concierge_matching/migration.sql', import.meta.url),
  ),
  'utf8',
);
const foundation = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/202607120001_initial_foundation/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('concierge and organic matching migration invariants', () => {
  it('persists an explainable non-commercial ranking trail', () => {
    expect(migration).toContain('"case_matching_criteria"');
    expect(migration).toContain('"criteria_version_id"');
    expect(migration).toContain('"organic_rank"');
    expect(foundation).toContain('"algorithm_version"');
    expect(migration).toContain('matching_results_append_only');
    expect(migration).toContain('case_matching_criteria_append_only');
    expect(migration).not.toMatch(/commercial_boost|sponsor_rank|commission_score/iu);
  });

  it('requires attributable override rationale and explicit introduction consent', () => {
    expect(migration).toContain('case_shortlist_entries_rank_override_check');
    expect(migration).toContain('"encrypted_override_reason" LIKE \'v1.%\'');
    expect(migration).toContain('ctv."purpose" = \'CLINIC_INTRODUCTION\'');
    expect(migration).toContain('introduction_requests_consent_integrity');
    expect(migration).toContain('cr."withdrawn_at" IS NULL');
    expect(migration).toContain('s."revoked_at" IS NULL');
  });

  it('protects assigned-case scope and private operational evidence', () => {
    expect(migration).toContain('concierge_case_workspaces_assignment_integrity');
    expect(migration).toContain('active concierge organization assignment');
    expect(migration).toContain('assigned concierge agent is not an active organization member');
    for (const trigger of [
      'concierge_internal_notes_append_only',
      'concierge_travel_notes_append_only',
      'concierge_communication_events_append_only',
      'concierge_supervisor_reviews_append_only',
    ]) {
      expect(migration).toContain(trigger);
    }
    expect(migration).toContain('protect_concierge_handoff');
  });
});
