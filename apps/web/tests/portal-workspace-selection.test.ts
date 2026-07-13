import { describe, expect, it } from 'vitest';

import { selectPortalWorkspace } from '@/components/portal-workspace-selection';

describe('care journey workspace selection', () => {
  it('routes patient and clinic dashboards to Today', () => {
    expect(selectPortalWorkspace('patient', 'dashboard')).toBe('today');
    expect(selectPortalWorkspace('clinic', 'dashboard')).toBe('today');
  });

  it('routes patient and clinic case detail to the shared Case Hub', () => {
    expect(selectPortalWorkspace('patient', 'case')).toBe('case-hub');
    expect(selectPortalWorkspace('clinic', 'caseDetail')).toBe('case-hub');
  });
});
