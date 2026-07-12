export const caregiverPermissions = [
  'VIEW_CASE_SUMMARY',
  'VIEW_APPOINTMENTS',
  'VIEW_TREATMENT_PLANS',
  'VIEW_FINANCIAL_INFORMATION',
  'VIEW_DOCUMENTS',
  'UPLOAD_DOCUMENTS',
  'PARTICIPATE_IN_MESSAGES',
  'APPROVE_NON_CLINICAL_ARRANGEMENTS',
  'RECEIVE_NOTIFICATIONS',
] as const;

export type CaregiverPermission = (typeof caregiverPermissions)[number];
