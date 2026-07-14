import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/202607140011_ai_care_assistant/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('AI care assistant migration', () => {
  it('encrypts messages and prevents duplicate exchange roles', () => {
    expect(migration).toContain('assistant_messages_encryption_check');
    expect(migration).toContain(`"encrypted_content" LIKE 'v1.%'`);
    expect(migration).toContain('assistant_messages_session_id_exchange_id_role_key');
  });

  it('binds assistant cases to the owning patient at the database boundary', () => {
    expect(migration).toContain('CREATE FUNCTION "enforce_assistant_case_ownership"');
    expect(migration).toContain('assistant session case must belong to the patient');
    expect(migration).toContain('CREATE TRIGGER "assistant_session_case_ownership"');
  });

  it('records notice acknowledgement and validates session lifecycle', () => {
    expect(migration).toContain('"notice_acknowledged_at" TIMESTAMPTZ(6) NOT NULL');
    expect(migration).toContain('assistant_sessions_closed_check');
    expect(migration).toContain("\"locale\" IN ('vi-VN', 'en-US')");
  });
});
