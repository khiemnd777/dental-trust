import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/202607120009_governance_regex_constraints/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('governance regex correction migration', () => {
  it('uses PostgreSQL-standard escaping for calling codes and decimal values', () => {
    expect(migration).toContain(`"calling_code" ~ '^\\+[1-9][0-9]{0,6}$'`);
    expect(migration).toContain(`NEW."value" !~ '^-?[0-9]+(\\.[0-9]+)?$'`);
    expect(migration).not.toContain(`"calling_code" ~ '^\\\\+`);
    expect(migration).not.toContain(`NEW."value" !~ '^-?[0-9]+(\\\\.`);
  });
});
