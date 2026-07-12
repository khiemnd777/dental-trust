import type {
  Prisma,
  PrismaClient,
  ReviewAbuseReport,
  ReviewModerationStatus,
  ReviewReportStatus,
} from '@prisma/client';

import type {
  AuditActor,
  IncidentSeverity,
  IncidentStatus,
  PrivacyRequestStatus,
  SupportCapability,
} from '@dental-trust/domain';

const incidentRecordInclude = {
  events: {
    where: { visibility: 'PARTICIPANTS' as const },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: { id: true, eventType: true, details: true, createdAt: true },
  },
  warrantyClaim: true,
} satisfies Prisma.IncidentInclude;

const reviewRecordInclude = {
  clinicResponse: true,
} satisfies Prisma.ReviewInclude;

const supportElevationInclude = {
  subject: {
    select: {
      id: true,
      accountStatus: true,
      deletedAt: true,
      roles: { select: { role: { select: { code: true } } } },
      memberships: {
        where: { status: 'ACTIVE' as const },
        select: { organizationId: true, role: { select: { code: true } } },
      },
    },
  },
} satisfies Prisma.SupportElevationInclude;

const privacyRequestInclude = {
  execution: {
    include: {
      noticeNotification: { select: { status: true } },
      artifactFileAsset: {
        select: { id: true, objectKey: true, status: true, scanStatus: true, deletedAt: true },
      },
    },
  },
  requester: {
    select: {
      privacyLegalHolds: {
        orderBy: [{ startsAt: 'desc' as const }, { id: 'desc' as const }],
        take: 100,
      },
    },
  },
} satisfies Prisma.PrivacyRequestInclude;

export type IncidentRecord = Prisma.IncidentGetPayload<{ include: typeof incidentRecordInclude }>;
export type ReviewRecord = Prisma.ReviewGetPayload<{ include: typeof reviewRecordInclude }>;
export type SupportElevationRecord = Prisma.SupportElevationGetPayload<{
  include: typeof supportElevationInclude;
}>;
export type PrivacyRequestRecord = Prisma.PrivacyRequestGetPayload<{
  include: typeof privacyRequestInclude;
}>;

export interface TrustQueryScope {
  readonly userId: string;
  readonly organizationIds: readonly string[];
  readonly includeAll: boolean;
}

export interface TrustPageOptions {
  readonly cursor?: string;
  readonly limit: number;
}

export interface IncidentPageOptions extends TrustPageOptions {
  readonly caseId?: string;
  readonly status?: IncidentStatus;
}

export interface ReviewPageOptions extends TrustPageOptions {
  readonly clinicId?: string;
  readonly caseId?: string;
  readonly moderationStatus?: ReviewModerationStatus;
}

export interface ReviewQueryScope {
  readonly patientUserId?: string;
  readonly organizationIds: readonly string[];
  readonly includeAll: boolean;
}

export interface IdempotentTrustCommand {
  readonly userId: string;
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface CreateIncidentPersistenceInput {
  readonly id: string;
  readonly caseId: string;
  readonly clinicId?: string;
  readonly createdByUserId: string;
  readonly type: string;
  readonly severity: IncidentSeverity;
  readonly summary: string;
  readonly encryptedDetails: string;
  readonly slaDueAt: Date;
  readonly attachmentFileAssetIds: readonly string[];
  readonly warranty?: {
    readonly clinicId: string;
    readonly warrantyTerms: string;
  };
}

export interface ReviewEligibilityRecord {
  readonly reviewerUserId: string;
  readonly patientUserId: string;
  readonly caseStatus: string;
  readonly completedTreatmentAt?: Date;
  readonly platformBookingId?: string;
  readonly clinicId?: string;
  readonly existingInitialReviewId?: string;
}

export class TrustResourceNotFoundError extends Error {
  constructor() {
    super('Trust and safety resource was not found in the caller scope.');
    this.name = 'TrustResourceNotFoundError';
  }
}

export class TrustConflictError extends Error {
  constructor(message = 'The trust and safety command conflicts with current state.') {
    super(message);
    this.name = 'TrustConflictError';
  }
}

export class TrustIdempotencyConflictError extends Error {
  constructor(message = 'The idempotency key conflicts with another command.') {
    super(message);
    this.name = 'TrustIdempotencyConflictError';
  }
}

export class TrustSafetyRepository {
  constructor(private readonly db: PrismaClient) {}

  async loadPatientCaseForIncident(userId: string, caseId: string) {
    return this.db.dentalCase.findFirst({
      where: { id: caseId, patientProfile: { userId } },
      select: {
        id: true,
        status: true,
        treatmentPlans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { clinicId: true },
        },
      },
    });
  }

  async loadWarrantySource(userId: string, caseId: string) {
    return this.db.booking.findFirst({
      where: {
        caseId,
        status: 'COMPLETED',
        dentalCase: { patientProfile: { userId } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        dentalCase: { select: { status: true } },
        treatmentPlanVersion: {
          select: {
            warrantyTerms: true,
            treatmentPlan: { select: { clinicId: true } },
          },
        },
      },
    });
  }

  async createIncident(
    input: CreateIncidentPersistenceInput,
    actor: AuditActor,
    requestId: string,
    command: IdempotentTrustCommand,
  ): Promise<IncidentRecord> {
    await this.assertIncidentAttachments(input.caseId, input.attachmentFileAssetIds);
    return this.runIdempotent(
      command,
      (resourceId) => this.findIncidentById(resourceId),
      async (transaction) => {
        const incident = await transaction.incident.create({
          data: {
            id: input.id,
            caseId: input.caseId,
            ...(input.clinicId ? { clinicId: input.clinicId } : {}),
            createdByUserId: input.createdByUserId,
            type: input.type,
            severity: input.severity,
            summary: input.summary,
            encryptedDetails: input.encryptedDetails,
            slaDueAt: input.slaDueAt,
            events: {
              create: {
                actorUserId: actor.userId,
                eventType: input.warranty ? 'WARRANTY_CLAIM_SUBMITTED' : 'INCIDENT_SUBMITTED',
                visibility: 'PARTICIPANTS',
                details: {
                  message: input.warranty
                    ? 'Warranty claim submitted for review.'
                    : 'Incident submitted for review.',
                },
              },
            },
            ...(input.attachmentFileAssetIds.length > 0
              ? {
                  attachments: {
                    create: input.attachmentFileAssetIds.map((fileAssetId) => ({ fileAssetId })),
                  },
                }
              : {}),
            ...(input.warranty
              ? {
                  warrantyClaim: {
                    create: {
                      clinicId: input.warranty.clinicId,
                      warrantyTerms: input.warranty.warrantyTerms,
                    },
                  },
                }
              : {}),
          },
          include: incidentRecordInclude,
        });
        await transaction.auditLog.create({
          data: auditData(actor, {
            action: input.warranty ? 'warranty-claim.submitted' : 'incident.submitted',
            resourceType: 'Incident',
            resourceId: incident.id,
            requestId,
            afterMetadata: {
              caseId: incident.caseId,
              type: incident.type,
              severity: incident.severity,
              status: incident.status,
              attachmentCount: input.attachmentFileAssetIds.length,
            },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Incident',
            aggregateId: incident.id,
            eventType: input.warranty ? 'warranty-claim.submitted' : 'incident.submitted',
            payload: {
              incidentId: incident.id,
              caseId: incident.caseId,
              severity: incident.severity,
            },
            correlationId: requestId,
            idempotencyKey: `incident.submitted:${incident.id}`,
          },
        });
        return { resourceId: incident.id, result: incident };
      },
    );
  }

  async listIncidentsScoped(
    scope: TrustQueryScope,
    options: IncidentPageOptions,
  ): Promise<IncidentRecord[]> {
    return this.db.incident.findMany({
      where: {
        AND: [
          { dentalCase: { is: this.caseScopeWhere(scope) } },
          options.caseId ? { caseId: options.caseId } : {},
          options.status ? { status: options.status } : {},
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: options.limit + 1,
      include: incidentRecordInclude,
    });
  }

  async findIncidentScoped(
    scope: TrustQueryScope,
    incidentId: string,
  ): Promise<IncidentRecord | null> {
    return this.db.incident.findFirst({
      where: { id: incidentId, dentalCase: { is: this.caseScopeWhere(scope) } },
      include: incidentRecordInclude,
    });
  }

  async addPatientVisibleIncidentUpdate(
    incidentId: string,
    message: string,
    actor: AuditActor,
    requestId: string,
    command: IdempotentTrustCommand,
  ): Promise<IncidentRecord> {
    return this.runIdempotent(
      command,
      (resourceId) => this.findIncidentById(resourceId),
      async (transaction) => {
        const updated = await transaction.incident.update({
          where: { id: incidentId },
          data: {
            version: { increment: 1 },
            events: {
              create: {
                actorUserId: actor.userId,
                eventType: 'PATIENT_VISIBLE_UPDATE',
                visibility: 'PARTICIPANTS',
                details: { message },
              },
            },
          },
          include: incidentRecordInclude,
        });
        await transaction.auditLog.create({
          data: auditData(actor, {
            action: 'incident.patient-visible-update-added',
            resourceType: 'Incident',
            resourceId: incidentId,
            requestId,
            afterMetadata: { version: updated.version },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Incident',
            aggregateId: incidentId,
            eventType: 'incident.patient-visible-update-added',
            payload: { incidentId, caseId: updated.caseId },
            correlationId: requestId,
            idempotencyKey: `incident.patient-visible-update-added:${command.userId}:${command.key}`,
          },
        });
        return { resourceId: incidentId, result: updated };
      },
    );
  }

  async transitionIncident(input: {
    readonly incidentId: string;
    readonly toStatus: IncidentStatus;
    readonly expectedVersion: number;
    readonly patientMessage: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
    readonly severity?: IncidentSeverity;
    readonly ownerUserId?: string;
    readonly slaDueAt?: Date;
  }): Promise<IncidentRecord> {
    return this.runIdempotent(
      input.command,
      (resourceId) => this.findIncidentById(resourceId),
      async (transaction) => {
        const current = await transaction.incident.findUnique({ where: { id: input.incidentId } });
        if (!current) throw new TrustResourceNotFoundError();
        const result = await transaction.incident.updateMany({
          where: { id: input.incidentId, version: input.expectedVersion, status: current.status },
          data: {
            status: input.toStatus,
            version: { increment: 1 },
            ...(input.severity ? { severity: input.severity } : {}),
            ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
            ...(input.slaDueAt ? { slaDueAt: input.slaDueAt } : {}),
            ...(input.toStatus === 'CLOSED' ? { closedAt: new Date() } : {}),
            ...(input.toStatus === 'REOPENED' ? { closedAt: null } : {}),
          },
        });
        if (result.count !== 1) throw new TrustConflictError('Incident version changed.');
        await transaction.incidentEvent.create({
          data: {
            incidentId: input.incidentId,
            actorUserId: input.actor.userId,
            eventType: `STATUS_${input.toStatus}`,
            visibility: 'PARTICIPANTS',
            details: { message: input.patientMessage },
          },
        });
        const updated = await transaction.incident.findUniqueOrThrow({
          where: { id: input.incidentId },
          include: incidentRecordInclude,
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'incident.status-transitioned',
            resourceType: 'Incident',
            resourceId: input.incidentId,
            requestId: input.requestId,
            beforeMetadata: { status: current.status, version: current.version },
            afterMetadata: {
              status: updated.status,
              version: updated.version,
              severity: updated.severity,
              ownerAssigned: updated.ownerUserId !== null,
            },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Incident',
            aggregateId: input.incidentId,
            eventType: 'incident.status-transitioned',
            payload: {
              incidentId: input.incidentId,
              caseId: updated.caseId,
              fromStatus: current.status,
              toStatus: updated.status,
            },
            correlationId: input.requestId,
            idempotencyKey: `incident.status-transitioned:${input.incidentId}:${updated.version}`,
          },
        });
        return { resourceId: input.incidentId, result: updated };
      },
    );
  }

  async loadReviewEligibility(
    caseId: string,
    reviewerUserId: string,
  ): Promise<ReviewEligibilityRecord> {
    const dentalCase = await this.db.dentalCase.findFirst({
      where: { id: caseId, patientProfile: { userId: reviewerUserId } },
      select: {
        status: true,
        patientProfile: { select: { userId: true } },
        reviews: { where: { patientUserId: reviewerUserId }, take: 1, select: { id: true } },
        bookings: {
          where: { status: 'COMPLETED' },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            updatedAt: true,
            treatmentPlanVersion: {
              select: { treatmentPlan: { select: { clinicId: true } } },
            },
          },
        },
      },
    });
    if (!dentalCase) throw new TrustResourceNotFoundError();
    const booking = dentalCase.bookings[0];
    return {
      reviewerUserId,
      patientUserId: dentalCase.patientProfile.userId,
      caseStatus: dentalCase.status,
      ...(booking
        ? {
            completedTreatmentAt: booking.updatedAt,
            platformBookingId: booking.id,
            clinicId: booking.treatmentPlanVersion.treatmentPlan.clinicId,
          }
        : {}),
      ...(dentalCase.reviews[0] ? { existingInitialReviewId: dentalCase.reviews[0].id } : {}),
    };
  }

  async createVerifiedReview(input: {
    readonly caseId: string;
    readonly clinicId: string;
    readonly patientUserId: string;
    readonly overallRating: number;
    readonly dimensionRatings: Prisma.InputJsonObject;
    readonly content: string;
    readonly treatmentDate: Date;
    readonly followUpDays: number;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<ReviewRecord> {
    return this.runIdempotent(
      input.command,
      (resourceId) => this.findReviewById(resourceId),
      async (transaction) => {
        const review = await transaction.review.create({
          data: {
            caseId: input.caseId,
            clinicId: input.clinicId,
            patientUserId: input.patientUserId,
            overallRating: input.overallRating,
            dimensionRatings: input.dimensionRatings,
            content: input.content,
            treatmentDate: input.treatmentDate,
            followUpDays: input.followUpDays,
            verified: true,
          },
          include: reviewRecordInclude,
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'review.submitted',
            resourceType: 'Review',
            resourceId: review.id,
            requestId: input.requestId,
            afterMetadata: {
              caseId: input.caseId,
              clinicId: input.clinicId,
              verified: true,
              moderationStatus: review.moderationStatus,
            },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Review',
            aggregateId: review.id,
            eventType: 'review.submitted',
            payload: { reviewId: review.id, clinicId: review.clinicId },
            correlationId: input.requestId,
            idempotencyKey: `review.submitted:${review.id}`,
          },
        });
        return { resourceId: review.id, result: review };
      },
    );
  }

  async listReviewsScoped(
    scope: ReviewQueryScope,
    options: ReviewPageOptions,
  ): Promise<ReviewRecord[]> {
    const scopePredicates: Prisma.ReviewWhereInput[] = [];
    if (scope.patientUserId) scopePredicates.push({ patientUserId: scope.patientUserId });
    if (scope.organizationIds.length > 0) {
      scopePredicates.push({
        clinic: { organizationId: { in: [...scope.organizationIds] } },
      });
    }
    return this.db.review.findMany({
      where: {
        AND: [
          scope.includeAll
            ? {}
            : scopePredicates.length > 0
              ? { OR: scopePredicates }
              : { id: '00000000-0000-0000-0000-000000000000' },
          options.clinicId ? { clinicId: options.clinicId } : {},
          options.caseId ? { caseId: options.caseId } : {},
          options.moderationStatus ? { moderationStatus: options.moderationStatus } : {},
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: options.limit + 1,
      include: reviewRecordInclude,
    });
  }

  async createClinicReviewResponse(input: {
    readonly reviewId: string;
    readonly authorUserId: string;
    readonly organizationIds: readonly string[];
    readonly content: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<ReviewRecord> {
    const review = await this.db.review.findFirst({
      where: {
        id: input.reviewId,
        clinic: {
          organizationId: { in: [...input.organizationIds] },
          staff: {
            some: {
              userId: input.authorUserId,
              active: true,
              membership: { status: 'ACTIVE' },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!review) throw new TrustResourceNotFoundError();
    return this.runIdempotent(
      input.command,
      (resourceId) => this.findReviewById(resourceId),
      async (transaction) => {
        await transaction.reviewResponse.create({
          data: {
            reviewId: input.reviewId,
            authorUserId: input.authorUserId,
            content: input.content,
          },
        });
        const updated = await transaction.review.findUniqueOrThrow({
          where: { id: input.reviewId },
          include: reviewRecordInclude,
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'review.clinic-response-submitted',
            resourceType: 'Review',
            resourceId: input.reviewId,
            requestId: input.requestId,
            afterMetadata: { moderationStatus: updated.clinicResponse?.moderationStatus },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Review',
            aggregateId: input.reviewId,
            eventType: 'review.clinic-response-submitted',
            payload: { reviewId: input.reviewId, clinicId: updated.clinicId },
            correlationId: input.requestId,
            idempotencyKey: `review.clinic-response-submitted:${input.reviewId}`,
          },
        });
        return { resourceId: input.reviewId, result: updated };
      },
    );
  }

  async reportReviewAbuse(input: {
    readonly id: string;
    readonly reviewId: string;
    readonly reporterUserId: string;
    readonly reasonCode: string;
    readonly encryptedDetails: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<{ readonly id: string; readonly status: string; readonly createdAt: Date }> {
    const review = await this.db.review.findFirst({
      where: { id: input.reviewId, moderationStatus: 'PUBLISHED' },
      select: { id: true },
    });
    if (!review) throw new TrustResourceNotFoundError();
    return this.runIdempotent(
      input.command,
      async (resourceId) =>
        this.db.reviewAbuseReport.findUnique({
          where: { id: resourceId },
          select: { id: true, status: true, createdAt: true },
        }),
      async (transaction) => {
        const report = await transaction.reviewAbuseReport.create({
          data: {
            id: input.id,
            reviewId: input.reviewId,
            reporterUserId: input.reporterUserId,
            reasonCode: input.reasonCode,
            encryptedDetails: input.encryptedDetails,
          },
          select: { id: true, status: true, createdAt: true },
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'review.abuse-reported',
            resourceType: 'ReviewAbuseReport',
            resourceId: report.id,
            requestId: input.requestId,
            afterMetadata: { reviewId: input.reviewId, reasonCode: input.reasonCode },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'ReviewAbuseReport',
            aggregateId: report.id,
            eventType: 'review.abuse-reported',
            payload: { reportId: report.id, reviewId: input.reviewId },
            correlationId: input.requestId,
            idempotencyKey: `review.abuse-reported:${report.id}`,
          },
        });
        return { resourceId: report.id, result: report };
      },
    );
  }

  async moderateReview(input: {
    readonly reviewId: string;
    readonly target: 'REVIEW' | 'CLINIC_RESPONSE';
    readonly status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED';
    readonly reason: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<ReviewRecord> {
    return this.runIdempotent(
      input.command,
      (resourceId) => this.findReviewById(resourceId),
      async (transaction) => {
        const current = await transaction.review.findUnique({
          where: { id: input.reviewId },
          include: reviewRecordInclude,
        });
        if (!current) throw new TrustResourceNotFoundError();
        if (input.target === 'CLINIC_RESPONSE') {
          if (!current.clinicResponse) throw new TrustResourceNotFoundError();
          const responseUpdate = await transaction.reviewResponse.updateMany({
            where: {
              reviewId: input.reviewId,
              moderationStatus: current.clinicResponse.moderationStatus,
            },
            data: { moderationStatus: input.status },
          });
          if (responseUpdate.count !== 1) {
            throw new TrustConflictError('The clinic response moderation state changed.');
          }
        } else {
          const reviewUpdate = await transaction.review.updateMany({
            where: { id: input.reviewId, moderationStatus: current.moderationStatus },
            data: { moderationStatus: input.status },
          });
          if (reviewUpdate.count !== 1) {
            throw new TrustConflictError('The review moderation state changed.');
          }
          if (input.status === 'HIDDEN' || input.status === 'REJECTED') {
            await transaction.reviewAbuseReport.updateMany({
              where: { reviewId: input.reviewId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
              data: { status: 'ACTIONED' },
            });
          }
        }
        const updated = await transaction.review.findUniqueOrThrow({
          where: { id: input.reviewId },
          include: reviewRecordInclude,
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'review.moderated',
            resourceType: 'Review',
            resourceId: input.reviewId,
            requestId: input.requestId,
            reason: input.reason,
            beforeMetadata: {
              target: input.target,
              status:
                input.target === 'REVIEW'
                  ? current.moderationStatus
                  : current.clinicResponse?.moderationStatus,
            },
            afterMetadata: { target: input.target, status: input.status },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Review',
            aggregateId: input.reviewId,
            eventType: 'review.moderated',
            payload: { reviewId: input.reviewId, target: input.target, status: input.status },
            correlationId: input.requestId,
            idempotencyKey: `review.moderated:${input.command.userId}:${input.command.key}`,
          },
        });
        return { resourceId: input.reviewId, result: updated };
      },
    );
  }

  async listReviewAbuseReports(
    status: ReviewReportStatus | undefined,
    options: TrustPageOptions,
  ): Promise<ReviewAbuseReport[]> {
    return this.db.reviewAbuseReport.findMany({
      where: status ? { status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: options.limit + 1,
    });
  }

  async decideReviewAbuseReport(input: {
    readonly reportId: string;
    readonly status: Extract<ReviewReportStatus, 'ACTIONED' | 'DISMISSED'>;
    readonly reason: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<ReviewAbuseReport> {
    return this.runIdempotent(
      input.command,
      (resourceId) => this.db.reviewAbuseReport.findUnique({ where: { id: resourceId } }),
      async (transaction) => {
        const current = await transaction.reviewAbuseReport.findUnique({
          where: { id: input.reportId },
        });
        if (!current) throw new TrustResourceNotFoundError();
        if (!['OPEN', 'UNDER_REVIEW'].includes(current.status)) {
          throw new TrustConflictError('The review abuse report is already resolved.');
        }
        const decision = await transaction.reviewAbuseReport.updateMany({
          where: { id: input.reportId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
          data: { status: input.status },
        });
        if (decision.count !== 1) {
          throw new TrustConflictError('The review abuse report changed before this decision.');
        }
        const report = await transaction.reviewAbuseReport.findUniqueOrThrow({
          where: { id: input.reportId },
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'review.abuse-report-decided',
            resourceType: 'ReviewAbuseReport',
            resourceId: input.reportId,
            requestId: input.requestId,
            reason: input.reason,
            beforeMetadata: { status: current.status, reviewId: current.reviewId },
            afterMetadata: { status: report.status, reviewId: report.reviewId },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'ReviewAbuseReport',
            aggregateId: input.reportId,
            eventType: 'review.abuse-report-decided',
            payload: { reportId: input.reportId, reviewId: report.reviewId, status: report.status },
            correlationId: input.requestId,
            idempotencyKey: `review.abuse-report-decided:${input.reportId}`,
          },
        });
        return { resourceId: input.reportId, result: report };
      },
    );
  }

  async createPrivacyRequest(input: {
    readonly id: string;
    readonly requesterUserId: string;
    readonly type: 'EXPORT' | 'DELETE';
    readonly encryptedReason: string;
    readonly dueAt: Date;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<PrivacyRequestRecord> {
    return this.runIdempotent(
      input.command,
      (resourceId) =>
        this.db.privacyRequest.findUnique({
          where: { id: resourceId },
          include: privacyRequestInclude,
        }),
      async (transaction) => {
        const request = await transaction.privacyRequest.create({
          data: {
            id: input.id,
            requesterUserId: input.requesterUserId,
            type: input.type,
            encryptedReason: input.encryptedReason,
            dueAt: input.dueAt,
          },
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'privacy-request.submitted',
            resourceType: 'PrivacyRequest',
            resourceId: request.id,
            requestId: input.requestId,
            afterMetadata: {
              type: request.type,
              status: request.status,
              dueAt: request.dueAt.toISOString(),
            },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'PrivacyRequest',
            aggregateId: request.id,
            eventType: 'privacy-request.submitted',
            payload: { privacyRequestId: request.id, type: request.type },
            correlationId: input.requestId,
            idempotencyKey: `privacy-request.submitted:${request.id}`,
          },
        });
        return {
          resourceId: request.id,
          result: await transaction.privacyRequest.findUniqueOrThrow({
            where: { id: request.id },
            include: privacyRequestInclude,
          }),
        };
      },
    );
  }

  async listPrivacyRequests(
    requesterUserId: string | undefined,
    status: PrivacyRequestStatus | undefined,
    options: TrustPageOptions,
  ): Promise<PrivacyRequestRecord[]> {
    return this.db.privacyRequest.findMany({
      where: {
        type: { in: ['EXPORT', 'DELETE'] },
        ...(requesterUserId ? { requesterUserId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: options.limit + 1,
      include: privacyRequestInclude,
    });
  }

  async findPrivacyRequestScoped(
    requestId: string,
    requesterUserId?: string,
  ): Promise<PrivacyRequestRecord | null> {
    return this.db.privacyRequest.findFirst({
      where: { id: requestId, ...(requesterUserId ? { requesterUserId } : {}) },
      include: privacyRequestInclude,
    });
  }

  async transitionPrivacyRequest(input: {
    readonly privacyRequestId: string;
    readonly toStatus: PrivacyRequestStatus;
    readonly expectedVersion: number;
    readonly encryptedPatientMessage: string;
    readonly handlerUserId?: string;
    readonly reason: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
    readonly verification?: {
      readonly method: 'ACCOUNT_MFA' | 'VERIFIED_COMMUNICATION' | 'DOCUMENT_REVIEW';
      readonly encryptedReference: string;
      readonly verifiedAt: Date;
    };
  }): Promise<PrivacyRequestRecord> {
    return this.runIdempotent(
      input.command,
      (resourceId) =>
        this.db.privacyRequest.findUnique({
          where: { id: resourceId },
          include: privacyRequestInclude,
        }),
      async (transaction) => {
        const current = await transaction.privacyRequest.findUnique({
          where: { id: input.privacyRequestId },
        });
        if (!current) throw new TrustResourceNotFoundError();
        const result = await transaction.privacyRequest.updateMany({
          where: { id: input.privacyRequestId, version: input.expectedVersion },
          data: {
            status: input.toStatus,
            encryptedPatientMessage: input.encryptedPatientMessage,
            version: { increment: 1 },
            ...(input.handlerUserId ? { handledByUserId: input.handlerUserId } : {}),
            ...(input.toStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
          },
        });
        if (result.count !== 1) throw new TrustConflictError('Privacy request version changed.');
        if (input.toStatus === 'APPROVED') {
          if (!input.verification || !input.handlerUserId) {
            throw new TrustConflictError('Privacy approval requires identity verification.');
          }
          const execution = await transaction.privacyRequestExecution.upsert({
            where: { privacyRequestId: input.privacyRequestId },
            update: {
              status: 'PENDING',
              outcome: null,
              identityVerificationMethod: input.verification.method,
              encryptedVerificationReference: input.verification.encryptedReference,
              verifiedByUserId: input.handlerUserId,
              verifiedAt: input.verification.verifiedAt,
              noticeNotificationId: null,
              blockerCodes: [],
              leaseExpiresAt: null,
              lastErrorCode: null,
              version: { increment: 1 },
            },
            create: {
              privacyRequestId: input.privacyRequestId,
              identityVerificationMethod: input.verification.method,
              encryptedVerificationReference: input.verification.encryptedReference,
              verifiedByUserId: input.handlerUserId,
              verifiedAt: input.verification.verifiedAt,
            },
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateType: 'PrivacyRequestExecution',
              aggregateId: execution.id,
              eventType: 'privacy-request.execution-requested',
              payload: {
                privacyRequestId: input.privacyRequestId,
                privacyExecutionId: execution.id,
                type: current.type,
              },
              correlationId: input.requestId,
              idempotencyKey: `privacy-request.execution-requested:${execution.id}:${execution.version}`,
            },
          });
        }
        const updated = await transaction.privacyRequest.findUniqueOrThrow({
          where: { id: input.privacyRequestId },
          include: privacyRequestInclude,
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'privacy-request.status-transitioned',
            resourceType: 'PrivacyRequest',
            resourceId: input.privacyRequestId,
            requestId: input.requestId,
            reason: input.reason,
            beforeMetadata: { status: current.status, version: current.version },
            afterMetadata: { status: updated.status, version: updated.version },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'PrivacyRequest',
            aggregateId: input.privacyRequestId,
            eventType: 'privacy-request.status-transitioned',
            payload: {
              privacyRequestId: input.privacyRequestId,
              requesterUserId: updated.requesterUserId,
              status: updated.status,
            },
            correlationId: input.requestId,
            idempotencyKey: `privacy-request.status-transitioned:${input.privacyRequestId}:${updated.version}`,
          },
        });
        return { resourceId: input.privacyRequestId, result: updated };
      },
    );
  }

  async retryPrivacyExecution(input: {
    readonly privacyRequestId: string;
    readonly expectedVersion: number;
    readonly reason: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<PrivacyRequestRecord> {
    return this.runIdempotent(
      input.command,
      (resourceId) =>
        this.db.privacyRequest.findUnique({
          where: { id: resourceId },
          include: privacyRequestInclude,
        }),
      async (transaction) => {
        const request = await transaction.privacyRequest.findUnique({
          where: { id: input.privacyRequestId },
          include: { execution: true },
        });
        if (!request?.execution || request.status !== 'PROCESSING') {
          throw new TrustConflictError('Privacy execution is not retryable.');
        }
        const changed = await transaction.privacyRequestExecution.updateMany({
          where: {
            id: request.execution.id,
            version: input.expectedVersion,
            status: 'FAILED',
          },
          data: {
            status: 'PENDING',
            leaseExpiresAt: null,
            lastErrorCode: null,
            blockerCodes: [],
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new TrustConflictError('Privacy execution version changed.');
        const execution = await transaction.privacyRequestExecution.findUniqueOrThrow({
          where: { id: request.execution.id },
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'privacy-request.execution-retried',
            resourceType: 'PrivacyRequestExecution',
            resourceId: execution.id,
            requestId: input.requestId,
            reason: input.reason,
            beforeMetadata: {
              status: request.execution.status,
              version: request.execution.version,
              lastErrorCode: request.execution.lastErrorCode,
            },
            afterMetadata: { status: execution.status, version: execution.version },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'PrivacyRequestExecution',
            aggregateId: execution.id,
            eventType: 'privacy-request.execution-requested',
            payload: {
              privacyRequestId: request.id,
              privacyExecutionId: execution.id,
              type: request.type,
              retry: true,
            },
            correlationId: input.requestId,
            idempotencyKey: `privacy-request.execution-retried:${execution.id}:${execution.version}`,
          },
        });
        return {
          resourceId: request.id,
          result: await transaction.privacyRequest.findUniqueOrThrow({
            where: { id: request.id },
            include: privacyRequestInclude,
          }),
        };
      },
    );
  }

  async listPrivacyLegalHolds(
    subjectUserId: string,
    activeOnly: boolean,
    options: TrustPageOptions,
    at = new Date(),
  ) {
    return this.db.privacyLegalHold.findMany({
      where: {
        subjectUserId,
        ...(activeOnly
          ? {
              releasedAt: null,
              startsAt: { lte: at },
              OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
            }
          : {}),
      },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: options.limit + 1,
    });
  }

  async createPrivacyLegalHold(input: {
    readonly id: string;
    readonly subjectUserId: string;
    readonly scopes: readonly (
      'ALL' | 'IDENTITY' | 'CLINICAL' | 'FINANCIAL' | 'TRUST_SAFETY' | 'AUDIT_SECURITY' | 'FILES'
    )[];
    readonly encryptedReason: string;
    readonly encryptedAuthorityReference: string;
    readonly startsAt: Date;
    readonly expiresAt: Date | null;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }) {
    return this.runIdempotent(
      input.command,
      (resourceId) => this.db.privacyLegalHold.findUnique({ where: { id: resourceId } }),
      async (transaction) => {
        const subject = await transaction.user.findFirst({
          where: { id: input.subjectUserId, deletedAt: null },
          select: { id: true },
        });
        if (!subject) throw new TrustResourceNotFoundError();
        const hold = await transaction.privacyLegalHold.create({
          data: {
            id: input.id,
            subjectUserId: input.subjectUserId,
            scopes: [...new Set(input.scopes)],
            encryptedReason: input.encryptedReason,
            encryptedAuthorityReference: input.encryptedAuthorityReference,
            placedByUserId: input.actor.userId,
            startsAt: input.startsAt,
            expiresAt: input.expiresAt,
          },
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'privacy.legal-hold-placed',
            resourceType: 'PrivacyLegalHold',
            resourceId: hold.id,
            requestId: input.requestId,
            afterMetadata: {
              subjectUserId: input.subjectUserId,
              scopes: hold.scopes,
              startsAt: hold.startsAt.toISOString(),
              expiresAt: hold.expiresAt?.toISOString() ?? null,
            },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'PrivacyLegalHold',
            aggregateId: hold.id,
            eventType: 'privacy.legal-hold-placed',
            payload: {
              legalHoldId: hold.id,
              subjectUserId: input.subjectUserId,
              scopes: hold.scopes,
            },
            correlationId: input.requestId,
            idempotencyKey: `privacy.legal-hold-placed:${hold.id}`,
          },
        });
        return { resourceId: hold.id, result: hold };
      },
    );
  }

  async releasePrivacyLegalHold(input: {
    readonly legalHoldId: string;
    readonly expectedVersion: number;
    readonly reason: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }) {
    return this.runIdempotent(
      input.command,
      (resourceId) => this.db.privacyLegalHold.findUnique({ where: { id: resourceId } }),
      async (transaction) => {
        const current = await transaction.privacyLegalHold.findUnique({
          where: { id: input.legalHoldId },
        });
        if (!current) throw new TrustResourceNotFoundError();
        const changed = await transaction.privacyLegalHold.updateMany({
          where: {
            id: input.legalHoldId,
            version: input.expectedVersion,
            releasedAt: null,
          },
          data: {
            releasedAt: new Date(),
            releasedByUserId: input.actor.userId,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new TrustConflictError('Privacy legal hold version changed.');
        const hold = await transaction.privacyLegalHold.findUniqueOrThrow({
          where: { id: input.legalHoldId },
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'privacy.legal-hold-released',
            resourceType: 'PrivacyLegalHold',
            resourceId: hold.id,
            requestId: input.requestId,
            reason: input.reason,
            beforeMetadata: { version: current.version, releasedAt: null },
            afterMetadata: { version: hold.version, releasedAt: hold.releasedAt?.toISOString() },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'PrivacyLegalHold',
            aggregateId: hold.id,
            eventType: 'privacy.legal-hold-released',
            payload: { legalHoldId: hold.id, subjectUserId: hold.subjectUserId },
            correlationId: input.requestId,
            idempotencyKey: `privacy.legal-hold-released:${hold.id}:${hold.version}`,
          },
        });
        return { resourceId: hold.id, result: hold };
      },
    );
  }

  async createSupportElevation(input: {
    readonly actorUserId: string;
    readonly subjectUserId: string;
    readonly approvedByUserId: string;
    readonly ticketReference: string;
    readonly reason: string;
    readonly capabilities: readonly SupportCapability[];
    readonly expiresAt: Date;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<SupportElevationRecord> {
    return this.runIdempotent(
      input.command,
      (resourceId) => this.findSupportElevationById(resourceId),
      async (transaction) => {
        const elevation = await transaction.supportElevation.create({
          data: {
            actorUserId: input.actorUserId,
            subjectUserId: input.subjectUserId,
            approvedByUserId: input.approvedByUserId,
            ticketReference: input.ticketReference,
            reason: input.reason,
            capabilities: [...new Set(input.capabilities)],
            expiresAt: input.expiresAt,
          },
          include: supportElevationInclude,
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'support-elevation.granted',
            resourceType: 'SupportElevation',
            resourceId: elevation.id,
            requestId: input.requestId,
            reason: input.reason,
            afterMetadata: {
              actorUserId: input.actorUserId,
              subjectUserId: input.subjectUserId,
              ticketReference: input.ticketReference,
              capabilities: [...input.capabilities],
              expiresAt: input.expiresAt.toISOString(),
            },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'SupportElevation',
            aggregateId: elevation.id,
            eventType: 'support-elevation.granted',
            payload: {
              elevationId: elevation.id,
              actorUserId: elevation.actorUserId,
              expiresAt: elevation.expiresAt.toISOString(),
            },
            correlationId: input.requestId,
            idempotencyKey: `support-elevation.granted:${elevation.id}`,
          },
        });
        return { resourceId: elevation.id, result: elevation };
      },
    );
  }

  async findActiveSupportElevation(
    elevationId: string,
    actorUserId: string,
    now = new Date(),
  ): Promise<SupportElevationRecord | null> {
    return this.db.supportElevation.findFirst({
      where: {
        id: elevationId,
        actorUserId,
        status: 'ACTIVE',
        expiresAt: { gt: now },
        revokedAt: null,
      },
      include: supportElevationInclude,
    });
  }

  async recordSupportElevationUse(input: {
    readonly elevation: SupportElevationRecord;
    readonly requestId: string;
    readonly requestPath: string;
  }): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const updated = await transaction.supportElevation.updateMany({
        where: {
          id: input.elevation.id,
          actorUserId: input.elevation.actorUserId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          revokedAt: null,
        },
        data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
      });
      if (updated.count !== 1) throw new TrustResourceNotFoundError();
      await transaction.auditLog.create({
        data: {
          actorUserId: input.elevation.subjectUserId,
          impersonatorUserId: input.elevation.actorUserId,
          action: 'support-elevation.used',
          resourceType: 'SupportElevation',
          resourceId: input.elevation.id,
          requestId: input.requestId,
          reason: input.elevation.reason,
          success: true,
          afterMetadata: {
            ticketReference: input.elevation.ticketReference,
            path: input.requestPath,
          },
        },
      });
    });
  }

  async listSupportElevations(
    actorUserId: string | undefined,
    options: TrustPageOptions,
  ): Promise<SupportElevationRecord[]> {
    return this.db.supportElevation.findMany({
      where: actorUserId ? { actorUserId } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: options.limit + 1,
      include: supportElevationInclude,
    });
  }

  async revokeSupportElevation(input: {
    readonly elevationId: string;
    readonly requestingUserId: string;
    readonly allowAny: boolean;
    readonly reason: string;
    readonly actor: AuditActor;
    readonly requestId: string;
    readonly command: IdempotentTrustCommand;
  }): Promise<SupportElevationRecord> {
    return this.runIdempotent(
      input.command,
      (resourceId) => this.findSupportElevationById(resourceId),
      async (transaction) => {
        const current = await transaction.supportElevation.findFirst({
          where: {
            id: input.elevationId,
            ...(input.allowAny ? {} : { actorUserId: input.requestingUserId }),
          },
        });
        if (!current) throw new TrustResourceNotFoundError();
        if (current.status === 'REVOKED') {
          const replay = await transaction.supportElevation.findUniqueOrThrow({
            where: { id: input.elevationId },
            include: supportElevationInclude,
          });
          return { resourceId: input.elevationId, result: replay };
        }
        const elevation = await transaction.supportElevation.update({
          where: { id: input.elevationId },
          data: { status: 'REVOKED', revokedAt: new Date() },
          include: supportElevationInclude,
        });
        await transaction.auditLog.create({
          data: auditData(input.actor, {
            action: 'support-elevation.revoked',
            resourceType: 'SupportElevation',
            resourceId: input.elevationId,
            requestId: input.requestId,
            reason: input.reason,
            beforeMetadata: { status: current.status },
            afterMetadata: { status: elevation.status },
          }),
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'SupportElevation',
            aggregateId: input.elevationId,
            eventType: 'support-elevation.revoked',
            payload: { elevationId: input.elevationId, actorUserId: elevation.actorUserId },
            correlationId: input.requestId,
            idempotencyKey: `support-elevation.revoked:${input.elevationId}`,
          },
        });
        return { resourceId: input.elevationId, result: elevation };
      },
    );
  }

  private async assertIncidentAttachments(
    caseId: string,
    attachmentFileAssetIds: readonly string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(attachmentFileAssetIds)];
    if (uniqueIds.length !== attachmentFileAssetIds.length) {
      throw new TrustConflictError('Incident attachments must be unique.');
    }
    if (uniqueIds.length === 0) return;
    const count = await this.db.caseDocument.count({
      where: {
        caseId,
        fileAssetId: { in: uniqueIds },
        fileAsset: { status: 'AVAILABLE', scanStatus: 'CLEAN', deletedAt: null },
      },
    });
    if (count !== uniqueIds.length) throw new TrustResourceNotFoundError();
  }

  private caseScopeWhere(scope: TrustQueryScope): Prisma.DentalCaseWhereInput {
    if (scope.includeAll) return {};
    return {
      OR: [
        { patientProfile: { userId: scope.userId } },
        {
          assignments: {
            some: { assignedUserId: scope.userId, endedAt: null },
          },
        },
        ...(scope.organizationIds.length > 0
          ? [
              {
                assignments: {
                  some: {
                    organizationId: { in: [...scope.organizationIds] },
                    endedAt: null,
                    organization: {
                      is: {
                        memberships: {
                          some: { userId: scope.userId, status: 'ACTIVE' as const },
                        },
                      },
                    },
                  },
                },
              },
            ]
          : []),
      ],
    };
  }

  private async findIncidentById(incidentId: string): Promise<IncidentRecord | null> {
    return this.db.incident.findUnique({
      where: { id: incidentId },
      include: incidentRecordInclude,
    });
  }

  private async findReviewById(reviewId: string): Promise<ReviewRecord | null> {
    return this.db.review.findUnique({
      where: { id: reviewId },
      include: reviewRecordInclude,
    });
  }

  private async findSupportElevationById(
    elevationId: string,
  ): Promise<SupportElevationRecord | null> {
    return this.db.supportElevation.findUnique({
      where: { id: elevationId },
      include: supportElevationInclude,
    });
  }

  private async runIdempotent<T>(
    command: IdempotentTrustCommand,
    load: (resourceId: string) => Promise<T | null>,
    work: (
      transaction: Prisma.TransactionClient,
    ) => Promise<{ readonly resourceId: string; readonly result: T }>,
  ): Promise<T> {
    const replayId = await this.resolveReplay(command, false);
    if (replayId) {
      const replay = await load(replayId);
      if (replay) return replay;
      throw new TrustIdempotencyConflictError('The original command resource no longer exists.');
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
        const racedId = await this.resolveReplay(command, true);
        if (racedId) {
          const replay = await load(racedId);
          if (replay) return replay;
        }
        throw new TrustIdempotencyConflictError();
      });
  }

  private async resolveReplay(
    command: IdempotentTrustCommand,
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
        throw new TrustIdempotencyConflictError(
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
    throw new TrustIdempotencyConflictError(
      'The original command is still in progress; retry shortly.',
    );
  }
}

function auditData(
  actor: AuditActor,
  input: {
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly requestId: string;
    readonly reason?: string;
    readonly beforeMetadata?: Prisma.InputJsonObject;
    readonly afterMetadata?: Prisma.InputJsonObject;
  },
) {
  return {
    actorUserId: actor.userId,
    ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
    ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    requestId: input.requestId,
    ...(input.reason ? { reason: input.reason } : {}),
    success: true,
    ...(input.beforeMetadata ? { beforeMetadata: input.beforeMetadata } : {}),
    ...(input.afterMetadata ? { afterMetadata: input.afterMetadata } : {}),
  };
}

function isIdempotencyInsertRace(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') {
    return false;
  }
  const metadata = 'meta' in error ? error.meta : undefined;
  if (!metadata || typeof metadata !== 'object' || !('target' in metadata)) return false;
  const { target } = metadata;
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
