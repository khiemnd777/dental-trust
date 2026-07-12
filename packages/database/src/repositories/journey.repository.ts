import { Prisma, type PrismaClient } from '@prisma/client';

import { IdempotencyConflictError, OptimisticConcurrencyError } from './case.repository.js';

export class JourneyNotFoundError extends Error {
  constructor() {
    super('Journey resource was not found in the authorized case scope.');
    this.name = 'JourneyNotFoundError';
  }
}

export class JourneyConflictError extends Error {
  constructor(message = 'The journey command conflicts with current state.') {
    super(message);
    this.name = 'JourneyConflictError';
  }
}

export interface JourneyCommand {
  readonly userId: string;
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface JourneyActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly organizationId?: string;
}

export class JourneyRepository {
  constructor(private readonly db: PrismaClient) {}

  async assignedClinicId(caseId: string, actor: JourneyActor): Promise<string> {
    return this.db.$transaction((transaction) =>
      assertClinicAssignment(transaction, caseId, actor),
    );
  }

  async read(caseId: string) {
    return this.db.dentalCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        status: true,
        version: true,
        treatmentMilestones: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        treatmentInstructions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        planChangeRequests: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { acknowledgement: true },
        },
        treatmentEvents: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
      },
    });
  }

  async completeMilestone(input: {
    readonly caseId: string;
    readonly milestoneId: string;
    readonly expectedVersion: number;
    readonly encryptedProviderNote?: string;
    readonly actor: JourneyActor;
    readonly command: JourneyCommand;
    readonly requestId: string;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findMilestone(input.caseId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertClinicAssignment(transaction, input.caseId, input.actor);
        const changed = await transaction.treatmentMilestone.updateMany({
          where: {
            id: input.milestoneId,
            caseId: input.caseId,
            version: input.expectedVersion,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            completedByUserId: input.actor.userId,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        const milestone = await transaction.treatmentMilestone.findUniqueOrThrow({
          where: { id: input.milestoneId },
        });
        await transaction.treatmentEvent.create({
          data: {
            caseId: input.caseId,
            actorUserId: input.actor.userId,
            eventType: 'MILESTONE_COMPLETED',
            details: {
              milestoneId: milestone.id,
              milestoneCode: milestone.code,
              ...(input.encryptedProviderNote
                ? { encryptedProviderNote: input.encryptedProviderNote }
                : {}),
            },
          },
        });
        await writeMutationEvidence(transaction, {
          actor: input.actor,
          caseId: input.caseId,
          action: 'journey.milestone-completed',
          resourceType: 'TreatmentMilestone',
          resourceId: milestone.id,
          requestId: input.requestId,
          eventType: 'journey.milestone-completed',
          payload: { caseId: input.caseId, milestoneId: milestone.id, code: milestone.code },
        });
        return { resourceId: milestone.id, value: milestone };
      },
      (resourceId) => this.findMilestone(input.caseId, resourceId),
    );
  }

  async createInstruction(input: {
    readonly instructionId: string;
    readonly caseId: string;
    readonly milestoneId?: string;
    readonly type: 'MEDICATION' | 'DISCHARGE' | 'FOLLOW_UP';
    readonly locale: string;
    readonly encryptedContent: string;
    readonly actor: JourneyActor;
    readonly command: JourneyCommand;
    readonly requestId: string;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId)
      return this.db.treatmentInstruction.findUniqueOrThrow({ where: { id: replayId } });
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertClinicAssignment(transaction, input.caseId, input.actor);
        const instruction = await transaction.treatmentInstruction.create({
          data: {
            id: input.instructionId,
            caseId: input.caseId,
            ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}),
            authorUserId: input.actor.userId,
            type: input.type,
            locale: input.locale,
            encryptedContent: input.encryptedContent,
          },
        });
        await writeMutationEvidence(transaction, {
          actor: input.actor,
          caseId: input.caseId,
          action: 'journey.instruction-authored',
          resourceType: 'TreatmentInstruction',
          resourceId: instruction.id,
          requestId: input.requestId,
          eventType: 'journey.instruction-authored',
          payload: { caseId: input.caseId, instructionId: instruction.id, type: instruction.type },
        });
        return { resourceId: instruction.id, value: instruction };
      },
      (resourceId) => this.db.treatmentInstruction.findUniqueOrThrow({ where: { id: resourceId } }),
    );
  }

  async createPlanChange(input: {
    readonly caseId: string;
    readonly fromPlanVersionId: string;
    readonly kind: 'TREATMENT' | 'PRICE' | 'TREATMENT_AND_PRICE';
    readonly reason: string;
    readonly beforeValues: Prisma.InputJsonObject;
    readonly afterValues: Prisma.InputJsonObject;
    readonly actor: JourneyActor;
    readonly command: JourneyCommand;
    readonly requestId: string;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findPlanChange(input.caseId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const clinicId = await assertClinicAssignment(transaction, input.caseId, input.actor);
        const plan = await transaction.treatmentPlanVersion.findFirst({
          where: {
            id: input.fromPlanVersionId,
            treatmentPlan: { caseId: input.caseId, clinicId },
          },
          select: { id: true },
        });
        if (!plan) throw new JourneyNotFoundError();
        const change = await transaction.planChangeRequest.create({
          data: {
            caseId: input.caseId,
            fromPlanVersionId: input.fromPlanVersionId,
            authorUserId: input.actor.userId,
            kind: input.kind,
            reason: input.reason,
            beforeValues: input.beforeValues,
            afterValues: input.afterValues,
          },
        });
        await writeMutationEvidence(transaction, {
          actor: input.actor,
          caseId: input.caseId,
          action: 'journey.plan-change-recorded',
          resourceType: 'PlanChangeRequest',
          resourceId: change.id,
          requestId: input.requestId,
          eventType: 'journey.plan-change-recorded',
          payload: { caseId: input.caseId, planChangeId: change.id, kind: change.kind },
        });
        return { resourceId: change.id, value: change };
      },
      (resourceId) => this.findPlanChange(input.caseId, resourceId),
    );
  }

  async acknowledgePlanChange(input: {
    readonly caseId: string;
    readonly planChangeId: string;
    readonly actor: JourneyActor;
    readonly command: JourneyCommand;
    readonly requestId: string;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) {
      return this.db.planChangeAcknowledgement.findUniqueOrThrow({ where: { id: replayId } });
    }
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientOwnership(transaction, input.caseId, input.actor.userId);
        const change = await transaction.planChangeRequest.findFirst({
          where: { id: input.planChangeId, caseId: input.caseId },
          select: { id: true },
        });
        if (!change) throw new JourneyNotFoundError();
        const acknowledgement = await transaction.planChangeAcknowledgement.create({
          data: {
            planChangeRequestId: change.id,
            patientUserId: input.actor.userId,
            sessionId: input.actor.sessionId,
            requestId: input.requestId,
          },
        });
        await writeMutationEvidence(transaction, {
          actor: input.actor,
          caseId: input.caseId,
          action: 'journey.plan-change-acknowledged',
          resourceType: 'PlanChangeAcknowledgement',
          resourceId: acknowledgement.id,
          requestId: input.requestId,
          eventType: 'journey.plan-change-acknowledged',
          payload: { caseId: input.caseId, planChangeId: change.id },
        });
        return { resourceId: acknowledgement.id, value: acknowledgement };
      },
      (resourceId) =>
        this.db.planChangeAcknowledgement.findUniqueOrThrow({ where: { id: resourceId } }),
    );
  }

  async createPassportDraft(input: PassportDraftPersistenceInput) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findPassportVersionOrThrow(input.caseId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const clinicId = await assertClinicAssignment(transaction, input.caseId, input.actor);
        const dentist = await transaction.dentist.findFirst({
          where: {
            id: input.treatingDentistId,
            affiliations: { some: { clinicId, active: true, endedAt: null } },
          },
          select: { id: true },
        });
        if (!dentist) throw new JourneyNotFoundError();
        const dentalCase = await transaction.dentalCase.findUnique({
          where: { id: input.caseId },
          select: { status: true },
        });
        if (
          !dentalCase ||
          !['TREATMENT_COMPLETED', 'AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE', 'CLOSED'].includes(
            dentalCase.status,
          )
        ) {
          throw new JourneyConflictError('A passport requires completed treatment.');
        }
        const passport = await transaction.dentalPassport.upsert({
          where: { caseId: input.caseId },
          update: {},
          create: { caseId: input.caseId },
        });
        await transaction.$queryRaw`SELECT "id" FROM "dental_passports" WHERE "id" = ${passport.id}::uuid FOR UPDATE`;
        const latest = await transaction.dentalPassportVersion.findFirst({
          where: { dentalPassportId: passport.id },
          orderBy: { version: 'desc' },
          select: { version: true, contentChecksum: true },
        });
        const version = await transaction.dentalPassportVersion.create({
          data: {
            id: input.passportVersionId,
            dentalPassportId: passport.id,
            clinicId,
            treatingDentistId: input.treatingDentistId,
            authorUserId: input.actor.userId,
            version: (latest?.version ?? 0) + 1,
            schemaVersion: 1,
            treatmentCompletedAt: input.treatmentCompletedAt,
            encryptedTreatmentSummary: input.encryptedTreatmentSummary,
            encryptedDischargeInstructions: input.encryptedDischargeInstructions,
            encryptedFollowUpInstructions: input.encryptedFollowUpInstructions,
            contentChecksum: input.contentChecksum,
            ...(latest ? { previousVersionChecksum: latest.contentChecksum } : {}),
            implants: { create: [...input.implants] },
            materials: { create: [...input.materials] },
            prescriptions: { create: [...input.prescriptions] },
          },
        });
        await writeMutationEvidence(transaction, {
          actor: input.actor,
          caseId: input.caseId,
          action: 'passport.draft-created',
          resourceType: 'DentalPassportVersion',
          resourceId: version.id,
          requestId: input.requestId,
          eventType: 'passport.draft-created',
          payload: {
            caseId: input.caseId,
            passportVersionId: version.id,
            version: version.version,
          },
        });
        return {
          resourceId: version.id,
          value: await findPassportVersionTx(transaction, version.id),
        };
      },
      (resourceId) => this.findPassportVersionOrThrow(input.caseId, resourceId),
    );
  }

  async findPassportVersion(caseId: string, versionId?: string, includeDrafts = false) {
    return this.db.dentalPassportVersion.findFirst({
      where: {
        ...(versionId ? { id: versionId } : includeDrafts ? {} : { status: 'PUBLISHED' }),
        dentalPassport: { caseId },
      },
      orderBy: { version: 'desc' },
      include: passportVersionInclude,
    });
  }

  async publishPassport(input: PublishPassportPersistenceInput) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findPassportVersionOrThrow(input.caseId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const clinicId = await assertClinicAssignment(transaction, input.caseId, input.actor);
        const draft = await transaction.dentalPassportVersion.findFirst({
          where: {
            id: input.passportVersionId,
            status: 'DRAFT',
            contentChecksum: input.contentChecksum,
            clinicId,
            dentalPassport: { caseId: input.caseId },
          },
          include: {
            dentalPassport: { include: { dentalCase: { include: { patientProfile: true } } } },
          },
        });
        if (!draft) throw new JourneyConflictError('Passport draft changed or is unavailable.');
        const file = await transaction.fileAsset.upsert({
          where: { objectKey: input.objectKey },
          update: {},
          create: {
            ownerUserId: draft.dentalPassport.dentalCase.patientProfile.userId,
            objectKey: input.objectKey,
            originalFileName: input.fileName,
            declaredMediaType: 'application/pdf',
            detectedMediaType: 'application/pdf',
            sizeBytes: BigInt(input.sizeBytes),
            checksumSha256: input.pdfChecksum,
            status: 'AVAILABLE',
            scanStatus: 'CLEAN',
          },
        });
        if (
          file.ownerUserId !== draft.dentalPassport.dentalCase.patientProfile.userId ||
          file.checksumSha256 !== input.pdfChecksum ||
          file.sizeBytes !== BigInt(input.sizeBytes) ||
          file.status !== 'AVAILABLE' ||
          file.scanStatus !== 'CLEAN'
        ) {
          throw new JourneyConflictError('Generated passport file metadata conflicts.');
        }
        await transaction.dentalPassportVersion.updateMany({
          where: {
            dentalPassportId: draft.dentalPassportId,
            id: { not: draft.id },
            status: 'PUBLISHED',
          },
          data: { status: 'SUPERSEDED' },
        });
        const changed = await transaction.dentalPassportVersion.updateMany({
          where: { id: draft.id, status: 'DRAFT', generatedFileId: null },
          data: {
            status: 'PUBLISHED',
            generatedFileId: file.id,
            publishedByUserId: input.actor.userId,
            publishedAt: input.publishedAt,
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        await writeMutationEvidence(transaction, {
          actor: input.actor,
          caseId: input.caseId,
          action: 'passport.published',
          resourceType: 'DentalPassportVersion',
          resourceId: draft.id,
          requestId: input.requestId,
          eventType: 'passport.published',
          payload: {
            caseId: input.caseId,
            passportVersionId: draft.id,
            contentChecksum: draft.contentChecksum,
            pdfChecksum: input.pdfChecksum,
          },
        });
        return { resourceId: draft.id, value: await findPassportVersionTx(transaction, draft.id) };
      },
      (resourceId) => this.findPassportVersionOrThrow(input.caseId, resourceId),
    );
  }

  async createPassportShare(input: {
    readonly caseId: string;
    readonly passportVersionId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly maxAccessCount?: number;
    readonly actor: JourneyActor;
    readonly command: JourneyCommand;
    readonly requestId: string;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findShare(replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientOwnership(transaction, input.caseId, input.actor.userId);
        const version = await transaction.dentalPassportVersion.findFirst({
          where: {
            id: input.passportVersionId,
            status: 'PUBLISHED',
            generatedFileId: { not: null },
            dentalPassport: { caseId: input.caseId },
          },
          select: { id: true, generatedFileId: true },
        });
        if (!version?.generatedFileId) throw new JourneyNotFoundError();
        const share = await transaction.secureShare.create({
          data: {
            caseId: input.caseId,
            fileAssetId: version.generatedFileId,
            passportVersionId: version.id,
            createdByUserId: input.actor.userId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            ...(input.maxAccessCount ? { maxAccessCount: input.maxAccessCount } : {}),
          },
        });
        await writeMutationEvidence(transaction, {
          actor: input.actor,
          caseId: input.caseId,
          action: 'passport.share-created',
          resourceType: 'SecureShare',
          resourceId: share.id,
          requestId: input.requestId,
          eventType: 'passport.share-created',
          payload: {
            caseId: input.caseId,
            shareId: share.id,
            expiresAt: share.expiresAt.toISOString(),
          },
        });
        return { resourceId: share.id, value: share };
      },
      (resourceId) => this.findShare(resourceId),
    );
  }

  async revokeShare(input: {
    readonly caseId: string;
    readonly shareId: string;
    readonly actor: JourneyActor;
    readonly command: JourneyCommand;
    readonly requestId: string;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findShare(replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientOwnership(transaction, input.caseId, input.actor.userId);
        const changed = await transaction.secureShare.updateMany({
          where: {
            id: input.shareId,
            caseId: input.caseId,
            createdByUserId: input.actor.userId,
            revokedAt: null,
          },
          data: { revokedAt: new Date(), revokedByUserId: input.actor.userId },
        });
        if (changed.count !== 1) throw new JourneyNotFoundError();
        const share = await transaction.secureShare.findUniqueOrThrow({
          where: { id: input.shareId },
        });
        await writeMutationEvidence(transaction, {
          actor: input.actor,
          caseId: input.caseId,
          action: 'passport.share-revoked',
          resourceType: 'SecureShare',
          resourceId: share.id,
          requestId: input.requestId,
          eventType: 'passport.share-revoked',
          payload: { caseId: input.caseId, shareId: share.id },
        });
        return { resourceId: share.id, value: share };
      },
      (resourceId) => this.findShare(resourceId),
    );
  }

  async findShare(shareId: string) {
    const share = await this.db.secureShare.findUnique({ where: { id: shareId } });
    if (!share) throw new JourneyNotFoundError();
    return share;
  }

  async accessShare(input: {
    readonly tokenHash: string;
    readonly ipAddressHash?: string;
    readonly userAgentHash?: string;
  }): Promise<
    | { readonly allowed: true; readonly objectKey: string; readonly fileAssetId: string }
    | {
        readonly allowed: false;
        readonly outcome: 'DENIED_EXPIRED' | 'DENIED_REVOKED' | 'DENIED_ACCESS_LIMIT' | 'NOT_FOUND';
      }
  > {
    return this.db.$transaction(async (transaction) => {
      const share = await transaction.secureShare.findUnique({
        where: { tokenHash: input.tokenHash },
        include: { fileAsset: true },
      });
      if (!share?.fileAsset) return { allowed: false, outcome: 'NOT_FOUND' };
      const now = new Date();
      const deniedOutcome = share.revokedAt
        ? 'DENIED_REVOKED'
        : share.expiresAt <= now
          ? 'DENIED_EXPIRED'
          : share.maxAccessCount !== null && share.accessCount >= share.maxAccessCount
            ? 'DENIED_ACCESS_LIMIT'
            : null;
      if (deniedOutcome) {
        await transaction.secureShareAccessLog.create({
          data: {
            secureShareId: share.id,
            outcome: deniedOutcome,
            ...(input.ipAddressHash ? { ipAddressHash: input.ipAddressHash } : {}),
            ...(input.userAgentHash ? { userAgentHash: input.userAgentHash } : {}),
          },
        });
        return { allowed: false, outcome: deniedOutcome };
      }
      const granted = await transaction.secureShare.updateMany({
        where: {
          id: share.id,
          revokedAt: null,
          expiresAt: { gt: now },
          ...(share.maxAccessCount !== null ? { accessCount: { lt: share.maxAccessCount } } : {}),
        },
        data: { accessCount: { increment: 1 } },
      });
      if (granted.count !== 1) {
        const current = await transaction.secureShare.findUniqueOrThrow({
          where: { id: share.id },
        });
        const outcome = current.revokedAt
          ? 'DENIED_REVOKED'
          : current.expiresAt <= new Date()
            ? 'DENIED_EXPIRED'
            : 'DENIED_ACCESS_LIMIT';
        await transaction.secureShareAccessLog.create({
          data: {
            secureShareId: share.id,
            outcome,
            ...(input.ipAddressHash ? { ipAddressHash: input.ipAddressHash } : {}),
            ...(input.userAgentHash ? { userAgentHash: input.userAgentHash } : {}),
          },
        });
        return { allowed: false, outcome };
      }
      await transaction.secureShareAccessLog.create({
        data: {
          secureShareId: share.id,
          outcome: 'GRANTED',
          ...(input.ipAddressHash ? { ipAddressHash: input.ipAddressHash } : {}),
          ...(input.userAgentHash ? { userAgentHash: input.userAgentHash } : {}),
        },
      });
      return {
        allowed: true,
        objectKey: share.fileAsset.objectKey,
        fileAssetId: share.fileAsset.id,
      };
    });
  }

  async recordPassportDownload(input: {
    readonly caseId: string;
    readonly passportVersionId: string;
    readonly actor: JourneyActor;
    readonly requestId: string;
  }): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const version = await transaction.dentalPassportVersion.findFirst({
        where: {
          id: input.passportVersionId,
          status: { in: ['PUBLISHED', 'SUPERSEDED'] },
          generatedFileId: { not: null },
          dentalPassport: { caseId: input.caseId },
        },
        select: { id: true, generatedFileId: true },
      });
      if (!version?.generatedFileId) throw new JourneyNotFoundError();
      await transaction.auditLog.create({
        data: {
          actorUserId: input.actor.userId,
          ...(input.actor.organizationId ? { organizationId: input.actor.organizationId } : {}),
          action: 'passport.download-url-issued',
          resourceType: 'DentalPassportVersion',
          resourceId: version.id,
          requestId: input.requestId,
          success: true,
          afterMetadata: { caseId: input.caseId, fileAssetId: version.generatedFileId },
        },
      });
    });
  }

  private async findMilestone(caseId: string, milestoneId: string) {
    const milestone = await this.db.treatmentMilestone.findFirst({
      where: { id: milestoneId, caseId },
    });
    if (!milestone) throw new JourneyNotFoundError();
    return milestone;
  }

  private async findPlanChange(caseId: string, changeId: string) {
    const change = await this.db.planChangeRequest.findFirst({
      where: { id: changeId, caseId },
      include: { acknowledgement: true },
    });
    if (!change) throw new JourneyNotFoundError();
    return change;
  }

  private async findPassportVersionOrThrow(caseId: string, versionId: string) {
    const version = await this.findPassportVersion(caseId, versionId);
    if (!version) throw new JourneyNotFoundError();
    return version;
  }

  private async completedResourceId(command: JourneyCommand): Promise<string | null> {
    const response = await this.completedResponse(command);
    return response ? jsonString(response, 'resourceId') : null;
  }

  private async completedResponse(command: JourneyCommand): Promise<Prisma.JsonObject | null> {
    const record = await this.db.idempotencyRecord.findUnique({
      where: { userId_key: { userId: command.userId, key: command.key } },
    });
    if (!record) return null;
    if (record.operation !== command.operation || record.requestHash !== command.requestHash) {
      throw new IdempotencyConflictError('The idempotency key was used for different content.');
    }
    if (
      record.status !== 'COMPLETED' ||
      !record.response ||
      Array.isArray(record.response) ||
      typeof record.response !== 'object'
    ) {
      throw new IdempotencyConflictError(
        'The original command is still in progress; retry shortly.',
      );
    }
    return record.response as Prisma.JsonObject;
  }

  private async runCommand<T>(
    command: JourneyCommand,
    work: (
      transaction: Prisma.TransactionClient,
    ) => Promise<{ resourceId: string; value: T; response?: Prisma.InputJsonObject }>,
    replay: (resourceId: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        async (transaction) => {
          await transaction.idempotencyRecord.create({
            data: {
              userId: command.userId,
              key: command.key,
              operation: command.operation,
              requestHash: command.requestHash,
              expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
            },
          });
          const result = await work(transaction);
          await transaction.idempotencyRecord.update({
            where: { userId_key: { userId: command.userId, key: command.key } },
            data: {
              status: 'COMPLETED',
              resourceId: result.resourceId,
              response: result.response ?? { resourceId: result.resourceId },
              completedAt: new Date(),
            },
          });
          return result.value;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const response = await this.completedResponse(command);
      if (!response) throw error;
      const resourceId = jsonString(response, 'resourceId');
      return replay(resourceId);
    }
  }
}

export interface PassportDraftPersistenceInput {
  readonly caseId: string;
  readonly passportVersionId: string;
  readonly treatingDentistId: string;
  readonly treatmentCompletedAt: Date;
  readonly encryptedTreatmentSummary: string;
  readonly encryptedDischargeInstructions: string;
  readonly encryptedFollowUpInstructions: string;
  readonly contentChecksum: string;
  readonly implants: readonly Prisma.ImplantRecordCreateWithoutDentalPassportVersionInput[];
  readonly materials: readonly Prisma.MaterialRecordCreateWithoutDentalPassportVersionInput[];
  readonly prescriptions: readonly Prisma.PrescriptionRecordCreateWithoutDentalPassportVersionInput[];
  readonly actor: JourneyActor;
  readonly command: JourneyCommand;
  readonly requestId: string;
}

export interface PublishPassportPersistenceInput {
  readonly caseId: string;
  readonly passportVersionId: string;
  readonly contentChecksum: string;
  readonly objectKey: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly pdfChecksum: string;
  readonly publishedAt: Date;
  readonly actor: JourneyActor;
  readonly command: JourneyCommand;
  readonly requestId: string;
}

const passportVersionInclude = {
  dentalPassport: { include: { dentalCase: { include: { patientProfile: true } } } },
  clinic: true,
  treatingDentist: true,
  author: { select: { id: true, email: true } },
  publishedBy: { select: { id: true, email: true } },
  generatedFile: true,
  implants: { orderBy: [{ toothNumber: 'asc' as const }, { id: 'asc' as const }] },
  materials: { orderBy: [{ procedureCode: 'asc' as const }, { id: 'asc' as const }] },
  prescriptions: { orderBy: [{ prescribedAt: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.DentalPassportVersionInclude;

async function findPassportVersionTx(transaction: Prisma.TransactionClient, versionId: string) {
  return transaction.dentalPassportVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: passportVersionInclude,
  });
}

async function assertClinicAssignment(
  transaction: Prisma.TransactionClient,
  caseId: string,
  actor: JourneyActor,
): Promise<string> {
  if (!actor.organizationId) throw new JourneyNotFoundError();
  const assignment = await transaction.caseAssignment.findFirst({
    where: {
      caseId,
      organizationId: actor.organizationId,
      endedAt: null,
      organization: {
        memberships: { some: { userId: actor.userId, status: 'ACTIVE' } },
        clinic: { isNot: null },
      },
    },
    select: { organization: { select: { clinic: { select: { id: true } } } } },
  });
  const clinicId = assignment?.organization?.clinic?.id;
  if (!clinicId) throw new JourneyNotFoundError();
  return clinicId;
}

async function assertPatientOwnership(
  transaction: Prisma.TransactionClient,
  caseId: string,
  userId: string,
): Promise<void> {
  const dentalCase = await transaction.dentalCase.findFirst({
    where: { id: caseId, patientProfile: { userId } },
    select: { id: true },
  });
  if (!dentalCase) throw new JourneyNotFoundError();
}

async function writeMutationEvidence(
  transaction: Prisma.TransactionClient,
  input: {
    readonly actor: JourneyActor;
    readonly caseId: string;
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly requestId: string;
    readonly eventType: string;
    readonly payload: Prisma.InputJsonObject;
  },
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorUserId: input.actor.userId,
      ...(input.actor.organizationId ? { organizationId: input.actor.organizationId } : {}),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: input.requestId,
      success: true,
      afterMetadata: { caseId: input.caseId },
    },
  });
  await transaction.outboxEvent.create({
    data: {
      aggregateType: input.resourceType,
      aggregateId: input.resourceId,
      eventType: input.eventType,
      payload: input.payload,
      correlationId: input.requestId,
      idempotencyKey: `${input.eventType}:${input.resourceId}`,
    },
  });
}

function jsonString(record: Prisma.JsonObject, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new IdempotencyConflictError('Stored response is invalid.');
  return value;
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
