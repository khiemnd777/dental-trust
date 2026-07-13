import { describe, expect, it } from 'vitest';

import { resolveClinicWorkspaceTab } from './clinic-tabs';

describe('resolveClinicWorkspaceTab', () => {
  it.each(['team', 'services', 'analytics', 'security'] as const)(
    'opens the %s management destination',
    (tab) => {
      expect(resolveClinicWorkspaceTab(tab)).toBe(tab);
    },
  );

  it('supports the previous securty typo and defaults unknown values safely', () => {
    expect(resolveClinicWorkspaceTab('securty')).toBe('security');
    expect(resolveClinicWorkspaceTab('unknown')).toBe('overview');
  });
});
