import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/202607120005_admin_governance/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('admin governance migration invariants', () => {
  it('persists append-only content, template, flag, and configuration versions', () => {
    for (const table of [
      'feature_flag_versions',
      'notification_template_versions',
      'system_configuration_versions',
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
      expect(migration).toContain(`${table}_append_only`);
    }
    expect(migration).toContain('content_pages_append_only');
    expect(migration).toContain('content_pages_publication_state_check');
  });

  it('keeps configuration non-secret and validates each typed value in PostgreSQL', () => {
    expect(migration).toContain('system_configurations_non_secret_check');
    expect(migration).toContain('"secret" = false');
    expect(migration).toContain('validate_system_configuration_value');
    expect(migration).toContain("configured_type = 'BOOLEAN'");
    expect(migration).toContain("configured_type = 'INTEGER'");
    expect(migration).toContain("configured_type = 'DECIMAL'");
  });

  it('requires controlled bilingual location and locale records with one default', () => {
    expect(migration).toContain('country_configurations_check');
    expect(migration).toContain('city_configurations_check');
    expect(migration).toContain('locale_configurations_check');
    expect(migration).toContain('locale_configurations_single_default_idx');
    expect(migration).toContain("\"locale\" IN ('vi-VN', 'en-US')");
  });

  it('uses foreign keys and optimistic versions for every mutable governance record', () => {
    expect(migration).toContain('feature_flag_versions_changed_by_user_id_fkey');
    expect(migration).toContain('notification_template_versions_created_by_user_id_fkey');
    expect(migration).toContain('system_configuration_versions_changed_by_user_id_fkey');
    expect(migration).toContain('service_categories_version_check');
    expect(migration).toContain('procedure_definitions_version_check');
  });
});
