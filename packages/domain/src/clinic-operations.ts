export const clinicOperationPermissions = [
  'CASE_INBOX',
  'CASE_ASSIGN_DENTIST',
  'TREATMENT_PLAN',
  'SCHEDULING',
  'CLINICAL_RECORDS',
  'AFTERCARE',
  'INCIDENT_RESPONSE',
  'REVIEW_RESPONSE',
  'ANALYTICS_READ',
] as const;

export type ClinicOperationPermission = (typeof clinicOperationPermissions)[number];

export const defaultClinicOperationPermissions = {
  DENTIST: [
    'CASE_INBOX',
    'TREATMENT_PLAN',
    'SCHEDULING',
    'CLINICAL_RECORDS',
    'AFTERCARE',
    'INCIDENT_RESPONSE',
  ],
  CLINIC_STAFF: [
    'CASE_INBOX',
    'SCHEDULING',
    'CLINICAL_RECORDS',
    'AFTERCARE',
    'INCIDENT_RESPONSE',
    'REVIEW_RESPONSE',
  ],
  CLINIC_ADMIN: clinicOperationPermissions,
} as const satisfies Readonly<
  Record<'DENTIST' | 'CLINIC_STAFF' | 'CLINIC_ADMIN', readonly ClinicOperationPermission[]>
>;

export function clinicPermissionAllowedForRole(
  role: keyof typeof defaultClinicOperationPermissions,
  permission: ClinicOperationPermission,
): boolean {
  return (defaultClinicOperationPermissions[role] as readonly ClinicOperationPermission[]).includes(
    permission,
  );
}
