import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../prisma/migrations/202607120008_privacy_execution/migration.sql', import.meta.url),
  'utf8',
);

describe('privacy execution migration contract', () => {
  it('persists bounded execution leases, immutable outcomes, and legal holds', () => {
    expect(migration).toContain('CREATE TABLE "privacy_request_executions"');
    expect(migration).toContain('"lease_expires_at" TIMESTAMPTZ(6)');
    expect(migration).toContain('CREATE TABLE "privacy_legal_holds"');
    expect(migration).toContain('privacy_execution_evidence_append_only');
    expect(migration).toContain('privacy_legal_hold_append_only');
  });

  it('rejects success without complete export or deletion evidence', () => {
    expect(migration).toContain('successful privacy execution requires immutable outcome evidence');
    expect(migration).toContain('successful export requires a verified expiring artifact');
    expect(migration).toContain('successful deletion requires an allowed retention outcome');
  });

  it('keeps request and execution state transitions consistent', () => {
    expect(migration).toContain('processing privacy request requires an active execution');
    expect(migration).toContain('completed privacy request requires successful execution evidence');
  });
});
