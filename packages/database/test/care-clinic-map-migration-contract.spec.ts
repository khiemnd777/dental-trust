import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/202607180012_care_clinic_map/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('Care clinic map migration invariants', () => {
  it('requires complete, bounded coordinate pairs', () => {
    expect(migration).toContain('clinic_locations_coordinates_pair_check');
    expect(migration).toContain('clinic_locations_latitude_range_check');
    expect(migration).toContain('clinic_locations_longitude_range_check');
    expect(migration).toContain('BETWEEN -90 AND 90');
    expect(migration).toContain('BETWEEN -180 AND 180');
  });
});
