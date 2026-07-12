import { createHash } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

import type { CaseAccessResource } from '@dental-trust/auth';
import { DomainRuleError, type CaregiverPermission } from '@dental-trust/domain';

import { CaseNotFoundError, IdempotencyConflictError } from './case.repository.js';

const commandLifetimeMs = 24 * 60 * 60_000;

export interface CaregiverGrantPersistenceInput {
  readonly caregiverEmail: string;
  readonly permissions: readonly CaregiverPermission[];
  readonly expiresAt?: string;
}

export interface CaregiverGrantRecord {
  readonly id: string;
  readonly caseId: string;
  readonly caregiverUserId: string;
  readonly caregiverEmail: string;
  readonly permissions: CaregiverPermission[];
  readonly grantedAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly lastAccessedAt: string | null;
}

export interface TreatmentPlanDraftPersistenceInput {
  readonly authoringDentistId?: string;
  readonly preliminaryAssessment: string;
  readonly diagnosisStatement: string;
  readonly risks: string;
  readonly limitations: string;
  readonly warrantyTerms: string;
  readonly exclusions: string;
  readonly currency: 'VND' | 'USD';
  readonly expiresAt: string;
  readonly items: readonly {
    readonly procedureCode: string;
    readonly toothNumbers: readonly number[];
    readonly quantity: number;
    readonly material?: string;
    readonly brand?: string;
    readonly unitPriceMinor: number;
  }[];
}

export interface TreatmentPlanVersionRecord extends Prisma.JsonObject {
  readonly id: string;
  readonly treatmentPlanId: string;
  readonly caseId: string;
  readonly clinicId: string;
  readonly clinicName: string;
  readonly authoringDentistId: string;
  readonly authoringDentistName: string;
  readonly version: number;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'EXPIRED';
  readonly preliminaryAssessment: string;
  readonly diagnosisStatement: string;
  readonly risks: string;
  readonly limitations: string;
  readonly warrantyTerms: string;
  readonly exclusions: string;
  readonly currency: 'VND' | 'USD';
  readonly totalMinor: number;
  readonly expiresAt: string;
  readonly publishedAt: string | null;
  readonly contentChecksum: string;
  readonly acceptedAt: string | null;
  readonly acceptanceConsentTextVersionId: string | null;
  readonly items: TreatmentPlanItemRecord[];
  readonly createdAt: string;
}

export interface TreatmentPlanItemRecord extends Prisma.JsonObject {
  readonly id: string;
  readonly procedureCode: string;
  readonly toothNumbers: number[];
  readonly quantity: number;
  readonly material: string | null;
  readonly brand: string | null;
  readonly unitPriceMinor: number;
  readonly totalPriceMinor: number;
  readonly sortOrder: number;
}

export interface TreatmentPlanAcceptanceRecord extends Prisma.JsonObject {
  readonly id: string;
  readonly treatmentPlanVersionId: string;
  readonly userId: string;
  readonly consentTextVersionId: string;
  readonly acceptedAt: string;
}

export interface TreatmentPlanAuthoringRecord {
  readonly clinicId: string;
  readonly clinicName: string;
  readonly dentistOptions: readonly {
    readonly id: string;
    readonly fullName: string;
    readonly isCurrentUser: boolean;
  }[];
}

export interface AftercareCheckInPersistenceInput {
  readonly aftercarePlanId: string;
  readonly painScale: number;
  readonly symptomCodes: readonly string[];
  readonly patientNotes?: string;
  readonly photoFileAssetIds: readonly string[];
}

export interface AftercarePlanRecord extends Prisma.JsonObject {
  readonly id: string;
  readonly caseId: string;
  readonly active: boolean;
  readonly startsAt: string;
  readonly completedAt: string | null;
  readonly checkIns: AftercareCheckInRecord[];
}

export interface AftercareCheckInRecord extends Prisma.JsonObject {
  readonly id: string;
  readonly aftercarePlanId: string;
  readonly painScale: number;
  readonly symptomCodes: string[];
  readonly patientNotes: string | null;
  readonly submittedAt: string;
  readonly escalations: AftercareEscalationRecord[];
}

export interface AftercareEscalationRecord extends Prisma.JsonObject {
  readonly id: string;
  readonly severity: 'URGENT' | 'HIGH' | 'ROUTINE';
  readonly matchedRuleIds: string[];
  readonly status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  readonly dueAt: string;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
}

export interface CaseDocumentRecord {
  readonly id: string;
  readonly caseId: string;
  readonly fileAssetId: string;
  readonly category: string;
  readonly description: string | null;
  readonly originalFileName: string;
  readonly declaredMediaType: string;
  readonly detectedMediaType: string | null;
  readonly sizeBytes: number;
  readonly status:
    'QUARANTINED' | 'SCANNING' | 'AVAILABLE' | 'REJECTED' | 'DELETION_PENDING' | 'DELETED';
  readonly scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'ERROR';
  readonly createdAt: string;
}

export interface ClinicalActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly organizationId?: string;
  readonly impersonatorUserId?: string;
}

export interface ClinicalCommand {
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface TreatmentPlanVisibility {
  readonly includeDrafts: boolean;
  readonly clinicOrganizationId?: string;
  readonly patientUserId?: string;
}

export interface AftercareEscalationInput {
  readonly matchedRuleIds: readonly string[];
  readonly severity: 'URGENT' | 'HIGH' | 'ROUTINE';
  readonly dueAt: Date;
}

export class ClinicalWorkflowRepository {
  constructor(private readonly db: PrismaClient) {}

  async loadCaseAccessResource(caseId: string): Promise<CaseAccessResource | null> {
    const result = await this.db.dentalCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        patientProfile: { select: { userId: true } },
        caregiverGrants: {
          select: { caregiverUserId: true, permissions: true, expiresAt: true, revokedAt: true },
        },
        assignments: {
          select: { assignedUserId: true, organizationId: true, endedAt: true },
        },
      },
    });
    if (!result) return null;
    return {
      caseId: result.id,
      patientUserId: result.patientProfile.userId,
      caregiverGrants: result.caregiverGrants.map((grant) => ({
        caregiverUserId: grant.caregiverUserId,
        permissions: grant.permissions,
        ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
        ...(grant.revokedAt ? { revokedAt: grant.revokedAt } : {}),
      })),
      assignments: result.assignments.map((assignment) => ({
        active: assignment.endedAt === null,
        ...(assignment.assignedUserId ? { userId: assignment.assignedUserId } : {}),
        ...(assignment.organizationId ? { organizationId: assignment.organizationId } : {}),
      })),
    };
  }

  async listCaregiverGrants(caseId: string): Promise<readonly CaregiverGrantRecord[]> {
    const grants = await this.db.caregiverGrant.findMany({
      where: { caseId },
      include: { caregiver: { select: { email: true } } },
      orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
    });
    return grants.map(toCaregiverGrantView);
  }

  async inviteCaregiver(
    caseId: string,
    input: CaregiverGrantPersistenceInput,
    actor: ClinicalActor,
    command: ClinicalCommand,
  ): Promise<CaregiverGrantRecord> {
    return this.idempotent(actor, command, async (transaction) => {
      const dentalCase = await transaction.dentalCase.findFirst({
        where: { id: caseId, patientProfile: { userId: actor.userId } },
        select: { id: true, patientProfileId: true },
      });
      if (!dentalCase) throw new CaseNotFoundError();

      const caregiver = await transaction.user.findFirst({
        where: {
          email: input.caregiverEmail,
          accountStatus: 'ACTIVE',
          deletedAt: null,
          emailVerifiedAt: { not: null },
          roles: { some: { role: { code: 'CAREGIVER' } } },
        },
        select: { id: true, email: true },
      });
      if (!caregiver || caregiver.id === actor.userId) {
        throw new DomainRuleError(
          'CAREGIVER_NOT_ELIGIBLE',
          'The caregiver must have a verified active caregiver account.',
        );
      }
      if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
        throw new DomainRuleError(
          'CAREGIVER_GRANT_EXPIRY_INVALID',
          'A caregiver grant expiry must be in the future.',
        );
      }
      const activeGrant = await transaction.caregiverGrant.findFirst({
        where: {
          caseId,
          caregiverUserId: caregiver.id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });
      if (activeGrant) {
        throw new DomainRuleError(
          'CAREGIVER_GRANT_ALREADY_ACTIVE',
          'This caregiver already has an active grant for the case.',
        );
      }

      const grant = await transaction.caregiverGrant.create({
        data: {
          caseId,
          patientProfileId: dentalCase.patientProfileId,
          caregiverUserId: caregiver.id,
          permissions: [...input.permissions],
          ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
        },
        include: { caregiver: { select: { email: true } } },
      });
      const view = toCaregiverGrantView(grant);
      await this.recordEffects(transaction, actor, {
        action: 'caregiver.grant-created',
        resourceType: 'CaregiverGrant',
        resourceId: grant.id,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'caregiver.grant-created',
        payload: {
          caseId,
          caregiverGrantId: grant.id,
          caregiverUserId: caregiver.id,
          permissions: [...input.permissions],
          expiresAt: input.expiresAt ?? null,
        },
      });
      return view;
    });
  }

  async revokeCaregiver(
    caseId: string,
    grantId: string,
    actor: ClinicalActor,
    command: ClinicalCommand,
  ): Promise<CaregiverGrantRecord> {
    return this.idempotent(actor, command, async (transaction) => {
      const owner = await transaction.dentalCase.findFirst({
        where: { id: caseId, patientProfile: { userId: actor.userId } },
        select: { id: true },
      });
      if (!owner) throw new CaseNotFoundError();
      const grant = await transaction.caregiverGrant.findFirst({
        where: { id: grantId, caseId, revokedAt: null },
        include: { caregiver: { select: { email: true } } },
      });
      if (!grant) throw new CaseNotFoundError();
      const revokedAt = new Date();
      const update = await transaction.caregiverGrant.updateMany({
        where: { id: grantId, caseId, revokedAt: null },
        data: { revokedAt },
      });
      if (update.count !== 1) throw new IdempotencyConflictError('Grant was already revoked.');
      const view: CaregiverGrantRecord & Prisma.JsonObject = {
        ...toCaregiverGrantView(grant),
        revokedAt: revokedAt.toISOString(),
      };
      await this.recordEffects(transaction, actor, {
        action: 'caregiver.grant-revoked',
        resourceType: 'CaregiverGrant',
        resourceId: grant.id,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'caregiver.grant-revoked',
        payload: { caseId, caregiverGrantId: grant.id, caregiverUserId: grant.caregiverUserId },
      });
      return view;
    });
  }

  async authoringContext(
    organizationId: string,
    actorUserId: string,
  ): Promise<TreatmentPlanAuthoringRecord | null> {
    const clinic = await this.db.clinic.findFirst({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        affiliations: {
          where: {
            active: true,
            endedAt: null,
            dentist: { licenseStatus: 'VERIFIED' },
          },
          select: { dentist: { select: { id: true, fullName: true, userId: true } } },
          orderBy: { dentist: { fullName: 'asc' } },
        },
      },
    });
    if (!clinic) return null;
    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      dentistOptions: clinic.affiliations.map(({ dentist }) => ({
        id: dentist.id,
        fullName: dentist.fullName,
        isCurrentUser: dentist.userId === actorUserId,
      })),
    };
  }

  async listTreatmentPlans(
    caseId: string,
    visibility: TreatmentPlanVisibility,
  ): Promise<readonly TreatmentPlanVersionRecord[]> {
    const consent = await this.latestAcceptanceConsent();
    const plans = await this.db.treatmentPlan.findMany({
      where: {
        caseId,
        ...(visibility.clinicOrganizationId
          ? { clinic: { organizationId: visibility.clinicOrganizationId } }
          : {}),
      },
      include: {
        clinic: { select: { name: true } },
        versions: {
          where: visibility.includeDrafts
            ? {}
            : { status: { in: ['PUBLISHED', 'SUPERSEDED', 'EXPIRED'] } },
          include: {
            authoringDentist: { select: { fullName: true } },
            items: { orderBy: { sortOrder: 'asc' } },
            acceptances: visibility.patientUserId
              ? { where: { userId: visibility.patientUserId } }
              : false,
          },
          orderBy: { version: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return plans.flatMap((plan) =>
      plan.versions.map((version) =>
        toTreatmentPlanVersionView(plan, version, consent?.id ?? null, visibility.patientUserId),
      ),
    );
  }

  async getTreatmentPlanVersion(
    caseId: string,
    versionId: string,
    visibility: TreatmentPlanVisibility,
  ): Promise<TreatmentPlanVersionRecord | null> {
    const consent = await this.latestAcceptanceConsent();
    const plan = await this.db.treatmentPlan.findFirst({
      where: {
        caseId,
        ...(visibility.clinicOrganizationId
          ? { clinic: { organizationId: visibility.clinicOrganizationId } }
          : {}),
        versions: {
          some: {
            id: versionId,
            ...(visibility.includeDrafts
              ? {}
              : { status: { in: ['PUBLISHED', 'SUPERSEDED', 'EXPIRED'] } }),
          },
        },
      },
      include: {
        clinic: { select: { name: true } },
        versions: {
          where: { id: versionId },
          include: {
            authoringDentist: { select: { fullName: true } },
            items: { orderBy: { sortOrder: 'asc' } },
            acceptances: visibility.patientUserId
              ? { where: { userId: visibility.patientUserId } }
              : false,
          },
        },
      },
    });
    const version = plan?.versions[0];
    return plan && version
      ? toTreatmentPlanVersionView(plan, version, consent?.id ?? null, visibility.patientUserId)
      : null;
  }

  async createTreatmentPlanDraft(
    caseId: string,
    input: TreatmentPlanDraftPersistenceInput,
    actor: ClinicalActor,
    command: ClinicalCommand,
  ): Promise<TreatmentPlanVersionRecord> {
    if (!actor.organizationId) throw new CaseNotFoundError();
    return this.idempotent(actor, command, async (transaction) => {
      const authoring = await this.resolveAuthoringContext(
        transaction,
        caseId,
        actor,
        input.authoringDentistId,
      );
      const plan = await transaction.treatmentPlan.upsert({
        where: { caseId_clinicId: { caseId, clinicId: authoring.clinic.id } },
        update: {},
        create: { caseId, clinicId: authoring.clinic.id },
      });
      const latest = await transaction.treatmentPlanVersion.findFirst({
        where: { treatmentPlanId: plan.id },
        orderBy: { version: 'desc' },
        select: { version: true, status: true },
      });
      if (latest?.status === 'DRAFT') {
        throw new DomainRuleError(
          'TREATMENT_PLAN_DRAFT_ALREADY_EXISTS',
          'Publish or remove the current draft before creating another version.',
        );
      }
      const totalMinor = input.items.reduce(
        (total, item) => total + BigInt(item.unitPriceMinor) * BigInt(item.quantity),
        0n,
      );
      if (totalMinor <= 0n || totalMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new DomainRuleError(
          'TREATMENT_PLAN_TOTAL_INVALID',
          'The treatment plan total must be positive and safely representable.',
        );
      }
      if (new Date(input.expiresAt) <= new Date()) {
        throw new DomainRuleError(
          'TREATMENT_PLAN_EXPIRY_INVALID',
          'A treatment-plan draft must expire in the future.',
        );
      }
      const created = await transaction.treatmentPlanVersion.create({
        data: {
          treatmentPlanId: plan.id,
          version: (latest?.version ?? 0) + 1,
          authoringDentistId: authoring.dentist.id,
          preliminaryAssessment: input.preliminaryAssessment,
          diagnosisStatement: input.diagnosisStatement,
          risks: input.risks,
          limitations: input.limitations,
          warrantyTerms: input.warrantyTerms,
          exclusions: input.exclusions,
          currency: input.currency,
          totalMinor,
          expiresAt: new Date(input.expiresAt),
          items: {
            create: input.items.map((item, sortOrder) => ({
              procedureCode: item.procedureCode,
              toothNumbers: [...item.toothNumbers],
              quantity: item.quantity,
              ...(item.material ? { material: item.material } : {}),
              ...(item.brand ? { brand: item.brand } : {}),
              unitPriceMinor: BigInt(item.unitPriceMinor),
              totalPriceMinor: BigInt(item.unitPriceMinor) * BigInt(item.quantity),
              sortOrder,
            })),
          },
        },
        include: {
          authoringDentist: { select: { fullName: true } },
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });
      const view = toTreatmentPlanVersionView(
        { ...plan, clinic: { name: authoring.clinic.name } },
        created,
        null,
      );
      await this.recordEffects(transaction, actor, {
        action: 'treatment-plan.draft-created',
        resourceType: 'TreatmentPlanVersion',
        resourceId: created.id,
        aggregateType: 'TreatmentPlan',
        aggregateId: plan.id,
        eventType: 'treatment-plan.draft-created',
        payload: {
          caseId,
          treatmentPlanId: plan.id,
          treatmentPlanVersionId: created.id,
          version: created.version,
          clinicId: authoring.clinic.id,
        },
      });
      return view;
    });
  }

  async publishTreatmentPlanVersion(
    caseId: string,
    versionId: string,
    expectedVersion: number,
    expectedChecksum: string,
    actor: ClinicalActor,
    command: ClinicalCommand,
  ): Promise<TreatmentPlanVersionRecord> {
    const organizationId = actor.organizationId;
    if (!organizationId) throw new CaseNotFoundError();
    return this.idempotent(actor, command, async (transaction) => {
      await this.assertActiveAuthorMembership(transaction, actor);
      const version = await transaction.treatmentPlanVersion.findFirst({
        where: {
          id: versionId,
          version: expectedVersion,
          status: 'DRAFT',
          treatmentPlan: {
            caseId,
            clinic: { organizationId },
            dentalCase: {
              assignments: {
                some: { organizationId, endedAt: null },
              },
            },
          },
        },
        include: {
          treatmentPlan: { include: { clinic: { select: { name: true } } } },
          authoringDentist: { select: { fullName: true } },
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!version) throw new CaseNotFoundError();
      const checksum = checksumForVersion(version);
      if (checksum !== expectedChecksum) {
        throw new DomainRuleError(
          'TREATMENT_PLAN_CHECKSUM_MISMATCH',
          'The draft content changed before publication.',
        );
      }
      await transaction.treatmentPlanVersion.updateMany({
        where: { treatmentPlanId: version.treatmentPlanId, status: 'PUBLISHED' },
        data: { status: 'SUPERSEDED' },
      });
      const publishedAt = new Date();
      const updated = await transaction.treatmentPlanVersion.update({
        where: { id: version.id },
        data: { status: 'PUBLISHED', publishedAt, contentChecksum: checksum },
        include: {
          authoringDentist: { select: { fullName: true } },
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });
      const view = toTreatmentPlanVersionView(
        version.treatmentPlan,
        updated,
        (await this.latestAcceptanceConsent(transaction))?.id ?? null,
      );
      await this.recordEffects(transaction, actor, {
        action: 'treatment-plan.published',
        resourceType: 'TreatmentPlanVersion',
        resourceId: version.id,
        aggregateType: 'TreatmentPlan',
        aggregateId: version.treatmentPlanId,
        eventType: 'treatment-plan.published',
        payload: {
          caseId,
          treatmentPlanId: version.treatmentPlanId,
          treatmentPlanVersionId: version.id,
          version: version.version,
          contentChecksum: checksum,
        },
      });
      return view;
    });
  }

  async acceptTreatmentPlanVersion(
    caseId: string,
    versionId: string,
    consentTextVersionId: string,
    actor: ClinicalActor,
    command: ClinicalCommand,
  ): Promise<TreatmentPlanAcceptanceRecord> {
    return this.idempotent(actor, command, async (transaction) => {
      const version = await transaction.treatmentPlanVersion.findFirst({
        where: {
          id: versionId,
          status: 'PUBLISHED',
          expiresAt: { gt: new Date() },
          treatmentPlan: {
            caseId,
            dentalCase: { patientProfile: { userId: actor.userId } },
          },
        },
        select: { id: true, treatmentPlanId: true, contentChecksum: true },
      });
      if (!version?.contentChecksum) throw new CaseNotFoundError();
      const consent = await transaction.consentTextVersion.findFirst({
        where: {
          id: consentTextVersionId,
          purpose: 'TREATMENT_PLAN_ACCEPTANCE',
          publishedAt: { lte: new Date() },
        },
        select: { id: true },
      });
      if (!consent) {
        throw new DomainRuleError(
          'TREATMENT_PLAN_CONSENT_INVALID',
          'A current treatment-plan consent text is required.',
        );
      }
      const existing = await transaction.treatmentPlanAcceptance.findUnique({
        where: {
          treatmentPlanVersionId_userId: {
            treatmentPlanVersionId: version.id,
            userId: actor.userId,
          },
        },
      });
      if (existing) {
        throw new DomainRuleError(
          'TREATMENT_PLAN_ALREADY_ACCEPTED',
          'This treatment plan version was already accepted.',
        );
      }
      const acceptance = await transaction.treatmentPlanAcceptance.create({
        data: {
          treatmentPlanVersionId: version.id,
          userId: actor.userId,
          consentTextVersionId: consent.id,
          sessionId: actor.sessionId,
          requestId: actor.requestId,
        },
      });
      const view = toTreatmentPlanAcceptanceView(acceptance);
      await this.recordEffects(transaction, actor, {
        action: 'treatment-plan.accepted',
        resourceType: 'TreatmentPlanVersion',
        resourceId: version.id,
        aggregateType: 'TreatmentPlan',
        aggregateId: version.treatmentPlanId,
        eventType: 'treatment-plan.accepted',
        payload: {
          caseId,
          treatmentPlanVersionId: version.id,
          patientUserId: actor.userId,
          consentTextVersionId: consent.id,
          contentChecksum: version.contentChecksum,
        },
      });
      return view;
    });
  }

  async listAftercare(caseId: string): Promise<readonly AftercarePlanRecord[]> {
    const plans = await this.db.aftercarePlan.findMany({
      where: { caseId },
      include: {
        checkIns: {
          include: { escalations: { orderBy: { createdAt: 'desc' } } },
          orderBy: { submittedAt: 'desc' },
        },
      },
      orderBy: { startsAt: 'desc' },
    });
    return plans.map(toAftercarePlanView);
  }

  async submitAftercareCheckIn(
    caseId: string,
    input: AftercareCheckInPersistenceInput,
    escalation: AftercareEscalationInput | null,
    actor: ClinicalActor,
    command: ClinicalCommand,
  ): Promise<AftercarePlanRecord> {
    return this.idempotent(actor, command, async (transaction) => {
      const plan = await transaction.aftercarePlan.findFirst({
        where: {
          id: input.aftercarePlanId,
          caseId,
          active: true,
          completedAt: null,
          dentalCase: { patientProfile: { userId: actor.userId } },
        },
        select: { id: true },
      });
      if (!plan) throw new CaseNotFoundError();
      const photoIds = [...new Set(input.photoFileAssetIds)];
      if (photoIds.length > 0) {
        const linkedPhotos = await transaction.caseDocument.count({
          where: {
            caseId,
            fileAssetId: { in: photoIds },
            fileAsset: {
              ownerUserId: actor.userId,
              status: 'AVAILABLE',
              scanStatus: 'CLEAN',
              deletedAt: null,
            },
          },
        });
        if (linkedPhotos !== photoIds.length) {
          throw new DomainRuleError(
            'AFTERCARE_PHOTO_NOT_AVAILABLE',
            'Every check-in photo must be a clean available document on this case.',
          );
        }
      }
      const checkIn = await transaction.aftercareCheckIn.create({
        data: {
          aftercarePlanId: plan.id,
          painScale: input.painScale,
          symptomCodes: [...input.symptomCodes],
          ...(input.patientNotes ? { patientNotes: input.patientNotes } : {}),
          ...(escalation
            ? {
                escalations: {
                  create: {
                    severity: escalation.severity,
                    matchedRuleIds: [...escalation.matchedRuleIds],
                    dueAt: escalation.dueAt,
                  },
                },
              }
            : {}),
        },
        include: { escalations: true },
      });
      await this.recordEffects(transaction, actor, {
        action: 'aftercare.check-in-submitted',
        resourceType: 'AftercareCheckIn',
        resourceId: checkIn.id,
        aggregateType: 'AftercarePlan',
        aggregateId: plan.id,
        eventType: escalation ? 'aftercare.check-in-escalated' : 'aftercare.check-in-submitted',
        payload: {
          caseId,
          aftercarePlanId: plan.id,
          checkInId: checkIn.id,
          painScale: input.painScale,
          symptomCodes: [...input.symptomCodes],
          photoFileAssetIds: photoIds,
          escalation: escalation
            ? {
                severity: escalation.severity,
                matchedRuleIds: [...escalation.matchedRuleIds],
                dueAt: escalation.dueAt.toISOString(),
              }
            : null,
        },
      });
      const refreshed = await transaction.aftercarePlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: {
          checkIns: {
            include: { escalations: { orderBy: { createdAt: 'desc' } } },
            orderBy: { submittedAt: 'desc' },
          },
        },
      });
      return toAftercarePlanView(refreshed);
    });
  }

  async listCaseDocuments(caseId: string): Promise<readonly CaseDocumentRecord[]> {
    const documents = await this.db.caseDocument.findMany({
      where: { caseId },
      include: { fileAsset: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return documents.map((document) => ({
      id: document.id,
      caseId: document.caseId,
      fileAssetId: document.fileAssetId,
      category: document.category,
      description: document.description,
      originalFileName: document.fileAsset.originalFileName,
      declaredMediaType: document.fileAsset.declaredMediaType,
      detectedMediaType: document.fileAsset.detectedMediaType,
      sizeBytes: safeInteger(document.fileAsset.sizeBytes),
      status: document.fileAsset.status,
      scanStatus: document.fileAsset.scanStatus,
      createdAt: document.createdAt.toISOString(),
    }));
  }

  private async resolveAuthoringContext(
    transaction: Prisma.TransactionClient,
    caseId: string,
    actor: ClinicalActor,
    requestedDentistId?: string,
  ) {
    if (!actor.organizationId) throw new CaseNotFoundError();
    const membership = await this.assertActiveAuthorMembership(transaction, actor);
    const dentalCase = await transaction.dentalCase.findFirst({
      where: {
        id: caseId,
        assignments: { some: { organizationId: actor.organizationId, endedAt: null } },
      },
      select: { id: true },
    });
    if (!dentalCase) throw new CaseNotFoundError();
    const clinic = await transaction.clinic.findFirst({
      where: { organizationId: actor.organizationId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!clinic) throw new CaseNotFoundError();
    const dentist = await transaction.dentist.findFirst({
      where: {
        ...(requestedDentistId ? { id: requestedDentistId } : { userId: actor.userId }),
        licenseStatus: 'VERIFIED',
        affiliations: {
          some: { clinicId: clinic.id, active: true, endedAt: null },
        },
      },
      select: { id: true, userId: true },
    });
    if (!dentist) throw new CaseNotFoundError();
    if (membership.role.code === 'DENTIST' && dentist.userId !== actor.userId) {
      throw new CaseNotFoundError();
    }
    return { clinic, dentist };
  }

  private async assertActiveAuthorMembership(
    transaction: Prisma.TransactionClient,
    actor: ClinicalActor,
  ) {
    if (!actor.organizationId) throw new CaseNotFoundError();
    const membership = await transaction.organizationMembership.findFirst({
      where: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        status: 'ACTIVE',
        role: { code: { in: ['DENTIST', 'CLINIC_ADMIN'] } },
      },
      include: { role: { select: { code: true } } },
    });
    if (!membership) throw new CaseNotFoundError();
    return membership;
  }

  private latestAcceptanceConsent(transaction: Prisma.TransactionClient = this.db) {
    return transaction.consentTextVersion.findFirst({
      where: {
        purpose: 'TREATMENT_PLAN_ACCEPTANCE',
        publishedAt: { lte: new Date() },
      },
      orderBy: { publishedAt: 'desc' },
      select: { id: true },
    });
  }

  private async recordEffects(
    transaction: Prisma.TransactionClient,
    actor: ClinicalActor,
    effect: {
      readonly action: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly aggregateType: string;
      readonly aggregateId: string;
      readonly eventType: string;
      readonly payload: Prisma.InputJsonValue;
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
        idempotencyKey: `${effect.eventType}:${effect.resourceId}`,
      },
    });
  }

  private async idempotent<T extends Prisma.JsonObject>(
    actor: ClinicalActor,
    command: ClinicalCommand,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const replay = await this.resolveReplay<T>(actor.userId, command, false);
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
          const result = await operation(transaction);
          await transaction.idempotencyRecord.update({
            where: { userId_key: { userId: actor.userId, key: command.key } },
            data: {
              status: 'COMPLETED',
              response: result,
              completedAt: new Date(),
              ...('id' in result && typeof result.id === 'string' ? { resourceId: result.id } : {}),
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaCode(error, 'P2002')) {
        const raced = await this.resolveReplay<T>(actor.userId, command, true);
        if (raced) return raced;
      }
      if (isPrismaCode(error, 'P2034')) {
        throw new IdempotencyConflictError('The command conflicted with another transaction.');
      }
      throw error;
    }
  }

  private async resolveReplay<T extends Prisma.JsonObject>(
    userId: string,
    command: ClinicalCommand,
    wait: boolean,
  ): Promise<T | null> {
    for (let attempt = 0; attempt < (wait ? 25 : 1); attempt += 1) {
      const record = await this.db.idempotencyRecord.findUnique({
        where: { userId_key: { userId, key: command.key } },
      });
      if (!record) {
        if (!wait) return null;
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      if (record.operation !== command.operation || record.requestHash !== command.requestHash) {
        throw new IdempotencyConflictError('The idempotency key was used for a different command.');
      }
      if (record.expiresAt <= new Date()) {
        await this.db.idempotencyRecord.deleteMany({
          where: { id: record.id, expiresAt: { lte: new Date() } },
        });
        return null;
      }
      if (record.status === 'COMPLETED' && isJsonObject(record.response)) {
        return record.response as T;
      }
      if (!wait) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new IdempotencyConflictError('The original command is still in progress.');
  }
}

function toCaregiverGrantView(grant: {
  id: string;
  caseId: string;
  caregiverUserId: string;
  permissions: CaregiverPermission[];
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastAccessedAt: Date | null;
  caregiver: { email: string };
}): CaregiverGrantRecord & Prisma.JsonObject {
  return {
    id: grant.id,
    caseId: grant.caseId,
    caregiverUserId: grant.caregiverUserId,
    caregiverEmail: grant.caregiver.email,
    permissions: grant.permissions,
    grantedAt: grant.grantedAt.toISOString(),
    expiresAt: grant.expiresAt?.toISOString() ?? null,
    revokedAt: grant.revokedAt?.toISOString() ?? null,
    lastAccessedAt: grant.lastAccessedAt?.toISOString() ?? null,
  };
}

function toTreatmentPlanVersionView(
  plan: { id: string; caseId: string; clinicId: string; clinic: { name: string } },
  version: {
    id: string;
    treatmentPlanId: string;
    authoringDentistId: string;
    authoringDentist: { fullName: string };
    version: number;
    status: TreatmentPlanVersionRecord['status'];
    preliminaryAssessment: string;
    diagnosisStatement: string;
    risks: string;
    limitations: string;
    warrantyTerms: string;
    exclusions: string;
    currency: TreatmentPlanVersionRecord['currency'];
    totalMinor: bigint;
    expiresAt: Date;
    publishedAt: Date | null;
    contentChecksum: string | null;
    createdAt: Date;
    items: readonly {
      id: string;
      procedureCode: string;
      toothNumbers: number[];
      quantity: number;
      material: string | null;
      brand: string | null;
      unitPriceMinor: bigint;
      totalPriceMinor: bigint;
      sortOrder: number;
    }[];
    acceptances?: readonly { acceptedAt: Date; userId: string }[];
  },
  consentTextVersionId: string | null,
  patientUserId?: string,
): TreatmentPlanVersionRecord {
  const acceptance = patientUserId
    ? version.acceptances?.find(({ userId }) => userId === patientUserId)
    : undefined;
  return {
    id: version.id,
    treatmentPlanId: plan.id,
    caseId: plan.caseId,
    clinicId: plan.clinicId,
    clinicName: plan.clinic.name,
    authoringDentistId: version.authoringDentistId,
    authoringDentistName: version.authoringDentist.fullName,
    version: version.version,
    status: version.status,
    preliminaryAssessment: version.preliminaryAssessment,
    diagnosisStatement: version.diagnosisStatement,
    risks: version.risks,
    limitations: version.limitations,
    warrantyTerms: version.warrantyTerms,
    exclusions: version.exclusions,
    currency: version.currency,
    totalMinor: safeInteger(version.totalMinor),
    expiresAt: version.expiresAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
    contentChecksum: version.contentChecksum ?? checksumForVersion(version),
    acceptedAt: acceptance?.acceptedAt.toISOString() ?? null,
    acceptanceConsentTextVersionId: consentTextVersionId,
    items: version.items.map((item) => ({
      id: item.id,
      procedureCode: item.procedureCode,
      toothNumbers: item.toothNumbers,
      quantity: item.quantity,
      material: item.material,
      brand: item.brand,
      unitPriceMinor: safeInteger(item.unitPriceMinor),
      totalPriceMinor: safeInteger(item.totalPriceMinor),
      sortOrder: item.sortOrder,
    })),
    createdAt: version.createdAt.toISOString(),
  };
}

function toTreatmentPlanAcceptanceView(acceptance: {
  id: string;
  treatmentPlanVersionId: string;
  userId: string;
  consentTextVersionId: string;
  acceptedAt: Date;
}): TreatmentPlanAcceptanceRecord {
  return {
    id: acceptance.id,
    treatmentPlanVersionId: acceptance.treatmentPlanVersionId,
    userId: acceptance.userId,
    consentTextVersionId: acceptance.consentTextVersionId,
    acceptedAt: acceptance.acceptedAt.toISOString(),
  };
}

function toAftercarePlanView(plan: {
  id: string;
  caseId: string;
  active: boolean;
  startsAt: Date;
  completedAt: Date | null;
  checkIns: readonly {
    id: string;
    aftercarePlanId: string;
    painScale: number;
    symptomCodes: string[];
    patientNotes: string | null;
    submittedAt: Date;
    escalations: readonly {
      id: string;
      severity: string;
      matchedRuleIds: string[];
      status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
      dueAt: Date;
      resolvedAt: Date | null;
      createdAt: Date;
    }[];
  }[];
}): AftercarePlanRecord {
  return {
    id: plan.id,
    caseId: plan.caseId,
    active: plan.active,
    startsAt: plan.startsAt.toISOString(),
    completedAt: plan.completedAt?.toISOString() ?? null,
    checkIns: plan.checkIns.map((checkIn) => ({
      id: checkIn.id,
      aftercarePlanId: checkIn.aftercarePlanId,
      painScale: checkIn.painScale,
      symptomCodes: checkIn.symptomCodes,
      patientNotes: checkIn.patientNotes,
      submittedAt: checkIn.submittedAt.toISOString(),
      escalations: checkIn.escalations.map((escalation) => ({
        id: escalation.id,
        severity: escalation.severity as 'URGENT' | 'HIGH' | 'ROUTINE',
        matchedRuleIds: escalation.matchedRuleIds,
        status: escalation.status,
        dueAt: escalation.dueAt.toISOString(),
        resolvedAt: escalation.resolvedAt?.toISOString() ?? null,
        createdAt: escalation.createdAt.toISOString(),
      })),
    })),
  };
}

function checksumForVersion(version: {
  treatmentPlanId: string;
  version: number;
  authoringDentistId: string;
  preliminaryAssessment: string;
  diagnosisStatement: string;
  risks: string;
  limitations: string;
  warrantyTerms: string;
  exclusions: string;
  currency: string;
  totalMinor: bigint;
  expiresAt: Date;
  items: readonly {
    procedureCode: string;
    toothNumbers: number[];
    quantity: number;
    material: string | null;
    brand: string | null;
    unitPriceMinor: bigint;
    totalPriceMinor: bigint;
    sortOrder: number;
  }[];
}): string {
  const snapshot = {
    treatmentPlanId: version.treatmentPlanId,
    version: version.version,
    authoringDentistId: version.authoringDentistId,
    preliminaryAssessment: version.preliminaryAssessment,
    diagnosisStatement: version.diagnosisStatement,
    risks: version.risks,
    limitations: version.limitations,
    warrantyTerms: version.warrantyTerms,
    exclusions: version.exclusions,
    currency: version.currency,
    totalMinor: version.totalMinor.toString(),
    expiresAt: version.expiresAt.toISOString(),
    items: version.items.map((item) => ({
      procedureCode: item.procedureCode,
      toothNumbers: item.toothNumbers,
      quantity: item.quantity,
      material: item.material,
      brand: item.brand,
      unitPriceMinor: item.unitPriceMinor.toString(),
      totalPriceMinor: item.totalPriceMinor.toString(),
      sortOrder: item.sortOrder,
    })),
  };
  return createHash('sha256').update(stableJson(snapshot)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function safeInteger(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainRuleError(
      'MONEY_VALUE_OUT_OF_RANGE',
      'A monetary value is outside the supported API range.',
    );
  }
  return Number(value);
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

function isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === 'object';
}
