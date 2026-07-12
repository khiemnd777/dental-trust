import { describe, expect, it } from 'vitest';

import {
  assertIncidentTransition,
  assertPrivacyRequestTransition,
  DomainRuleError,
  incidentSlaDueAt,
} from '../src/index.js';

describe('trust and safety policies', () => {
  it('permits only explicit incident transitions', () => {
    expect(() => assertIncidentTransition('OPEN', 'TRIAGED')).not.toThrow();
    expect(() => assertIncidentTransition('CLOSED', 'IN_PROGRESS')).toThrow(DomainRuleError);
    expect(() => assertIncidentTransition('CLOSED', 'REOPENED')).not.toThrow();
  });

  it('calculates stricter response deadlines for more severe incidents', () => {
    const openedAt = new Date('2026-07-12T00:00:00.000Z');
    expect(incidentSlaDueAt('CRITICAL', openedAt).toISOString()).toBe('2026-07-12T01:00:00.000Z');
    expect(incidentSlaDueAt('LOW', openedAt).toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('makes completed privacy requests terminal', () => {
    expect(() => assertPrivacyRequestTransition('IN_REVIEW', 'APPROVED')).not.toThrow();
    expect(() => assertPrivacyRequestTransition('COMPLETED', 'PROCESSING')).toThrow(
      DomainRuleError,
    );
  });
});
