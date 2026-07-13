import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { hasPermission, requiresMfa, type AccessContext } from '@dental-trust/auth';
import type {
  AddVerificationEvidence,
  AssignVerificationCase,
  CompleteSiteAudit,
  CorrectiveActionView,
  CreateCorrectiveAction,
  CreateSiteAudit,
  CreateVerificationCase,
  DecideCorrectiveAction,
  DecideVerificationCase,
  RespondCorrectiveAction,
  ReviewVerificationEvidence,
  SecondApproval,
  SiteAuditView,
  SubmitVerificationCase,
  VerificationCaseDetail,
  VerificationCaseListQuery,
  VerificationCaseSummary,
  VerificationEvidenceAccessView,
  VerificationEvidenceView,
  VerificationRequirementTemplateView,
  VerificationRequirementView,
  VerificationReviewView,
} from '@dental-trust/contracts';
import { VerificationRepository } from '@dental-trust/database';
import type { Prisma, PrismaClient, VerificationCaseRecord } from '@dental-trust/database';
import {
  assertIndependentVerificationActors,
  assertVerificationTransition,
  requiresFourEyes,
} from '@dental-trust/domain';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';
import type { ServerEnvironment } from '@dental-trust/config/server';
import { PrivateObjectStorageProvider } from '../infrastructure/providers/private-object-storage.provider.js';

@Injectable()
export class VerificationService {
  private readonly verification: VerificationRepository;
  private readonly cipher: SensitiveFieldCipher;
  private readonly storage: PrivateObjectStorageProvider;

  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(SERVER_ENV) environment: ServerEnvironment,
  ) {
    this.verification = new VerificationRepository(this.db);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
    this.storage = new PrivateObjectStorageProvider(environment);
  }

  async listTemplates(
    access: AccessContext,
    subjectType?: 'CLINIC' | 'DENTIST',
  ): Promise<readonly VerificationRequirementTemplateView[]> {
    this.assertRead(access);
    const templates = await this.verification.listTemplates(subjectType);
    return templates.map((template) => ({
      id: template.id,
      code: template.code,
      subjectType: template.subjectType,
      category: verificationCategory(template.category),
      names: localizedMap(template.names),
      descriptions: localizedMap(template.descriptions),
      required: template.required,
      highRisk: template.highRisk,
      validityDays: template.validityDays,
      version: template.version,
    }));
  }

  async listCases(
    access: AccessContext,
    query: VerificationCaseListQuery,
  ): Promise<{
    readonly data: readonly VerificationCaseSummary[];
    readonly nextCursor: string | null;
  }> {
    this.assertRead(access);
    const records = await this.verification.listCases(scopeFor(access), {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.subjectType ? { subjectType: query.subjectType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToMe ? { assignedReviewerUserId: access.userId } : {}),
      ...(query.expiresBefore ? { expiresBefore: new Date(query.expiresBefore) } : {}),
    });
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map(toSummary),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async getCase(
    access: AccessContext,
    verificationCaseId: string,
  ): Promise<VerificationCaseDetail> {
    this.assertRead(access);
    const record = await this.verification.getCaseScoped(scopeFor(access), verificationCaseId);
    if (!record) throw new NotFoundException();
    return this.toDetail(access, record);
  }

  async accessEvidence(
    access: AccessContext,
    verificationCaseId: string,
    evidenceId: string,
  ): Promise<VerificationEvidenceAccessView> {
    this.assertRead(access);
    const record = await this.verification.getCaseScoped(scopeFor(access), verificationCaseId);
    if (!record) throw new NotFoundException();
    const evidence = record.requirements
      .flatMap((requirement) => requirement.evidence)
      .find(({ id }) => id === evidenceId);
    if (!evidence) throw new NotFoundException();

    if (!evidence.fileAsset) {
      if (!evidence.sourceReference) throw new NotFoundException();
      return { kind: 'SOURCE', sourceReference: evidence.sourceReference };
    }
    if (evidence.fileAsset.status !== 'AVAILABLE' || evidence.fileAsset.scanStatus !== 'CLEAN') {
      throw new ConflictException('The evidence file is not clean and available.');
    }

    const download = await this.storage.createPrivateDownload(evidence.fileAsset.objectKey);
    await this.db.auditLog.create({
      data: {
        actorUserId: access.userId,
        ...(record.clinic?.organizationId ? { organizationId: record.clinic.organizationId } : {}),
        action: 'verification.evidence.download-authorized',
        resourceType: 'VerificationEvidence',
        resourceId: evidence.id,
        requestId: access.requestId,
        success: true,
        afterMetadata: { verificationCaseId, fileAssetId: evidence.fileAsset.id },
      },
    });
    return {
      kind: 'FILE',
      downloadUrl: download.signedUrl,
      expiresAt: download.expiresAt.toISOString(),
      fileName: evidence.fileAsset.originalFileName,
      mediaType: evidence.fileAsset.detectedMediaType ?? evidence.fileAsset.declaredMediaType,
    };
  }

  async getSiteAuditCase(
    access: AccessContext,
    siteAuditId: string,
  ): Promise<VerificationCaseDetail> {
    this.assertRead(access);
    const record = await this.verification.getCaseBySiteAuditScoped(scopeFor(access), siteAuditId);
    if (!record) throw new NotFoundException();
    return this.toDetail(access, record);
  }

  async getCorrectiveActionCase(
    access: AccessContext,
    correctiveActionId: string,
  ): Promise<VerificationCaseDetail> {
    this.assertRead(access);
    const record = await this.verification.getCaseByCorrectiveActionScoped(
      scopeFor(access),
      correctiveActionId,
    );
    if (!record) throw new NotFoundException();
    return this.toDetail(access, record);
  }

  async createCase(
    access: AccessContext,
    input: CreateVerificationCase,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertApplicantMutation(access);
    await this.assertSubjectOwnership(access, input.subjectType, input.subjectId);
    const record = await this.verification.ensureCase(
      {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        submitterUserId: access.userId,
      },
      mutationContext(access, idempotencyKey, 'verification.case.ensure', input),
    );
    return this.toDetail(access, record);
  }

  async ensureClinicCase(
    access: AccessContext,
    clinicId: string,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    return this.createCase(access, { subjectType: 'CLINIC', subjectId: clinicId }, idempotencyKey);
  }

  async assignCase(
    access: AccessContext,
    verificationCaseId: string,
    input: AssignVerificationCase,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertReviewerMutation(access, 'verification:review');
    const current = await this.loadReviewerCase(access, verificationCaseId, false);
    this.assertNoPendingDecision(current);
    if (!(await this.verification.isEligibleReviewer(input.reviewerUserId))) {
      throw new ForbiddenException();
    }
    const record = await this.verification.assignCase(
      current.id,
      input.reviewerUserId,
      input.expectedVersion,
      mutationContext(access, idempotencyKey, 'verification.case.assign', {
        verificationCaseId,
        ...input,
      }),
    );
    return this.toDetail(access, record);
  }

  async addEvidence(
    access: AccessContext,
    verificationCaseId: string,
    input: AddVerificationEvidence,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertApplicantMutation(access);
    const current = await this.loadApplicantCase(access, verificationCaseId);
    if (!['DRAFT', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(current.status)) {
      throw new ForbiddenException();
    }
    const record = await this.verification.addEvidence(
      verificationCaseId,
      {
        expectedCaseVersion: input.expectedCaseVersion,
        requirementId: input.requirementId,
        submitterUserId: access.userId,
        category: input.category,
        ...(input.fileAssetId ? { fileAssetId: input.fileAssetId } : {}),
        ...(input.sourceReference ? { sourceReference: input.sourceReference } : {}),
        ...(input.contentHash ? { contentHash: input.contentHash } : {}),
        ...(input.issuedAt ? { issuedAt: dateOnly(input.issuedAt) } : {}),
        ...(input.expiresAt ? { expiresAt: dateOnly(input.expiresAt) } : {}),
      },
      mutationContext(access, idempotencyKey, 'verification.evidence.add', {
        verificationCaseId,
        ...input,
      }),
    );
    return this.toDetail(access, record);
  }

  async submitCase(
    access: AccessContext,
    verificationCaseId: string,
    input: SubmitVerificationCase,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertApplicantMutation(access);
    const current = await this.loadApplicantCase(access, verificationCaseId);
    assertVerificationTransition(current.status, 'SUBMITTED');
    const record = await this.verification.submitCase(
      verificationCaseId,
      {
        expectedVersion: input.expectedVersion,
        submitterUserId: access.userId,
        encryptedAttestation: this.cipher.encrypt(
          input.attestation,
          caseStatusReasonContext(verificationCaseId),
        ),
      },
      mutationContext(access, idempotencyKey, 'verification.case.submit', {
        verificationCaseId,
        expectedVersion: input.expectedVersion,
      }),
    );
    return this.toDetail(access, record);
  }

  async submitClinicCase(
    access: AccessContext,
    verificationCaseId: string,
    input: SubmitVerificationCase,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    const current = await this.loadApplicantCase(access, verificationCaseId);
    if (current.subjectType !== 'CLINIC') throw new NotFoundException();
    return this.submitCase(access, verificationCaseId, input, idempotencyKey);
  }

  async reviewEvidence(
    access: AccessContext,
    verificationCaseId: string,
    evidenceId: string,
    input: ReviewVerificationEvidence,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertReviewerMutation(access, 'verification:review');
    await this.loadReviewerCase(access, verificationCaseId, true);
    const record = await this.verification.reviewEvidence(
      verificationCaseId,
      evidenceId,
      {
        decision: input.decision,
        reviewerUserId: access.userId,
        expectedCaseVersion: input.expectedCaseVersion,
        encryptedNotes: this.cipher.encrypt(
          input.notes,
          caseStatusReasonContext(verificationCaseId),
        ),
      },
      mutationContext(access, idempotencyKey, 'verification.evidence.review', {
        verificationCaseId,
        evidenceId,
        decision: input.decision,
        expectedCaseVersion: input.expectedCaseVersion,
      }),
    );
    return this.toDetail(access, record);
  }

  async decideCase(
    access: AccessContext,
    verificationCaseId: string,
    input: DecideVerificationCase,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertReviewerMutation(
      access,
      input.toStatus === 'SUSPENDED' ? 'verification:suspend' : 'verification:review',
    );
    const current = await this.loadReviewerCase(access, verificationCaseId, true);
    assertVerificationTransition(current.status, input.toStatus);
    assertIndependentVerificationActors(current.submittedByUserId ?? undefined, access.userId);
    const fourEyesRequired = requiresFourEyes(current.status, input.toStatus);
    if (fourEyesRequired && !hasPermission(access, 'verification:approve')) {
      throw new ForbiddenException();
    }
    if (
      input.toStatus === 'VERIFIED' &&
      (!input.expiresAt || new Date(input.expiresAt) <= new Date())
    ) {
      throw new ForbiddenException();
    }
    const reviewId = randomUUID();
    const record = await this.verification.proposeDecision(
      verificationCaseId,
      {
        reviewId,
        toStatus: input.toStatus,
        reviewerUserId: access.userId,
        expectedVersion: input.expectedVersion,
        encryptedNotes: this.cipher.encrypt(input.notes, reviewNotesContext(reviewId)),
        fourEyesRequired,
        ...(input.expiresAt && !fourEyesRequired ? { expiresAt: new Date(input.expiresAt) } : {}),
      },
      mutationContext(access, idempotencyKey, 'verification.case.decide', {
        verificationCaseId,
        toStatus: input.toStatus,
        expectedVersion: input.expectedVersion,
        fourEyesRequired,
      }),
    );
    return this.toDetail(access, record);
  }

  async secondApprove(
    access: AccessContext,
    reviewId: string,
    input: SecondApproval,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertReviewerMutation(access, 'verification:approve');
    const current = await this.verification.getCaseByReviewScoped(scopeFor(access), reviewId);
    if (!current) throw new NotFoundException();
    const review = current.reviews.find(({ id }) => id === reviewId);
    if (!review || review.status !== 'PENDING_SECOND_APPROVAL') throw new NotFoundException();
    assertIndependentVerificationActors(
      current.submittedByUserId ?? undefined,
      review.reviewerUserId,
      access.userId,
    );
    if (
      input.approve &&
      review.toStatus === 'VERIFIED' &&
      (!input.expiresAt || new Date(input.expiresAt) <= new Date())
    ) {
      throw new ForbiddenException();
    }
    const record = await this.verification.secondApprove(
      reviewId,
      {
        approverUserId: access.userId,
        approve: input.approve,
        expectedCaseVersion: input.expectedCaseVersion,
        encryptedNotes: this.cipher.encrypt(input.notes, secondApprovalContext(reviewId)),
        ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
      },
      mutationContext(access, idempotencyKey, 'verification.decision.second-approval', {
        reviewId,
        approve: input.approve,
        expectedCaseVersion: input.expectedCaseVersion,
      }),
    );
    return this.toDetail(access, record);
  }

  async createSiteAudit(
    access: AccessContext,
    verificationCaseId: string,
    input: CreateSiteAudit,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertReviewerMutation(access, 'verification:audit');
    const current = await this.loadReviewerCase(access, verificationCaseId, true);
    if (current.subjectType !== 'CLINIC' || !current.clinicId) throw new ForbiddenException();
    if (!(await this.verification.isEligibleReviewer(input.auditorUserId))) {
      throw new ForbiddenException();
    }
    const record = await this.verification.createSiteAudit(
      verificationCaseId,
      {
        expectedCaseVersion: input.expectedCaseVersion,
        clinicId: current.clinicId,
        clinicLocationId: input.clinicLocationId,
        scheduledByUserId: access.userId,
        auditorUserId: input.auditorUserId,
        scheduledAt: new Date(input.scheduledAt),
        checklist: input.checklist as Prisma.InputJsonObject,
      },
      mutationContext(access, idempotencyKey, 'verification.site-audit.create', {
        verificationCaseId,
        ...input,
      }),
    );
    return this.toDetail(access, record);
  }

  async completeSiteAudit(
    access: AccessContext,
    siteAuditId: string,
    input: CompleteSiteAudit,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertReviewerMutation(access, 'verification:audit');
    const current = await this.verification.getCaseBySiteAuditScoped(scopeFor(access), siteAuditId);
    if (!current) throw new NotFoundException();
    this.assertNoPendingDecision(current);
    const audit = current.siteAudits.find(({ id }) => id === siteAuditId);
    if (!audit || audit.auditorUserId !== access.userId) throw new ForbiddenException();
    const record = await this.verification.completeSiteAudit(
      siteAuditId,
      {
        expectedCaseVersion: input.expectedCaseVersion,
        encryptedFindings: this.cipher.encrypt(
          input.findings,
          siteAuditFindingsContext(siteAuditId),
        ),
        checklist: input.checklist as Prisma.InputJsonObject,
        attachmentFileAssetIds: input.attachmentFileAssetIds,
      },
      mutationContext(access, idempotencyKey, 'verification.site-audit.complete', {
        siteAuditId,
        expectedCaseVersion: input.expectedCaseVersion,
        attachmentFileAssetIds: input.attachmentFileAssetIds,
      }),
    );
    return this.toDetail(access, record);
  }

  async createCorrectiveAction(
    access: AccessContext,
    verificationCaseId: string,
    input: CreateCorrectiveAction,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertReviewerMutation(access, 'verification:review');
    await this.loadReviewerCase(access, verificationCaseId, true);
    const correctiveActionId = randomUUID();
    const record = await this.verification.createCorrectiveAction(
      verificationCaseId,
      {
        expectedCaseVersion: input.expectedCaseVersion,
        correctiveActionId,
        ...(input.requirementId ? { requirementId: input.requirementId } : {}),
        requestedByUserId: access.userId,
        title: input.title,
        encryptedDescription: this.cipher.encrypt(
          input.description,
          correctiveDescriptionContext(correctiveActionId),
        ),
        dueAt: new Date(input.dueAt),
      },
      mutationContext(access, idempotencyKey, 'verification.corrective-action.create', {
        verificationCaseId,
        ...input,
      }),
    );
    return this.toDetail(access, record);
  }

  async respondCorrectiveAction(
    access: AccessContext,
    correctiveActionId: string,
    input: RespondCorrectiveAction,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertApplicantMutation(access);
    const current = await this.verification.getCaseByCorrectiveActionScoped(
      scopeFor(access),
      correctiveActionId,
    );
    if (!current || hasPermission(access, 'verification:read:any')) throw new NotFoundException();
    this.assertNoPendingDecision(current);
    const record = await this.verification.respondCorrectiveAction(
      correctiveActionId,
      {
        expectedVersion: input.expectedVersion,
        expectedCaseVersion: input.expectedCaseVersion,
        encryptedResponse: this.cipher.encrypt(
          input.response,
          correctiveResponseContext(correctiveActionId),
        ),
        attachmentFileAssetIds: input.attachmentFileAssetIds,
      },
      mutationContext(access, idempotencyKey, 'verification.corrective-action.respond', {
        correctiveActionId,
        expectedVersion: input.expectedVersion,
        expectedCaseVersion: input.expectedCaseVersion,
        attachmentFileAssetIds: input.attachmentFileAssetIds,
      }),
    );
    return this.toDetail(access, record);
  }

  async decideCorrectiveAction(
    access: AccessContext,
    correctiveActionId: string,
    input: DecideCorrectiveAction,
    idempotencyKey: string,
  ): Promise<VerificationCaseDetail> {
    this.assertReviewerMutation(access, 'verification:review');
    const current = await this.verification.getCaseByCorrectiveActionScoped(
      scopeFor(access),
      correctiveActionId,
    );
    if (!current) throw new NotFoundException();
    this.assertAssigned(current, access.userId);
    this.assertNoPendingDecision(current);
    const record = await this.verification.decideCorrectiveAction(
      correctiveActionId,
      {
        expectedVersion: input.expectedVersion,
        expectedCaseVersion: input.expectedCaseVersion,
        decision: input.decision,
        encryptedNotes: this.cipher.encrypt(
          input.notes,
          correctiveDecisionContext(correctiveActionId),
        ),
      },
      mutationContext(access, idempotencyKey, 'verification.corrective-action.decide', {
        correctiveActionId,
        decision: input.decision,
        expectedVersion: input.expectedVersion,
        expectedCaseVersion: input.expectedCaseVersion,
      }),
    );
    return this.toDetail(access, record);
  }

  private async loadApplicantCase(
    access: AccessContext,
    verificationCaseId: string,
  ): Promise<VerificationCaseRecord> {
    const record = await this.verification.getCaseScoped(scopeFor(access), verificationCaseId);
    if (!record || hasPermission(access, 'verification:read:any')) throw new NotFoundException();
    return record;
  }

  private async loadReviewerCase(
    access: AccessContext,
    verificationCaseId: string,
    requireAssignment: boolean,
  ): Promise<VerificationCaseRecord> {
    const record = await this.verification.getCaseScoped(scopeFor(access), verificationCaseId);
    if (!record) throw new NotFoundException();
    if (requireAssignment) {
      this.assertAssigned(record, access.userId);
      this.assertNoPendingDecision(record);
    }
    return record;
  }

  private assertAssigned(record: VerificationCaseRecord, userId: string): void {
    if (record.assignedReviewerUserId !== userId) throw new ForbiddenException();
  }

  private assertNoPendingDecision(record: VerificationCaseRecord): void {
    if (record.reviews.some(({ status }) => status === 'PENDING_SECOND_APPROVAL')) {
      throw new ForbiddenException();
    }
  }

  private async assertSubjectOwnership(
    access: AccessContext,
    subjectType: 'CLINIC' | 'DENTIST',
    subjectId: string,
  ): Promise<void> {
    const organizationIds = new Set(access.memberships.map(({ organizationId }) => organizationId));
    if (subjectType === 'CLINIC') {
      const clinic = await this.verification.findClinicSubject(subjectId);
      if (!clinic || clinic.deletedAt || !organizationIds.has(clinic.organizationId)) {
        throw new NotFoundException();
      }
      return;
    }
    const dentist = await this.verification.findDentistSubject(subjectId);
    if (
      !dentist ||
      (dentist.userId !== access.userId &&
        !dentist.affiliations.some(({ clinic }) => organizationIds.has(clinic.organizationId)))
    ) {
      throw new NotFoundException();
    }
  }

  private assertRead(access: AccessContext): void {
    if (
      requiresMfa(access) ||
      (!hasPermission(access, 'verification:read:own') &&
        !hasPermission(access, 'verification:read:any'))
    ) {
      throw new ForbiddenException();
    }
  }

  private assertApplicantMutation(access: AccessContext): void {
    if (
      access.impersonation ||
      requiresMfa(access) ||
      !hasPermission(access, 'verification:submit')
    ) {
      throw new ForbiddenException();
    }
  }

  private assertReviewerMutation(
    access: AccessContext,
    permission:
      | 'verification:review'
      | 'verification:approve'
      | 'verification:audit'
      | 'verification:suspend',
  ): void {
    if (access.impersonation || requiresMfa(access) || !hasPermission(access, permission)) {
      throw new ForbiddenException();
    }
  }

  private toDetail(access: AccessContext, record: VerificationCaseRecord): VerificationCaseDetail {
    const mayReadInternalNotes = hasPermission(access, 'verification:read:any');
    return {
      ...toSummary(record),
      methodologyVersion: record.methodologyVersion,
      requirements: record.requirements.map((requirement): VerificationRequirementView => ({
        id: requirement.id,
        code: requirement.template.code,
        category: verificationCategory(requirement.template.category),
        names: localizedMap(requirement.template.names),
        descriptions: localizedMap(requirement.template.descriptions),
        required: requirement.required,
        highRisk: requirement.highRisk,
        validityDays: requirement.template.validityDays,
        templateVersion: requirement.template.version,
        status: requirement.status,
        evidence: requirement.evidence.map((evidence): VerificationEvidenceView => ({
          id: evidence.id,
          requirementId: evidence.requirementId,
          category: verificationCategory(evidence.category),
          fileAssetId: evidence.fileAssetId,
          fileName: evidence.fileAsset?.originalFileName ?? null,
          mediaType:
            evidence.fileAsset?.detectedMediaType ?? evidence.fileAsset?.declaredMediaType ?? null,
          sizeBytes: evidence.fileAsset?.sizeBytes.toString() ?? null,
          fileStatus: evidence.fileAsset?.status ?? null,
          scanStatus: evidence.fileAsset?.scanStatus ?? null,
          sourceReference: evidence.sourceReference,
          contentHash: evidence.contentHash,
          issuedAt: evidence.issuedAt?.toISOString().slice(0, 10) ?? null,
          expiresAt: evidence.expiresAt?.toISOString().slice(0, 10) ?? null,
          approvedAt: evidence.approvedAt?.toISOString() ?? null,
          revokedAt: evidence.revokedAt?.toISOString() ?? null,
          createdAt: evidence.createdAt.toISOString(),
        })),
      })),
      reviews: record.reviews.map((review): VerificationReviewView => ({
        id: review.id,
        reviewerUserId: review.reviewerUserId,
        reviewerEmail: review.reviewer.email,
        secondApproverUserId: review.secondApproverUserId,
        secondApproverEmail: review.secondApprover?.email ?? null,
        fromStatus: review.fromStatus,
        toStatus: review.toStatus,
        status: review.status,
        fourEyesRequired: review.fourEyesRequired,
        notes: mayReadInternalNotes
          ? safeDecrypt(this.cipher, review.encryptedNotes, reviewNotesContext(review.id))
          : null,
        secondApprovalNotes:
          mayReadInternalNotes && review.encryptedSecondApprovalNotes
            ? safeDecrypt(
                this.cipher,
                review.encryptedSecondApprovalNotes,
                secondApprovalContext(review.id),
              )
            : null,
        createdAt: review.createdAt.toISOString(),
        appliedAt: review.appliedAt?.toISOString() ?? null,
      })),
      siteAudits: record.siteAudits.map((audit): SiteAuditView => ({
        id: audit.id,
        auditorUserId: audit.auditorUserId,
        clinicLocationId: audit.clinicLocationId,
        status: audit.status,
        scheduledAt: audit.scheduledAt.toISOString(),
        checklist: booleanMap(audit.checklist),
        findings: audit.encryptedFindings
          ? safeDecrypt(this.cipher, audit.encryptedFindings, siteAuditFindingsContext(audit.id))
          : null,
        attachmentFileAssetIds: audit.attachments.map(({ fileAssetId }) => fileAssetId),
        completedAt: audit.completedAt?.toISOString() ?? null,
      })),
      correctiveActions: record.correctiveActions.map((action): CorrectiveActionView => ({
        id: action.id,
        requirementId: action.requirementId,
        title: action.title,
        description:
          safeDecrypt(
            this.cipher,
            action.encryptedDescription,
            correctiveDescriptionContext(action.id),
          ) ?? 'Encrypted historical record',
        response: action.encryptedResponse
          ? safeDecrypt(this.cipher, action.encryptedResponse, correctiveResponseContext(action.id))
          : null,
        status: action.status,
        dueAt: action.dueAt.toISOString(),
        version: action.version,
        attachmentFileAssetIds: action.attachments.map(({ fileAssetId }) => fileAssetId),
        createdAt: action.createdAt.toISOString(),
        updatedAt: action.updatedAt.toISOString(),
      })),
    };
  }
}

function toSummary(record: VerificationCaseRecord): VerificationCaseSummary {
  const subjectId = record.subjectType === 'CLINIC' ? record.clinicId : record.dentistId;
  const subjectName =
    record.subjectType === 'CLINIC' ? record.clinic?.name : record.dentist?.fullName;
  if (!subjectId || !subjectName) throw new VerificationDataIntegrityError();
  return {
    id: record.id,
    subjectType: record.subjectType,
    subjectId,
    subjectName,
    status: record.status,
    riskLevel: record.riskLevel,
    assignedReviewerUserId: record.assignedReviewerUserId,
    version: record.version,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    decidedAt: record.decidedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function scopeFor(access: AccessContext) {
  return {
    userId: access.userId,
    organizationIds: access.memberships.map(({ organizationId }) => organizationId),
    includeAll: hasPermission(access, 'verification:read:any'),
  };
}

function mutationContext(
  access: AccessContext,
  idempotencyKey: string,
  operation: string,
  payload: unknown,
) {
  return {
    actor: {
      userId: access.userId,
      sessionId: access.sessionId,
      ...(access.selectedOrganizationId ? { organizationId: access.selectedOrganizationId } : {}),
      ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
    },
    requestId: access.requestId,
    command: {
      userId: access.userId,
      key: idempotencyKey,
      operation,
      requestHash: sha256(JSON.stringify(payload)),
    },
  };
}

function verificationCategory(value: string): VerificationEvidenceView['category'] {
  const allowed = new Set<VerificationEvidenceView['category']>([
    'CLINIC_OPERATING_LICENSE',
    'DENTIST_PRACTICE_LICENSE',
    'SCOPE_OF_PRACTICE',
    'DENTIST_CLINIC_AFFILIATION',
    'RESPONSIBLE_CLINICAL_LEADER',
    'LOCATION',
    'SERVICE_CAPABILITIES',
    'INFECTION_CONTROL_PROCESS',
    'EQUIPMENT',
    'EMERGENCY_PROCEDURES',
    'MATERIAL_TRACEABILITY',
    'CLINICAL_RECORD_PROCESS',
    'WARRANTY_PROCESS',
    'INTERNATIONAL_PATIENT_SUPPORT',
    'ENGLISH_RECORDS_CAPABILITY',
  ]);
  if (!allowed.has(value as VerificationEvidenceView['category'])) {
    throw new VerificationDataIntegrityError();
  }
  return value as VerificationEvidenceView['category'];
}

function localizedMap(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VerificationDataIntegrityError();
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function booleanMap(value: Prisma.JsonValue): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  );
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function safeDecrypt(
  cipher: SensitiveFieldCipher,
  ciphertext: string,
  context: string,
): string | null {
  try {
    return cipher.decrypt(ciphertext, context);
  } catch {
    return null;
  }
}

function caseStatusReasonContext(caseId: string): string {
  return `verification-case:${caseId}:status-reason`;
}

function reviewNotesContext(reviewId: string): string {
  return `verification-review:${reviewId}:notes`;
}

function secondApprovalContext(reviewId: string): string {
  return `verification-review:${reviewId}:second-approval`;
}

function siteAuditFindingsContext(siteAuditId: string): string {
  return `site-audit:${siteAuditId}:findings`;
}

function correctiveDescriptionContext(actionId: string): string {
  return `corrective-action:${actionId}:description`;
}

function correctiveResponseContext(actionId: string): string {
  return `corrective-action:${actionId}:response`;
}

function correctiveDecisionContext(actionId: string): string {
  return `corrective-action:${actionId}:decision`;
}

class VerificationDataIntegrityError extends Error {
  constructor() {
    super('Verification data failed an internal integrity check.');
    this.name = 'VerificationDataIntegrityError';
  }
}
