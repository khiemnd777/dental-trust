import type { PortalArea } from '@/lib/routing';

export type PortalWorkspaceKind =
  | 'patient-onboarding'
  | 'verification'
  | 'booking-billing'
  | 'clinic-operations'
  | 'case-list'
  | 'notification-center'
  | 'admin-governance'
  | 'privacy-requests'
  | 'trust-safety'
  | 'admin-operations'
  | 'admin-directory'
  | 'collaboration'
  | 'journey-passport'
  | 'matching-concierge'
  | 'specialized'
  | 'generic';

const exact = new Map<string, PortalWorkspaceKind>([
  ['patient:onboarding', 'patient-onboarding'],
  ['patient:intake', 'patient-onboarding'],
  ['patient:checkout', 'booking-billing'],
  ['patient:payments', 'booking-billing'],
  ['clinic:billing', 'booking-billing'],
  ['patient:dashboard', 'case-list'],
  ['clinic:dashboard', 'clinic-operations'],
  ['clinic:cases', 'clinic-operations'],
  ['concierge:dashboard', 'case-list'],
  ['concierge:queue', 'case-list'],
  ['admin:dashboard', 'case-list'],
  ['admin:cases', 'case-list'],
  ['patient:notifications', 'notification-center'],
  ['patient:settings', 'notification-center'],
  ['admin:content', 'admin-governance'],
  ['admin:taxonomy', 'admin-governance'],
  ['admin:flags', 'admin-governance'],
  ['patient:privacy', 'privacy-requests'],
  ['admin:privacy', 'privacy-requests'],
  ['patient:incidents', 'trust-safety'],
  ['patient:reviews', 'trust-safety'],
  ['clinic:incidents', 'trust-safety'],
  ['admin:incidents', 'trust-safety'],
  ['clinic:reviews', 'trust-safety'],
  ['admin:reviews', 'trust-safety'],
  ['admin:audit', 'admin-operations'],
  ['admin:jobs', 'admin-operations'],
  ['admin:notifications', 'admin-operations'],
  ['admin:webhooks', 'admin-operations'],
  ['admin:health', 'admin-operations'],
  ['admin:users', 'admin-directory'],
  ['admin:organizations', 'admin-directory'],
  ['admin:roles', 'admin-directory'],
  ['admin:clinics', 'admin-directory'],
  ['admin:dentists', 'admin-directory'],
  ['admin:payments', 'admin-directory'],
  ['patient:consultations', 'collaboration'],
  ['patient:messages', 'collaboration'],
  ['clinic:scheduling', 'collaboration'],
  ['clinic:messages', 'collaboration'],
  ['patient:journey', 'journey-passport'],
  ['patient:passport', 'journey-passport'],
  ['clinic:progress', 'journey-passport'],
  ['clinic:passport', 'journey-passport'],
  ['patient:shortlist', 'matching-concierge'],
  ['concierge:cases', 'matching-concierge'],
  ['concierge:matching', 'matching-concierge'],
  ['concierge:scheduling', 'matching-concierge'],
  ['concierge:aftercare', 'matching-concierge'],
  ['concierge:incidents', 'matching-concierge'],
  ['concierge:tasks', 'matching-concierge'],
  ['patient:newCase', 'specialized'],
  ['patient:case', 'specialized'],
  ['patient:records', 'specialized'],
  ['patient:plans', 'specialized'],
  ['patient:aftercare', 'specialized'],
  ['patient:caregivers', 'specialized'],
  ['clinic:planBuilder', 'specialized'],
]);

const clinicOperationsPages = new Set([
  'onboarding',
  'verification',
  'profile',
  'dentists',
  'team',
  'availability',
  'pricing',
  'analytics',
  'settings',
]);

export function selectPortalWorkspace(area: PortalArea, pageKey: string): PortalWorkspaceKind {
  if (area === 'verification') return 'verification';
  const selected = exact.get(`${area}:${pageKey}`);
  if (selected) return selected;
  if (area === 'clinic' && clinicOperationsPages.has(pageKey)) return 'clinic-operations';
  return 'generic';
}
