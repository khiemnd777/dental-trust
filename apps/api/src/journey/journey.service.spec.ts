import { describe, expect, it } from 'vitest';

import { deterministicPassportShareToken } from './journey.service.js';

describe('Dental Passport share credentials', () => {
  it('derives a replayable opaque token without embedding identifiers', () => {
    const input = [
      'unit-test-auth-secret-with-ample-entropy',
      '10000000-0000-4000-8000-000000000001',
      'mobile-retry-key-1',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
    ] as const;
    const first = deterministicPassportShareToken(...input);
    const replay = deterministicPassportShareToken(...input);

    expect(first).toBe(replay);
    expect(first).toMatch(/^dtp_[A-Za-z0-9_-]{64}$/u);
    for (const identifier of input.slice(1)) expect(first).not.toContain(identifier);
    expect(
      deterministicPassportShareToken(input[0], input[1], 'another-key', input[3], input[4]),
    ).not.toBe(first);
  });
});
