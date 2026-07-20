import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { effectiveRoles, hasPermission, requiresMfa, type AccessContext } from '@dental-trust/auth';
import { privacyCategoryDispositionSchema } from '@dental-trust/contracts';
import type {
  CloseIncidentRequest,
  CreatePrivacyLegalHoldRequest,
  DecideReviewAbuseReportRequest,
  CreateClinicReviewResponseRequest,
  CreateIncidentRequest,
  CreatePrivacyRequest,
  CreateSupportElevationRequest,
  CreateVerifiedReviewRequest,
  CreateWarrantyClaimRequest,
  IncidentListQuery,
  IncidentPatientUpdateRequest,
  IncidentView,
  ModerateReviewRequest,
  PrivacyExportDownloadView,
  PrivacyExecutionView,
  PrivacyLegalHoldListQuery,
  PrivacyLegalHoldView,
  PrivacyRequestListQuery,
  PrivacyRequestView,
  ProcessPrivacyRequest,
  ReportReviewAbuseRequest,
  ReviewAbuseReportListQuery,
  ReviewAbuseReportView,
  ReviewListQuery,
  ReviewView,
  ReopenIncidentRequest,
  ReleasePrivacyLegalHoldRequest,
  RevokeSupportElevationRequest,
  RetryPrivacyExecutionRequest,
  SupportElevationView,
  TriageIncidentRequest,
} from '@dental-trust/contracts';
import type {
  IncidentClinicResponseRequest,
  IncidentInternalNoteRequest,
} from '@dental-trust/contracts/trust-safety-workflows';
import type { ServerEnvironment } from '@dental-trust/config/server';
import {
  ClinicOperationsRepository,
  type ClinicOperatorScope,
  type IncidentRecord,
  type Prisma,
  type PrismaClient,
  type PrivacyLegalHold,
  type PrivacyRequestRecord,
  type ReviewRecord,
  type ReviewAbuseReport,
  type SupportElevationRecord,
  TrustSafetyRepository,
} from '@dental-trust/database';
import {
  assertIncidentTransition,
  assertPrivacyRequestTransition,
  assertVerifiedReviewEligibility,
  incidentSlaDueAt,
  isActivePrivacyLegalHold,
  type IncidentSeverity,
  type IncidentStatus,
} from '@dental-trust/domain';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';
import { PrivateObjectStorageProvider } from '../infrastructure/providers/private-object-storage.provider.js';

const PRIVACY_RESPONSE_TARGET_DAYS = 30;

type ClinicIncidentView = IncidentView & {
  readonly internalNotes: IncidentView['updates'];
};
type IncidentResponseView = IncidentView | ClinicIncidentView;

@Injectable()
export class TrustSafetyService {
  private readonly trust: TrustSafetyRepository;
  private readonly clinicOperations: ClinicOperationsRepository;
  private readonly cipher: SensitiveFieldCipher;
  private readonly storage: PrivateObjectStorageProvider;

  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(SERVER_ENV) private readonly environment: ServerEnvironment,
  ) {
    this.trust = new TrustSafetyRepository(db);
    this.clinicOperations = new ClinicOperationsRepository(db);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
    this.storage = new PrivateObjectStorageProvider(environment);
  }

  async createIncident(
    access: AccessContext,
    input: CreateIncidentRequest,
    idempotencyKey: string,
  ): Promise<IncidentView> {
    this.assertDirectPatientMutation(access, 'incident:create:own');
    const dentalCase = await this.trust.loadPatientCaseForIncident(access.userId, input.caseId);
    if (!dentalCase) throw new NotFoundException();
    const severity: IncidentSeverity =
      input.type === 'SAFETY_CONCERN' ? 'CRITICAL' : input.reportedSeverity;
    const id = randomUUID();
    const record = await this.trust.createIncident(
      {
        id,
        caseId: input.caseId,
        ...(dentalCase.treatmentPlans[0]
          ? { clinicId: dentalCase.treatmentPlans[0].clinicId }
          : {}),
        createdByUserId: access.userId,
        type: input.type,
        severity,
        summary: input.summary,
        encryptedDetails: this.cipher.encrypt(input.details, incidentDetailsAad(id)),
        slaDueAt: incidentSlaDueAt(severity),
        attachmentFileAssetIds: input.attachmentFileAssetIds,
      },
      auditActor(access),
      access.requestId,
      command(access, idempotencyKey, 'incident.create', input),
    );
    return this.toIncidentView(record);
  }

  async createWarrantyClaim(
    access: AccessContext,
    caseId: string,
    input: CreateWarrantyClaimRequest,
    idempotencyKey: string,
  ): Promise<IncidentView> {
    this.assertDirectPatientMutation(access, 'incident:create:own');
    const source = await this.trust.loadWarrantySource(access.userId, caseId);
    if (!source) throw new NotFoundException();
    const id = randomUUID();
    const clinicId = source.treatmentPlanVersion.treatmentPlan.clinicId;
    const record = await this.trust.createIncident(
      {
        id,
        caseId,
        clinicId,
        createdByUserId: access.userId,
        type: 'WARRANTY_CLAIM',
        severity: input.reportedSeverity,
        summary: input.summary,
        encryptedDetails: this.cipher.encrypt(input.details, incidentDetailsAad(id)),
        slaDueAt: incidentSlaDueAt(input.reportedSeverity),
        attachmentFileAssetIds: input.attachmentFileAssetIds,
        warranty: {
          clinicId,
          warrantyTerms: source.treatmentPlanVersion.warrantyTerms,
        },
      },
      auditActor(access),
      access.requestId,
      command(access, idempotencyKey, 'warranty-claim.create', { caseId, ...input }),
    );
    return this.toIncidentView(record);
  }

  async listIncidents(
    access: AccessContext,
    query: IncidentListQuery,
  ): Promise<{
    readonly data: readonly IncidentResponseView[];
    readonly nextCursor: string | null;
  }> {
    const scope = await this.incidentReadScope(access);
    const records = await this.trust.listIncidentsScoped(scope, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.caseId ? { caseId: query.caseId } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map((record) =>
        'clinicId' in scope ? this.toClinicIncidentView(record) : this.toIncidentView(record),
      ),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async getIncident(access: AccessContext, incidentId: string): Promise<IncidentView> {
    this.assertIncidentRead(access);
    return this.toIncidentView(await this.loadIncident(access, incidentId));
  }

  async addIncidentUpdate(
    access: AccessContext,
    incidentId: string,
    input: IncidentPatientUpdateRequest,
    idempotencyKey: string,
  ): Promise<IncidentView> {
    const current = await this.loadIncident(access, incidentId);
    if (current.status === 'CLOSED') {
      throw new ConflictException('Reopen the incident before adding an update.');
    }
    const isOwner = current.createdByUserId === access.userId;
    const canManage = hasPermission(access, 'incident:manage') && !requiresMfa(access);
    if ((!isOwner && !canManage) || (access.impersonation && !isOwner)) {
      throw new ForbiddenException();
    }
    const updated = await this.trust.addPatientVisibleIncidentUpdate(
      incidentId,
      input.message,
      auditActor(access),
      access.requestId,
      command(access, idempotencyKey, 'incident.patient-visible-update', {
        incidentId,
        ...input,
      }),
    );
    return this.toIncidentView(updated);
  }

  async addClinicResponse(
    access: AccessContext,
    incidentId: string,
    input: IncidentClinicResponseRequest,
    idempotencyKey: string,
  ): Promise<ClinicIncidentView> {
    const { operator, incident } = await this.loadClinicIncident(access, incidentId);
    if (incident.status === 'CLOSED') {
      throw new ConflictException('Reopen the incident before adding a clinic response.');
    }
    return this.toClinicIncidentView(
      await this.trust.addClinicIncidentEvent({
        incidentId,
        clinicId: operator.clinicId,
        organizationId: operator.organizationId,
        expectedVersion: input.expectedVersion,
        kind: 'CLINIC_RESPONSE',
        message: input.message,
        actor: auditActor(access, operator.organizationId),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'incident.clinic-response', {
          incidentId,
          ...input,
        }),
      }),
    );
  }

  async addIncidentInternalNote(
    access: AccessContext,
    incidentId: string,
    input: IncidentInternalNoteRequest,
    idempotencyKey: string,
  ): Promise<ClinicIncidentView> {
    const { operator, incident } = await this.loadClinicIncident(access, incidentId);
    if (incident.status === 'CLOSED') {
      throw new ConflictException('Reopen the incident before adding an internal note.');
    }
    return this.toClinicIncidentView(
      await this.trust.addClinicIncidentEvent({
        incidentId,
        clinicId: operator.clinicId,
        organizationId: operator.organizationId,
        expectedVersion: input.expectedVersion,
        kind: 'INTERNAL_NOTE',
        message: input.note,
        actor: auditActor(access, operator.organizationId),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'incident.internal-note', {
          incidentId,
          ...input,
        }),
      }),
    );
  }

  async triageIncident(
    access: AccessContext,
    incidentId: string,
    input: TriageIncidentRequest,
    idempotencyKey: string,
  ): Promise<IncidentView> {
    this.assertIncidentManager(access);
    const current = await this.loadIncident(access, incidentId);
    assertIncidentTransition(current.status as IncidentStatus, input.toStatus);
    const updated = await this.trust.transitionIncident({
      incidentId,
      toStatus: input.toStatus,
      expectedVersion: input.expectedVersion,
      patientMessage: input.patientMessage,
      severity: input.severity,
      ownerUserId: input.ownerUserId,
      slaDueAt: incidentSlaDueAt(input.severity),
      actor: auditActor(access),
      requestId: access.requestId,
      command: command(access, idempotencyKey, 'incident.triage', { incidentId, ...input }),
    });
    return this.toIncidentView(updated);
  }

  async closeIncident(
    access: AccessContext,
    incidentId: string,
    input: CloseIncidentRequest,
    idempotencyKey: string,
  ): Promise<IncidentView> {
    this.assertIncidentManager(access);
    const current = await this.loadIncident(access, incidentId);
    assertIncidentTransition(current.status as IncidentStatus, 'CLOSED');
    return this.toIncidentView(
      await this.trust.transitionIncident({
        incidentId,
        toStatus: 'CLOSED',
        expectedVersion: input.expectedVersion,
        patientMessage: input.patientMessage,
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'incident.close', { incidentId, ...input }),
      }),
    );
  }

  async reopenIncident(
    access: AccessContext,
    incidentId: string,
    input: ReopenIncidentRequest,
    idempotencyKey: string,
  ): Promise<IncidentView> {
    if (access.impersonation) throw new ForbiddenException();
    const current = await this.loadIncident(access, incidentId);
    const isOwner = current.createdByUserId === access.userId;
    const canManage = hasPermission(access, 'incident:manage') && !requiresMfa(access);
    if (!isOwner && !canManage) throw new ForbiddenException();
    assertIncidentTransition(current.status as IncidentStatus, 'REOPENED');
    return this.toIncidentView(
      await this.trust.transitionIncident({
        incidentId,
        toStatus: 'REOPENED',
        expectedVersion: input.expectedVersion,
        patientMessage: input.patientMessage,
        slaDueAt: incidentSlaDueAt(current.severity as IncidentSeverity),
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'incident.reopen', { incidentId, ...input }),
      }),
    );
  }

  async submitReview(
    access: AccessContext,
    input: CreateVerifiedReviewRequest,
    idempotencyKey: string,
  ): Promise<ReviewView> {
    this.assertDirectPatientMutation(access, 'review:create:own');
    const facts = await this.trust.loadReviewEligibility(input.caseId, access.userId);
    assertVerifiedReviewEligibility(facts);
    if (!facts.clinicId || !facts.completedTreatmentAt) throw new NotFoundException();
    const treatmentDate = dateOnly(facts.completedTreatmentAt);
    const followUpDays = Math.max(
      0,
      Math.floor((Date.now() - treatmentDate.getTime()) / (24 * 60 * 60_000)),
    );
    const review = await this.trust.createVerifiedReview({
      caseId: input.caseId,
      clinicId: facts.clinicId,
      patientUserId: access.userId,
      overallRating: input.overallRating,
      dimensionRatings: input.dimensionRatings as Prisma.InputJsonObject,
      content: input.content,
      treatmentDate,
      followUpDays,
      actor: auditActor(access),
      requestId: access.requestId,
      command: command(access, idempotencyKey, 'review.create', input),
    });
    return toReviewView(review);
  }

  async listReviews(
    access: AccessContext,
    query: ReviewListQuery,
  ): Promise<{ readonly data: readonly ReviewView[]; readonly nextCursor: string | null }> {
    const moderator = hasPermission(access, 'review:moderate');
    const clinic = hasPermission(access, 'review:respond');
    const patient = hasPermission(access, 'review:create:own');
    if (access.impersonation || (!moderator && !clinic && !patient)) {
      throw new ForbiddenException();
    }
    if ((moderator || clinic) && requiresMfa(access)) throw new ForbiddenException();
    const records = await this.trust.listReviewsScoped(
      {
        ...(patient ? { patientUserId: access.userId } : {}),
        organizationIds: clinic
          ? access.memberships.map(({ organizationId }) => organizationId)
          : [],
        includeAll: moderator,
      },
      {
        limit: query.limit,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.clinicId ? { clinicId: query.clinicId } : {}),
        ...(query.caseId ? { caseId: query.caseId } : {}),
        ...(query.moderationStatus ? { moderationStatus: query.moderationStatus } : {}),
      },
    );
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map(toReviewView),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async respondToReview(
    access: AccessContext,
    reviewId: string,
    input: CreateClinicReviewResponseRequest,
    idempotencyKey: string,
  ): Promise<ReviewView> {
    if (
      access.impersonation ||
      !hasPermission(access, 'review:respond') ||
      requiresMfa(access) ||
      access.memberships.length === 0
    ) {
      throw new ForbiddenException();
    }
    return toReviewView(
      await this.trust.createClinicReviewResponse({
        reviewId,
        authorUserId: access.userId,
        organizationIds: access.memberships.map(({ organizationId }) => organizationId),
        content: input.content,
        actor: auditActor(access, access.selectedOrganizationId),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'review.clinic-response', {
          reviewId,
          ...input,
        }),
      }),
    );
  }

  async reportReview(
    access: AccessContext,
    reviewId: string,
    input: ReportReviewAbuseRequest,
    idempotencyKey: string,
  ) {
    if (access.impersonation) throw new ForbiddenException();
    const reportId = randomUUID();
    const report = await this.trust.reportReviewAbuse({
      id: reportId,
      reviewId,
      reporterUserId: access.userId,
      reasonCode: input.reasonCode,
      encryptedDetails: this.cipher.encrypt(input.details, reviewReportAad(reportId)),
      actor: auditActor(access),
      requestId: access.requestId,
      command: command(access, idempotencyKey, 'review.abuse-report', { reviewId, ...input }),
    });
    return { id: report.id, status: report.status, createdAt: report.createdAt.toISOString() };
  }

  async moderateReview(
    access: AccessContext,
    reviewId: string,
    input: ModerateReviewRequest,
    idempotencyKey: string,
  ): Promise<ReviewView> {
    if (access.impersonation || !hasPermission(access, 'review:moderate') || requiresMfa(access)) {
      throw new ForbiddenException();
    }
    return toReviewView(
      await this.trust.moderateReview({
        reviewId,
        target: input.target,
        status: input.status,
        reason: input.reason,
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'review.moderate', { reviewId, ...input }),
      }),
    );
  }

  async listReviewAbuseReports(
    access: AccessContext,
    query: ReviewAbuseReportListQuery,
  ): Promise<{
    readonly data: readonly ReviewAbuseReportView[];
    readonly nextCursor: string | null;
  }> {
    this.assertReviewModerator(access);
    const records = await this.trust.listReviewAbuseReports(query.status, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map((report) => this.toReviewAbuseReportView(report)),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async decideReviewAbuseReport(
    access: AccessContext,
    reportId: string,
    input: DecideReviewAbuseReportRequest,
    idempotencyKey: string,
  ): Promise<ReviewAbuseReportView> {
    this.assertReviewModerator(access);
    return this.toReviewAbuseReportView(
      await this.trust.decideReviewAbuseReport({
        reportId,
        status: input.status,
        reason: input.reason,
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'review.abuse-report-decision', {
          reportId,
          ...input,
        }),
      }),
    );
  }

  async createPrivacyRequest(
    access: AccessContext,
    input: CreatePrivacyRequest,
    idempotencyKey: string,
  ): Promise<PrivacyRequestView> {
    this.assertDirectPatientMutation(access, 'privacy:request:own');
    const id = randomUUID();
    const dueAt = new Date(Date.now() + PRIVACY_RESPONSE_TARGET_DAYS * 24 * 60 * 60_000);
    const request = await this.trust.createPrivacyRequest({
      id,
      requesterUserId: access.userId,
      type: input.type,
      encryptedReason: this.cipher.encrypt(input.reason, privacyReasonAad(id)),
      dueAt,
      actor: auditActor(access),
      requestId: access.requestId,
      command: command(access, idempotencyKey, 'privacy-request.create', input),
    });
    return this.toPrivacyRequestView(request);
  }

  async listPrivacyRequests(
    access: AccessContext,
    query: PrivacyRequestListQuery,
  ): Promise<{ readonly data: readonly PrivacyRequestView[]; readonly nextCursor: string | null }> {
    const adminQueue = query.queue && hasPermission(access, 'privacy:manage');
    if (adminQueue && (access.impersonation || requiresMfa(access))) throw new ForbiddenException();
    if (!adminQueue && !hasPermission(access, 'privacy:request:own'))
      throw new ForbiddenException();
    const records = await this.trust.listPrivacyRequests(
      adminQueue ? undefined : access.userId,
      query.status,
      { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) },
    );
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map((record) => this.toPrivacyRequestView(record, Boolean(access.impersonation))),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async getPrivacyRequest(
    access: AccessContext,
    privacyRequestId: string,
  ): Promise<PrivacyRequestView> {
    const admin = hasPermission(access, 'privacy:manage') && !access.impersonation;
    if (admin && requiresMfa(access)) throw new ForbiddenException();
    if (!admin && !hasPermission(access, 'privacy:request:own')) throw new ForbiddenException();
    const request = await this.trust.findPrivacyRequestScoped(
      privacyRequestId,
      admin ? undefined : access.userId,
    );
    if (!request) throw new NotFoundException();
    return this.toPrivacyRequestView(request, Boolean(access.impersonation));
  }

  async processPrivacyRequest(
    access: AccessContext,
    privacyRequestId: string,
    input: ProcessPrivacyRequest,
    idempotencyKey: string,
  ): Promise<PrivacyRequestView> {
    if (access.impersonation || !hasPermission(access, 'privacy:manage') || requiresMfa(access)) {
      throw new ForbiddenException();
    }
    const current = await this.trust.findPrivacyRequestScoped(privacyRequestId);
    if (!current) throw new NotFoundException();
    if (current.status === 'PROCESSING') throw new ConflictException();
    assertPrivacyRequestTransition(current.status, input.toStatus);
    if (input.verification) {
      const verifiedAt = new Date(input.verification.verifiedAt);
      const oldestAccepted = Date.now() - 30 * 24 * 60 * 60_000;
      if (verifiedAt.getTime() > Date.now() + 60_000 || verifiedAt.getTime() < oldestAccepted) {
        throw new ConflictException('Identity verification evidence is not current.');
      }
    }
    const updated = await this.trust.transitionPrivacyRequest({
      privacyRequestId,
      toStatus: input.toStatus,
      expectedVersion: input.expectedVersion,
      encryptedPatientMessage: this.cipher.encrypt(
        input.patientMessage,
        privacyPatientMessageAad(privacyRequestId),
      ),
      handlerUserId: access.userId,
      ...(input.verification
        ? {
            verification: {
              method: input.verification.method,
              encryptedReference: this.cipher.encrypt(
                input.verification.reference,
                privacyVerificationAad(privacyRequestId),
              ),
              verifiedAt: new Date(input.verification.verifiedAt),
            },
          }
        : {}),
      reason: input.reason,
      actor: auditActor(access),
      requestId: access.requestId,
      command: command(access, idempotencyKey, 'privacy-request.process', {
        privacyRequestId,
        ...input,
      }),
    });
    return this.toPrivacyRequestView(updated);
  }

  async retryPrivacyExecution(
    access: AccessContext,
    privacyRequestId: string,
    input: RetryPrivacyExecutionRequest,
    idempotencyKey: string,
  ): Promise<PrivacyRequestView> {
    this.assertPrivacyAdministrator(access);
    return this.toPrivacyRequestView(
      await this.trust.retryPrivacyExecution({
        privacyRequestId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'privacy-request.execution.retry', {
          privacyRequestId,
          ...input,
        }),
      }),
    );
  }

  async downloadPrivacyExport(
    access: AccessContext,
    privacyRequestId: string,
  ): Promise<PrivacyExportDownloadView> {
    if (
      access.impersonation ||
      !access.mfaVerified ||
      !hasPermission(access, 'privacy:request:own')
    ) {
      throw new ForbiddenException();
    }
    const request = await this.trust.findPrivacyRequestScoped(privacyRequestId, access.userId);
    const execution = request?.execution;
    if (
      !request ||
      request.type !== 'EXPORT' ||
      request.status !== 'COMPLETED' ||
      !execution ||
      execution.status !== 'SUCCEEDED' ||
      execution.outcome !== 'EXPORT_READY' ||
      !execution.artifactFileAsset ||
      execution.artifactFileAsset.status !== 'AVAILABLE' ||
      execution.artifactFileAsset.scanStatus !== 'CLEAN' ||
      execution.artifactFileAsset.deletedAt ||
      !execution.artifactExpiresAt ||
      execution.artifactExpiresAt <= new Date() ||
      !execution.archiveChecksumSha256 ||
      !execution.manifestChecksumSha256
    ) {
      throw new NotFoundException();
    }
    const download = await this.storage.createPrivateDownload(
      execution.artifactFileAsset.objectKey,
    );
    await this.db.auditLog.create({
      data: {
        actorUserId: access.userId,
        action: 'privacy-request.export-download-authorized',
        resourceType: 'PrivacyRequestExecution',
        resourceId: execution.id,
        requestId: access.requestId,
        success: true,
        afterMetadata: {
          privacyRequestId,
          artifactFileAssetId: execution.artifactFileAsset.id,
          signedUrlExpiresAt: download.expiresAt.toISOString(),
        },
      },
    });
    return {
      downloadUrl: download.signedUrl,
      expiresAt: download.expiresAt.toISOString(),
      archiveChecksumSha256: execution.archiveChecksumSha256,
      manifestChecksumSha256: execution.manifestChecksumSha256,
    };
  }

  async listPrivacyLegalHolds(
    access: AccessContext,
    query: PrivacyLegalHoldListQuery,
  ): Promise<{
    readonly data: readonly PrivacyLegalHoldView[];
    readonly nextCursor: string | null;
  }> {
    this.assertPrivacyAdministrator(access);
    const records = await this.trust.listPrivacyLegalHolds(query.subjectUserId, query.activeOnly, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map((record) => this.toPrivacyLegalHoldView(record)),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async createPrivacyLegalHold(
    access: AccessContext,
    input: CreatePrivacyLegalHoldRequest,
    idempotencyKey: string,
  ): Promise<PrivacyLegalHoldView> {
    this.assertPrivacyAdministrator(access);
    const id = randomUUID();
    return this.toPrivacyLegalHoldView(
      await this.trust.createPrivacyLegalHold({
        id,
        subjectUserId: input.subjectUserId,
        scopes: input.scopes,
        encryptedReason: this.cipher.encrypt(input.reason, privacyLegalHoldReasonAad(id)),
        encryptedAuthorityReference: this.cipher.encrypt(
          input.authorityReference,
          privacyLegalHoldAuthorityAad(id),
        ),
        startsAt: new Date(input.startsAt),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'privacy.legal-hold.create', input),
      }),
    );
  }

  async releasePrivacyLegalHold(
    access: AccessContext,
    legalHoldId: string,
    input: ReleasePrivacyLegalHoldRequest,
    idempotencyKey: string,
  ): Promise<PrivacyLegalHoldView> {
    this.assertPrivacyAdministrator(access);
    return this.toPrivacyLegalHoldView(
      await this.trust.releasePrivacyLegalHold({
        legalHoldId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'privacy.legal-hold.release', {
          legalHoldId,
          ...input,
        }),
      }),
    );
  }

  async createSupportElevation(
    access: AccessContext,
    input: CreateSupportElevationRequest,
    idempotencyKey: string,
  ): Promise<SupportElevationView> {
    if (
      access.impersonation ||
      !hasPermission(access, 'admin:impersonate') ||
      requiresMfa(access)
    ) {
      throw new ForbiddenException();
    }
    if (input.actorUserId === input.subjectUserId || access.userId === input.subjectUserId) {
      throw new ConflictException();
    }
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
    return toSupportElevationView(
      await this.trust.createSupportElevation({
        actorUserId: input.actorUserId,
        subjectUserId: input.subjectUserId,
        approvedByUserId: access.userId,
        ticketReference: input.ticketReference,
        reason: input.reason,
        capabilities: input.capabilities,
        expiresAt,
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'support-elevation.create', input),
      }),
    );
  }

  async listSupportElevations(
    access: AccessContext,
    query: { readonly cursor?: string; readonly limit: number },
  ): Promise<{
    readonly data: readonly SupportElevationView[];
    readonly nextCursor: string | null;
  }> {
    if (access.impersonation || requiresMfa(access)) throw new ForbiddenException();
    const admin = hasPermission(access, 'admin:impersonate');
    const supportAgent = effectiveRoles(access).includes('SUPPORT_AGENT');
    if (!admin && !supportAgent) throw new ForbiddenException();
    const records = await this.trust.listSupportElevations(admin ? undefined : access.userId, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map(toSupportElevationView),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async revokeSupportElevation(
    access: AccessContext,
    elevationId: string,
    input: RevokeSupportElevationRequest,
    idempotencyKey: string,
  ): Promise<SupportElevationView> {
    if (access.impersonation || requiresMfa(access)) throw new ForbiddenException();
    const allowAny = hasPermission(access, 'admin:impersonate');
    if (!allowAny && !effectiveRoles(access).includes('SUPPORT_AGENT')) {
      throw new ForbiddenException();
    }
    return toSupportElevationView(
      await this.trust.revokeSupportElevation({
        elevationId,
        requestingUserId: access.userId,
        allowAny,
        reason: input.reason,
        actor: auditActor(access),
        requestId: access.requestId,
        command: command(access, idempotencyKey, 'support-elevation.revoke', {
          elevationId,
          ...input,
        }),
      }),
    );
  }

  private assertDirectPatientMutation(
    access: AccessContext,
    permission: 'incident:create:own' | 'review:create:own' | 'privacy:request:own',
  ): void {
    if (access.impersonation || !hasPermission(access, permission)) throw new ForbiddenException();
  }

  private assertPrivacyAdministrator(access: AccessContext): void {
    if (access.impersonation || !hasPermission(access, 'privacy:manage') || requiresMfa(access)) {
      throw new ForbiddenException();
    }
  }

  private assertIncidentRead(access: AccessContext): void {
    const allowed = (
      ['incident:read:own', 'incident:read:assigned', 'incident:manage'] as const
    ).some((permission) => hasPermission(access, permission));
    if (!allowed || requiresMfa(access)) throw new ForbiddenException();
  }

  private assertIncidentManager(access: AccessContext): void {
    if (access.impersonation || !hasPermission(access, 'incident:manage') || requiresMfa(access)) {
      throw new ForbiddenException();
    }
  }

  private assertReviewModerator(access: AccessContext): void {
    if (access.impersonation || !hasPermission(access, 'review:moderate') || requiresMfa(access)) {
      throw new ForbiddenException();
    }
  }

  private async loadIncident(access: AccessContext, incidentId: string): Promise<IncidentRecord> {
    const incident = await this.trust.findIncidentScoped(
      await this.incidentReadScope(access),
      incidentId,
    );
    if (!incident) throw new NotFoundException();
    return incident;
  }

  private async loadClinicIncident(
    access: AccessContext,
    incidentId: string,
  ): Promise<{ readonly operator: ClinicOperatorScope; readonly incident: IncidentRecord }> {
    const operator = await this.loadClinicIncidentOperator(access);
    const incident = await this.trust.findClinicIncidentScoped(
      incidentId,
      operator.clinicId,
      operator.organizationId,
    );
    if (!incident) throw new NotFoundException();
    return { operator, incident };
  }

  private async incidentReadScope(access: AccessContext) {
    this.assertIncidentRead(access);
    const isClinicOperator = access.memberships.some(({ role }) =>
      ['DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN'].includes(role),
    );
    if (!isClinicOperator || hasPermission(access, 'case:read:any')) {
      return scopeFor(access);
    }
    const operator = await this.loadClinicIncidentOperator(access);
    return {
      userId: access.userId,
      organizationIds: [operator.organizationId],
      includeAll: false,
      clinicId: operator.clinicId,
    };
  }

  private async loadClinicIncidentOperator(access: AccessContext): Promise<ClinicOperatorScope> {
    if (
      access.impersonation ||
      requiresMfa(access) ||
      !access.selectedOrganizationId ||
      !hasPermission(access, 'incident:read:assigned')
    ) {
      throw new ForbiddenException();
    }
    const operator = await this.clinicOperations.loadOperator(
      access.userId,
      access.selectedOrganizationId,
    );
    if (!operator?.permissions.includes('INCIDENT_RESPONSE')) {
      throw new ForbiddenException();
    }
    return operator;
  }

  private toIncidentView(incident: IncidentRecord): IncidentView {
    return {
      id: incident.id,
      caseId: incident.caseId,
      clinicId: incident.clinicId,
      type: incident.type,
      severity: incident.severity as IncidentView['severity'],
      status: incident.status,
      summary: incident.summary,
      details: this.cipher.decrypt(incident.encryptedDetails, incidentDetailsAad(incident.id)),
      ownerAssigned: incident.ownerUserId !== null,
      slaDueAt: incident.slaDueAt.toISOString(),
      version: incident.version,
      closedAt: incident.closedAt?.toISOString() ?? null,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
      updates: incident.events
        .filter((event) => event.visibility === 'PARTICIPANTS')
        .map((event) => ({
          id: event.id,
          eventType: event.eventType,
          message: incidentEventMessage(event.details),
          createdAt: event.createdAt.toISOString(),
        })),
      warrantyClaim: incident.warrantyClaim
        ? {
            id: incident.warrantyClaim.id,
            status: incident.warrantyClaim.status,
            warrantyTerms: incident.warrantyClaim.warrantyTerms,
            resolution: incident.warrantyClaim.resolution,
          }
        : null,
    };
  }

  private toClinicIncidentView(incident: IncidentRecord): ClinicIncidentView {
    return {
      ...this.toIncidentView(incident),
      internalNotes: incident.events
        .filter((event) => event.visibility === 'STAFF_INTERNAL')
        .map((event) => ({
          id: event.id,
          eventType: event.eventType,
          message: incidentEventMessage(event.details),
          createdAt: event.createdAt.toISOString(),
        })),
    };
  }

  private toPrivacyRequestView(
    request: PrivacyRequestRecord,
    statusOnly = false,
  ): PrivacyRequestView {
    if (request.type !== 'EXPORT' && request.type !== 'DELETE') {
      throw new ConflictException('Unsupported privacy request type.');
    }
    const execution = request.execution;
    const artifact =
      execution?.artifactFileAsset &&
      execution.artifactExpiresAt &&
      execution.archiveChecksumSha256 &&
      execution.manifestChecksumSha256 &&
      execution.archiveSizeBytes !== null &&
      execution.recordCount !== null
        ? {
            available:
              execution.artifactFileAsset.status === 'AVAILABLE' &&
              execution.artifactFileAsset.scanStatus === 'CLEAN' &&
              execution.artifactFileAsset.deletedAt === null &&
              execution.artifactPurgedAt === null &&
              execution.artifactExpiresAt > new Date(),
            expiresAt: execution.artifactExpiresAt.toISOString(),
            purgedAt: execution.artifactPurgedAt?.toISOString() ?? null,
            archiveChecksumSha256: execution.archiveChecksumSha256,
            manifestChecksumSha256: execution.manifestChecksumSha256,
            sizeBytes: execution.archiveSizeBytes.toString(),
            recordCount: execution.recordCount,
          }
        : null;
    const activeLegalHoldScopes = [
      ...new Set(
        request.requester.privacyLegalHolds
          .filter((hold) => isActivePrivacyLegalHold(hold))
          .flatMap((hold) => hold.scopes),
      ),
    ];
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      reason: statusOnly
        ? null
        : this.cipher.decrypt(request.encryptedReason, privacyReasonAad(request.id)),
      patientMessage:
        !statusOnly && request.encryptedPatientMessage
          ? this.cipher.decrypt(
              request.encryptedPatientMessage,
              privacyPatientMessageAad(request.id),
            )
          : null,
      dueAt: request.dueAt.toISOString(),
      version: request.version,
      completedAt: request.completedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      execution: execution
        ? {
            id: execution.id,
            status: execution.status,
            outcome: execution.outcome,
            identityVerificationMethod: execution.identityVerificationMethod,
            verifiedAt: execution.verifiedAt.toISOString(),
            noticeStatus: execution.noticeNotification?.status ?? null,
            attemptCount: execution.attemptCount,
            lastErrorCode: execution.lastErrorCode,
            version: execution.version,
            blockerCodes: execution.blockerCodes as PrivacyExecutionView['blockerCodes'],
            categoryDisposition: execution.categoryDisposition
              ? privacyCategoryDispositionSchema.array().parse(execution.categoryDisposition)
              : [],
            artifact,
            startedAt: execution.startedAt?.toISOString() ?? null,
            completedAt: execution.completedAt?.toISOString() ?? null,
          }
        : null,
      activeLegalHoldScopes,
    };
  }

  private toPrivacyLegalHoldView(hold: PrivacyLegalHold): PrivacyLegalHoldView {
    return {
      id: hold.id,
      subjectUserId: hold.subjectUserId,
      scopes: hold.scopes,
      reason: this.cipher.decrypt(hold.encryptedReason, privacyLegalHoldReasonAad(hold.id)),
      authorityReference: this.cipher.decrypt(
        hold.encryptedAuthorityReference,
        privacyLegalHoldAuthorityAad(hold.id),
      ),
      startsAt: hold.startsAt.toISOString(),
      expiresAt: hold.expiresAt?.toISOString() ?? null,
      releasedAt: hold.releasedAt?.toISOString() ?? null,
      version: hold.version,
      active: isActivePrivacyLegalHold(hold),
    };
  }

  private toReviewAbuseReportView(report: ReviewAbuseReport): ReviewAbuseReportView {
    return {
      id: report.id,
      reviewId: report.reviewId,
      reasonCode: report.reasonCode as ReviewAbuseReportView['reasonCode'],
      details: this.cipher.decrypt(report.encryptedDetails, reviewReportAad(report.id)),
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }
}

function scopeFor(access: AccessContext) {
  return {
    userId: access.impersonation?.actorUserId ?? access.userId,
    organizationIds: access.memberships.map(({ organizationId }) => organizationId),
    includeAll: hasPermission(access, 'case:read:any'),
  };
}

function command(
  access: AccessContext,
  key: string,
  operation: string,
  input: Readonly<Record<string, unknown>>,
) {
  return {
    userId: access.userId,
    key,
    operation,
    requestHash: sha256(JSON.stringify(input)),
  };
}

function auditActor(access: AccessContext, organizationId?: string) {
  return {
    userId: access.userId,
    sessionId: access.sessionId,
    ...(organizationId ? { organizationId } : {}),
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}

function toReviewView(review: ReviewRecord): ReviewView {
  if (!isRatingRecord(review.dimensionRatings)) {
    throw new ConflictException('Review rating data is invalid.');
  }
  return {
    id: review.id,
    caseId: review.caseId,
    clinicId: review.clinicId,
    overallRating: review.overallRating,
    dimensionRatings: review.dimensionRatings,
    content: review.content,
    treatmentDate: review.treatmentDate.toISOString().slice(0, 10),
    followUpDays: review.followUpDays,
    verified: review.verified,
    moderationStatus: review.moderationStatus,
    createdAt: review.createdAt.toISOString(),
    clinicResponse: review.clinicResponse
      ? {
          id: review.clinicResponse.id,
          content: review.clinicResponse.content,
          moderationStatus: review.clinicResponse.moderationStatus,
          createdAt: review.clinicResponse.createdAt.toISOString(),
        }
      : null,
  };
}

function toSupportElevationView(elevation: SupportElevationRecord): SupportElevationView {
  return {
    id: elevation.id,
    actorUserId: elevation.actorUserId,
    subjectUserId: elevation.subjectUserId,
    approvedByUserId: elevation.approvedByUserId,
    ticketReference: elevation.ticketReference,
    reason: elevation.reason,
    capabilities: elevation.capabilities as SupportElevationView['capabilities'],
    status:
      elevation.status === 'ACTIVE' && elevation.expiresAt <= new Date()
        ? 'EXPIRED'
        : elevation.status,
    expiresAt: elevation.expiresAt.toISOString(),
    lastUsedAt: elevation.lastUsedAt?.toISOString() ?? null,
    useCount: elevation.useCount,
    revokedAt: elevation.revokedAt?.toISOString() ?? null,
    createdAt: elevation.createdAt.toISOString(),
  };
}

function isRatingRecord(value: Prisma.JsonValue): value is Record<string, number> {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    Object.values(value).every(
      (rating) =>
        typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5,
    )
  );
}

function incidentEventMessage(value: Prisma.JsonValue): string {
  if (value && !Array.isArray(value) && typeof value === 'object') {
    const message = value.message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  throw new ConflictException('Incident timeline data is invalid.');
}

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function incidentDetailsAad(incidentId: string): string {
  return `incident:${incidentId}:details`;
}

function reviewReportAad(reportId: string): string {
  return `review-report:${reportId}:details`;
}

function privacyReasonAad(requestId: string): string {
  return `privacy-request:${requestId}:reason`;
}

function privacyPatientMessageAad(requestId: string): string {
  return `privacy-request:${requestId}:patient-message`;
}

function privacyVerificationAad(requestId: string): string {
  return `privacy-request:${requestId}:identity-verification`;
}

function privacyLegalHoldReasonAad(legalHoldId: string): string {
  return `privacy-legal-hold:${legalHoldId}:reason`;
}

function privacyLegalHoldAuthorityAad(legalHoldId: string): string {
  return `privacy-legal-hold:${legalHoldId}:authority`;
}
