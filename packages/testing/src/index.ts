import type { AccessContext } from '@dental-trust/auth';

export const testIds = {
  patientUser: '00000000-0000-4000-8000-000000000001',
  caregiverUser: '00000000-0000-4000-8000-000000000002',
  clinicOrganization: '00000000-0000-4000-8000-000000000010',
  dentalCase: '00000000-0000-4000-8000-000000000020',
  session: '00000000-0000-4000-8000-000000000030',
  request: 'test-request-00000001',
} as const;

export const testClock = new Date('2026-07-12T05:00:00.000Z');

export function createTestAccessContext(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: testIds.patientUser,
    sessionId: testIds.session,
    roles: ['PATIENT'],
    memberships: [],
    mfaVerified: false,
    requestId: testIds.request,
    ...overrides,
  };
}
