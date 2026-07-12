import { z } from 'zod';

import { notificationCategorySchema } from './notifications.js';

export const adminDirectoryQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().min(2).max(120).optional(),
  status: z.string().trim().min(1).max(80).optional(),
});

const accountStatusSchema = z.enum([
  'PENDING_VERIFICATION',
  'ACTIVE',
  'LOCKED',
  'SUSPENDED',
  'DELETION_REQUESTED',
  'DELETED',
]);
const verificationStatusSchema = z.enum([
  'NOT_SUBMITTED',
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'SITE_AUDIT_REQUIRED',
  'APPROVED',
  'VERIFIED',
  'VERIFICATION_EXPIRING',
  'EXPIRED',
  'SUSPENDED',
  'REJECTED',
]);

export const adminUserDirectoryQuerySchema = adminDirectoryQuerySchema.extend({
  status: accountStatusSchema.optional(),
});
export const adminOrganizationDirectoryQuerySchema = adminDirectoryQuerySchema.extend({
  status: z.enum(['ACTIVE', 'DELETED']).optional(),
});
export const adminClinicDirectoryQuerySchema = adminDirectoryQuerySchema.extend({
  status: verificationStatusSchema.optional(),
});
export const adminDentistDirectoryQuerySchema = adminClinicDirectoryQuerySchema;
export const adminCaseDirectoryQuerySchema = adminDirectoryQuerySchema.extend({
  status: z
    .enum([
      'DRAFT',
      'RECORDS_PENDING',
      'INTAKE_REVIEW',
      'ADDITIONAL_INFORMATION_REQUESTED',
      'MATCHING_IN_PROGRESS',
      'CLINICS_SHORTLISTED',
      'TREATMENT_PLANS_PENDING',
      'TREATMENT_PLANS_READY',
      'CONSULTATION_SCHEDULED',
      'CONSULTATION_COMPLETED',
      'PATIENT_DECISION_PENDING',
      'BOOKING_PENDING',
      'BOOKED',
      'IN_TREATMENT',
      'TREATMENT_COMPLETED',
      'AFTERCARE_ACTIVE',
      'WARRANTY_CASE_ACTIVE',
      'CLOSED',
      'CANCELLED',
    ])
    .optional(),
});
export const adminPaymentDirectoryQuerySchema = adminDirectoryQuerySchema.extend({
  status: z
    .enum([
      'REQUIRES_PAYMENT_METHOD',
      'REQUIRES_ACTION',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ])
    .optional(),
});

export const adminUserViewSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  accountStatus: accountStatusSchema,
  emailVerified: z.boolean(),
  roles: z.array(z.string()),
  mfaEnabled: z.boolean(),
  activeSessionCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
});

export const adminOrganizationViewSchema = z.object({
  id: z.uuid(),
  type: z.enum(['CLINIC', 'CONCIERGE', 'PLATFORM']),
  name: z.string(),
  slug: z.string(),
  active: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
});

export const adminClinicViewSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  slug: z.string(),
  verificationStatus: z.string(),
  activeLocationCount: z.number().int().nonnegative(),
  activeDentistCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
});

export const adminDentistViewSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  slug: z.string(),
  licenseStatus: z.string(),
  activeClinicCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
});

export const adminCaseViewSchema = z.object({
  id: z.uuid(),
  caseNumber: z.string(),
  status: z.string(),
  preferredLocation: z.string().nullable(),
  activeAssignmentCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const adminPaymentViewSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  provider: z.string(),
  status: z.string(),
  amountMinor: z.string().regex(/^\d+$/u),
  currency: z.enum(['VND', 'USD']),
  refundCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
});

export const adminRoleViewSchema = z.object({
  code: z.string(),
  displayName: z.string(),
  privileged: z.boolean(),
  permissions: z.array(z.string()),
  userCount: z.number().int().nonnegative(),
  membershipCount: z.number().int().nonnegative(),
});

export const adminAccountStatusCommandSchema = z.object({
  toStatus: z.enum(['ACTIVE', 'LOCKED', 'SUSPENDED']),
  expectedStatus: accountStatusSchema,
  reason: z.string().trim().min(12).max(1_000),
  confirmation: z.literal('CHANGE ACCOUNT STATUS'),
});

export const adminUserRoleCommandSchema = z.object({
  role: z.enum([
    'PATIENT',
    'CAREGIVER',
    'VERIFICATION_OFFICER',
    'SUPPORT_AGENT',
    'FINANCE_ADMIN',
    'CONTENT_ADMIN',
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
  ]),
  action: z.enum(['GRANT', 'REVOKE']),
  expectedRolePresent: z.boolean(),
  reason: z.string().trim().min(12).max(1_000),
  confirmation: z.literal('CHANGE USER ROLE'),
});

export const notificationTemplateCategorySchema = notificationCategorySchema;

export type AdminDirectoryQuery = z.infer<typeof adminDirectoryQuerySchema>;
export type AdminUserDirectoryQuery = z.infer<typeof adminUserDirectoryQuerySchema>;
export type AdminOrganizationDirectoryQuery = z.infer<typeof adminOrganizationDirectoryQuerySchema>;
export type AdminClinicDirectoryQuery = z.infer<typeof adminClinicDirectoryQuerySchema>;
export type AdminDentistDirectoryQuery = z.infer<typeof adminDentistDirectoryQuerySchema>;
export type AdminCaseDirectoryQuery = z.infer<typeof adminCaseDirectoryQuerySchema>;
export type AdminPaymentDirectoryQuery = z.infer<typeof adminPaymentDirectoryQuerySchema>;
export type AdminUserView = z.infer<typeof adminUserViewSchema>;
export type AdminOrganizationView = z.infer<typeof adminOrganizationViewSchema>;
export type AdminClinicView = z.infer<typeof adminClinicViewSchema>;
export type AdminDentistView = z.infer<typeof adminDentistViewSchema>;
export type AdminCaseView = z.infer<typeof adminCaseViewSchema>;
export type AdminPaymentView = z.infer<typeof adminPaymentViewSchema>;
export type AdminRoleView = z.infer<typeof adminRoleViewSchema>;
export type AdminAccountStatusCommand = z.infer<typeof adminAccountStatusCommandSchema>;
export type AdminUserRoleCommand = z.infer<typeof adminUserRoleCommandSchema>;
