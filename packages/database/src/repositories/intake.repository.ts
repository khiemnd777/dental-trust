import { Prisma, type PrismaClient } from '@prisma/client';

import { IdempotencyConflictError, OptimisticConcurrencyError } from './case.repository.js';

export class IntakeResourceNotFoundError extends Error {
  constructor() {
    super('Patient onboarding or intake resource was not found in the authorized scope.');
    this.name = 'IntakeResourceNotFoundError';
  }
}

export class IntakeConflictError extends Error {
  constructor(message = 'Patient onboarding or intake state conflicts with this command.') {
    super(message);
    this.name = 'IntakeConflictError';
  }
}

export interface IntakeActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly requestId: string;
}

export interface IntakeCommand {
  readonly userId: string;
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface PersistedHealthCondition {
  readonly id: string;
  readonly code: string;
  readonly encryptedDetails?: string;
}

export interface PersistedMedication {
  readonly id: string;
  readonly encryptedName: string;
  readonly encryptedDosage?: string;
}

export interface PersistedAllergy {
  readonly id: string;
  readonly encryptedSubstance: string;
  readonly encryptedReaction?: string;
}

export interface DraftFields {
  readonly desiredProcedureCode?: string | null;
  readonly dentalConcerns?: readonly string[];
  readonly treatmentGoals?: readonly string[];
  readonly encryptedExistingDiagnosis?: string | null;
  readonly encryptedCosmeticExpectations?: string | null;
  readonly currentCountry?: string | null;
  readonly currentCity?: string | null;
  readonly expectedArrivalDate?: Date | null;
  readonly expectedDepartureDate?: Date | null;
  readonly preferredLocation?: string | null;
  readonly availableTreatmentDays?: number | null;
  readonly budgetMinimumMinor?: bigint | null;
  readonly budgetMaximumMinor?: bigint | null;
  readonly budgetCurrency?: 'VND' | 'USD' | null;
  readonly preferredLanguage?: string | null;
  readonly encryptedPriorDentalWork?: string | null;
  readonly existingImplantSystems?: readonly string[];
  readonly smokingStatus?: 'NEVER' | 'FORMER' | 'CURRENT' | 'PREFER_NOT_TO_SAY' | null;
  readonly pregnancyStatus?:
    'NOT_APPLICABLE' | 'NOT_PREGNANT' | 'PREGNANT' | 'UNSURE' | 'PREFER_NOT_TO_SAY' | null;
  readonly accessibilityNeeds?: readonly string[];
  readonly preferredConsultationTimes?: Prisma.InputJsonValue | null;
  readonly medicalConditions?: readonly PersistedHealthCondition[];
  readonly medications?: readonly PersistedMedication[];
  readonly allergies?: readonly PersistedAllergy[];
}

const withdrawableConsentPurposes = [
  'PRIVACY',
  'CLINIC_INTRODUCTION',
  'INTAKE_HEALTH_INFORMATION',
] as const;

export class IntakeRepository {
  constructor(private readonly db: PrismaClient) {}

  async profile(userId: string, audit?: IntakeActor) {
    const record = await this.profileRecord(this.db, userId);
    if (audit) {
      await this.db.auditLog.create({
        data: {
          actorUserId: audit.userId,
          action: 'patient.profile-read',
          resourceType: 'PatientProfile',
          resourceId: record.patientProfile.id,
          requestId: audit.requestId,
          success: true,
        },
      });
    }
    return record;
  }

  async updateProfile(input: {
    readonly preferredLocale: 'vi-VN' | 'en-US';
    readonly preferredCurrency: 'VND' | 'USD';
    readonly currentCountry: string;
    readonly currentCity: string;
    readonly timezone: string;
    readonly encryptedIdentityData: string;
    readonly encryptedContactData: string;
    readonly encryptedPreferences: string;
    readonly expectedVersion: number;
    readonly actor: IntakeActor;
    readonly command: IntakeCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.profileRecord(this.db, input.actor.userId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const profile = await assertPatientProfile(transaction, input.actor.userId);
        const emergencyContact = await transaction.emergencyContact.findFirst({
          where: { patientId: profile.id },
          select: { id: true },
        });
        const changed = await transaction.patientProfile.updateMany({
          where: { id: profile.id, version: input.expectedVersion },
          data: {
            preferredCurrency: input.preferredCurrency,
            currentCountry: input.currentCountry,
            currentCity: input.currentCity,
            timezone: input.timezone,
            encryptedIdentityData: input.encryptedIdentityData,
            encryptedContactData: input.encryptedContactData,
            encryptedPreferences: input.encryptedPreferences,
            onboardingCompletedAt: emergencyContact ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        await transaction.user.update({
          where: { id: input.actor.userId },
          data: { preferredLocale: input.preferredLocale },
        });
        await writeEvidence(transaction, input.actor, {
          action: 'patient.profile-updated',
          resourceType: 'PatientProfile',
          resourceId: profile.id,
          eventType: 'patient.profile-updated',
          payload: { patientProfileId: profile.id },
        });
        return {
          resourceId: profile.id,
          value: await this.profileRecord(transaction, input.actor.userId, profile.id),
        };
      },
      (resourceId) => this.profileRecord(this.db, input.actor.userId, resourceId),
    );
  }

  async upsertEmergencyContact(input: {
    readonly contactId: string;
    readonly expectedVersion: number;
    readonly encryptedName: string;
    readonly encryptedPhone: string;
    readonly relationship: string;
    readonly actor: IntakeActor;
    readonly command: IntakeCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.emergencyContact(input.actor.userId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const profile = await assertPatientProfile(transaction, input.actor.userId);
        await transaction.$queryRaw`SELECT "id" FROM "patient_profiles" WHERE "id" = ${profile.id}::uuid FOR UPDATE`;
        let contact;
        if (input.expectedVersion === 0) {
          const existing = await transaction.emergencyContact.findFirst({
            where: { patientId: profile.id },
            select: { id: true },
          });
          if (existing) throw new IntakeConflictError('An emergency contact already exists.');
          contact = await transaction.emergencyContact.create({
            data: {
              id: input.contactId,
              patientId: profile.id,
              encryptedName: input.encryptedName,
              encryptedPhone: input.encryptedPhone,
              relationship: input.relationship,
            },
          });
        } else {
          const changed = await transaction.emergencyContact.updateMany({
            where: {
              id: input.contactId,
              patientId: profile.id,
              version: input.expectedVersion,
            },
            data: {
              encryptedName: input.encryptedName,
              encryptedPhone: input.encryptedPhone,
              relationship: input.relationship,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) throw new OptimisticConcurrencyError();
          contact = await transaction.emergencyContact.findUniqueOrThrow({
            where: { id: input.contactId },
          });
        }
        if (
          profile.encryptedIdentityData &&
          profile.encryptedContactData &&
          profile.encryptedPreferences
        ) {
          await transaction.patientProfile.update({
            where: { id: profile.id },
            data: { onboardingCompletedAt: new Date() },
          });
        }
        await writeEvidence(transaction, input.actor, {
          action: 'patient.emergency-contact-updated',
          resourceType: 'EmergencyContact',
          resourceId: contact.id,
          eventType: 'patient.emergency-contact-updated',
          payload: { patientProfileId: profile.id, emergencyContactId: contact.id },
        });
        return { resourceId: contact.id, value: contact };
      },
      (resourceId) => this.emergencyContact(input.actor.userId, resourceId),
    );
  }

  async consentTexts(locale: 'vi-VN' | 'en-US') {
    return this.db.consentTextVersion.findMany({
      where: {
        locale,
        purpose: { in: ['INTAKE_HEALTH_INFORMATION', 'INTAKE_MEDICAL_DISCLAIMER'] },
        publishedAt: { lte: new Date() },
      },
      orderBy: [{ purpose: 'asc' }, { publishedAt: 'desc' }],
      distinct: ['purpose'],
      take: 2,
    });
  }

  async consentPurposes(textVersionIds: readonly string[]) {
    return this.db.consentTextVersion.findMany({
      where: {
        id: { in: [...textVersionIds] },
        purpose: { in: ['INTAKE_HEALTH_INFORMATION', 'INTAKE_MEDICAL_DISCLAIMER'] },
        publishedAt: { lte: new Date() },
      },
      select: { id: true, purpose: true, locale: true },
    });
  }

  async consentLedger(
    userId: string,
    input: {
      readonly limit: number;
      readonly cursor?: string;
      readonly status?: 'ACTIVE' | 'WITHDRAWN';
    },
  ) {
    const rows = await this.db.consentRecord.findMany({
      where: {
        userId,
        ...(input.status === 'ACTIVE'
          ? { withdrawnAt: null }
          : input.status === 'WITHDRAWN'
            ? { withdrawnAt: { not: null } }
            : {}),
      },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
      include: { consentTextVersion: true },
    });
    const hasNext = rows.length > input.limit;
    const records = rows.slice(0, input.limit);
    return {
      records,
      nextCursor: hasNext ? (records.at(-1)?.id ?? null) : null,
    };
  }

  async withdrawConsent(input: {
    readonly consentRecordId: string;
    readonly expectedGrantedAt: Date;
    readonly reason: string;
    readonly actor: IntakeActor;
    readonly command: IntakeCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.consentRecord(input.actor.userId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const current = await transaction.consentRecord.findFirst({
          where: {
            id: input.consentRecordId,
            userId: input.actor.userId,
            consentTextVersion: { purpose: { in: [...withdrawableConsentPurposes] } },
          },
          include: { consentTextVersion: true },
        });
        if (!current) throw new IntakeResourceNotFoundError();
        if (
          current.withdrawnAt ||
          current.grantedAt.getTime() !== input.expectedGrantedAt.getTime()
        ) {
          throw new OptimisticConcurrencyError();
        }
        const withdrawnAt = new Date();
        const changed = await transaction.consentRecord.updateMany({
          where: {
            id: current.id,
            userId: input.actor.userId,
            grantedAt: input.expectedGrantedAt,
            withdrawnAt: null,
          },
          data: { withdrawnAt },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        await writeEvidence(transaction, input.actor, {
          action: 'patient.consent-withdrawn',
          resourceType: 'ConsentRecord',
          resourceId: current.id,
          eventType: 'patient.consent-withdrawn',
          reason: input.reason,
          payload: {
            consentRecordId: current.id,
            purpose: current.consentTextVersion.purpose,
            withdrawnAt: withdrawnAt.toISOString(),
          },
        });
        return {
          resourceId: current.id,
          value: await this.consentRecordFrom(transaction, input.actor.userId, current.id),
        };
      },
      (resourceId) => this.consentRecord(input.actor.userId, resourceId),
    );
  }

  async intakeOrNull(caseId: string, userId: string, audit?: IntakeActor) {
    const dentalCase = await this.db.dentalCase.findFirst({
      where: { id: caseId, patientProfile: { userId } },
      select: { id: true },
    });
    if (!dentalCase) throw new IntakeResourceNotFoundError();
    const record = await this.db.intakeQuestionnaire.findUnique({
      where: { caseId },
      include: {
        versions: {
          include: versionInclude,
          orderBy: { version: 'desc' },
          take: 50,
        },
      },
    });
    if (record && audit) {
      await this.db.auditLog.create({
        data: {
          actorUserId: audit.userId,
          action: 'patient.intake-read',
          resourceType: 'IntakeQuestionnaire',
          resourceId: record.id,
          requestId: audit.requestId,
          success: true,
          afterMetadata: { caseId },
        },
      });
    }
    return record;
  }

  async intake(caseId: string, userId: string, audit?: IntakeActor) {
    const record = await this.intakeRecord(this.db, caseId, userId);
    if (audit) {
      await this.db.auditLog.create({
        data: {
          actorUserId: audit.userId,
          action: 'patient.intake-read',
          resourceType: 'IntakeQuestionnaire',
          resourceId: record.id,
          requestId: audit.requestId,
          success: true,
          afterMetadata: { caseId },
        },
      });
    }
    return record;
  }

  async version(caseId: string, versionId: string, userId: string) {
    const record = await this.db.intakeQuestionnaireVersion.findFirst({
      where: {
        id: versionId,
        questionnaire: { caseId, dentalCase: { patientProfile: { userId } } },
      },
      include: versionInclude,
    });
    if (!record) throw new IntakeResourceNotFoundError();
    return record;
  }

  async createDraft(input: {
    readonly questionnaireId: string;
    readonly versionId: string;
    readonly caseId: string;
    readonly currentStep: number;
    readonly fields: DraftFields;
    readonly actor: IntakeActor;
    readonly command: IntakeCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.version(input.caseId, replayId, input.actor.userId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientCase(transaction, input.caseId, input.actor.userId);
        await transaction.$queryRaw`SELECT "id" FROM "dental_cases" WHERE "id" = ${input.caseId}::uuid FOR UPDATE`;
        const questionnaire =
          (await transaction.intakeQuestionnaire.findUnique({ where: { caseId: input.caseId } })) ??
          (await transaction.intakeQuestionnaire.create({
            data: { id: input.questionnaireId, caseId: input.caseId },
          }));
        const current = await transaction.intakeQuestionnaireVersion.findFirst({
          where: { questionnaireId: questionnaire.id },
          orderBy: { version: 'desc' },
          select: { version: true, status: true },
        });
        if (current?.status === 'DRAFT') {
          throw new IntakeConflictError('A draft intake version already exists.');
        }
        const created = await transaction.intakeQuestionnaireVersion.create({
          data: {
            id: input.versionId,
            questionnaireId: questionnaire.id,
            version: (current?.version ?? 0) + 1,
            currentStep: input.currentStep,
            ...draftScalarCreate(input.fields),
          },
        });
        await replaceHealthChildren(transaction, created.id, input.fields);
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'patient.intake-draft-created',
          resourceType: 'IntakeQuestionnaireVersion',
          resourceId: created.id,
          eventType: 'patient.intake-draft-created',
          payload: {
            caseId: input.caseId,
            questionnaireId: questionnaire.id,
            questionnaireVersionId: created.id,
            version: created.version,
          },
        });
        return {
          resourceId: created.id,
          value: await versionRecord(transaction, created.id),
        };
      },
      (resourceId) => this.version(input.caseId, resourceId, input.actor.userId),
    );
  }

  async updateDraft(input: {
    readonly caseId: string;
    readonly versionId: string;
    readonly expectedDraftRevision: number;
    readonly currentStep: number;
    readonly fields: DraftFields;
    readonly actor: IntakeActor;
    readonly command: IntakeCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.version(input.caseId, replayId, input.actor.userId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientCase(transaction, input.caseId, input.actor.userId);
        const changed = await transaction.intakeQuestionnaireVersion.updateMany({
          where: {
            id: input.versionId,
            status: 'DRAFT',
            draftRevision: input.expectedDraftRevision,
            questionnaire: { caseId: input.caseId },
          },
          data: {
            currentStep: input.currentStep,
            draftRevision: { increment: 1 },
            ...draftScalarUpdate(input.fields),
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        await replaceHealthChildren(transaction, input.versionId, input.fields);
        const version = await versionRecord(transaction, input.versionId);
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'patient.intake-draft-saved',
          resourceType: 'IntakeQuestionnaireVersion',
          resourceId: version.id,
          eventType: 'patient.intake-draft-saved',
          payload: {
            caseId: input.caseId,
            questionnaireVersionId: version.id,
            draftRevision: version.draftRevision,
            currentStep: version.currentStep,
          },
        });
        return { resourceId: version.id, value: version };
      },
      (resourceId) => this.version(input.caseId, resourceId, input.actor.userId),
    );
  }

  async submit(input: {
    readonly caseId: string;
    readonly versionId: string;
    readonly expectedDraftRevision: number;
    readonly contentChecksum: string;
    readonly consentRecords: readonly { readonly id: string; readonly textVersionId: string }[];
    readonly actor: IntakeActor;
    readonly command: IntakeCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.version(input.caseId, replayId, input.actor.userId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientCase(transaction, input.caseId, input.actor.userId);
        const draft = await transaction.intakeQuestionnaireVersion.findFirst({
          where: {
            id: input.versionId,
            status: 'DRAFT',
            draftRevision: input.expectedDraftRevision,
            questionnaire: { caseId: input.caseId },
          },
          select: { id: true },
        });
        if (!draft) throw new OptimisticConcurrencyError();
        const texts = await transaction.consentTextVersion.findMany({
          where: {
            id: { in: input.consentRecords.map(({ textVersionId }) => textVersionId) },
            purpose: { in: ['INTAKE_HEALTH_INFORMATION', 'INTAKE_MEDICAL_DISCLAIMER'] },
            publishedAt: { lte: new Date() },
          },
          select: { id: true, purpose: true },
        });
        if (texts.length !== 2 || new Set(texts.map(({ purpose }) => purpose)).size !== 2) {
          throw new IntakeConflictError('Both current intake consent texts are required.');
        }
        for (const consent of input.consentRecords) {
          await transaction.consentRecord.create({
            data: {
              id: consent.id,
              userId: input.actor.userId,
              consentTextVersionId: consent.textVersionId,
              requestId: input.actor.requestId,
              sessionId: input.actor.sessionId,
            },
          });
          await transaction.questionnaireConsent.create({
            data: { questionnaireVersionId: draft.id, consentRecordId: consent.id },
          });
        }
        const changed = await transaction.intakeQuestionnaireVersion.updateMany({
          where: {
            id: draft.id,
            status: 'DRAFT',
            draftRevision: input.expectedDraftRevision,
          },
          data: {
            status: 'SUBMITTED',
            currentStep: 6,
            contentChecksum: input.contentChecksum,
            submittedAt: new Date(),
            draftRevision: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        const submitted = await versionRecord(transaction, draft.id);
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'patient.intake-submitted',
          resourceType: 'IntakeQuestionnaireVersion',
          resourceId: submitted.id,
          eventType: 'patient.intake-submitted',
          payload: {
            caseId: input.caseId,
            questionnaireVersionId: submitted.id,
            version: submitted.version,
            contentChecksum: input.contentChecksum,
          },
        });
        return { resourceId: submitted.id, value: submitted };
      },
      (resourceId) => this.version(input.caseId, resourceId, input.actor.userId),
    );
  }

  async createRevision(input: {
    readonly caseId: string;
    readonly sourceVersionId: string;
    readonly expectedQuestionnaireVersion: number;
    readonly newVersionId: string;
    readonly fields: DraftFields;
    readonly actor: IntakeActor;
    readonly command: IntakeCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.version(input.caseId, replayId, input.actor.userId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientCase(transaction, input.caseId, input.actor.userId);
        const source = await transaction.intakeQuestionnaireVersion.findFirst({
          where: {
            id: input.sourceVersionId,
            version: input.expectedQuestionnaireVersion,
            status: 'SUBMITTED',
            questionnaire: { caseId: input.caseId },
          },
        });
        if (!source) throw new OptimisticConcurrencyError();
        await transaction.$queryRaw`SELECT "id" FROM "intake_questionnaires" WHERE "id" = ${source.questionnaireId}::uuid FOR UPDATE`;
        const existingDraft = await transaction.intakeQuestionnaireVersion.findFirst({
          where: { questionnaireId: source.questionnaireId, status: 'DRAFT' },
          select: { id: true },
        });
        if (existingDraft) throw new IntakeConflictError('A draft intake revision already exists.');
        await transaction.intakeQuestionnaireVersion.update({
          where: { id: source.id },
          data: { status: 'SUPERSEDED' },
        });
        const revision = await transaction.intakeQuestionnaireVersion.create({
          data: {
            id: input.newVersionId,
            questionnaireId: source.questionnaireId,
            version: source.version + 1,
            currentStep: 6,
            ...draftScalarCreate(input.fields),
          },
        });
        await replaceHealthChildren(transaction, revision.id, input.fields);
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'patient.intake-revision-created',
          resourceType: 'IntakeQuestionnaireVersion',
          resourceId: revision.id,
          eventType: 'patient.intake-revision-created',
          payload: {
            caseId: input.caseId,
            sourceVersionId: source.id,
            questionnaireVersionId: revision.id,
            version: revision.version,
          },
        });
        return {
          resourceId: revision.id,
          value: await versionRecord(transaction, revision.id),
        };
      },
      (resourceId) => this.version(input.caseId, resourceId, input.actor.userId),
    );
  }

  private async profileRecord(
    client: PrismaClient | Prisma.TransactionClient,
    userId: string,
    profileId?: string,
  ) {
    const record = await client.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        patientProfile: profileId ? { id: profileId } : { isNot: null },
      },
      select: {
        id: true,
        email: true,
        preferredLocale: true,
        patientProfile: {
          include: { emergencyContacts: { orderBy: { createdAt: 'asc' }, take: 1 } },
        },
      },
    });
    if (!record?.patientProfile) throw new IntakeResourceNotFoundError();
    return { ...record, patientProfile: record.patientProfile };
  }

  private async emergencyContact(userId: string, contactId: string) {
    const record = await this.db.emergencyContact.findFirst({
      where: { id: contactId, patient: { userId } },
    });
    if (!record) throw new IntakeResourceNotFoundError();
    return record;
  }

  private async consentRecord(userId: string, consentRecordId: string) {
    return this.consentRecordFrom(this.db, userId, consentRecordId);
  }

  private async consentRecordFrom(
    client: PrismaClient | Prisma.TransactionClient,
    userId: string,
    consentRecordId: string,
  ) {
    const record = await client.consentRecord.findFirst({
      where: { id: consentRecordId, userId },
      include: { consentTextVersion: true },
    });
    if (!record) throw new IntakeResourceNotFoundError();
    return record;
  }

  private async intakeRecord(
    client: PrismaClient | Prisma.TransactionClient,
    caseId: string,
    userId: string,
  ) {
    const record = await client.intakeQuestionnaire.findFirst({
      where: { caseId, dentalCase: { patientProfile: { userId } } },
      include: {
        versions: {
          include: versionInclude,
          orderBy: { version: 'desc' },
          take: 50,
        },
      },
    });
    if (!record) throw new IntakeResourceNotFoundError();
    return record;
  }

  private async completedResourceId(command: IntakeCommand): Promise<string | null> {
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
      throw new IdempotencyConflictError('The original intake command is still in progress.');
    }
    const resourceId = (record.response as Prisma.JsonObject).resourceId;
    if (typeof resourceId !== 'string') {
      throw new IdempotencyConflictError('Stored intake response is invalid.');
    }
    return resourceId;
  }

  private async runCommand<T>(
    command: IntakeCommand,
    work: (transaction: Prisma.TransactionClient) => Promise<{ resourceId: string; value: T }>,
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
              response: { resourceId: result.resourceId },
              completedAt: new Date(),
            },
          });
          return result.value;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const resourceId = await this.completedResourceId(command);
      if (!resourceId) throw error;
      return replay(resourceId);
    }
  }
}

const versionInclude = {
  medicalConditions: { orderBy: { code: 'asc' as const } },
  medications: { orderBy: { id: 'asc' as const } },
  allergies: { orderBy: { id: 'asc' as const } },
  consents: {
    include: { consentRecord: { include: { consentTextVersion: true } } },
  },
} satisfies Prisma.IntakeQuestionnaireVersionInclude;

function draftScalarCreate(fields: DraftFields) {
  return {
    ...(fields.desiredProcedureCode !== undefined
      ? { desiredProcedureCode: fields.desiredProcedureCode }
      : {}),
    dentalConcerns: [...(fields.dentalConcerns ?? [])],
    treatmentGoals: [...(fields.treatmentGoals ?? [])],
    ...(fields.encryptedExistingDiagnosis !== undefined
      ? { encryptedExistingDiagnosis: fields.encryptedExistingDiagnosis }
      : {}),
    ...(fields.encryptedCosmeticExpectations !== undefined
      ? { encryptedCosmeticExpectations: fields.encryptedCosmeticExpectations }
      : {}),
    ...(fields.currentCountry !== undefined ? { currentCountry: fields.currentCountry } : {}),
    ...(fields.currentCity !== undefined ? { currentCity: fields.currentCity } : {}),
    ...(fields.expectedArrivalDate !== undefined
      ? { expectedArrivalDate: fields.expectedArrivalDate }
      : {}),
    ...(fields.expectedDepartureDate !== undefined
      ? { expectedDepartureDate: fields.expectedDepartureDate }
      : {}),
    ...(fields.preferredLocation !== undefined
      ? { preferredLocation: fields.preferredLocation }
      : {}),
    ...(fields.availableTreatmentDays !== undefined
      ? { availableTreatmentDays: fields.availableTreatmentDays }
      : {}),
    ...(fields.budgetMinimumMinor !== undefined
      ? { budgetMinimumMinor: fields.budgetMinimumMinor }
      : {}),
    ...(fields.budgetMaximumMinor !== undefined
      ? { budgetMaximumMinor: fields.budgetMaximumMinor }
      : {}),
    ...(fields.budgetCurrency !== undefined ? { budgetCurrency: fields.budgetCurrency } : {}),
    ...(fields.preferredLanguage !== undefined
      ? { preferredLanguage: fields.preferredLanguage }
      : {}),
    ...(fields.encryptedPriorDentalWork !== undefined
      ? { encryptedPriorDentalWork: fields.encryptedPriorDentalWork }
      : {}),
    existingImplantSystems: [...(fields.existingImplantSystems ?? [])],
    ...(fields.smokingStatus !== undefined ? { smokingStatus: fields.smokingStatus } : {}),
    ...(fields.pregnancyStatus !== undefined ? { pregnancyStatus: fields.pregnancyStatus } : {}),
    accessibilityNeeds: [...(fields.accessibilityNeeds ?? [])],
    ...(fields.preferredConsultationTimes !== undefined
      ? {
          preferredConsultationTimes:
            fields.preferredConsultationTimes === null
              ? Prisma.DbNull
              : fields.preferredConsultationTimes,
        }
      : {}),
  };
}

function draftScalarUpdate(
  fields: DraftFields,
): Prisma.IntakeQuestionnaireVersionUpdateManyMutationInput {
  return {
    ...(fields.desiredProcedureCode !== undefined
      ? { desiredProcedureCode: fields.desiredProcedureCode }
      : {}),
    ...(fields.dentalConcerns !== undefined ? { dentalConcerns: [...fields.dentalConcerns] } : {}),
    ...(fields.treatmentGoals !== undefined ? { treatmentGoals: [...fields.treatmentGoals] } : {}),
    ...(fields.encryptedExistingDiagnosis !== undefined
      ? { encryptedExistingDiagnosis: fields.encryptedExistingDiagnosis }
      : {}),
    ...(fields.encryptedCosmeticExpectations !== undefined
      ? { encryptedCosmeticExpectations: fields.encryptedCosmeticExpectations }
      : {}),
    ...(fields.currentCountry !== undefined ? { currentCountry: fields.currentCountry } : {}),
    ...(fields.currentCity !== undefined ? { currentCity: fields.currentCity } : {}),
    ...(fields.expectedArrivalDate !== undefined
      ? { expectedArrivalDate: fields.expectedArrivalDate }
      : {}),
    ...(fields.expectedDepartureDate !== undefined
      ? { expectedDepartureDate: fields.expectedDepartureDate }
      : {}),
    ...(fields.preferredLocation !== undefined
      ? { preferredLocation: fields.preferredLocation }
      : {}),
    ...(fields.availableTreatmentDays !== undefined
      ? { availableTreatmentDays: fields.availableTreatmentDays }
      : {}),
    ...(fields.budgetMinimumMinor !== undefined
      ? { budgetMinimumMinor: fields.budgetMinimumMinor }
      : {}),
    ...(fields.budgetMaximumMinor !== undefined
      ? { budgetMaximumMinor: fields.budgetMaximumMinor }
      : {}),
    ...(fields.budgetCurrency !== undefined ? { budgetCurrency: fields.budgetCurrency } : {}),
    ...(fields.preferredLanguage !== undefined
      ? { preferredLanguage: fields.preferredLanguage }
      : {}),
    ...(fields.encryptedPriorDentalWork !== undefined
      ? { encryptedPriorDentalWork: fields.encryptedPriorDentalWork }
      : {}),
    ...(fields.existingImplantSystems !== undefined
      ? { existingImplantSystems: [...fields.existingImplantSystems] }
      : {}),
    ...(fields.smokingStatus !== undefined ? { smokingStatus: fields.smokingStatus } : {}),
    ...(fields.pregnancyStatus !== undefined ? { pregnancyStatus: fields.pregnancyStatus } : {}),
    ...(fields.accessibilityNeeds !== undefined
      ? { accessibilityNeeds: [...fields.accessibilityNeeds] }
      : {}),
    ...(fields.preferredConsultationTimes !== undefined
      ? {
          preferredConsultationTimes:
            fields.preferredConsultationTimes === null
              ? Prisma.DbNull
              : fields.preferredConsultationTimes,
        }
      : {}),
  };
}

async function replaceHealthChildren(
  transaction: Prisma.TransactionClient,
  versionId: string,
  fields: DraftFields,
): Promise<void> {
  if (fields.medicalConditions !== undefined) {
    await transaction.intakeMedicalCondition.deleteMany({
      where: { questionnaireVersionId: versionId },
    });
    if (fields.medicalConditions.length) {
      await transaction.intakeMedicalCondition.createMany({
        data: fields.medicalConditions.map((condition) => ({
          id: condition.id,
          questionnaireVersionId: versionId,
          code: condition.code,
          ...(condition.encryptedDetails ? { encryptedDetails: condition.encryptedDetails } : {}),
        })),
      });
    }
  }
  if (fields.medications !== undefined) {
    await transaction.intakeMedication.deleteMany({ where: { questionnaireVersionId: versionId } });
    if (fields.medications.length) {
      await transaction.intakeMedication.createMany({
        data: fields.medications.map((medication) => ({
          id: medication.id,
          questionnaireVersionId: versionId,
          encryptedName: medication.encryptedName,
          ...(medication.encryptedDosage ? { encryptedDosage: medication.encryptedDosage } : {}),
        })),
      });
    }
  }
  if (fields.allergies !== undefined) {
    await transaction.intakeAllergy.deleteMany({ where: { questionnaireVersionId: versionId } });
    if (fields.allergies.length) {
      await transaction.intakeAllergy.createMany({
        data: fields.allergies.map((allergy) => ({
          id: allergy.id,
          questionnaireVersionId: versionId,
          encryptedSubstance: allergy.encryptedSubstance,
          ...(allergy.encryptedReaction ? { encryptedReaction: allergy.encryptedReaction } : {}),
        })),
      });
    }
  }
}

async function versionRecord(transaction: Prisma.TransactionClient, versionId: string) {
  return transaction.intakeQuestionnaireVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: versionInclude,
  });
}

async function assertPatientProfile(transaction: Prisma.TransactionClient, userId: string) {
  const profile = await transaction.patientProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      encryptedIdentityData: true,
      encryptedContactData: true,
      encryptedPreferences: true,
    },
  });
  if (!profile) throw new IntakeResourceNotFoundError();
  return profile;
}

async function assertPatientCase(
  transaction: Prisma.TransactionClient,
  caseId: string,
  userId: string,
): Promise<void> {
  const dentalCase = await transaction.dentalCase.findFirst({
    where: { id: caseId, patientProfile: { userId } },
    select: { id: true },
  });
  if (!dentalCase) throw new IntakeResourceNotFoundError();
}

async function writeEvidence(
  transaction: Prisma.TransactionClient,
  actor: IntakeActor,
  input: {
    readonly caseId?: string;
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly eventType: string;
    readonly payload: Prisma.InputJsonObject;
    readonly reason?: string;
  },
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorUserId: actor.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: actor.requestId,
      success: true,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.caseId ? { afterMetadata: { caseId: input.caseId } } : {}),
    },
  });
  await transaction.outboxEvent.create({
    data: {
      aggregateType: input.resourceType,
      aggregateId: input.resourceId,
      eventType: input.eventType,
      payload: input.payload,
      correlationId: actor.requestId,
      idempotencyKey: `${input.eventType}:${input.resourceId}`,
    },
  });
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
