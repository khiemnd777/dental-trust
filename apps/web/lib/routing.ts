import type { IconName } from '@dental-trust/ui';

export type PortalArea = 'patient' | 'clinic' | 'concierge' | 'verification' | 'admin';

export const developmentCaseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
export const developmentCaseNumber = 'DT-2026-A1B2C3D4E5';
export const developmentVerificationClinicCaseId = '118f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
export const developmentVerificationDentistCaseId = '218f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
export const developmentSiteAuditId = '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';

export interface PortalRoute {
  key: string;
  path: string;
  icon: IconName;
}

export const portalBasePaths: Record<PortalArea, string> = {
  patient: 'app',
  clinic: 'clinic',
  concierge: 'concierge',
  verification: 'verification-admin',
  admin: 'admin',
};

export const portalRoutes: Record<PortalArea, readonly PortalRoute[]> = {
  patient: [
    { key: 'dashboard', path: '', icon: 'home' },
    { key: 'onboarding', path: 'onboarding', icon: 'user' },
    { key: 'newCase', path: 'cases/new', icon: 'plus' },
    { key: 'case', path: `cases/${developmentCaseId}`, icon: 'document' },
    { key: 'intake', path: `cases/${developmentCaseId}/intake`, icon: 'file' },
    { key: 'records', path: `cases/${developmentCaseId}/records`, icon: 'upload' },
    { key: 'shortlist', path: `cases/${developmentCaseId}/shortlist`, icon: 'clinic' },
    { key: 'plans', path: `cases/${developmentCaseId}/plans`, icon: 'activity' },
    { key: 'planDetail', path: `cases/${developmentCaseId}/plans/v3`, icon: 'file' },
    {
      key: 'consultations',
      path: `cases/${developmentCaseId}/consultations`,
      icon: 'calendar',
    },
    { key: 'checkout', path: 'bookings/checkout', icon: 'wallet' },
    { key: 'payments', path: 'payments', icon: 'wallet' },
    { key: 'journey', path: `cases/${developmentCaseId}/journey`, icon: 'activity' },
    { key: 'passport', path: `cases/${developmentCaseId}/passport`, icon: 'passport' },
    { key: 'aftercare', path: `cases/${developmentCaseId}/aftercare`, icon: 'heart' },
    { key: 'incidents', path: 'incidents', icon: 'alert' },
    { key: 'reviews', path: 'reviews', icon: 'star' },
    { key: 'messages', path: `cases/${developmentCaseId}/messages`, icon: 'message' },
    { key: 'caregivers', path: `cases/${developmentCaseId}/caregivers`, icon: 'team' },
    { key: 'notifications', path: 'notifications', icon: 'mail' },
    { key: 'settings', path: 'settings', icon: 'settings' },
    { key: 'privacy', path: 'privacy', icon: 'shield' },
  ],
  clinic: [
    { key: 'dashboard', path: '', icon: 'home' },
    { key: 'onboarding', path: 'onboarding', icon: 'document' },
    { key: 'verification', path: 'verification', icon: 'shield' },
    { key: 'profile', path: 'profile', icon: 'clinic' },
    { key: 'dentists', path: 'dentists', icon: 'user' },
    { key: 'team', path: 'team', icon: 'team' },
    { key: 'cases', path: 'cases', icon: 'document' },
    { key: 'caseDetail', path: `cases/${developmentCaseId}`, icon: 'file' },
    { key: 'planBuilder', path: `cases/${developmentCaseId}/treatment-plans/new`, icon: 'plus' },
    { key: 'scheduling', path: `cases/${developmentCaseId}/scheduling`, icon: 'calendar' },
    { key: 'availability', path: 'availability', icon: 'calendar' },
    { key: 'messages', path: `cases/${developmentCaseId}/messages`, icon: 'message' },
    { key: 'progress', path: `cases/${developmentCaseId}/treatment-progress`, icon: 'activity' },
    { key: 'passport', path: `cases/${developmentCaseId}/passport`, icon: 'passport' },
    { key: 'aftercare', path: 'aftercare', icon: 'heart' },
    { key: 'incidents', path: 'incidents', icon: 'alert' },
    { key: 'reviews', path: 'reviews', icon: 'star' },
    { key: 'pricing', path: 'services', icon: 'wallet' },
    { key: 'analytics', path: 'analytics', icon: 'activity' },
    { key: 'billing', path: 'billing', icon: 'wallet' },
    { key: 'settings', path: 'settings', icon: 'settings' },
  ],
  concierge: [
    { key: 'dashboard', path: '', icon: 'home' },
    { key: 'queue', path: 'queue', icon: 'activity' },
    { key: 'cases', path: `cases/${developmentCaseId}`, icon: 'document' },
    { key: 'matching', path: `cases/${developmentCaseId}/matching`, icon: 'sparkle' },
    { key: 'scheduling', path: `cases/${developmentCaseId}/scheduling`, icon: 'calendar' },
    { key: 'aftercare', path: `cases/${developmentCaseId}/aftercare`, icon: 'heart' },
    { key: 'incidents', path: `cases/${developmentCaseId}/incidents`, icon: 'alert' },
    { key: 'tasks', path: `cases/${developmentCaseId}/tasks`, icon: 'check' },
  ],
  verification: [
    { key: 'dashboard', path: '', icon: 'home' },
    { key: 'clinic', path: 'clinics', icon: 'clinic' },
    { key: 'dentist', path: 'dentists', icon: 'user' },
    { key: 'audit', path: 'site-audits', icon: 'document' },
    { key: 'corrective', path: 'corrective-actions', icon: 'alert' },
    { key: 'expiring', path: 'expiring', icon: 'calendar' },
    { key: 'suspension', path: 'suspensions', icon: 'shield' },
  ],
  admin: [
    { key: 'dashboard', path: '', icon: 'home' },
    { key: 'users', path: 'users', icon: 'user' },
    { key: 'organizations', path: 'organizations', icon: 'team' },
    { key: 'roles', path: 'roles', icon: 'shield' },
    { key: 'clinics', path: 'clinics', icon: 'clinic' },
    { key: 'dentists', path: 'dentists', icon: 'user' },
    { key: 'cases', path: 'cases', icon: 'document' },
    { key: 'payments', path: 'payments', icon: 'wallet' },
    { key: 'incidents', path: 'incidents', icon: 'alert' },
    { key: 'reviews', path: 'reviews', icon: 'star' },
    { key: 'content', path: 'content', icon: 'file' },
    { key: 'taxonomy', path: 'taxonomy', icon: 'filter' },
    { key: 'notifications', path: 'notifications', icon: 'mail' },
    { key: 'privacy', path: 'privacy-requests', icon: 'shield' },
    { key: 'audit', path: 'audit-logs', icon: 'activity' },
    { key: 'jobs', path: 'jobs', icon: 'settings' },
    { key: 'webhooks', path: 'webhooks', icon: 'external' },
    { key: 'flags', path: 'feature-flags', icon: 'filter' },
    { key: 'health', path: 'health', icon: 'activity' },
  ],
};

export function findPortalRoute(area: PortalArea, segments: readonly string[]) {
  const path = segments.join('/');
  const exact = portalRoutes[area].find((route) => route.path === path);
  if (exact) return exact;
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  const patterns: Partial<Record<PortalArea, readonly [string, string][]>> = {
    patient: [
      [`^cases/${uuid}$`, 'case'],
      [`^cases/${uuid}/intake$`, 'intake'],
      [`^cases/${uuid}/records$`, 'records'],
      [`^cases/${uuid}/shortlist$`, 'shortlist'],
      [`^cases/${uuid}/plans$`, 'plans'],
      [`^cases/${uuid}/plans/v3$`, 'planDetail'],
      [`^cases/${uuid}/consultations$`, 'consultations'],
      [`^cases/${uuid}/journey$`, 'journey'],
      [`^cases/${uuid}/passport$`, 'passport'],
      [`^cases/${uuid}/aftercare$`, 'aftercare'],
      [`^cases/${uuid}/caregivers$`, 'caregivers'],
      [`^cases/${uuid}/messages$`, 'messages'],
    ],
    clinic: [
      [`^cases/${uuid}$`, 'caseDetail'],
      [`^cases/${uuid}/treatment-plans/new$`, 'planBuilder'],
      [`^cases/${uuid}/scheduling$`, 'scheduling'],
      [`^cases/${uuid}/treatment-progress$`, 'progress'],
      [`^cases/${uuid}/passport$`, 'passport'],
      [`^cases/${uuid}/messages$`, 'messages'],
    ],
    concierge: [
      [`^cases/${uuid}$`, 'cases'],
      [`^cases/${uuid}/matching$`, 'matching'],
      [`^cases/${uuid}/scheduling$`, 'scheduling'],
      [`^cases/${uuid}/aftercare$`, 'aftercare'],
      [`^cases/${uuid}/incidents$`, 'incidents'],
      [`^cases/${uuid}/tasks$`, 'tasks'],
    ],
    verification: [
      [`^clinics/${uuid}$`, 'clinic'],
      [`^dentists/${uuid}$`, 'dentist'],
      [`^site-audits/${uuid}$`, 'audit'],
      [`^corrective-actions/${uuid}$`, 'corrective'],
    ],
  };
  const key = patterns[area]?.find(([pattern]) => new RegExp(pattern, 'i').test(path))?.[1];
  return key ? portalRoutes[area].find((route) => route.key === key) : undefined;
}

export const publicPaths = [
  '',
  'about',
  'how-it-works',
  'verification',
  'clinics',
  'services',
  'services/dental-implants',
  'pricing',
  'faq',
  'contact',
  'privacy',
  'terms',
  'medical-disclaimer',
] as const;
