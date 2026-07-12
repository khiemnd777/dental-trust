import { randomUUID } from 'node:crypto';

import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import { hasPermission, requiresMfa, type AccessContext } from '@dental-trust/auth';
import {
  consultationTimeSchema,
  patientProfileUpdateSchema,
  type ConsentLedgerQuery,
  type ConsentLedgerRecordView,
  type EmergencyContactUpdate,
  type IntakeConsentTextView,
  type IntakeDraftCreate,
  type IntakeDraftUpdate,
  type IntakeQuestionnaireView,
  type IntakeRevisionCreate,
  type IntakeSubmit,
  type IntakeVersionView,
  type PatientProfileUpdate,
  type PatientProfileView,
  type WithdrawConsent,
} from '@dental-trust/contracts';
import {
  IntakeRepository,
  type DraftFields,
  type Prisma,
  type PrismaClient,
} from '@dental-trust/database';
import {
  canonicalIntakeSnapshot,
  DomainRuleError,
  intakeProgress,
  validateIntakeSubmission,
  type IntakeSubmissionSnapshot,
} from '@dental-trust/domain';
import type { ServerEnvironment } from '@dental-trust/config/server';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';

type ProfileRecord = Awaited<ReturnType<IntakeRepository['profile']>>;
type IntakeVersionRecord = Awaited<ReturnType<IntakeRepository['version']>>;
type IntakeRecord = NonNullable<Awaited<ReturnType<IntakeRepository['intakeOrNull']>>>;

@Injectable()
export class IntakeService {
  private readonly repository: IntakeRepository;
  private readonly cipher: SensitiveFieldCipher;

  constructor(
    @Inject(PRISMA) database: PrismaClient,
    @Inject(SERVER_ENV) environment: ServerEnvironment,
  ) {
    this.repository = new IntakeRepository(database);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
  }

  async profile(access: AccessContext): Promise<PatientProfileView> {
    assertPatient(access, 'profile:read:own');
    return this.profileView(await this.repository.profile(access.userId, actor(access)));
  }

  async updateProfile(
    access: AccessContext,
    input: PatientProfileUpdate,
    idempotencyKey: string,
  ): Promise<PatientProfileView> {
    assertPatient(access, 'profile:write:own');
    const current = await this.repository.profile(access.userId);
    const profileId = current.patientProfile.id;
    const updated = await this.repository.updateProfile({
      preferredLocale: input.preferredLocale,
      preferredCurrency: input.preferredCurrency,
      currentCountry: input.currentCountry,
      currentCity: input.currentCity,
      timezone: input.timezone,
      encryptedIdentityData: this.encryptJson(
        input.identity,
        profileContext(profileId, 'identity'),
      ),
      encryptedContactData: this.encryptJson(input.contact, profileContext(profileId, 'contact')),
      encryptedPreferences: this.encryptJson(
        input.preferences,
        profileContext(profileId, 'preferences'),
      ),
      expectedVersion: input.expectedVersion,
      actor: actor(access),
      command: command(access, idempotencyKey, 'patient.profile.update', input),
    });
    return this.profileView(updated);
  }

  async updateEmergencyContact(
    access: AccessContext,
    input: EmergencyContactUpdate,
    idempotencyKey: string,
  ): Promise<PatientProfileView> {
    assertPatient(access, 'profile:write:own');
    const profile = await this.repository.profile(access.userId);
    const existing = profile.patientProfile.emergencyContacts[0];
    const contactId = input.contactId ?? existing?.id ?? randomUUID();
    await this.repository.upsertEmergencyContact({
      contactId,
      expectedVersion: input.expectedVersion,
      encryptedName: this.cipher.encrypt(input.name, emergencyContext(contactId, 'name')),
      encryptedPhone: this.cipher.encrypt(input.phoneE164, emergencyContext(contactId, 'phone')),
      relationship: input.relationship,
      actor: actor(access),
      command: command(access, idempotencyKey, 'patient.emergency-contact.update', input),
    });
    return this.profileView(await this.repository.profile(access.userId));
  }

  async consentTexts(
    access: AccessContext,
    locale: 'vi-VN' | 'en-US',
  ): Promise<readonly IntakeConsentTextView[]> {
    assertPatient(access, 'profile:read:own');
    return (await this.repository.consentTexts(locale)).map((text) => ({
      id: text.id,
      purpose: text.purpose as IntakeConsentTextView['purpose'],
      version: text.version,
      locale: locale,
      contentHash: text.contentHash,
      publishedAt: text.publishedAt.toISOString(),
    }));
  }

  async consentLedger(
    access: AccessContext,
    query: ConsentLedgerQuery,
  ): Promise<{
    readonly data: readonly ConsentLedgerRecordView[];
    readonly nextCursor: string | null;
  }> {
    assertPatient(access, 'profile:read:own');
    const page = await this.repository.consentLedger(access.userId, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    return { data: page.records.map(consentLedgerView), nextCursor: page.nextCursor };
  }

  async withdrawConsent(
    access: AccessContext,
    consentRecordId: string,
    input: WithdrawConsent,
    idempotencyKey: string,
  ): Promise<ConsentLedgerRecordView> {
    assertPatient(access, 'profile:write:own');
    return consentLedgerView(
      await this.repository.withdrawConsent({
        consentRecordId,
        expectedGrantedAt: new Date(input.expectedGrantedAt),
        reason: input.reason,
        actor: actor(access),
        command: command(access, idempotencyKey, 'patient.consent.withdraw', {
          consentRecordId,
          ...input,
        }),
      }),
    );
  }

  async intake(access: AccessContext, caseId: string): Promise<IntakeQuestionnaireView> {
    assertPatient(access, 'profile:read:own');
    const record = await this.repository.intakeOrNull(caseId, access.userId, actor(access));
    return this.questionnaireView(caseId, record);
  }

  async createDraft(
    access: AccessContext,
    caseId: string,
    input: IntakeDraftCreate,
    idempotencyKey: string,
  ): Promise<IntakeVersionView> {
    assertPatient(access, 'profile:write:own');
    const versionId = randomUUID();
    return this.versionView(
      await this.repository.createDraft({
        questionnaireId: randomUUID(),
        versionId,
        caseId,
        currentStep: input.currentStep,
        fields: this.persistedFields(input, versionId),
        actor: actor(access),
        command: command(access, idempotencyKey, 'patient.intake-draft.create', {
          caseId,
          ...input,
        }),
      }),
    );
  }

  async updateDraft(
    access: AccessContext,
    caseId: string,
    versionId: string,
    input: IntakeDraftUpdate,
    idempotencyKey: string,
  ): Promise<IntakeVersionView> {
    assertPatient(access, 'profile:write:own');
    return this.versionView(
      await this.repository.updateDraft({
        caseId,
        versionId,
        expectedDraftRevision: input.expectedDraftRevision,
        currentStep: input.currentStep,
        fields: this.persistedFields(input, versionId),
        actor: actor(access),
        command: command(access, idempotencyKey, 'patient.intake-draft.update', {
          caseId,
          versionId,
          ...input,
        }),
      }),
    );
  }

  async submit(
    access: AccessContext,
    caseId: string,
    versionId: string,
    input: IntakeSubmit,
    idempotencyKey: string,
  ): Promise<IntakeVersionView> {
    assertPatient(access, 'profile:write:own');
    const profile = await this.repository.profile(access.userId);
    if (!profile.patientProfile.onboardingCompletedAt) {
      throw new DomainRuleError(
        'PATIENT_ONBOARDING_INCOMPLETE',
        'Complete your patient profile and emergency contact before submitting intake.',
      );
    }
    const selectedTexts = await this.repository.consentPurposes(input.consentTextVersionIds);
    const selectedLocales = new Set(selectedTexts.map(({ locale }) => locale));
    const selectedLocale = selectedTexts[0]?.locale;
    if (
      selectedTexts.length !== 2 ||
      selectedLocales.size !== 1 ||
      (selectedLocale !== 'vi-VN' && selectedLocale !== 'en-US')
    ) {
      throw new DomainRuleError(
        'INTAKE_CONSENT_INVALID',
        'Both intake acknowledgements must use the same supported language.',
      );
    }
    const currentTexts = await this.repository.consentTexts(selectedLocale);
    const selectedIds = new Set(input.consentTextVersionIds);
    if (
      currentTexts.length !== 2 ||
      currentTexts.some(({ id }) => !selectedIds.has(id)) ||
      selectedIds.size !== 2
    ) {
      throw new DomainRuleError(
        'INTAKE_CONSENT_OUTDATED',
        'Review and accept the current intake consent text before submitting.',
      );
    }
    const draft = await this.repository.version(caseId, versionId, access.userId);
    const snapshot = this.submissionSnapshot(
      this.versionView(draft),
      selectedTexts.map(({ purpose }) => purpose),
    );
    validateIntakeSubmission(snapshot);
    const checksum = sha256(JSON.stringify(canonicalIntakeSnapshot(snapshot)));
    const submitted = await this.repository.submit({
      caseId,
      versionId,
      expectedDraftRevision: input.expectedDraftRevision,
      contentChecksum: checksum,
      consentRecords: input.consentTextVersionIds.map((textVersionId) => ({
        id: randomUUID(),
        textVersionId,
      })),
      actor: actor(access),
      command: command(access, idempotencyKey, 'patient.intake.submit', {
        caseId,
        versionId,
        ...input,
      }),
    });
    return this.versionView(submitted);
  }

  async createRevision(
    access: AccessContext,
    caseId: string,
    sourceVersionId: string,
    input: IntakeRevisionCreate,
    idempotencyKey: string,
  ): Promise<IntakeVersionView> {
    assertPatient(access, 'profile:write:own');
    const source = await this.repository.version(caseId, sourceVersionId, access.userId);
    const newVersionId = randomUUID();
    return this.versionView(
      await this.repository.createRevision({
        caseId,
        sourceVersionId,
        expectedQuestionnaireVersion: input.expectedQuestionnaireVersion,
        newVersionId,
        fields: this.cloneFields(source, newVersionId),
        actor: actor(access),
        command: command(access, idempotencyKey, 'patient.intake-revision.create', {
          caseId,
          sourceVersionId,
          ...input,
        }),
      }),
    );
  }

  private profileView(record: ProfileRecord): PatientProfileView {
    const profile = record.patientProfile;
    const emergency = profile.emergencyContacts[0];
    return {
      id: profile.id,
      email: record.email,
      preferredLocale: record.preferredLocale === 'en-US' ? 'en-US' : 'vi-VN',
      preferredCurrency: profile.preferredCurrency,
      currentCountry: profile.currentCountry,
      currentCity: profile.currentCity,
      timezone: profile.timezone,
      identity: profile.encryptedIdentityData
        ? this.decryptJson(
            profile.encryptedIdentityData,
            profileContext(profile.id, 'identity'),
            patientProfileUpdateSchema.shape.identity,
          )
        : null,
      contact: profile.encryptedContactData
        ? this.decryptJson(
            profile.encryptedContactData,
            profileContext(profile.id, 'contact'),
            patientProfileUpdateSchema.shape.contact,
          )
        : null,
      preferences: profile.encryptedPreferences
        ? this.decryptJson(
            profile.encryptedPreferences,
            profileContext(profile.id, 'preferences'),
            patientProfileUpdateSchema.shape.preferences,
          )
        : null,
      emergencyContact: emergency
        ? {
            id: emergency.id,
            name: this.cipher.decrypt(
              emergency.encryptedName,
              emergencyContext(emergency.id, 'name'),
            ),
            phoneE164: this.cipher.decrypt(
              emergency.encryptedPhone,
              emergencyContext(emergency.id, 'phone'),
            ),
            relationship: emergency.relationship,
            version: emergency.version,
          }
        : null,
      onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
      version: profile.version,
    };
  }

  private questionnaireView(caseId: string, record: IntakeRecord | null): IntakeQuestionnaireView {
    const history = record?.versions.map((version) => this.versionView(version)) ?? [];
    const current = history[0] ?? null;
    return {
      id: record?.id ?? null,
      caseId,
      current,
      history,
      progress: current ? progressOf(current) : emptyProgress(),
    };
  }

  private versionView(record: IntakeVersionRecord): IntakeVersionView {
    const consultationTimes = consultationTimeSchema
      .array()
      .safeParse(record.preferredConsultationTimes ?? []);
    if (!consultationTimes.success)
      throw new Error('Stored intake consultation times are invalid.');
    const budget =
      record.budgetMinimumMinor !== null &&
      record.budgetMaximumMinor !== null &&
      record.budgetCurrency !== null
        ? {
            minimumMinor: Number(record.budgetMinimumMinor),
            maximumMinor: Number(record.budgetMaximumMinor),
            currency: record.budgetCurrency,
          }
        : null;
    return {
      id: record.id,
      version: record.version,
      status: record.status,
      desiredProcedureCode: record.desiredProcedureCode,
      dentalConcerns: record.dentalConcerns,
      existingDiagnosis: this.decryptNullable(
        record.encryptedExistingDiagnosis,
        intakeContext(record.id, 'existing-diagnosis'),
      ),
      treatmentGoals: record.treatmentGoals,
      cosmeticExpectations: this.decryptNullable(
        record.encryptedCosmeticExpectations,
        intakeContext(record.id, 'cosmetic-expectations'),
      ),
      currentCountry: record.currentCountry,
      currentCity: record.currentCity,
      expectedArrivalDate: dateOnly(record.expectedArrivalDate),
      expectedDepartureDate: dateOnly(record.expectedDepartureDate),
      preferredLocation: record.preferredLocation,
      availableTreatmentDays: record.availableTreatmentDays,
      budget,
      preferredLanguage: record.preferredLanguage,
      priorDentalWork: this.decryptNullable(
        record.encryptedPriorDentalWork,
        intakeContext(record.id, 'prior-dental-work'),
      ),
      existingImplantSystems: record.existingImplantSystems,
      medicalConditions: record.medicalConditions.map((condition) => ({
        code: condition.code,
        ...(condition.encryptedDetails
          ? {
              details: this.cipher.decrypt(
                condition.encryptedDetails,
                conditionContext(condition.id),
              ),
            }
          : {}),
      })),
      medications: record.medications.map((medication) => ({
        name: this.cipher.decrypt(
          medication.encryptedName,
          medicationContext(medication.id, 'name'),
        ),
        ...(medication.encryptedDosage
          ? {
              dosage: this.cipher.decrypt(
                medication.encryptedDosage,
                medicationContext(medication.id, 'dosage'),
              ),
            }
          : {}),
      })),
      allergies: record.allergies.map((allergy) => ({
        substance: this.cipher.decrypt(
          allergy.encryptedSubstance,
          allergyContext(allergy.id, 'substance'),
        ),
        ...(allergy.encryptedReaction
          ? {
              reaction: this.cipher.decrypt(
                allergy.encryptedReaction,
                allergyContext(allergy.id, 'reaction'),
              ),
            }
          : {}),
      })),
      smokingStatus: record.smokingStatus,
      pregnancyStatus: record.pregnancyStatus,
      accessibilityNeeds: record.accessibilityNeeds,
      preferredConsultationTimes: consultationTimes.data,
      consentPurposes: record.consents.map(
        ({ consentRecord }) => consentRecord.consentTextVersion.purpose,
      ),
      currentStep: record.currentStep,
      draftRevision: record.draftRevision,
      submittedAt: record.submittedAt?.toISOString() ?? null,
      contentChecksum: record.contentChecksum,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private persistedFields(
    input: IntakeDraftCreate | IntakeDraftUpdate,
    versionId: string,
  ): DraftFields {
    return {
      ...(input.desiredProcedureCode !== undefined
        ? { desiredProcedureCode: input.desiredProcedureCode }
        : {}),
      ...(input.dentalConcerns !== undefined ? { dentalConcerns: input.dentalConcerns } : {}),
      ...(input.treatmentGoals !== undefined ? { treatmentGoals: input.treatmentGoals } : {}),
      ...(input.existingDiagnosis !== undefined
        ? {
            encryptedExistingDiagnosis: encryptOptional(
              this.cipher,
              input.existingDiagnosis,
              intakeContext(versionId, 'existing-diagnosis'),
            ),
          }
        : {}),
      ...(input.cosmeticExpectations !== undefined
        ? {
            encryptedCosmeticExpectations: encryptOptional(
              this.cipher,
              input.cosmeticExpectations,
              intakeContext(versionId, 'cosmetic-expectations'),
            ),
          }
        : {}),
      ...(input.currentCountry !== undefined ? { currentCountry: input.currentCountry } : {}),
      ...(input.currentCity !== undefined ? { currentCity: input.currentCity } : {}),
      ...(input.expectedArrivalDate !== undefined
        ? { expectedArrivalDate: new Date(`${input.expectedArrivalDate}T00:00:00.000Z`) }
        : {}),
      ...(input.expectedDepartureDate !== undefined
        ? { expectedDepartureDate: new Date(`${input.expectedDepartureDate}T00:00:00.000Z`) }
        : {}),
      ...(input.preferredLocation !== undefined
        ? { preferredLocation: input.preferredLocation }
        : {}),
      ...(input.availableTreatmentDays !== undefined
        ? { availableTreatmentDays: input.availableTreatmentDays }
        : {}),
      ...(input.budget
        ? {
            budgetMinimumMinor: BigInt(input.budget.minimumMinor),
            budgetMaximumMinor: BigInt(input.budget.maximumMinor),
            budgetCurrency: input.budget.currency,
          }
        : {}),
      ...(input.preferredLanguage !== undefined
        ? { preferredLanguage: input.preferredLanguage }
        : {}),
      ...(input.priorDentalWork !== undefined
        ? {
            encryptedPriorDentalWork: encryptOptional(
              this.cipher,
              input.priorDentalWork,
              intakeContext(versionId, 'prior-dental-work'),
            ),
          }
        : {}),
      ...(input.existingImplantSystems !== undefined
        ? { existingImplantSystems: input.existingImplantSystems }
        : {}),
      ...(input.smokingStatus !== undefined ? { smokingStatus: input.smokingStatus } : {}),
      ...(input.pregnancyStatus !== undefined ? { pregnancyStatus: input.pregnancyStatus } : {}),
      ...(input.accessibilityNeeds !== undefined
        ? { accessibilityNeeds: input.accessibilityNeeds }
        : {}),
      ...(input.preferredConsultationTimes !== undefined
        ? {
            preferredConsultationTimes: input.preferredConsultationTimes as Prisma.InputJsonValue,
          }
        : {}),
      ...(input.medicalConditions !== undefined
        ? {
            medicalConditions: input.medicalConditions.map((condition) => {
              const id = randomUUID();
              return {
                id,
                code: condition.code,
                ...(condition.details
                  ? {
                      encryptedDetails: this.cipher.encrypt(
                        condition.details,
                        conditionContext(id),
                      ),
                    }
                  : {}),
              };
            }),
          }
        : {}),
      ...(input.medications !== undefined
        ? {
            medications: input.medications.map((medication) => {
              const id = randomUUID();
              return {
                id,
                encryptedName: this.cipher.encrypt(medication.name, medicationContext(id, 'name')),
                ...(medication.dosage
                  ? {
                      encryptedDosage: this.cipher.encrypt(
                        medication.dosage,
                        medicationContext(id, 'dosage'),
                      ),
                    }
                  : {}),
              };
            }),
          }
        : {}),
      ...(input.allergies !== undefined
        ? {
            allergies: input.allergies.map((allergy) => {
              const id = randomUUID();
              return {
                id,
                encryptedSubstance: this.cipher.encrypt(
                  allergy.substance,
                  allergyContext(id, 'substance'),
                ),
                ...(allergy.reaction
                  ? {
                      encryptedReaction: this.cipher.encrypt(
                        allergy.reaction,
                        allergyContext(id, 'reaction'),
                      ),
                    }
                  : {}),
              };
            }),
          }
        : {}),
    };
  }

  private cloneFields(source: IntakeVersionRecord, newVersionId: string): DraftFields {
    const sourceView = this.versionView(source);
    return this.persistedFields(
      {
        currentStep: 6,
        ...(sourceView.desiredProcedureCode
          ? { desiredProcedureCode: sourceView.desiredProcedureCode }
          : {}),
        dentalConcerns: [...sourceView.dentalConcerns],
        ...(sourceView.existingDiagnosis !== null
          ? { existingDiagnosis: sourceView.existingDiagnosis }
          : {}),
        treatmentGoals: [...sourceView.treatmentGoals],
        ...(sourceView.cosmeticExpectations !== null
          ? { cosmeticExpectations: sourceView.cosmeticExpectations }
          : {}),
        ...(sourceView.currentCountry ? { currentCountry: sourceView.currentCountry } : {}),
        ...(sourceView.currentCity ? { currentCity: sourceView.currentCity } : {}),
        ...(sourceView.expectedArrivalDate
          ? { expectedArrivalDate: sourceView.expectedArrivalDate }
          : {}),
        ...(sourceView.expectedDepartureDate
          ? { expectedDepartureDate: sourceView.expectedDepartureDate }
          : {}),
        ...(sourceView.preferredLocation
          ? { preferredLocation: sourceView.preferredLocation }
          : {}),
        ...(sourceView.availableTreatmentDays !== null
          ? { availableTreatmentDays: sourceView.availableTreatmentDays }
          : {}),
        ...(sourceView.budget ? { budget: sourceView.budget } : {}),
        ...(sourceView.preferredLanguage
          ? { preferredLanguage: sourceView.preferredLanguage }
          : {}),
        ...(sourceView.priorDentalWork !== null
          ? { priorDentalWork: sourceView.priorDentalWork }
          : {}),
        existingImplantSystems: [...sourceView.existingImplantSystems],
        medicalConditions: [...sourceView.medicalConditions],
        medications: [...sourceView.medications],
        allergies: [...sourceView.allergies],
        ...(sourceView.smokingStatus ? { smokingStatus: sourceView.smokingStatus } : {}),
        ...(sourceView.pregnancyStatus ? { pregnancyStatus: sourceView.pregnancyStatus } : {}),
        accessibilityNeeds: [...sourceView.accessibilityNeeds],
        preferredConsultationTimes: [...sourceView.preferredConsultationTimes],
      },
      newVersionId,
    );
  }

  private submissionSnapshot(
    view: IntakeVersionView,
    consentPurposes: readonly string[],
  ): IntakeSubmissionSnapshot {
    return {
      ...(view.desiredProcedureCode ? { desiredProcedureCode: view.desiredProcedureCode } : {}),
      dentalConcerns: view.dentalConcerns,
      treatmentGoals: view.treatmentGoals,
      ...(view.currentCountry ? { currentCountry: view.currentCountry } : {}),
      ...(view.currentCity ? { currentCity: view.currentCity } : {}),
      ...(view.expectedArrivalDate ? { expectedArrivalDate: view.expectedArrivalDate } : {}),
      ...(view.expectedDepartureDate ? { expectedDepartureDate: view.expectedDepartureDate } : {}),
      ...(view.preferredLocation ? { preferredLocation: view.preferredLocation } : {}),
      ...(view.availableTreatmentDays !== null
        ? { availableTreatmentDays: view.availableTreatmentDays }
        : {}),
      ...(view.budget
        ? {
            budgetMinimumMinor: view.budget.minimumMinor,
            budgetMaximumMinor: view.budget.maximumMinor,
            budgetCurrency: view.budget.currency,
          }
        : {}),
      ...(view.preferredLanguage ? { preferredLanguage: view.preferredLanguage } : {}),
      ...(view.smokingStatus ? { smokingStatus: view.smokingStatus } : {}),
      ...(view.pregnancyStatus ? { pregnancyStatus: view.pregnancyStatus } : {}),
      preferredConsultationTimes: view.preferredConsultationTimes,
      medicalConditions: view.medicalConditions.map(({ code, details }) => ({
        key: code,
        ...(details ? { secondary: details } : {}),
      })),
      medications: view.medications.map(({ name, dosage }) => ({
        key: name,
        ...(dosage ? { secondary: dosage } : {}),
      })),
      allergies: view.allergies.map(({ substance, reaction }) => ({
        key: substance,
        ...(reaction ? { secondary: reaction } : {}),
      })),
      consentPurposes,
    };
  }

  private encryptJson(value: unknown, context: string): string {
    return this.cipher.encrypt(JSON.stringify(value), context);
  }

  private decryptJson<T>(ciphertext: string, context: string, schema: ZodType<T>): T {
    const parsed: unknown = JSON.parse(this.cipher.decrypt(ciphertext, context));
    const result = schema.safeParse(parsed);
    if (!result.success) throw new Error('Stored encrypted patient profile data is invalid.');
    return result.data;
  }

  private decryptNullable(ciphertext: string | null, context: string): string | null {
    return ciphertext ? this.cipher.decrypt(ciphertext, context) : null;
  }
}

function assertPatient(
  access: AccessContext,
  permission: 'profile:read:own' | 'profile:write:own',
): void {
  if (
    access.impersonation ||
    !access.roles.includes('PATIENT') ||
    !hasPermission(access, permission) ||
    requiresMfa(access)
  ) {
    throw new ForbiddenException();
  }
}

function consentLedgerView(record: {
  readonly id: string;
  readonly grantedAt: Date;
  readonly withdrawnAt: Date | null;
  readonly consentTextVersion: {
    readonly purpose: string;
    readonly version: string;
    readonly locale: string;
    readonly contentHash: string;
  };
}): ConsentLedgerRecordView {
  return {
    id: record.id,
    purpose: record.consentTextVersion.purpose,
    textVersion: record.consentTextVersion.version,
    locale: record.consentTextVersion.locale as ConsentLedgerRecordView['locale'],
    contentHash: record.consentTextVersion.contentHash,
    grantedAt: record.grantedAt.toISOString(),
    withdrawnAt: record.withdrawnAt?.toISOString() ?? null,
    withdrawable: ['PRIVACY', 'CLINIC_INTRODUCTION', 'INTAKE_HEALTH_INFORMATION'].includes(
      record.consentTextVersion.purpose,
    ),
  };
}

function actor(access: AccessContext) {
  return { userId: access.userId, sessionId: access.sessionId, requestId: access.requestId };
}

function command(access: AccessContext, key: string, operation: string, payload: unknown) {
  return {
    userId: access.userId,
    key,
    operation,
    requestHash: sha256(JSON.stringify(canonicalIntakeSnapshot(payload))),
  };
}

function progressOf(view: IntakeVersionView) {
  return intakeProgress({
    ...(view.desiredProcedureCode ? { desiredProcedureCode: view.desiredProcedureCode } : {}),
    dentalConcerns: view.dentalConcerns,
    treatmentGoals: view.treatmentGoals,
    ...(view.currentCountry ? { currentCountry: view.currentCountry } : {}),
    ...(view.currentCity ? { currentCity: view.currentCity } : {}),
    ...(view.expectedArrivalDate ? { expectedArrivalDate: view.expectedArrivalDate } : {}),
    ...(view.expectedDepartureDate ? { expectedDepartureDate: view.expectedDepartureDate } : {}),
    ...(view.preferredLocation ? { preferredLocation: view.preferredLocation } : {}),
    ...(view.availableTreatmentDays !== null
      ? { availableTreatmentDays: view.availableTreatmentDays }
      : {}),
    ...(view.budget
      ? {
          budgetMinimumMinor: view.budget.minimumMinor,
          budgetMaximumMinor: view.budget.maximumMinor,
          budgetCurrency: view.budget.currency,
        }
      : {}),
    ...(view.preferredLanguage ? { preferredLanguage: view.preferredLanguage } : {}),
    ...(view.smokingStatus ? { smokingStatus: view.smokingStatus } : {}),
    ...(view.pregnancyStatus ? { pregnancyStatus: view.pregnancyStatus } : {}),
    preferredConsultationTimes: view.preferredConsultationTimes,
    medicalConditions: view.medicalConditions.map(({ code }) => ({ key: code })),
    medications: view.medications.map(({ name }) => ({ key: name })),
    allergies: view.allergies.map(({ substance }) => ({ key: substance })),
    consentPurposes: view.consentPurposes,
    hasDentalHistoryAnswer:
      view.priorDentalWork !== null ||
      view.existingDiagnosis !== null ||
      view.existingImplantSystems.length > 0 ||
      view.medicalConditions.length > 0 ||
      view.medications.length > 0 ||
      view.allergies.length > 0,
    hasAccessibilityAnswer:
      view.accessibilityNeeds.length > 0 ||
      (view.smokingStatus !== null && view.pregnancyStatus !== null),
  });
}

function emptyProgress() {
  return intakeProgress({
    dentalConcerns: [],
    treatmentGoals: [],
    medicalConditions: [],
    medications: [],
    allergies: [],
    consentPurposes: [],
    hasDentalHistoryAnswer: false,
    hasAccessibilityAnswer: false,
  });
}

function encryptOptional(
  cipher: SensitiveFieldCipher,
  value: string,
  context: string,
): string | null {
  return value.trim() ? cipher.encrypt(value, context) : null;
}

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function profileContext(profileId: string, field: string): string {
  return `patient-profile:${profileId}:${field}`;
}

function emergencyContext(contactId: string, field: string): string {
  return `emergency-contact:${contactId}:${field}`;
}

function intakeContext(versionId: string, field: string): string {
  return `intake-version:${versionId}:${field}`;
}

function conditionContext(conditionId: string): string {
  return `intake-condition:${conditionId}:details`;
}

function medicationContext(medicationId: string, field: string): string {
  return `intake-medication:${medicationId}:${field}`;
}

function allergyContext(allergyId: string, field: string): string {
  return `intake-allergy:${allergyId}:${field}`;
}
