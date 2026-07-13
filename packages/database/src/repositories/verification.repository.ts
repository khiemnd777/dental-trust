import type { Prisma, PrismaClient, VerificationStatus } from '@prisma/client';

import type { AuditActor } from '@dental-trust/domain';

const verificationCaseInclude = {
  clinic: { select: { id: true, name: true, organizationId: true } },
  dentist: { select: { id: true, fullName: true, userId: true } },
  requirements: {
    orderBy: [{ required: 'desc' as const }, { createdAt: 'asc' as const }],
    include: {
      template: true,
      evidence: {
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        include: { fileAsset: true },
      },
    },
  },
  reviews: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    include: {
      reviewer: { select: { email: true } },
      secondApprover: { select: { email: true } },
    },
  },
  siteAudits: {
    orderBy: [{ scheduledAt: 'desc' as const }, { id: 'desc' as const }],
    include: { attachments: { select: { fileAssetId: true } } },
  },
  correctiveActions: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    include: { attachments: { select: { fileAssetId: true } } },
  },
} satisfies Prisma.VerificationCaseInclude;

export type VerificationCaseRecord = Prisma.VerificationCaseGetPayload<{
  include: typeof verificationCaseInclude;
}>;

export interface VerificationScope {
  readonly userId: string;
  readonly organizationIds: readonly string[];
  readonly includeAll: boolean;
}

export interface VerificationPageOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly subjectType?: 'CLINIC' | 'DENTIST';
  readonly status?: VerificationStatus;
  readonly assignedReviewerUserId?: string;
  readonly expiresBefore?: Date;
}

export interface VerificationCommand {
  readonly userId: string;
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export class VerificationResourceNotFoundError extends Error {
  constructor() {
    super('Verification resource was not found in the caller scope.');
    this.name = 'VerificationResourceNotFoundError';
  }
}

export class VerificationOptimisticConcurrencyError extends Error {
  constructor() {
    super('Verification resource changed before this command could be committed.');
    this.name = 'VerificationOptimisticConcurrencyError';
  }
}

export class VerificationIdempotencyConflictError extends Error {
  constructor(message = 'The idempotency key conflicts with another verification command.') {
    super(message);
    this.name = 'VerificationIdempotencyConflictError';
  }
}

interface MutationContext {
  readonly actor: AuditActor;
  readonly requestId: string;
  readonly command: VerificationCommand;
}

export class VerificationRepository {
  constructor(private readonly db: PrismaClient) {}

  async findClinicSubject(clinicId: string) {
    return this.db.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, organizationId: true, deletedAt: true },
    });
  }

  async findDentistSubject(dentistId: string) {
    return this.db.dentist.findUnique({
      where: { id: dentistId },
      select: {
        id: true,
        fullName: true,
        userId: true,
        affiliations: {
          where: { active: true, endedAt: null },
          select: { clinic: { select: { organizationId: true } } },
        },
      },
    });
  }

  async listTemplates(subjectType?: 'CLINIC' | 'DENTIST') {
    return this.db.verificationRequirementTemplate.findMany({
      where: { active: true, ...(subjectType ? { subjectType } : {}) },
      orderBy: [{ subjectType: 'asc' }, { code: 'asc' }],
      take: 100,
    });
  }

  async listCases(
    scope: VerificationScope,
    options: VerificationPageOptions,
  ): Promise<readonly VerificationCaseRecord[]> {
    return this.db.verificationCase.findMany({
      where: {
        AND: [
          this.scopeWhere(scope),
          ...(options.subjectType ? [{ subjectType: options.subjectType }] : []),
          ...(options.status ? [{ status: options.status }] : []),
          ...(options.assignedReviewerUserId
            ? [{ assignedReviewerUserId: options.assignedReviewerUserId }]
            : []),
          ...(options.expiresBefore ? [{ expiresAt: { lte: options.expiresBefore } }] : []),
        ],
      },
      orderBy: { id: 'desc' },
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      include: verificationCaseInclude,
    });
  }

  async getCaseScoped(
    scope: VerificationScope,
    verificationCaseId: string,
  ): Promise<VerificationCaseRecord | null> {
    return this.db.verificationCase.findFirst({
      where: { id: verificationCaseId, AND: [this.scopeWhere(scope)] },
      include: verificationCaseInclude,
    });
  }

  async getCase(verificationCaseId: string): Promise<VerificationCaseRecord | null> {
    return this.db.verificationCase.findUnique({
      where: { id: verificationCaseId },
      include: verificationCaseInclude,
    });
  }

  async getCaseByReviewScoped(
    scope: VerificationScope,
    reviewId: string,
  ): Promise<VerificationCaseRecord | null> {
    return this.db.verificationCase.findFirst({
      where: { reviews: { some: { id: reviewId } }, AND: [this.scopeWhere(scope)] },
      include: verificationCaseInclude,
    });
  }

  async getCaseBySiteAuditScoped(
    scope: VerificationScope,
    siteAuditId: string,
  ): Promise<VerificationCaseRecord | null> {
    return this.db.verificationCase.findFirst({
      where: { siteAudits: { some: { id: siteAuditId } }, AND: [this.scopeWhere(scope)] },
      include: verificationCaseInclude,
    });
  }

  async getCaseByCorrectiveActionScoped(
    scope: VerificationScope,
    correctiveActionId: string,
  ): Promise<VerificationCaseRecord | null> {
    return this.db.verificationCase.findFirst({
      where: {
        correctiveActions: { some: { id: correctiveActionId } },
        AND: [this.scopeWhere(scope)],
      },
      include: verificationCaseInclude,
    });
  }

  async isEligibleReviewer(userId: string): Promise<boolean> {
    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        accountStatus: 'ACTIVE',
        deletedAt: null,
        roles: {
          some: {
            role: { code: { in: ['VERIFICATION_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN'] } },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(user);
  }

  async ensureCase(
    input: {
      readonly subjectType: 'CLINIC' | 'DENTIST';
      readonly subjectId: string;
      readonly submitterUserId: string;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    return this.runIdempotent(context.command, async (transaction) => {
      const subjectWhere =
        input.subjectType === 'CLINIC'
          ? { clinicId: input.subjectId }
          : { dentistId: input.subjectId };
      const existing = await transaction.verificationCase.findFirst({
        where: {
          ...subjectWhere,
          status: { notIn: ['EXPIRED', 'REJECTED'] },
        },
        include: verificationCaseInclude,
      });
      if (existing) return { resourceId: existing.id, result: existing };

      const templates = await transaction.verificationRequirementTemplate.findMany({
        where: { subjectType: input.subjectType, active: true },
        orderBy: { code: 'asc' },
        take: 100,
      });
      if (templates.length === 0) throw new VerificationResourceNotFoundError();
      const verificationCase = await transaction.verificationCase.create({
        data: {
          subjectType: input.subjectType,
          ...(input.subjectType === 'CLINIC'
            ? { clinicId: input.subjectId }
            : { dentistId: input.subjectId }),
          submittedByUserId: input.submitterUserId,
          riskLevel: templates.some(({ highRisk }) => highRisk) ? 'HIGH' : 'STANDARD',
          requirements: {
            create: templates.map((template) => ({
              templateId: template.id,
              required: template.required,
              highRisk: template.highRisk,
            })),
          },
        },
        include: verificationCaseInclude,
      });
      await this.recordMutation(transaction, context, {
        action: 'verification.case.created',
        eventType: 'verification.case.created',
        caseId: verificationCase.id,
        after: {
          subjectType: verificationCase.subjectType,
          status: verificationCase.status,
          requirementCount: templates.length,
        },
      });
      return { resourceId: verificationCase.id, result: verificationCase };
    });
  }

  async assignCase(
    verificationCaseId: string,
    reviewerUserId: string,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    return this.mutateCase(verificationCaseId, context, async (transaction, current) => {
      const updated = await transaction.verificationCase.updateMany({
        where: { id: verificationCaseId, version: expectedVersion },
        data: { assignedReviewerUserId: reviewerUserId, version: { increment: 1 } },
      });
      this.assertUpdated(updated.count);
      await this.recordMutation(transaction, context, {
        action: 'verification.case.assigned',
        eventType: 'verification.case.assigned',
        caseId: verificationCaseId,
        before: {
          version: current.version,
          assignedReviewerUserId: current.assignedReviewerUserId,
        },
        after: { version: current.version + 1, assignedReviewerUserId: reviewerUserId },
      });
    });
  }

  async submitCase(
    verificationCaseId: string,
    input: {
      readonly expectedVersion: number;
      readonly submitterUserId: string;
      readonly encryptedAttestation: string;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    return this.mutateCase(verificationCaseId, context, async (transaction, current) => {
      const missing = await transaction.verificationRequirement.count({
        where: {
          verificationCaseId,
          required: true,
          evidence: { none: { revokedAt: null } },
        },
      });
      if (missing > 0) {
        throw new VerificationIdempotencyConflictError(
          'Every required verification item needs evidence before submission.',
        );
      }
      const updated = await transaction.verificationCase.updateMany({
        where: { id: verificationCaseId, version: input.expectedVersion },
        data: {
          status: 'SUBMITTED',
          submittedByUserId: input.submitterUserId,
          encryptedStatusReason: input.encryptedAttestation,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
      });
      this.assertUpdated(updated.count);
      await this.recordMutation(transaction, context, {
        action: 'verification.case.submitted',
        eventType: 'verification.case.submitted',
        caseId: verificationCaseId,
        before: { status: current.status, version: current.version },
        after: { status: 'SUBMITTED', version: current.version + 1 },
      });
    });
  }

  async addEvidence(
    verificationCaseId: string,
    input: {
      readonly expectedCaseVersion: number;
      readonly requirementId: string;
      readonly submitterUserId: string;
      readonly category: string;
      readonly fileAssetId?: string;
      readonly sourceReference?: string;
      readonly contentHash?: string;
      readonly issuedAt?: Date;
      readonly expiresAt?: Date;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    return this.mutateCase(verificationCaseId, context, async (transaction, current) => {
      const requirement = await transaction.verificationRequirement.findFirst({
        where: { id: input.requirementId, verificationCaseId },
        include: { template: { select: { category: true } } },
      });
      if (!requirement || requirement.template.category !== input.category) {
        throw new VerificationResourceNotFoundError();
      }
      const versionUpdate = await transaction.verificationCase.updateMany({
        where: { id: verificationCaseId, version: input.expectedCaseVersion },
        data: { version: { increment: 1 } },
      });
      this.assertUpdated(versionUpdate.count);
      const evidence = await transaction.verificationEvidence.create({
        data: {
          verificationCaseId,
          requirementId: input.requirementId,
          submittedByUserId: input.submitterUserId,
          category: input.category,
          ...(input.fileAssetId ? { fileAssetId: input.fileAssetId } : {}),
          ...(input.sourceReference ? { sourceReference: input.sourceReference } : {}),
          ...(input.contentHash ? { contentHash: input.contentHash } : {}),
          ...(input.issuedAt ? { issuedAt: input.issuedAt } : {}),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        },
      });
      await transaction.verificationRequirement.update({
        where: { id: requirement.id },
        data: { status: 'PROVIDED' },
      });
      await this.recordMutation(transaction, context, {
        action: 'verification.evidence.added',
        eventType: 'verification.evidence.added',
        caseId: verificationCaseId,
        resourceType: 'VerificationEvidence',
        resourceId: evidence.id,
        after: {
          caseVersion: current.version + 1,
          requirementId: requirement.id,
          category: input.category,
          hasFile: Boolean(input.fileAssetId),
          hasSource: Boolean(input.sourceReference),
        },
      });
    });
  }

  async reviewEvidence(
    verificationCaseId: string,
    evidenceId: string,
    input: {
      readonly decision: 'APPROVE' | 'REJECT' | 'REVOKE';
      readonly reviewerUserId: string;
      readonly expectedCaseVersion: number;
      readonly encryptedNotes: string;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    return this.mutateCase(verificationCaseId, context, async (transaction, current) => {
      const evidence = await transaction.verificationEvidence.findFirst({
        where: { id: evidenceId, verificationCaseId },
      });
      if (!evidence) throw new VerificationResourceNotFoundError();
      const versionUpdate = await transaction.verificationCase.updateMany({
        where: { id: verificationCaseId, version: input.expectedCaseVersion },
        data: { version: { increment: 1 }, encryptedStatusReason: input.encryptedNotes },
      });
      this.assertUpdated(versionUpdate.count);
      const now = new Date();
      if (input.decision === 'APPROVE') {
        await transaction.verificationEvidence.update({
          where: { id: evidenceId },
          data: { approvedByUserId: input.reviewerUserId, approvedAt: now },
        });
        await transaction.verificationRequirement.update({
          where: { id: evidence.requirementId },
          data: { status: 'APPROVED' },
        });
      } else if (input.decision === 'REVOKE') {
        await transaction.verificationEvidence.update({
          where: { id: evidenceId },
          data: { revokedAt: now },
        });
        await transaction.verificationRequirement.update({
          where: { id: evidence.requirementId },
          data: { status: 'REJECTED' },
        });
      } else {
        await transaction.verificationRequirement.update({
          where: { id: evidence.requirementId },
          data: { status: 'REJECTED' },
        });
      }
      await this.recordMutation(transaction, context, {
        action: `verification.evidence.${input.decision.toLowerCase()}`,
        eventType: 'verification.evidence.reviewed',
        caseId: verificationCaseId,
        resourceType: 'VerificationEvidence',
        resourceId: evidenceId,
        before: { caseVersion: current.version },
        after: { caseVersion: current.version + 1, decision: input.decision },
      });
    });
  }

  async proposeDecision(
    verificationCaseId: string,
    input: {
      readonly reviewId: string;
      readonly toStatus: VerificationStatus;
      readonly reviewerUserId: string;
      readonly expectedVersion: number;
      readonly encryptedNotes: string;
      readonly fourEyesRequired: boolean;
      readonly expiresAt?: Date;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    return this.mutateCase(verificationCaseId, context, async (transaction, current) => {
      if (current.version !== input.expectedVersion) this.assertUpdated(0);
      const nextVersion = current.version + 1;
      await transaction.verificationReview.create({
        data: {
          id: input.reviewId,
          verificationCaseId,
          reviewerUserId: input.reviewerUserId,
          caseVersion: nextVersion,
          fromStatus: current.status,
          toStatus: input.toStatus,
          status: input.fourEyesRequired ? 'PENDING_SECOND_APPROVAL' : 'APPLIED',
          fourEyesRequired: input.fourEyesRequired,
          encryptedNotes: input.encryptedNotes,
          ...(!input.fourEyesRequired ? { appliedAt: new Date() } : {}),
        },
      });
      if (!input.fourEyesRequired) {
        const update = await transaction.verificationCase.updateMany({
          where: { id: verificationCaseId, version: input.expectedVersion },
          data: {
            status: input.toStatus,
            version: { increment: 1 },
            encryptedStatusReason: input.encryptedNotes,
            decidedAt: new Date(),
            ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          },
        });
        this.assertUpdated(update.count);
        await this.updateSubjectProjection(transaction, current, input.toStatus);
      }
      await this.recordMutation(transaction, context, {
        action: input.fourEyesRequired
          ? 'verification.decision.proposed'
          : 'verification.decision.applied',
        eventType: input.fourEyesRequired
          ? 'verification.decision.second-approval-required'
          : 'verification.status.changed',
        caseId: verificationCaseId,
        before: { status: current.status, version: current.version },
        after: {
          proposedStatus: input.toStatus,
          caseVersion: input.fourEyesRequired ? current.version : nextVersion,
          reviewVersion: nextVersion,
          fourEyesRequired: input.fourEyesRequired,
        },
      });
    });
  }

  async secondApprove(
    reviewId: string,
    input: {
      readonly approverUserId: string;
      readonly approve: boolean;
      readonly expectedCaseVersion: number;
      readonly encryptedNotes: string;
      readonly expiresAt?: Date;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    const review = await this.db.verificationReview.findUnique({
      where: { id: reviewId },
      select: { verificationCaseId: true },
    });
    if (!review) throw new VerificationResourceNotFoundError();
    return this.mutateCase(review.verificationCaseId, context, async (transaction, current) => {
      const pending = await transaction.verificationReview.findFirst({
        where: {
          id: reviewId,
          verificationCaseId: current.id,
          status: 'PENDING_SECOND_APPROVAL',
          caseVersion: current.version + 1,
        },
      });
      if (!pending) throw new VerificationOptimisticConcurrencyError();
      if (current.version !== input.expectedCaseVersion) this.assertUpdated(0);
      await transaction.verificationReview.update({
        where: { id: reviewId },
        data: {
          status: input.approve ? 'APPLIED' : 'REJECTED',
          secondApproverUserId: input.approverUserId,
          encryptedSecondApprovalNotes: input.encryptedNotes,
          ...(input.approve ? { appliedAt: new Date() } : {}),
        },
      });
      const update = await transaction.verificationCase.updateMany({
        where: { id: current.id, version: input.expectedCaseVersion },
        data: {
          version: { increment: 1 },
          ...(input.approve
            ? {
                status: pending.toStatus,
                encryptedStatusReason: input.encryptedNotes,
                decidedAt: new Date(),
                ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
              }
            : {}),
        },
      });
      this.assertUpdated(update.count);
      if (input.approve) await this.updateSubjectProjection(transaction, current, pending.toStatus);
      await this.recordMutation(transaction, context, {
        action: input.approve
          ? 'verification.decision.second-approved'
          : 'verification.decision.second-rejected',
        eventType: input.approve ? 'verification.status.changed' : 'verification.decision.rejected',
        caseId: current.id,
        before: { status: current.status, version: current.version },
        after: {
          status: input.approve ? pending.toStatus : current.status,
          version: current.version + 1,
          reviewId,
        },
      });
    });
  }

  async createSiteAudit(
    verificationCaseId: string,
    input: {
      readonly expectedCaseVersion: number;
      readonly clinicId: string;
      readonly clinicLocationId: string;
      readonly scheduledByUserId: string;
      readonly auditorUserId: string;
      readonly scheduledAt: Date;
      readonly checklist: Prisma.InputJsonObject;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    return this.mutateCase(verificationCaseId, context, async (transaction, current) => {
      const version = await transaction.verificationCase.updateMany({
        where: { id: verificationCaseId, version: input.expectedCaseVersion },
        data: { version: { increment: 1 } },
      });
      this.assertUpdated(version.count);
      const siteAudit = await transaction.siteAudit.create({
        data: {
          verificationCaseId,
          clinicId: input.clinicId,
          clinicLocationId: input.clinicLocationId,
          scheduledByUserId: input.scheduledByUserId,
          auditorUserId: input.auditorUserId,
          scheduledAt: input.scheduledAt,
          checklist: input.checklist,
        },
      });
      await this.recordMutation(transaction, context, {
        action: 'verification.site-audit.scheduled',
        eventType: 'verification.site-audit.scheduled',
        caseId: verificationCaseId,
        resourceType: 'SiteAudit',
        resourceId: siteAudit.id,
        after: { caseVersion: current.version + 1, scheduledAt: input.scheduledAt.toISOString() },
      });
    });
  }

  async completeSiteAudit(
    siteAuditId: string,
    input: {
      readonly expectedCaseVersion: number;
      readonly encryptedFindings: string;
      readonly checklist: Prisma.InputJsonObject;
      readonly attachmentFileAssetIds: readonly string[];
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    const audit = await this.db.siteAudit.findUnique({
      where: { id: siteAuditId },
      select: { verificationCaseId: true },
    });
    if (!audit) throw new VerificationResourceNotFoundError();
    return this.mutateCase(audit.verificationCaseId, context, async (transaction, current) => {
      await this.assertCleanFiles(transaction, input.attachmentFileAssetIds, context.actor.userId);
      const version = await transaction.verificationCase.updateMany({
        where: { id: current.id, version: input.expectedCaseVersion },
        data: { version: { increment: 1 } },
      });
      this.assertUpdated(version.count);
      const updated = await transaction.siteAudit.updateMany({
        where: { id: siteAuditId, verificationCaseId: current.id },
        data: {
          status: 'COMPLETED',
          encryptedFindings: input.encryptedFindings,
          checklist: input.checklist,
          completedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new VerificationResourceNotFoundError();
      if (input.attachmentFileAssetIds.length > 0) {
        await transaction.siteAuditAttachment.createMany({
          data: [...new Set(input.attachmentFileAssetIds)].map((fileAssetId) => ({
            siteAuditId,
            fileAssetId,
          })),
          skipDuplicates: true,
        });
      }
      await this.recordMutation(transaction, context, {
        action: 'verification.site-audit.completed',
        eventType: 'verification.site-audit.completed',
        caseId: current.id,
        resourceType: 'SiteAudit',
        resourceId: siteAuditId,
        after: {
          caseVersion: current.version + 1,
          attachmentCount: input.attachmentFileAssetIds.length,
        },
      });
    });
  }

  async createCorrectiveAction(
    verificationCaseId: string,
    input: {
      readonly expectedCaseVersion: number;
      readonly correctiveActionId: string;
      readonly requirementId?: string;
      readonly requestedByUserId: string;
      readonly title: string;
      readonly encryptedDescription: string;
      readonly dueAt: Date;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    return this.mutateCase(verificationCaseId, context, async (transaction, current) => {
      const version = await transaction.verificationCase.updateMany({
        where: { id: verificationCaseId, version: input.expectedCaseVersion },
        data: { version: { increment: 1 } },
      });
      this.assertUpdated(version.count);
      const action = await transaction.correctiveAction.create({
        data: {
          id: input.correctiveActionId,
          verificationCaseId,
          ...(input.requirementId ? { requirementId: input.requirementId } : {}),
          requestedByUserId: input.requestedByUserId,
          title: input.title,
          encryptedDescription: input.encryptedDescription,
          dueAt: input.dueAt,
        },
      });
      await this.recordMutation(transaction, context, {
        action: 'verification.corrective-action.created',
        eventType: 'verification.corrective-action.created',
        caseId: verificationCaseId,
        resourceType: 'CorrectiveAction',
        resourceId: action.id,
        after: { caseVersion: current.version + 1, dueAt: input.dueAt.toISOString() },
      });
    });
  }

  async respondCorrectiveAction(
    correctiveActionId: string,
    input: {
      readonly expectedVersion: number;
      readonly expectedCaseVersion: number;
      readonly encryptedResponse: string;
      readonly attachmentFileAssetIds: readonly string[];
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    const action = await this.db.correctiveAction.findUnique({
      where: { id: correctiveActionId },
      select: { verificationCaseId: true },
    });
    if (!action) throw new VerificationResourceNotFoundError();
    return this.mutateCase(action.verificationCaseId, context, async (transaction, current) => {
      await this.assertCleanFiles(transaction, input.attachmentFileAssetIds, context.actor.userId);
      const caseVersion = await transaction.verificationCase.updateMany({
        where: { id: current.id, version: input.expectedCaseVersion },
        data: { version: { increment: 1 } },
      });
      this.assertUpdated(caseVersion.count);
      const updated = await transaction.correctiveAction.updateMany({
        where: {
          id: correctiveActionId,
          version: input.expectedVersion,
          status: { in: ['OPEN', 'REJECTED'] },
        },
        data: {
          encryptedResponse: input.encryptedResponse,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          resolvedAt: null,
          version: { increment: 1 },
        },
      });
      this.assertUpdated(updated.count);
      if (input.attachmentFileAssetIds.length > 0) {
        await transaction.correctiveActionAttachment.createMany({
          data: [...new Set(input.attachmentFileAssetIds)].map((fileAssetId) => ({
            correctiveActionId,
            fileAssetId,
          })),
          skipDuplicates: true,
        });
      }
      await this.recordMutation(transaction, context, {
        action: 'verification.corrective-action.responded',
        eventType: 'verification.corrective-action.responded',
        caseId: current.id,
        resourceType: 'CorrectiveAction',
        resourceId: correctiveActionId,
        after: {
          caseVersion: current.version + 1,
          actionVersion: input.expectedVersion + 1,
          attachmentCount: input.attachmentFileAssetIds.length,
        },
      });
    });
  }

  async decideCorrectiveAction(
    correctiveActionId: string,
    input: {
      readonly expectedVersion: number;
      readonly expectedCaseVersion: number;
      readonly decision: 'ACCEPT' | 'REJECT' | 'CLOSE';
      readonly encryptedNotes: string;
    },
    context: MutationContext,
  ): Promise<VerificationCaseRecord> {
    const action = await this.db.correctiveAction.findUnique({
      where: { id: correctiveActionId },
      select: { verificationCaseId: true },
    });
    if (!action) throw new VerificationResourceNotFoundError();
    return this.mutateCase(action.verificationCaseId, context, async (transaction, current) => {
      const caseVersion = await transaction.verificationCase.updateMany({
        where: { id: current.id, version: input.expectedCaseVersion },
        data: { version: { increment: 1 } },
      });
      this.assertUpdated(caseVersion.count);
      const target =
        input.decision === 'ACCEPT'
          ? ('ACCEPTED' as const)
          : input.decision === 'CLOSE'
            ? ('CLOSED' as const)
            : ('REJECTED' as const);
      const updated = await transaction.correctiveAction.updateMany({
        where: {
          id: correctiveActionId,
          version: input.expectedVersion,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED'] },
        },
        data: {
          status: target,
          encryptedDecisionNotes: input.encryptedNotes,
          ...(target === 'ACCEPTED' || target === 'CLOSED'
            ? { resolvedAt: new Date() }
            : { resolvedAt: null }),
          version: { increment: 1 },
        },
      });
      this.assertUpdated(updated.count);
      await this.recordMutation(transaction, context, {
        action: `verification.corrective-action.${input.decision.toLowerCase()}`,
        eventType: 'verification.corrective-action.decided',
        caseId: current.id,
        resourceType: 'CorrectiveAction',
        resourceId: correctiveActionId,
        after: {
          decision: input.decision,
          caseVersion: current.version + 1,
          actionVersion: input.expectedVersion + 1,
        },
      });
    });
  }

  async listCasesForExpiryMaintenance(now: Date, reminderCutoff: Date) {
    return this.db.verificationCase.findMany({
      where: {
        status: { in: ['VERIFIED', 'VERIFICATION_EXPIRING'] },
        expiresAt: { gt: now, lte: reminderCutoff },
      },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: 500,
      select: {
        id: true,
        subjectType: true,
        clinicId: true,
        dentistId: true,
        status: true,
        version: true,
        expiresAt: true,
        submittedByUserId: true,
      },
    });
  }

  private async mutateCase(
    verificationCaseId: string,
    context: MutationContext,
    work: (transaction: Prisma.TransactionClient, current: VerificationCaseRecord) => Promise<void>,
  ): Promise<VerificationCaseRecord> {
    return this.runIdempotent(context.command, async (transaction) => {
      const current = await transaction.verificationCase.findUnique({
        where: { id: verificationCaseId },
        include: verificationCaseInclude,
      });
      if (!current) throw new VerificationResourceNotFoundError();
      await work(transaction, current);
      const result = await transaction.verificationCase.findUniqueOrThrow({
        where: { id: verificationCaseId },
        include: verificationCaseInclude,
      });
      return { resourceId: verificationCaseId, result };
    });
  }

  private async updateSubjectProjection(
    transaction: Prisma.TransactionClient,
    current: VerificationCaseRecord,
    status: VerificationStatus,
  ): Promise<void> {
    if (current.subjectType === 'CLINIC' && current.clinicId) {
      await transaction.clinic.update({
        where: { id: current.clinicId },
        data: {
          verificationStatus: status,
          ...(status === 'VERIFIED' ? { verifiedAt: new Date() } : {}),
        },
      });
    } else if (current.subjectType === 'DENTIST' && current.dentistId) {
      await transaction.dentist.update({
        where: { id: current.dentistId },
        data: { licenseStatus: status },
      });
    }
  }

  private async assertCleanFiles(
    transaction: Prisma.TransactionClient,
    fileAssetIds: readonly string[],
    ownerUserId: string,
  ): Promise<void> {
    const ids = [...new Set(fileAssetIds)];
    if (ids.length === 0) return;
    const count = await transaction.fileAsset.count({
      where: {
        id: { in: ids },
        status: 'AVAILABLE',
        scanStatus: 'CLEAN',
        deletedAt: null,
        ownerUserId,
      },
    });
    if (count !== ids.length) throw new VerificationResourceNotFoundError();
  }

  private scopeWhere(scope: VerificationScope): Prisma.VerificationCaseWhereInput {
    if (scope.includeAll) return {};
    return {
      OR: [
        ...(scope.organizationIds.length > 0
          ? [
              { clinic: { organizationId: { in: [...scope.organizationIds] } } },
              {
                dentist: {
                  affiliations: {
                    some: {
                      active: true,
                      endedAt: null,
                      clinic: { organizationId: { in: [...scope.organizationIds] } },
                    },
                  },
                },
              },
            ]
          : []),
        { dentist: { userId: scope.userId } },
      ],
    };
  }

  private assertUpdated(count: number): void {
    if (count !== 1) throw new VerificationOptimisticConcurrencyError();
  }

  private async recordMutation(
    transaction: Prisma.TransactionClient,
    context: MutationContext,
    input: {
      readonly action: string;
      readonly eventType: string;
      readonly caseId: string;
      readonly resourceType?: string;
      readonly resourceId?: string;
      readonly before?: Prisma.InputJsonObject;
      readonly after?: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        actorUserId: context.actor.userId,
        ...(context.actor.impersonatorUserId
          ? { impersonatorUserId: context.actor.impersonatorUserId }
          : {}),
        ...(context.actor.organizationId ? { organizationId: context.actor.organizationId } : {}),
        action: input.action,
        resourceType: input.resourceType ?? 'VerificationCase',
        resourceId: input.resourceId ?? input.caseId,
        requestId: context.requestId,
        success: true,
        ...(input.before ? { beforeMetadata: input.before } : {}),
        ...(input.after ? { afterMetadata: input.after } : {}),
      },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'VerificationCase',
        aggregateId: input.caseId,
        eventType: input.eventType,
        payload: {
          verificationCaseId: input.caseId,
          resourceType: input.resourceType ?? 'VerificationCase',
          resourceId: input.resourceId ?? input.caseId,
        },
        correlationId: context.requestId,
        idempotencyKey: `${context.command.operation}:${context.command.key}:event`,
      },
    });
  }

  private async runIdempotent(
    command: VerificationCommand,
    work: (
      transaction: Prisma.TransactionClient,
    ) => Promise<{ readonly resourceId: string; readonly result: VerificationCaseRecord }>,
  ): Promise<VerificationCaseRecord> {
    const replayId = await this.resolveReplay(command, false);
    if (replayId) {
      const replay = await this.getCase(replayId);
      if (replay) return replay;
      throw new VerificationIdempotencyConflictError(
        'The original verification resource no longer exists.',
      );
    }
    return this.db
      .$transaction(async (transaction) => {
        await transaction.idempotencyRecord.create({
          data: {
            userId: command.userId,
            key: command.key,
            operation: command.operation,
            requestHash: command.requestHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          },
        });
        const outcome = await work(transaction);
        await transaction.idempotencyRecord.update({
          where: { userId_key: { userId: command.userId, key: command.key } },
          data: {
            status: 'COMPLETED',
            resourceId: outcome.resourceId,
            response: { resourceId: outcome.resourceId },
            completedAt: new Date(),
          },
        });
        return outcome.result;
      })
      .catch(async (error: unknown) => {
        if (!isIdempotencyInsertRace(error)) throw error;
        const replayId = await this.resolveReplay(command, true);
        if (replayId) {
          const replay = await this.getCase(replayId);
          if (replay) return replay;
        }
        throw new VerificationIdempotencyConflictError();
      });
  }

  private async resolveReplay(
    command: VerificationCommand,
    waitForCompletion: boolean,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < (waitForCompletion ? 25 : 1); attempt += 1) {
      const record = await this.db.idempotencyRecord.findUnique({
        where: { userId_key: { userId: command.userId, key: command.key } },
      });
      if (!record) {
        if (!waitForCompletion) return null;
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      if (record.operation !== command.operation || record.requestHash !== command.requestHash) {
        throw new VerificationIdempotencyConflictError(
          'The idempotency key was used with a different request.',
        );
      }
      if (record.expiresAt <= new Date()) {
        await this.db.idempotencyRecord.deleteMany({
          where: { id: record.id, expiresAt: { lte: new Date() } },
        });
        return null;
      }
      if (record.status === 'COMPLETED' && record.resourceId) return record.resourceId;
      if (record.status === 'FAILED') {
        await this.db.idempotencyRecord.deleteMany({ where: { id: record.id, status: 'FAILED' } });
        return null;
      }
      if (!waitForCompletion) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new VerificationIdempotencyConflictError(
      'The original verification command is still in progress; retry shortly.',
    );
  }
}

function isIdempotencyInsertRace(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') {
    return false;
  }
  const metadata = 'meta' in error ? error.meta : undefined;
  if (!metadata || typeof metadata !== 'object' || !('target' in metadata)) return false;
  const target = metadata.target;
  const fields = Array.isArray(target)
    ? target.filter((value): value is string => typeof value === 'string')
    : typeof target === 'string'
      ? [target]
      : [];
  return (
    fields.some((field) => field.toLowerCase().includes('user')) &&
    fields.some((field) => field.toLowerCase().includes('key'))
  );
}
