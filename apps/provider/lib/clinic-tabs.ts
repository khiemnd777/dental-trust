export const clinicWorkspaceTabs = [
  'overview',
  'team',
  'services',
  'availability',
  'analytics',
  'billing',
  'security',
] as const;

export type ClinicWorkspaceTab = (typeof clinicWorkspaceTabs)[number];

export function resolveClinicWorkspaceTab(value: string | undefined): ClinicWorkspaceTab {
  // Keep the common legacy typo working while canonical links use `security`.
  const normalized = value === 'securty' ? 'security' : value;
  return clinicWorkspaceTabs.includes(normalized as ClinicWorkspaceTab)
    ? (normalized as ClinicWorkspaceTab)
    : 'overview';
}
