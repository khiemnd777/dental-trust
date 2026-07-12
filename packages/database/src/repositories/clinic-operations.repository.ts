import { Prisma, type PrismaClient, type SystemRole } from '@prisma/client';

import type { ClinicOperationPermission } from '@dental-trust/domain';
import { defaultClinicOperationPermissions } from '@dental-trust/domain';

import { IdempotencyConflictError, OptimisticConcurrencyError } from './case.repository.js';

const commandLifetimeMs = 24 * 60 * 60_000;
const clinicRoles = ['DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN'] as const;

export interface ClinicOperationsActor {
  readonly userId: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly organizationId?: string;
  readonly impersonatorUserId?: string;
}

export interface ClinicOperationsCommand {
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface ClinicOperatorScope {
  readonly clinicId: string;
  readonly organizationId: string;
  readonly role: (typeof clinicRoles)[number];
  readonly permissions: readonly ClinicOperationPermission[];
  readonly locationIds: readonly string[];
  readonly dentistId?: string;
}

export class ClinicOperationsRepository {
  constructor(private readonly db: PrismaClient) {}

  async loadOperator(userId: string, organizationId: string): Promise<ClinicOperatorScope | null> {
    const membership = await this.db.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
        role: { code: { in: [...clinicRoles] } },
        organization: { deletedAt: null, clinic: { deletedAt: null } },
      },
      select: {
        role: { select: { code: true } },
        organization: { select: { clinic: { select: { id: true } } } },
        clinicStaff: {
          select: {
            id: true,
            active: true,
            permissions: true,
            permissionsConfiguredAt: true,
          },
        },
      },
    });
    const clinicId = membership?.organization.clinic?.id;
    const role = membership?.role.code;
    if (!clinicId || !role || !isClinicRole(role)) return null;

    const [locationRows, dentist] = await Promise.all([
      membership.clinicStaff
        ? this.db.clinicStaffLocation.findMany({
            where: { clinicStaffId: membership.clinicStaff.id },
            select: { locationId: true },
          })
        : Promise.resolve([]),
      role === 'DENTIST'
        ? this.db.dentist.findFirst({
            where: {
              userId,
              affiliations: {
                some: { clinicId, active: true, endedAt: null },
              },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (role !== 'DENTIST' && (!membership.clinicStaff || !membership.clinicStaff.active)) {
      return null;
    }
    if (role === 'DENTIST' && !dentist) return null;
    const permissions =
      role === 'CLINIC_ADMIN' || !membership.clinicStaff?.permissionsConfiguredAt
        ? defaultClinicOperationPermissions[role]
        : membership.clinicStaff.permissions.filter(isClinicPermission);
    return {
      clinicId,
      organizationId,
      role,
      permissions,
      locationIds: locationRows.map(({ locationId }) => locationId),
      ...(dentist ? { dentistId: dentist.id } : {}),
    };
  }

  async createOrganization(
    input: {
      readonly name: string;
      readonly slug: string;
      readonly legalEntityName: string;
      readonly registrationNumber: string;
      readonly registrationCountry: string;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    const organizationId = await this.idempotentResource(actor, command, async (transaction) => {
      const role = await transaction.roleDefinition.findUnique({
        where: { code: 'CLINIC_ADMIN' },
        select: { id: true },
      });
      if (!role) throw new Error('CLINIC_ADMIN role definition is missing.');
      const organization = await transaction.organization.create({
        data: { type: 'CLINIC', name: input.name, slug: input.slug },
      });
      const clinic = await transaction.clinic.create({
        data: {
          organizationId: organization.id,
          name: input.name,
          slug: input.slug,
          legalEntityName: input.legalEntityName,
        },
      });
      await transaction.clinicOnboardingProfile.create({
        data: {
          clinicId: clinic.id,
          registrationNumber: input.registrationNumber,
          registrationCountry: input.registrationCountry,
        },
      });
      const membership = await transaction.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: actor.userId,
          roleId: role.id,
          status: 'ACTIVE',
          acceptedAt: new Date(),
        },
      });
      await transaction.clinicStaff.create({
        data: {
          clinicId: clinic.id,
          userId: actor.userId,
          membershipId: membership.id,
          jobTitle: 'Clinic administrator',
        },
      });
      await transaction.clinicSchedulingPolicy.create({ data: { clinicId: clinic.id } });
      await this.recordEffects(
        transaction,
        { ...actor, organizationId: organization.id },
        command,
        {
          action: 'clinic.organization-created',
          resourceType: 'Organization',
          resourceId: organization.id,
          aggregateType: 'Clinic',
          aggregateId: clinic.id,
          eventType: 'clinic.organization-created',
          payload: { organizationId: organization.id, clinicId: clinic.id },
        },
      );
      return organization.id;
    });
    return this.db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, clinic: { select: { id: true } } },
    });
  }

  async onboarding(clinicId: string) {
    const [
      clinic,
      profile,
      locations,
      declarations,
      documents,
      dentistCount,
      staffCount,
      serviceCount,
      warrantyCount,
    ] = await Promise.all([
      this.db.clinic.findUnique({
        where: { id: clinicId },
        select: {
          id: true,
          organizationId: true,
          name: true,
          slug: true,
          legalEntityName: true,
          verificationStatus: true,
        },
      }),
      this.db.clinicOnboardingProfile.findUnique({ where: { clinicId } }),
      this.db.clinicLocation.findMany({
        where: { clinicId },
        take: 100,
        orderBy: [{ active: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.clinicDeclaration.findMany({
        where: { clinicId },
        take: 100,
        orderBy: [{ kind: 'asc' }, { code: 'asc' }],
      }),
      this.db.clinicOnboardingDocument.findMany({
        where: { clinicId },
        take: 100,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.dentistClinicAffiliation.count({
        where: { clinicId, active: true, endedAt: null },
      }),
      this.db.clinicStaff.count({ where: { clinicId, active: true, removedAt: null } }),
      this.db.clinicService.count({ where: { clinicId, active: true } }),
      this.db.warrantyPolicy.count({ where: { clinicId, archivedAt: null } }),
    ]);
    if (!clinic || !profile) return null;
    const assets = documents.length
      ? await this.db.fileAsset.findMany({
          where: { id: { in: documents.map(({ fileAssetId }) => fileAssetId) } },
          select: { id: true, status: true, scanStatus: true },
        })
      : [];
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    return {
      clinic,
      profile,
      locations,
      declarations,
      documents: documents.map((document) => ({
        ...document,
        status: assetById.get(document.fileAssetId)?.status ?? 'DELETED',
        scanStatus: assetById.get(document.fileAssetId)?.scanStatus ?? 'ERROR',
      })),
      dentistCount,
      staffCount,
      serviceCount,
      warrantyCount,
    };
  }

  async updateProfile(
    clinicId: string,
    input: {
      readonly expectedVersion: number;
      readonly legalEntityName: string;
      readonly registrationNumber: string;
      readonly registrationCountry: string;
      readonly encryptedBusinessContact: string;
      readonly responsibleClinicalLeaderDentistId: string;
      readonly aftercarePolicy: Prisma.InputJsonValue;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    await this.idempotentResource(actor, command, async (transaction) => {
      await this.requireAffiliatedDentist(
        transaction,
        clinicId,
        input.responsibleClinicalLeaderDentistId,
      );
      const updated = await transaction.clinicOnboardingProfile.updateMany({
        where: { clinicId, version: input.expectedVersion },
        data: {
          registrationNumber: input.registrationNumber,
          registrationCountry: input.registrationCountry,
          encryptedBusinessContact: input.encryptedBusinessContact,
          responsibleClinicalLeaderDentistId: input.responsibleClinicalLeaderDentistId,
          aftercarePolicy: input.aftercarePolicy,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new OptimisticConcurrencyError();
      await transaction.clinic.update({
        where: { id: clinicId },
        data: { legalEntityName: input.legalEntityName },
      });
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.onboarding-profile-updated',
        resourceType: 'Clinic',
        resourceId: clinicId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.onboarding-updated',
        payload: { clinicId, section: 'PROFILE', version: input.expectedVersion + 1 },
      });
      return clinicId;
    });
  }

  async upsertLocation(
    clinicId: string,
    input: {
      readonly locationId?: string;
      readonly name: string;
      readonly address: string;
      readonly city: string;
      readonly district?: string;
      readonly timezone: string;
      readonly encryptedBusinessContact: string;
      readonly active: boolean;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      let locationId = input.locationId;
      if (locationId) {
        const updated = await transaction.clinicLocation.updateMany({
          where: { id: locationId, clinicId },
          data: {
            name: input.name,
            address: input.address,
            city: input.city,
            district: input.district ?? null,
            timezone: input.timezone,
            encryptedBusinessContact: input.encryptedBusinessContact,
            active: input.active,
          },
        });
        if (updated.count !== 1) throw new OptimisticConcurrencyError();
      } else {
        const created = await transaction.clinicLocation.create({
          data: {
            clinicId,
            name: input.name,
            address: input.address,
            city: input.city,
            ...(input.district ? { district: input.district } : {}),
            timezone: input.timezone,
            encryptedBusinessContact: input.encryptedBusinessContact,
            active: input.active,
          },
        });
        locationId = created.id;
      }
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.location-upserted',
        resourceType: 'ClinicLocation',
        resourceId: locationId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.location-upserted',
        payload: { clinicId, locationId, active: input.active },
      });
      return locationId;
    });
  }

  async upsertDeclaration(
    clinicId: string,
    input: {
      readonly declarationId?: string;
      readonly kind: 'EQUIPMENT' | 'SERVICE_CAPABILITY' | 'WARRANTY' | 'AFTERCARE';
      readonly code: string;
      readonly name: string;
      readonly details: Prisma.InputJsonValue;
      readonly active: boolean;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const current = input.declarationId
        ? await transaction.clinicDeclaration.findFirst({
            where: { id: input.declarationId, clinicId },
            select: { id: true },
          })
        : null;
      const declaration = current
        ? await transaction.clinicDeclaration.update({
            where: { id: current.id },
            data: {
              kind: input.kind,
              code: input.code,
              name: input.name,
              details: input.details,
              active: input.active,
            },
          })
        : await transaction.clinicDeclaration.upsert({
            where: { clinicId_kind_code: { clinicId, kind: input.kind, code: input.code } },
            update: { name: input.name, details: input.details, active: input.active },
            create: {
              clinicId,
              kind: input.kind,
              code: input.code,
              name: input.name,
              details: input.details,
              active: input.active,
            },
          });
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.declaration-upserted',
        resourceType: 'ClinicDeclaration',
        resourceId: declaration.id,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.declaration-upserted',
        payload: { clinicId, declarationId: declaration.id, kind: declaration.kind },
      });
      return declaration.id;
    });
  }

  async addOnboardingDocument(
    clinicId: string,
    input: {
      readonly kind:
        'OPERATING_LICENSE' | 'PROFESSIONAL_LICENSE' | 'INSURANCE' | 'EQUIPMENT_CERTIFICATE';
      readonly fileAssetId: string;
      readonly professionalLicenseId?: string;
      readonly label: string;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const clinicFile = await transaction.clinicFileAsset.findFirst({
        where: {
          clinicId,
          fileAssetId: input.fileAssetId,
        },
      });
      const file = await transaction.fileAsset.findFirst({
        where: { id: input.fileAssetId, status: 'AVAILABLE', scanStatus: 'CLEAN' },
        select: { id: true },
      });
      if (!clinicFile || !file) throw new OptimisticConcurrencyError();
      const document = await transaction.clinicOnboardingDocument.upsert({
        where: {
          clinicId_kind_fileAssetId: {
            clinicId,
            kind: input.kind,
            fileAssetId: input.fileAssetId,
          },
        },
        update: {
          label: input.label,
          ...(input.professionalLicenseId
            ? { professionalLicenseId: input.professionalLicenseId }
            : {}),
        },
        create: {
          clinicId,
          kind: input.kind,
          fileAssetId: input.fileAssetId,
          ...(input.professionalLicenseId
            ? { professionalLicenseId: input.professionalLicenseId }
            : {}),
          label: input.label,
          createdByUserId: actor.userId,
        },
      });
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.onboarding-document-added',
        resourceType: 'ClinicOnboardingDocument',
        resourceId: document.id,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.onboarding-document-added',
        payload: {
          clinicId,
          documentId: document.id,
          fileAssetId: input.fileAssetId,
          kind: input.kind,
        },
      });
      return document.id;
    });
  }

  async acceptTerms(
    clinicId: string,
    input: { readonly expectedVersion: number; readonly termsVersion: string },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    await this.idempotentResource(actor, command, async (transaction) => {
      const updated = await transaction.clinicOnboardingProfile.updateMany({
        where: { clinicId, version: input.expectedVersion },
        data: {
          termsVersion: input.termsVersion,
          termsAcceptedByUserId: actor.userId,
          termsAcceptedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.terms-accepted',
        resourceType: 'Clinic',
        resourceId: clinicId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.terms-accepted',
        payload: { clinicId, termsVersion: input.termsVersion, version: input.expectedVersion + 1 },
      });
      return clinicId;
    });
  }

  async savePayoutAccount(
    clinicId: string,
    input: {
      readonly expectedVersion: number;
      readonly provider: string;
      readonly encryptedAccountId: string;
      readonly status: 'INCOMPLETE' | 'PENDING_REVIEW' | 'ACTIVE' | 'RESTRICTED';
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    await this.idempotentResource(actor, command, async (transaction) => {
      const updated = await transaction.clinicOnboardingProfile.updateMany({
        where: { clinicId, version: input.expectedVersion },
        data: {
          payoutProvider: input.provider,
          encryptedPayoutAccountId: input.encryptedAccountId,
          payoutStatus: input.status,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.payout-onboarding-updated',
        resourceType: 'Clinic',
        resourceId: clinicId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.payout-onboarding-updated',
        payload: { clinicId, status: input.status, version: input.expectedVersion + 1 },
      });
      return clinicId;
    });
  }

  async linkVerificationCase(
    clinicId: string,
    expectedVersion: number,
    verificationCaseId: string,
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    await this.idempotentResource(actor, command, async (transaction) => {
      const updated = await transaction.clinicOnboardingProfile.updateMany({
        where: { clinicId, version: expectedVersion },
        data: {
          verificationCaseId,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.verification-submitted',
        resourceType: 'VerificationCase',
        resourceId: verificationCaseId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.verification-submitted',
        payload: { clinicId, verificationCaseId },
      });
      return verificationCaseId;
    });
  }

  async listDentists(clinicId: string) {
    return this.db.dentistClinicAffiliation.findMany({
      where: { clinicId },
      take: 100,
      orderBy: [{ active: 'desc' }, { startedAt: 'asc' }, { id: 'asc' }],
      include: { dentist: true },
    });
  }

  async addDentist(
    clinicId: string,
    input:
      | { readonly dentistId: string }
      | {
          readonly fullName: string;
          readonly slug: string;
          readonly licenseNumber: string;
          readonly authority: string;
          readonly scopeOfPractice?: string;
          readonly issuedAt?: Date;
          readonly expiresAt?: Date;
        },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      let dentistId: string;
      if ('dentistId' in input) {
        const dentist = await transaction.dentist.findUnique({
          where: { id: input.dentistId },
          select: { id: true },
        });
        if (!dentist) throw new OptimisticConcurrencyError();
        dentistId = dentist.id;
      } else {
        const dentist = await transaction.dentist.create({
          data: {
            fullName: input.fullName,
            slug: input.slug,
            licenseNumber: input.licenseNumber,
          },
        });
        dentistId = dentist.id;
        await transaction.professionalLicense.create({
          data: {
            dentistId,
            authority: input.authority,
            licenseNumber: input.licenseNumber,
            ...(input.scopeOfPractice ? { scopeOfPractice: input.scopeOfPractice } : {}),
            ...(input.issuedAt ? { issuedAt: input.issuedAt } : {}),
            ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          },
        });
      }
      const existing = await transaction.dentistClinicAffiliation.findFirst({
        where: { clinicId, dentistId },
        select: { id: true },
      });
      const affiliation = existing
        ? await transaction.dentistClinicAffiliation.update({
            where: { id: existing.id },
            data: { active: true, endedAt: null },
          })
        : await transaction.dentistClinicAffiliation.create({
            data: { clinicId, dentistId, active: true, startedAt: new Date() },
          });
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.dentist-affiliated',
        resourceType: 'DentistClinicAffiliation',
        resourceId: affiliation.id,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.dentist-affiliated',
        payload: { clinicId, dentistId, affiliationId: affiliation.id },
      });
      return affiliation.id;
    });
  }

  async updateDentist(
    clinicId: string,
    dentistId: string,
    active: boolean,
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const affiliation = await transaction.dentistClinicAffiliation.findFirst({
        where: { clinicId, dentistId },
      });
      if (!affiliation) throw new OptimisticConcurrencyError();
      await transaction.dentistClinicAffiliation.update({
        where: { id: affiliation.id },
        data: { active, endedAt: active ? null : new Date() },
      });
      await this.recordEffects(transaction, actor, command, {
        action: active ? 'clinic.dentist-reactivated' : 'clinic.dentist-suspended',
        resourceType: 'DentistClinicAffiliation',
        resourceId: affiliation.id,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.dentist-affiliation-updated',
        payload: { clinicId, dentistId, active },
      });
      return affiliation.id;
    });
  }

  async listTeam(clinicId: string, organizationId: string) {
    const memberships = await this.db.organizationMembership.findMany({
      where: {
        organizationId,
        role: { code: { in: [...clinicRoles] } },
      },
      take: 100,
      orderBy: [{ status: 'asc' }, { invitedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        userId: true,
        status: true,
        acceptedAt: true,
        role: { select: { code: true } },
        user: {
          select: {
            email: true,
            mfaConfigurations: {
              where: { enabledAt: { not: null }, revokedAt: null },
              select: { id: true },
            },
          },
        },
        clinicStaff: {
          select: {
            id: true,
            clinicId: true,
            jobTitle: true,
            permissions: true,
            permissionsConfiguredAt: true,
            version: true,
          },
        },
      },
    });
    const staffIds = memberships.flatMap(({ clinicStaff }) =>
      clinicStaff?.clinicId === clinicId ? [clinicStaff.id] : [],
    );
    const locations = staffIds.length
      ? await this.db.clinicStaffLocation.findMany({
          where: { clinicStaffId: { in: staffIds } },
          select: { clinicStaffId: true, locationId: true },
        })
      : [];
    const locationsByStaff = new Map<string, string[]>();
    for (const { clinicStaffId, locationId } of locations) {
      locationsByStaff.set(clinicStaffId, [
        ...(locationsByStaff.get(clinicStaffId) ?? []),
        locationId,
      ]);
    }
    return memberships.flatMap((membership) => {
      const role = membership.role.code;
      if (!isClinicRole(role)) return [];
      const staff = membership.clinicStaff;
      if (staff && staff.clinicId !== clinicId) return [];
      return [
        {
          membershipId: membership.id,
          userId: membership.userId,
          email: membership.user.email,
          role,
          status: membership.status,
          jobTitle: staff?.jobTitle ?? null,
          locationIds: staff ? (locationsByStaff.get(staff.id) ?? []) : [],
          permissions:
            role === 'CLINIC_ADMIN' || !staff?.permissionsConfiguredAt
              ? defaultClinicOperationPermissions[role]
              : staff.permissions.filter(isClinicPermission),
          mfaEnabled: membership.user.mfaConfigurations.length > 0,
          version: staff?.version ?? 1,
          acceptedAt: membership.acceptedAt,
        },
      ];
    });
  }

  async listPendingInvitations(clinicId: string) {
    return this.db.clinicTeamInvitation.findMany({
      where: { clinicId, status: 'PENDING', expiresAt: { gt: new Date() } },
      take: 100,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        encryptedEmail: true,
        role: true,
        permissions: true,
        jobTitle: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async inviteTeamMember(
    clinicId: string,
    organizationId: string,
    input: {
      readonly id: string;
      readonly encryptedEmail: string;
      readonly emailHash: string;
      readonly role: ClinicOperatorScope['role'];
      readonly permissions: readonly string[];
      readonly jobTitle?: string;
      readonly locationIds: readonly string[];
      readonly tokenHash: string;
      readonly encryptedToken: string;
      readonly expiresAt: Date;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    const invitationId = await this.idempotentResource(actor, command, async (transaction) => {
      await this.requireLocations(transaction, clinicId, input.locationIds);
      const existing = await transaction.clinicTeamInvitation.findFirst({
        where: {
          organizationId,
          emailHash: input.emailHash,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (existing) throw new IdempotencyConflictError('An active invitation already exists.');
      const invitation = await transaction.clinicTeamInvitation.create({
        data: {
          id: input.id,
          clinicId,
          organizationId,
          encryptedEmail: input.encryptedEmail,
          emailHash: input.emailHash,
          role: input.role,
          permissions: [...input.permissions],
          ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
          tokenHash: input.tokenHash,
          invitedByUserId: actor.userId,
          expiresAt: input.expiresAt,
        },
      });
      if (input.locationIds.length) {
        await transaction.clinicTeamInvitationLocation.createMany({
          data: input.locationIds.map((locationId) => ({
            invitationId: invitation.id,
            locationId,
          })),
        });
      }
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.team-invited',
        resourceType: 'ClinicTeamInvitation',
        resourceId: invitation.id,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.team-invited',
        payload: {
          clinicId,
          invitationId: invitation.id,
          encryptedToken: input.encryptedToken,
          expiresAt: input.expiresAt.toISOString(),
        },
      });
      return invitation.id;
    });
    return this.db.clinicTeamInvitation.findUniqueOrThrow({ where: { id: invitationId } });
  }

  async acceptTeamInvitation(
    tokenHash: string,
    userId: string,
    emailHash: string,
    actor: ClinicOperationsActor,
  ) {
    return this.db.$transaction(
      async (transaction) => {
        const invitation = await transaction.clinicTeamInvitation.findFirst({
          where: { tokenHash, emailHash, status: 'PENDING', expiresAt: { gt: new Date() } },
        });
        if (!invitation) return null;
        const role = await transaction.roleDefinition.findUnique({
          where: { code: invitation.role },
          select: { id: true },
        });
        if (!role || !isClinicRole(invitation.role)) return null;
        const membership = await transaction.organizationMembership.upsert({
          where: {
            organizationId_userId_roleId: {
              organizationId: invitation.organizationId,
              userId,
              roleId: role.id,
            },
          },
          update: { status: 'ACTIVE', acceptedAt: new Date(), suspendedAt: null, removedAt: null },
          create: {
            organizationId: invitation.organizationId,
            userId,
            roleId: role.id,
            status: 'ACTIVE',
            acceptedAt: new Date(),
          },
        });
        const staff = await transaction.clinicStaff.upsert({
          where: { clinicId_userId: { clinicId: invitation.clinicId, userId } },
          update: {
            membershipId: membership.id,
            active: true,
            permissions: invitation.permissions,
            permissionsConfiguredAt: new Date(),
            jobTitle: invitation.jobTitle,
            suspendedAt: null,
            removedAt: null,
            version: { increment: 1 },
          },
          create: {
            clinicId: invitation.clinicId,
            userId,
            membershipId: membership.id,
            jobTitle: invitation.jobTitle,
            active: true,
            permissions: invitation.permissions,
            permissionsConfiguredAt: new Date(),
          },
        });
        const locations = await transaction.clinicTeamInvitationLocation.findMany({
          where: { invitationId: invitation.id },
          select: { locationId: true },
        });
        await transaction.clinicStaffLocation.deleteMany({ where: { clinicStaffId: staff.id } });
        if (locations.length) {
          await transaction.clinicStaffLocation.createMany({
            data: locations.map(({ locationId }) => ({ clinicStaffId: staff.id, locationId })),
          });
        }
        await transaction.clinicTeamInvitation.update({
          where: { id: invitation.id },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: userId,
            organizationId: invitation.organizationId,
            action: 'clinic.team-invitation-accepted',
            resourceType: 'OrganizationMembership',
            resourceId: membership.id,
            requestId: actor.requestId,
            success: true,
            afterMetadata: {
              clinicId: invitation.clinicId,
              membershipId: membership.id,
              role: invitation.role,
            },
          },
        });
        return { organizationId: invitation.organizationId, clinicId: invitation.clinicId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateTeamAccess(
    clinicId: string,
    organizationId: string,
    membershipId: string,
    input: {
      readonly expectedVersion: number;
      readonly role: ClinicOperatorScope['role'];
      readonly permissions: readonly string[];
      readonly jobTitle?: string | null;
      readonly locationIds: readonly string[];
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const current = await transaction.organizationMembership.findFirst({
        where: { id: membershipId, organizationId, status: { not: 'REMOVED' } },
        include: { clinicStaff: true },
      });
      if (!current?.clinicStaff || current.clinicStaff.clinicId !== clinicId) {
        throw new OptimisticConcurrencyError();
      }
      if (current.userId === actor.userId) {
        throw new IdempotencyConflictError('Administrators cannot change their own access.');
      }
      if (current.clinicStaff.version !== input.expectedVersion) {
        throw new OptimisticConcurrencyError();
      }
      const clinicStaffId = current.clinicStaff.id;
      await this.requireLocations(transaction, clinicId, input.locationIds);
      const role = await transaction.roleDefinition.findUnique({
        where: { code: input.role },
        select: { id: true },
      });
      if (!role) throw new OptimisticConcurrencyError();
      await transaction.organizationMembership.update({
        where: { id: membershipId },
        data: { roleId: role.id },
      });
      await transaction.clinicStaff.update({
        where: { id: clinicStaffId },
        data: {
          permissions: [...input.permissions],
          permissionsConfiguredAt: new Date(),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
          version: { increment: 1 },
        },
      });
      await transaction.clinicStaffLocation.deleteMany({
        where: { clinicStaffId },
      });
      if (input.locationIds.length) {
        await transaction.clinicStaffLocation.createMany({
          data: input.locationIds.map((locationId) => ({
            clinicStaffId,
            locationId,
          })),
        });
      }
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.team-access-updated',
        resourceType: 'OrganizationMembership',
        resourceId: membershipId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.team-access-updated',
        payload: {
          clinicId,
          membershipId,
          role: input.role,
          permissionCount: input.permissions.length,
          locationCount: input.locationIds.length,
          version: input.expectedVersion + 1,
        },
      });
      return membershipId;
    });
  }

  async changeTeamStatus(
    clinicId: string,
    organizationId: string,
    membershipId: string,
    expectedVersion: number,
    status: 'SUSPENDED' | 'REMOVED',
    reason: string,
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const current = await transaction.organizationMembership.findFirst({
        where: { id: membershipId, organizationId, status: 'ACTIVE' },
        include: { clinicStaff: true },
      });
      if (
        !current?.clinicStaff ||
        current.clinicStaff.clinicId !== clinicId ||
        current.clinicStaff.version !== expectedVersion ||
        current.userId === actor.userId
      ) {
        throw new OptimisticConcurrencyError();
      }
      const changedAt = new Date();
      await transaction.organizationMembership.update({
        where: { id: membershipId },
        data: {
          status,
          ...(status === 'SUSPENDED'
            ? { suspendedAt: changedAt }
            : { removedAt: changedAt, suspendedAt: null }),
        },
      });
      await transaction.clinicStaff.update({
        where: { id: current.clinicStaff.id },
        data: {
          active: false,
          ...(status === 'SUSPENDED'
            ? { suspendedAt: changedAt }
            : { removedAt: changedAt, suspendedAt: null }),
          version: { increment: 1 },
        },
      });
      await this.recordEffects(transaction, actor, command, {
        action: status === 'SUSPENDED' ? 'clinic.team-suspended' : 'clinic.team-removed',
        resourceType: 'OrganizationMembership',
        resourceId: membershipId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.team-status-updated',
        payload: { clinicId, membershipId, status, version: expectedVersion + 1 },
        reason,
      });
      return membershipId;
    });
  }

  async activity(
    organizationId: string,
    input: { readonly cursor?: string; readonly limit: number; readonly action?: string },
  ) {
    const rows = await this.db.auditLog.findMany({
      where: {
        organizationId,
        ...(input.action ? { action: input.action } : {}),
      },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        actorUserId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        success: true,
        createdAt: true,
      },
    });
    return page(rows, input.limit, (row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async opportunities(
    clinicId: string,
    organizationId: string,
    input: { readonly cursor?: string; readonly limit: number; readonly status?: string },
  ) {
    const cursorPredicate = input.cursor
      ? Prisma.sql`AND (assignment."assigned_at", assignment."id") < (
          SELECT cursor_assignment."assigned_at", cursor_assignment."id"
          FROM "case_assignments" cursor_assignment
          WHERE cursor_assignment."id" = CAST(${input.cursor} AS uuid)
            AND cursor_assignment."organization_id" = CAST(${organizationId} AS uuid)
            AND cursor_assignment."kind" = 'CLINIC'
          LIMIT 1
        )`
      : Prisma.empty;
    const statusPredicate = input.status
      ? Prisma.sql`AND COALESCE(opportunity."status"::text, 'ASSIGNED') = ${input.status}`
      : Prisma.empty;
    const assignments = await this.db.$queryRaw<
      {
        cursor_id: string;
        case_id: string;
        case_number: string;
        status: 'ASSIGNED' | 'ACCEPTED' | 'DECLINED' | 'ADDITIONAL_RECORDS_REQUESTED';
        case_status: string;
        desired_procedure_code: string;
        preferred_location: string | null;
        expected_arrival_date: Date | null;
        expected_departure_date: Date | null;
        preferred_currency: 'VND' | 'USD';
        assigned_at: Date;
        responded_at: Date | null;
        assigned_dentist_id: string | null;
        version: number;
      }[]
    >(Prisma.sql`
      SELECT assignment."id" AS "cursor_id",
             dental_case."id" AS "case_id",
             dental_case."case_number",
             COALESCE(opportunity."status"::text, 'ASSIGNED') AS "status",
             dental_case."status"::text AS "case_status",
             dental_case."desired_procedure_code",
             dental_case."preferred_location",
             dental_case."expected_arrival_date",
             dental_case."expected_departure_date",
             dental_case."preferred_currency",
             COALESCE(opportunity."assigned_at", assignment."assigned_at") AS "assigned_at",
             opportunity."responded_at",
             assigned_dentist."dentist_id" AS "assigned_dentist_id",
             COALESCE(opportunity."version", 0) AS "version"
      FROM "case_assignments" assignment
      JOIN "dental_cases" dental_case ON dental_case."id" = assignment."case_id"
      LEFT JOIN "clinic_case_opportunities" opportunity
        ON opportunity."clinic_id" = CAST(${clinicId} AS uuid)
       AND opportunity."case_id" = assignment."case_id"
      LEFT JOIN LATERAL (
        SELECT dentist."id" AS "dentist_id"
        FROM "case_assignments" dentist_assignment
        JOIN "dentists" dentist ON dentist."user_id" = dentist_assignment."assigned_user_id"
        WHERE dentist_assignment."case_id" = assignment."case_id"
          AND dentist_assignment."kind" = 'DENTIST'
          AND dentist_assignment."ended_at" IS NULL
        ORDER BY dentist_assignment."assigned_at" DESC, dentist_assignment."id" DESC
        LIMIT 1
      ) assigned_dentist ON true
      WHERE assignment."organization_id" = CAST(${organizationId} AS uuid)
        AND assignment."kind" = 'CLINIC'
        AND assignment."ended_at" IS NULL
        ${cursorPredicate}
        ${statusPredicate}
      ORDER BY assignment."assigned_at" DESC, assignment."id" DESC
      LIMIT ${input.limit + 1}
    `);
    const selected = assignments.slice(0, input.limit);
    const records = selected.map((assignment) => ({
      caseId: assignment.case_id,
      caseNumber: assignment.case_number,
      status: assignment.status,
      caseStatus: assignment.case_status,
      desiredProcedureCode: assignment.desired_procedure_code,
      preferredLocation: assignment.preferred_location,
      expectedArrivalDate: assignment.expected_arrival_date,
      expectedDepartureDate: assignment.expected_departure_date,
      preferredCurrency: assignment.preferred_currency,
      assignedAt: assignment.assigned_at,
      respondedAt: assignment.responded_at,
      assignedDentistId: assignment.assigned_dentist_id,
      version: assignment.version,
    }));
    return {
      records,
      nextCursor: assignments.length > input.limit ? (selected.at(-1)?.cursor_id ?? null) : null,
    };
  }

  async decideOpportunity(
    clinicId: string,
    organizationId: string,
    caseId: string,
    input: {
      readonly expectedVersion: number;
      readonly status: 'ACCEPTED' | 'DECLINED' | 'ADDITIONAL_RECORDS_REQUESTED';
      readonly encryptedReason?: string;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const assignment = await transaction.caseAssignment.findFirst({
        where: { caseId, organizationId, kind: 'CLINIC', endedAt: null },
      });
      if (!assignment) throw new OptimisticConcurrencyError();
      const current = await transaction.clinicCaseOpportunity.findUnique({
        where: { clinicId_caseId: { clinicId, caseId } },
      });
      if ((current?.version ?? 0) !== input.expectedVersion) throw new OptimisticConcurrencyError();
      const state = current
        ? await transaction.clinicCaseOpportunity.update({
            where: { id: current.id },
            data: {
              status: input.status,
              encryptedDeclineReason:
                input.status === 'DECLINED' ? (input.encryptedReason ?? null) : null,
              encryptedRecordsRequest:
                input.status === 'ADDITIONAL_RECORDS_REQUESTED'
                  ? (input.encryptedReason ?? null)
                  : null,
              respondedAt: new Date(),
              respondedByUserId: actor.userId,
              version: { increment: 1 },
            },
          })
        : await transaction.clinicCaseOpportunity.create({
            data: {
              clinicId,
              caseId,
              status: input.status,
              encryptedDeclineReason:
                input.status === 'DECLINED' ? (input.encryptedReason ?? null) : null,
              encryptedRecordsRequest:
                input.status === 'ADDITIONAL_RECORDS_REQUESTED'
                  ? (input.encryptedReason ?? null)
                  : null,
              assignedAt: assignment.assignedAt,
              respondedAt: new Date(),
              respondedByUserId: actor.userId,
            },
          });
      if (input.status === 'ADDITIONAL_RECORDS_REQUESTED') {
        const dentalCase = await transaction.dentalCase.findUniqueOrThrow({
          where: { id: caseId },
        });
        if (!['CLOSED', 'CANCELLED'].includes(dentalCase.status)) {
          await transaction.dentalCase.update({
            where: { id: caseId },
            data: { status: 'ADDITIONAL_INFORMATION_REQUESTED', version: { increment: 1 } },
          });
          await transaction.caseStatusHistory.create({
            data: {
              caseId,
              fromStatus: dentalCase.status,
              toStatus: 'ADDITIONAL_INFORMATION_REQUESTED',
              actorUserId: actor.userId,
              reason: 'Assigned clinic requested additional records.',
              requestId: actor.requestId,
            },
          });
        }
      }
      if (input.status === 'DECLINED') {
        await transaction.caseAssignment.update({
          where: { id: assignment.id },
          data: { endedAt: new Date() },
        });
      }
      await this.recordEffects(transaction, actor, command, {
        action: `clinic.opportunity-${input.status.toLowerCase()}`,
        resourceType: 'ClinicCaseOpportunity',
        resourceId: state.id,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'clinic.opportunity-updated',
        payload: {
          clinicId,
          caseId,
          opportunityId: state.id,
          status: input.status,
          version: state.version,
        },
      });
      return state.id;
    });
  }

  async assignDentist(
    clinicId: string,
    organizationId: string,
    caseId: string,
    dentistId: string,
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const opportunity = await transaction.clinicCaseOpportunity.findFirst({
        where: { clinicId, caseId, status: 'ACCEPTED' },
      });
      const affiliation = await transaction.dentistClinicAffiliation.findFirst({
        where: { clinicId, dentistId, active: true, endedAt: null },
        include: { dentist: true },
      });
      const clinicAssignment = await transaction.caseAssignment.findFirst({
        where: { caseId, organizationId, kind: 'CLINIC', endedAt: null },
      });
      if (!opportunity || !affiliation?.dentist.userId || !clinicAssignment) {
        throw new OptimisticConcurrencyError();
      }
      await transaction.caseAssignment.updateMany({
        where: { caseId, kind: 'DENTIST', endedAt: null },
        data: { endedAt: new Date() },
      });
      const assignment = await transaction.caseAssignment.create({
        data: {
          caseId,
          kind: 'DENTIST',
          organizationId,
          assignedUserId: affiliation.dentist.userId,
        },
      });
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.case-dentist-assigned',
        resourceType: 'CaseAssignment',
        resourceId: assignment.id,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'clinic.case-dentist-assigned',
        payload: { clinicId, caseId, dentistId, assignmentId: assignment.id },
      });
      return assignment.id;
    });
  }

  async availability(clinicId: string) {
    const [rules, blocks, policy, connections] = await Promise.all([
      this.db.availabilityRule.findMany({
        where: { clinicId },
        take: 100,
        orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { startsAtMinute: 'asc' }],
      }),
      this.db.availabilityBlock.findMany({
        where: { clinicId, deletedAt: null, endsAt: { gte: new Date() } },
        take: 100,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.clinicSchedulingPolicy.findUnique({ where: { clinicId } }),
      this.db.clinicCalendarConnection.findMany({
        where: { clinicId },
        take: 100,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);
    return { rules, blocks, policy, connections };
  }

  async upsertAvailabilityRule(
    clinicId: string,
    input: {
      readonly ruleId?: string;
      readonly locationId: string;
      readonly dentistId?: string;
      readonly slotKind: 'CONSULTATION' | 'TREATMENT' | 'BOTH';
      readonly dayOfWeek: number;
      readonly startsAtMinute: number;
      readonly endsAtMinute: number;
      readonly timezone: string;
      readonly capacity: number;
      readonly procedureDurationMinutes: number;
      readonly effectiveFrom: Date;
      readonly effectiveUntil?: Date;
      readonly active: boolean;
      readonly expectedVersion?: number;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      await this.requireLocations(transaction, clinicId, [input.locationId]);
      if (input.dentistId)
        await this.requireAffiliatedDentist(transaction, clinicId, input.dentistId);
      let ruleId = input.ruleId;
      if (ruleId) {
        if (!input.expectedVersion) throw new OptimisticConcurrencyError();
        const changed = await transaction.availabilityRule.updateMany({
          where: { id: ruleId, clinicId, version: input.expectedVersion },
          data: {
            locationId: input.locationId,
            dentistId: input.dentistId ?? null,
            slotKind: input.slotKind,
            dayOfWeek: input.dayOfWeek,
            startsAtMinute: input.startsAtMinute,
            endsAtMinute: input.endsAtMinute,
            timezone: input.timezone,
            capacity: input.capacity,
            procedureDurationMinutes: input.procedureDurationMinutes,
            effectiveFrom: input.effectiveFrom,
            effectiveUntil: input.effectiveUntil ?? null,
            active: input.active,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
      } else {
        const rule = await transaction.availabilityRule.create({
          data: {
            clinicId,
            locationId: input.locationId,
            ...(input.dentistId ? { dentistId: input.dentistId } : {}),
            slotKind: input.slotKind,
            dayOfWeek: input.dayOfWeek,
            startsAtMinute: input.startsAtMinute,
            endsAtMinute: input.endsAtMinute,
            timezone: input.timezone,
            capacity: input.capacity,
            procedureDurationMinutes: input.procedureDurationMinutes,
            effectiveFrom: input.effectiveFrom,
            ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
            active: input.active,
          },
        });
        ruleId = rule.id;
      }
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.availability-rule-upserted',
        resourceType: 'AvailabilityRule',
        resourceId: ruleId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.availability-rule-upserted',
        payload: {
          clinicId,
          availabilityRuleId: ruleId,
          locationId: input.locationId,
          dentistId: input.dentistId ?? null,
          active: input.active,
        },
      });
      return ruleId;
    });
  }

  async createAvailabilityBlock(
    clinicId: string,
    input: {
      readonly id: string;
      readonly locationId?: string;
      readonly dentistId?: string;
      readonly kind: 'BLOCK' | 'TIME_OFF';
      readonly startsAt: Date;
      readonly endsAt: Date;
      readonly encryptedReason: string;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      if (input.locationId) await this.requireLocations(transaction, clinicId, [input.locationId]);
      if (input.dentistId)
        await this.requireAffiliatedDentist(transaction, clinicId, input.dentistId);
      const conflict = await transaction.appointment.findFirst({
        where: {
          clinicId,
          status: { in: ['TENTATIVE', 'CONFIRMED'] },
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
          ...(input.locationId ? { clinicLocationId: input.locationId } : {}),
          ...(input.dentistId ? { dentistId: input.dentistId } : {}),
        },
        select: { id: true },
      });
      if (conflict) {
        throw new IdempotencyConflictError('The block overlaps an active appointment.');
      }
      const block = await transaction.availabilityBlock.create({
        data: {
          id: input.id,
          clinicId,
          ...(input.locationId ? { locationId: input.locationId } : {}),
          ...(input.dentistId ? { dentistId: input.dentistId } : {}),
          kind: input.kind,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          encryptedReason: input.encryptedReason,
          createdByUserId: actor.userId,
        },
      });
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.availability-block-created',
        resourceType: 'AvailabilityBlock',
        resourceId: block.id,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.availability-block-created',
        payload: {
          clinicId,
          availabilityBlockId: block.id,
          kind: input.kind,
          startsAt: input.startsAt.toISOString(),
          endsAt: input.endsAt.toISOString(),
        },
      });
      return block.id;
    });
  }

  async updateSchedulingPolicy(
    clinicId: string,
    input: {
      readonly expectedVersion: number;
      readonly minimumNoticeMinutes: number;
      readonly maximumAdvanceDays: number;
      readonly rescheduleCutoffMinutes: number;
      readonly cancellationCutoffMinutes: number;
      readonly defaultConsultationMinutes: number;
      readonly defaultTreatmentMinutes: number;
      readonly overbookingAllowed: boolean;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    await this.idempotentResource(actor, command, async (transaction) => {
      const updated = await transaction.clinicSchedulingPolicy.updateMany({
        where: { clinicId, version: input.expectedVersion },
        data: {
          minimumNoticeMinutes: input.minimumNoticeMinutes,
          maximumAdvanceDays: input.maximumAdvanceDays,
          rescheduleCutoffMinutes: input.rescheduleCutoffMinutes,
          cancellationCutoffMinutes: input.cancellationCutoffMinutes,
          defaultConsultationMinutes: input.defaultConsultationMinutes,
          defaultTreatmentMinutes: input.defaultTreatmentMinutes,
          overbookingAllowed: input.overbookingAllowed,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.scheduling-policy-updated',
        resourceType: 'ClinicSchedulingPolicy',
        resourceId: clinicId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.scheduling-policy-updated',
        payload: { clinicId, version: input.expectedVersion + 1 },
      });
      return clinicId;
    });
  }

  async reserveCalendarConnection(
    clinicId: string,
    input: {
      readonly id: string;
      readonly dentistId?: string;
      readonly provider: string;
      readonly externalCalendarReferenceHash: string;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    const connectionId = await this.idempotentResource(actor, command, async (transaction) => {
      if (input.dentistId)
        await this.requireAffiliatedDentist(transaction, clinicId, input.dentistId);
      const existing = await transaction.clinicCalendarConnection.findUnique({
        where: {
          clinicId_provider_externalCalendarReferenceHash: {
            clinicId,
            provider: input.provider,
            externalCalendarReferenceHash: input.externalCalendarReferenceHash,
          },
        },
        select: { id: true },
      });
      const connection = existing
        ? await transaction.clinicCalendarConnection.update({
            where: { id: existing.id },
            data: {
              dentistId: input.dentistId ?? null,
              status: 'PENDING',
              lastErrorCode: null,
            },
          })
        : await transaction.clinicCalendarConnection.create({
            data: {
              id: input.id,
              clinicId,
              ...(input.dentistId ? { dentistId: input.dentistId } : {}),
              provider: input.provider,
              externalCalendarReferenceHash: input.externalCalendarReferenceHash,
            },
          });
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.calendar-connection-requested',
        resourceType: 'ClinicCalendarConnection',
        resourceId: connection.id,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.calendar-connection-requested',
        payload: {
          clinicId,
          calendarConnectionId: connection.id,
          provider: input.provider,
          dentistId: input.dentistId ?? null,
        },
      });
      return connection.id;
    });
    return this.db.clinicCalendarConnection.findFirstOrThrow({
      where: { id: connectionId, clinicId },
    });
  }

  async calendarConnection(clinicId: string, connectionId: string) {
    return this.db.clinicCalendarConnection.findFirst({
      where: { id: connectionId, clinicId },
    });
  }

  async recordCalendarConnectionStatus(
    clinicId: string,
    connectionId: string,
    input: {
      readonly status: 'ACTIVE' | 'ERROR';
      readonly lastSyncedAt: Date | null;
      readonly lastErrorCode: string | null;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const updated = await transaction.clinicCalendarConnection.updateMany({
        where: { id: connectionId, clinicId, status: { not: 'DISCONNECTED' } },
        data: {
          status: input.status,
          lastSyncedAt: input.lastSyncedAt,
          lastErrorCode: input.lastErrorCode,
        },
      });
      if (updated.count !== 1) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action:
          input.status === 'ACTIVE'
            ? 'clinic.calendar-synchronized'
            : 'clinic.calendar-synchronization-failed',
        resourceType: 'ClinicCalendarConnection',
        resourceId: connectionId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.calendar-connection-updated',
        payload: {
          clinicId,
          calendarConnectionId: connectionId,
          status: input.status,
          lastSyncedAt: input.lastSyncedAt?.toISOString() ?? null,
          lastErrorCode: input.lastErrorCode,
        },
      });
      return connectionId;
    });
  }

  async disconnectCalendar(
    clinicId: string,
    connectionId: string,
    reason: string,
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const updated = await transaction.clinicCalendarConnection.updateMany({
        where: { id: connectionId, clinicId, status: { not: 'DISCONNECTED' } },
        data: { status: 'DISCONNECTED', lastErrorCode: null },
      });
      if (updated.count !== 1) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.calendar-disconnected',
        resourceType: 'ClinicCalendarConnection',
        resourceId: connectionId,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.calendar-disconnected',
        payload: { clinicId, calendarConnectionId: connectionId },
        reason,
      });
      return connectionId;
    });
  }

  async listServices(clinicId: string) {
    return this.db.clinicService.findMany({
      where: { clinicId },
      take: 100,
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      include: {
        procedureDefinition: { select: { id: true, code: true, names: true } },
        prices: { take: 100, orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }] },
      },
    });
  }

  async listProcedureCatalog() {
    return this.db.procedureDefinition.findMany({
      where: { active: true },
      take: 500,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, names: true },
    });
  }

  async publishService(
    clinicId: string,
    input: {
      readonly clinicServiceId?: string;
      readonly procedureDefinitionId: string;
      readonly displayNames: Prisma.InputJsonValue;
      readonly includedServices: readonly string[];
      readonly exclusions: readonly string[];
      readonly estimatedDurationDays: number;
      readonly warrantyName: string;
      readonly warrantyTerms: Prisma.InputJsonValue;
      readonly minimumMinor: bigint;
      readonly maximumMinor: bigint;
      readonly currency: 'VND' | 'USD';
      readonly materialOptions: Prisma.InputJsonValue;
      readonly brandOptions: Prisma.InputJsonValue;
      readonly effectiveAt: Date;
    },
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    const priceVersionId = await this.idempotentResource(actor, command, async (transaction) => {
      const procedure = await transaction.procedureDefinition.findFirst({
        where: { id: input.procedureDefinitionId, active: true },
        select: { id: true },
      });
      if (!procedure) throw new OptimisticConcurrencyError();
      const warranty = await transaction.warrantyPolicy.create({
        data: {
          clinicId,
          name: input.warrantyName,
          terms: input.warrantyTerms,
          effectiveAt: input.effectiveAt,
        },
      });
      let service;
      if (input.clinicServiceId) {
        const existing = await transaction.clinicService.findFirst({
          where: { id: input.clinicServiceId, clinicId },
        });
        if (!existing) throw new OptimisticConcurrencyError();
        service = await transaction.clinicService.update({
          where: { id: existing.id },
          data: {
            procedureDefinitionId: input.procedureDefinitionId,
            warrantyPolicyId: warranty.id,
            displayNames: input.displayNames,
            includedServices: [...input.includedServices],
            exclusions: [...input.exclusions],
            estimatedDurationDays: input.estimatedDurationDays,
            active: true,
          },
        });
      } else {
        service = await transaction.clinicService.upsert({
          where: {
            clinicId_procedureDefinitionId: {
              clinicId,
              procedureDefinitionId: input.procedureDefinitionId,
            },
          },
          update: {
            warrantyPolicyId: warranty.id,
            displayNames: input.displayNames,
            includedServices: [...input.includedServices],
            exclusions: [...input.exclusions],
            estimatedDurationDays: input.estimatedDurationDays,
            active: true,
          },
          create: {
            clinicId,
            procedureDefinitionId: input.procedureDefinitionId,
            warrantyPolicyId: warranty.id,
            displayNames: input.displayNames,
            includedServices: [...input.includedServices],
            exclusions: [...input.exclusions],
            estimatedDurationDays: input.estimatedDurationDays,
          },
        });
      }
      const snapshot = {
        displayNames: input.displayNames,
        includedServices: [...input.includedServices],
        exclusions: [...input.exclusions],
        estimatedDurationDays: input.estimatedDurationDays,
        warrantyPolicyId: warranty.id,
        warrantyName: input.warrantyName,
        warrantyTerms: input.warrantyTerms,
      } as Prisma.InputJsonObject;
      const price = await transaction.priceVersion.create({
        data: {
          clinicServiceId: service.id,
          minimumMinor: input.minimumMinor,
          maximumMinor: input.maximumMinor,
          currency: input.currency,
          materialOptions: input.materialOptions,
          brandOptions: input.brandOptions,
          serviceSnapshot: snapshot,
          createdByUserId: actor.userId,
          effectiveAt: input.effectiveAt,
        },
      });
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.service-version-published',
        resourceType: 'PriceVersion',
        resourceId: price.id,
        aggregateType: 'ClinicService',
        aggregateId: service.id,
        eventType: 'clinic.service-version-published',
        payload: {
          clinicId,
          clinicServiceId: service.id,
          priceVersionId: price.id,
          procedureDefinitionId: input.procedureDefinitionId,
          effectiveAt: input.effectiveAt.toISOString(),
        },
      });
      return price.id;
    });
    return this.db.priceVersion.findUniqueOrThrow({ where: { id: priceVersionId } });
  }

  async archiveService(
    clinicId: string,
    clinicServiceId: string,
    reason: string,
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
  ) {
    return this.idempotentResource(actor, command, async (transaction) => {
      const service = await transaction.clinicService.findFirst({
        where: { id: clinicServiceId, clinicId, active: true },
      });
      if (!service) throw new OptimisticConcurrencyError();
      await transaction.clinicService.update({
        where: { id: service.id },
        data: { active: false },
      });
      if (service.warrantyPolicyId) {
        await transaction.warrantyPolicy.update({
          where: { id: service.warrantyPolicyId },
          data: { archivedAt: new Date() },
        });
      }
      await this.recordEffects(transaction, actor, command, {
        action: 'clinic.service-archived',
        resourceType: 'ClinicService',
        resourceId: service.id,
        aggregateType: 'Clinic',
        aggregateId: clinicId,
        eventType: 'clinic.service-archived',
        payload: { clinicId, clinicServiceId: service.id },
        reason,
      });
      return service.id;
    });
  }

  async overview(clinicId: string, organizationId: string) {
    const [onboarding, newCases, activeAppointments, activeTeam, openIncidents, activeServices] =
      await Promise.all([
        this.onboarding(clinicId),
        this.db.caseAssignment.count({
          where: {
            organizationId,
            kind: 'CLINIC',
            endedAt: null,
            assignedAt: { gte: daysAgo(30) },
          },
        }),
        this.db.appointment.count({
          where: {
            clinicId,
            status: { in: ['TENTATIVE', 'CONFIRMED'] },
            startsAt: { gte: new Date() },
          },
        }),
        this.db.clinicStaff.count({ where: { clinicId, active: true, removedAt: null } }),
        this.db.incident.count({ where: { clinicId, status: { not: 'CLOSED' } } }),
        this.db.clinicService.count({ where: { clinicId, active: true } }),
      ]);
    return { onboarding, newCases, activeAppointments, activeTeam, openIncidents, activeServices };
  }

  async analytics(clinicId: string, organizationId: string) {
    const [
      newCases,
      responseMetric,
      planCompletionMetric,
      costVarianceMetric,
      scheduleVarianceMetric,
      appointments,
      bookings,
      incidents,
      warranties,
      reviews,
      aftercareMetric,
      payments,
      licenseExpiry,
    ] = await Promise.all([
      this.db.caseAssignment.count({
        where: { organizationId, kind: 'CLINIC', assignedAt: { gte: daysAgo(30) } },
      }),
      this.db.$queryRaw<{ average_hours: number | null }[]>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (o."responded_at" - o."assigned_at")) / 3600.0)::double precision AS "average_hours"
        FROM "clinic_case_opportunities" o
        WHERE o."clinic_id" = CAST(${clinicId} AS uuid)
          AND o."assigned_at" >= ${daysAgo(90)}
          AND o."responded_at" IS NOT NULL
      `),
      this.db.$queryRaw<{ average_hours: number | null }[]>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (published."published_at" - plan."created_at")) / 3600.0)::double precision AS "average_hours"
        FROM "treatment_plans" plan
        JOIN LATERAL (
          SELECT MIN(version."published_at") AS "published_at"
          FROM "treatment_plan_versions" version
          WHERE version."treatment_plan_id" = plan."id" AND version."published_at" IS NOT NULL
        ) published ON published."published_at" IS NOT NULL
        WHERE plan."clinic_id" = CAST(${clinicId} AS uuid)
          AND plan."created_at" >= ${daysAgo(365)}
      `),
      this.db.$queryRaw<{ average_rate: number | null }[]>(Prisma.sql`
        SELECT AVG(
          ABS(
            (change."after_values"->>'TOTAL_PRICE_MINOR')::numeric
            - (change."before_values"->>'TOTAL_PRICE_MINOR')::numeric
          ) / NULLIF((change."before_values"->>'TOTAL_PRICE_MINOR')::numeric, 0)
        )::double precision AS "average_rate"
        FROM "plan_change_requests" change
        JOIN "treatment_plan_versions" version ON version."id" = change."from_plan_version_id"
        JOIN "treatment_plans" plan ON plan."id" = version."treatment_plan_id"
        WHERE plan."clinic_id" = CAST(${clinicId} AS uuid)
          AND change."created_at" >= ${daysAgo(365)}
          AND change."before_values"->>'TOTAL_PRICE_MINOR' ~ '^[0-9]+(?:\\.[0-9]+)?$'
          AND change."after_values"->>'TOTAL_PRICE_MINOR' ~ '^[0-9]+(?:\\.[0-9]+)?$'
      `),
      this.db.$queryRaw<{ average_hours: number | null }[]>(Prisma.sql`
        SELECT AVG(ABS(EXTRACT(EPOCH FROM (milestone."completed_at" - milestone."scheduled_at"))) / 3600.0)::double precision AS "average_hours"
        FROM "treatment_milestones" milestone
        WHERE milestone."completed_at" >= ${daysAgo(365)}
          AND milestone."scheduled_at" IS NOT NULL
          AND milestone."completed_at" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "treatment_plans" plan
            WHERE plan."case_id" = milestone."case_id"
              AND plan."clinic_id" = CAST(${clinicId} AS uuid)
          )
      `),
      this.db.appointment.groupBy({
        by: ['kind', 'status'],
        where: { clinicId, createdAt: { gte: daysAgo(90) } },
        _count: true,
      }),
      this.db.booking.groupBy({
        by: ['status'],
        where: {
          treatmentPlanVersion: { treatmentPlan: { clinicId } },
          createdAt: { gte: daysAgo(365) },
        },
        _count: true,
      }),
      this.db.incident.count({ where: { clinicId, createdAt: { gte: daysAgo(365) } } }),
      this.db.warrantyClaim.count({ where: { clinicId, createdAt: { gte: daysAgo(365) } } }),
      this.db.review.aggregate({
        where: { clinicId, verified: true, moderationStatus: 'PUBLISHED' },
        _count: true,
        _avg: { overallRating: true },
      }),
      this.db.$queryRaw<{ total: number; within_sla: number }[]>(Prisma.sql`
        SELECT COUNT(*)::integer AS "total",
               COUNT(*) FILTER (
                 WHERE escalation."resolved_at" IS NOT NULL
                   AND escalation."resolved_at" <= escalation."due_at"
               )::integer AS "within_sla"
        FROM "aftercare_escalations" escalation
        JOIN "aftercare_check_ins" check_in ON check_in."id" = escalation."aftercare_check_in_id"
        JOIN "aftercare_plans" aftercare_plan ON aftercare_plan."id" = check_in."aftercare_plan_id"
        WHERE escalation."created_at" >= ${daysAgo(365)}
          AND EXISTS (
            SELECT 1 FROM "treatment_plans" treatment_plan
            WHERE treatment_plan."case_id" = aftercare_plan."case_id"
              AND treatment_plan."clinic_id" = CAST(${clinicId} AS uuid)
          )
      `),
      this.db.payment.groupBy({
        by: ['currency'],
        where: {
          status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
          booking: { treatmentPlanVersion: { treatmentPlan: { clinicId } } },
        },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.db.professionalLicense.findFirst({
        where: {
          OR: [
            { clinicId },
            { dentist: { affiliations: { some: { clinicId, active: true, endedAt: null } } } },
          ],
          expiresAt: { not: null },
        },
        orderBy: { expiresAt: 'asc' },
        select: { expiresAt: true },
      }),
    ]);
    const consultationTotal = appointments
      .filter(({ kind }) => kind === 'CONSULTATION')
      .reduce((sum, item) => sum + item._count, 0);
    const consultationCompleted = appointments
      .filter(({ kind, status }) => kind === 'CONSULTATION' && status === 'COMPLETED')
      .reduce((sum, item) => sum + item._count, 0);
    const bookingTotal = bookings.reduce((sum, item) => sum + item._count, 0);
    const bookingCompleted = bookings
      .filter(({ status }) => status === 'COMPLETED')
      .reduce((sum, item) => sum + item._count, 0);
    const aftercare = aftercareMetric[0] ?? { total: 0, within_sla: 0 };
    return {
      generatedAt: new Date(),
      periodDays: 90,
      metrics: {
        newCases,
        averageResponseHours: responseMetric[0]?.average_hours ?? null,
        averagePlanCompletionHours: planCompletionMetric[0]?.average_hours ?? null,
        consultationConversionRate:
          consultationTotal > 0 ? consultationCompleted / consultationTotal : null,
        bookingConversionRate: bookingTotal > 0 ? bookingCompleted / bookingTotal : null,
        treatmentCompletionRate: bookingTotal > 0 ? bookingCompleted / bookingTotal : null,
        averageCostVarianceRate: costVarianceMetric[0]?.average_rate ?? null,
        averageScheduleVarianceHours: scheduleVarianceMetric[0]?.average_hours ?? null,
        incidentRate: bookingCompleted > 0 ? incidents / bookingCompleted : null,
        warrantyRate: bookingCompleted > 0 ? warranties / bookingCompleted : null,
        verifiedReviewCount: reviews._count,
        averageVerifiedRating: reviews._avg.overallRating,
        aftercareResponseSlaRate:
          aftercare.total > 0 ? aftercare.within_sla / aftercare.total : null,
        nextVerificationExpiry: licenseExpiry?.expiresAt ?? null,
      },
      paymentSummaries: payments.map((payment) => ({
        currency: payment.currency,
        count: payment._count,
        grossAmountMinor: payment._sum.amountMinor ?? BigInt(0),
      })),
      unavailableMetrics: [],
    };
  }

  async billing(clinicId: string) {
    const [profile, payments] = await Promise.all([
      this.db.clinicOnboardingProfile.findUnique({
        where: { clinicId },
        select: { payoutProvider: true, payoutStatus: true, updatedAt: true },
      }),
      this.db.payment.groupBy({
        by: ['currency', 'status'],
        where: { booking: { treatmentPlanVersion: { treatmentPlan: { clinicId } } } },
        _sum: { amountMinor: true },
        _count: true,
      }),
    ]);
    return {
      payout: profile,
      payments: payments.map((payment) => ({
        currency: payment.currency,
        status: payment.status,
        count: payment._count,
        amountMinor: payment._sum.amountMinor ?? BigInt(0),
      })),
    };
  }

  async verificationEvidenceSources(clinicId: string) {
    const [profile, locations, affiliations, services, warranties, declarations, documents] =
      await Promise.all([
        this.db.clinicOnboardingProfile.findUnique({ where: { clinicId } }),
        this.db.clinicLocation.findMany({
          where: { clinicId, active: true },
          take: 100,
          select: { id: true },
        }),
        this.db.dentistClinicAffiliation.findMany({
          where: { clinicId, active: true, endedAt: null },
          take: 100,
          select: { id: true, dentistId: true },
        }),
        this.db.clinicService.findMany({
          where: { clinicId, active: true },
          take: 100,
          select: { id: true },
        }),
        this.db.warrantyPolicy.findMany({
          where: { clinicId, archivedAt: null },
          take: 100,
          select: { id: true },
        }),
        this.db.clinicDeclaration.findMany({
          where: { clinicId, active: true },
          take: 100,
          select: { id: true, kind: true, code: true },
        }),
        this.db.clinicOnboardingDocument.findMany({
          where: { clinicId },
          take: 100,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, kind: true, fileAssetId: true },
        }),
      ]);
    return { profile, locations, affiliations, services, warranties, declarations, documents };
  }

  async userEmail(userId: string): Promise<string | null> {
    const user = await this.db.user.findFirst({
      where: { id: userId, accountStatus: 'ACTIVE', deletedAt: null },
      select: { email: true },
    });
    return user?.email ?? null;
  }

  private async requireLocations(
    transaction: Prisma.TransactionClient,
    clinicId: string,
    locationIds: readonly string[],
  ) {
    if (!locationIds.length) return;
    const count = await transaction.clinicLocation.count({
      where: { clinicId, id: { in: [...locationIds] }, active: true },
    });
    if (count !== locationIds.length) throw new OptimisticConcurrencyError();
  }

  private async requireAffiliatedDentist(
    transaction: Prisma.TransactionClient,
    clinicId: string,
    dentistId: string,
  ) {
    const affiliation = await transaction.dentistClinicAffiliation.findFirst({
      where: { clinicId, dentistId, active: true, endedAt: null },
      select: { id: true },
    });
    if (!affiliation) throw new OptimisticConcurrencyError();
  }

  private async recordEffects(
    transaction: Prisma.TransactionClient,
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
    effect: {
      readonly action: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly aggregateType: string;
      readonly aggregateId: string;
      readonly eventType: string;
      readonly payload: Prisma.InputJsonValue;
      readonly reason?: string;
    },
  ) {
    await transaction.auditLog.create({
      data: {
        actorUserId: actor.userId,
        ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
        ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
        action: effect.action,
        resourceType: effect.resourceType,
        resourceId: effect.resourceId,
        requestId: actor.requestId,
        ...(effect.reason ? { reason: effect.reason } : {}),
        success: true,
        afterMetadata: effect.payload,
      },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: effect.aggregateType,
        aggregateId: effect.aggregateId,
        eventType: effect.eventType,
        payload: effect.payload,
        correlationId: actor.requestId,
        idempotencyKey: `${effect.eventType}:${command.key}`,
      },
    });
  }

  private async idempotentResource(
    actor: ClinicOperationsActor,
    command: ClinicOperationsCommand,
    operation: (transaction: Prisma.TransactionClient) => Promise<string>,
  ): Promise<string> {
    const replay = await this.resolveReplay(actor.userId, command);
    if (replay) return replay;
    try {
      return await this.db.$transaction(
        async (transaction) => {
          await transaction.idempotencyRecord.create({
            data: {
              userId: actor.userId,
              key: command.key,
              operation: command.operation,
              requestHash: command.requestHash,
              expiresAt: new Date(Date.now() + commandLifetimeMs),
            },
          });
          const resourceId = await operation(transaction);
          await transaction.idempotencyRecord.update({
            where: { userId_key: { userId: actor.userId, key: command.key } },
            data: {
              status: 'COMPLETED',
              resourceId,
              response: { resourceId },
              completedAt: new Date(),
            },
          });
          return resourceId;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaCode(error, 'P2002')) {
        const raced = await this.resolveReplay(actor.userId, command);
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async resolveReplay(
    userId: string,
    command: ClinicOperationsCommand,
  ): Promise<string | null> {
    const record = await this.db.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key: command.key } },
    });
    if (!record) return null;
    if (record.operation !== command.operation || record.requestHash !== command.requestHash) {
      throw new IdempotencyConflictError('The idempotency key was used for a different command.');
    }
    if (record.expiresAt <= new Date()) {
      await this.db.idempotencyRecord.deleteMany({
        where: { id: record.id, expiresAt: { lte: new Date() } },
      });
      return null;
    }
    if (record.status === 'COMPLETED' && record.resourceId) return record.resourceId;
    throw new IdempotencyConflictError('The original command is still in progress.');
  }
}

function isClinicRole(role: SystemRole): role is ClinicOperatorScope['role'] {
  return (clinicRoles as readonly SystemRole[]).includes(role);
}

function isClinicPermission(value: string): value is ClinicOperationPermission {
  return (defaultClinicOperationPermissions.CLINIC_ADMIN as readonly string[]).includes(value);
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

function page<T extends { readonly id: string }, V>(
  rows: readonly T[],
  limit: number,
  view: (row: T) => V,
) {
  const selected = rows.slice(0, limit);
  return {
    records: selected.map(view),
    nextCursor: rows.length > limit ? (selected.at(-1)?.id ?? null) : null,
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60_000);
}
