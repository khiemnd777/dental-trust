import { createHmac, randomUUID } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  hasPermission,
  requiresMfa,
  type AccessContext,
  type CaseAccessResource,
} from '@dental-trust/auth';
import type {
  MilestoneCompleteRequest,
  PassportDraftRequest,
  PassportShareRequest,
  PlanChangeRequestInput,
  TreatmentInstructionRequest,
} from '@dental-trust/contracts';
import {
  CaseRepository,
  JourneyConflictError,
  JourneyRepository,
  type JourneyActor,
  type Prisma,
  type PrismaClient,
} from '@dental-trust/database';
import { assertPlanChangeFieldsMatchKind, canonicalPassportContent } from '@dental-trust/domain';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';
import type { ServerEnvironment } from '@dental-trust/config/server';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';
import { PrivateObjectStorageProvider } from '../infrastructure/providers/private-object-storage.provider.js';
import { PassportPdfProvider, type PassportPdfInput } from './passport-pdf.provider.js';

const clinicRoles = new Set(['DENTIST', 'CLINIC_STAFF', 'CLINIC_ADMIN']);
const clinicalAuthorRoles = new Set(['DENTIST']);
const publisherRoles = new Set(['DENTIST', 'CLINIC_ADMIN']);

@Injectable()
export class JourneyService {
  private readonly cases: CaseRepository;
  private readonly journey: JourneyRepository;
  private readonly cipher: SensitiveFieldCipher;
  private readonly storage: PrivateObjectStorageProvider;
  private readonly pdf: PassportPdfProvider;

  constructor(
    @Inject(PRISMA) database: PrismaClient,
    @Inject(SERVER_ENV) private readonly environment: ServerEnvironment,
  ) {
    this.cases = new CaseRepository(database);
    this.journey = new JourneyRepository(database);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
    this.storage = new PrivateObjectStorageProvider(environment);
    this.pdf = new PassportPdfProvider(environment);
  }

  async read(access: AccessContext, caseId: string) {
    const resource = await this.resource(caseId);
    assertJourneyReadAccess(access, resource);
    const record = await this.journey.read(caseId);
    if (!record) throw new NotFoundException();
    return {
      id: record.id,
      caseNumber: record.caseNumber,
      title: record.title,
      status: record.status,
      version: record.version,
      milestones: record.treatmentMilestones.map((milestone) => ({
        id: milestone.id,
        code: milestone.code,
        title: milestone.title,
        status: milestone.status,
        scheduledAt: milestone.scheduledAt?.toISOString() ?? null,
        completedAt: milestone.completedAt?.toISOString() ?? null,
        completedByUserId: milestone.completedByUserId,
        version: milestone.version,
      })),
      instructions: record.treatmentInstructions.map((instruction) => ({
        id: instruction.id,
        milestoneId: instruction.milestoneId,
        authorUserId: instruction.authorUserId,
        type: instruction.type,
        locale: instruction.locale,
        content: this.cipher.decrypt(
          instruction.encryptedContent,
          instructionContext(instruction.id),
        ),
        createdAt: instruction.createdAt.toISOString(),
      })),
      planChanges: record.planChangeRequests.map((change) => ({
        id: change.id,
        fromPlanVersionId: change.fromPlanVersionId,
        authorUserId: change.authorUserId,
        kind: change.kind,
        reason: change.reason,
        changes: planChangesFrom(change.beforeValues, change.afterValues),
        createdAt: change.createdAt.toISOString(),
        acknowledgedAt: change.acknowledgement?.acknowledgedAt.toISOString() ?? null,
      })),
    };
  }

  async completeMilestone(
    access: AccessContext,
    caseId: string,
    milestoneId: string,
    input: MilestoneCompleteRequest,
    idempotencyKey: string,
  ) {
    const organizationId = await this.assertClinicMutation(access, caseId, clinicRoles);
    const providerNote = input.providerNote
      ? this.cipher.encrypt(
          input.providerNote,
          `milestone:${milestoneId}:completion:${input.expectedVersion}`,
        )
      : undefined;
    const milestone = await this.journey.completeMilestone({
      caseId,
      milestoneId,
      expectedVersion: input.expectedVersion,
      ...(providerNote ? { encryptedProviderNote: providerNote } : {}),
      actor: actorFrom(access, organizationId),
      command: command(access, idempotencyKey, 'journey.milestone.complete', {
        caseId,
        milestoneId,
        input,
      }),
      requestId: access.requestId,
    });
    return {
      ...milestone,
      scheduledAt: milestone.scheduledAt?.toISOString() ?? null,
      completedAt: milestone.completedAt?.toISOString() ?? null,
    };
  }

  async createInstruction(
    access: AccessContext,
    caseId: string,
    input: TreatmentInstructionRequest,
    idempotencyKey: string,
  ) {
    const organizationId = await this.assertClinicMutation(access, caseId, clinicalAuthorRoles);
    const instructionId = randomUUID();
    const instruction = await this.journey.createInstruction({
      instructionId,
      caseId,
      ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}),
      type: input.type,
      locale: input.locale,
      encryptedContent: this.cipher.encrypt(input.content, instructionContext(instructionId)),
      actor: actorFrom(access, organizationId),
      command: command(access, idempotencyKey, 'journey.instruction.create', { caseId, input }),
      requestId: access.requestId,
    });
    return {
      id: instruction.id,
      milestoneId: instruction.milestoneId,
      authorUserId: instruction.authorUserId,
      type: instruction.type,
      locale: instruction.locale,
      content: this.cipher.decrypt(
        instruction.encryptedContent,
        instructionContext(instruction.id),
      ),
      createdAt: instruction.createdAt.toISOString(),
    };
  }

  async createPlanChange(
    access: AccessContext,
    caseId: string,
    input: PlanChangeRequestInput,
    idempotencyKey: string,
  ) {
    assertPlanChangeFieldsMatchKind(
      input.kind,
      input.changes.map(({ field }) => field),
    );
    const allowedRoles = input.kind === 'PRICE' ? publisherRoles : clinicalAuthorRoles;
    const organizationId = await this.assertClinicMutation(access, caseId, allowedRoles);
    const beforeValues = Object.fromEntries(
      input.changes.map(({ field, beforeValue }) => [field, beforeValue]),
    ) as Prisma.InputJsonObject;
    const afterValues = Object.fromEntries(
      input.changes.map(({ field, afterValue }) => [field, afterValue]),
    ) as Prisma.InputJsonObject;
    const change = await this.journey.createPlanChange({
      caseId,
      fromPlanVersionId: input.fromPlanVersionId,
      kind: input.kind,
      reason: input.reason,
      beforeValues,
      afterValues,
      actor: actorFrom(access, organizationId),
      command: command(access, idempotencyKey, 'journey.plan-change.create', { caseId, input }),
      requestId: access.requestId,
    });
    return {
      id: change.id,
      fromPlanVersionId: change.fromPlanVersionId,
      authorUserId: change.authorUserId,
      kind: change.kind,
      reason: change.reason,
      changes: planChangesFrom(change.beforeValues, change.afterValues),
      createdAt: change.createdAt.toISOString(),
      acknowledgedAt: null,
    };
  }

  async acknowledgePlanChange(
    access: AccessContext,
    caseId: string,
    planChangeId: string,
    idempotencyKey: string,
  ) {
    const resource = await this.resource(caseId);
    assertPatientOwner(access, resource);
    const acknowledgement = await this.journey.acknowledgePlanChange({
      caseId,
      planChangeId,
      actor: actorFrom(access),
      command: command(access, idempotencyKey, 'journey.plan-change.acknowledge', {
        caseId,
        planChangeId,
      }),
      requestId: access.requestId,
    });
    return {
      id: acknowledgement.id,
      planChangeRequestId: acknowledgement.planChangeRequestId,
      acknowledgedAt: acknowledgement.acknowledgedAt.toISOString(),
    };
  }

  async createPassportDraft(
    access: AccessContext,
    caseId: string,
    input: PassportDraftRequest,
    idempotencyKey: string,
  ) {
    const organizationId = await this.assertClinicMutation(access, caseId, clinicalAuthorRoles);
    const actor = actorFrom(access, organizationId);
    const clinicId = await this.journey.assignedClinicId(caseId, actor);
    const passportVersionId = randomUUID();
    const normalized = normalizePassportInput(caseId, clinicId, input);
    const contentChecksum = checksumPassport(normalized.manifest);
    const version = await this.journey.createPassportDraft({
      passportVersionId,
      caseId,
      treatingDentistId: input.treatingDentistId,
      treatmentCompletedAt: dateOnly(input.treatmentCompletedAt),
      encryptedTreatmentSummary: this.cipher.encrypt(
        input.treatmentSummary,
        passportFieldContext(passportVersionId, 'treatment-summary'),
      ),
      encryptedDischargeInstructions: this.cipher.encrypt(
        input.dischargeInstructions,
        passportFieldContext(passportVersionId, 'discharge-instructions'),
      ),
      encryptedFollowUpInstructions: this.cipher.encrypt(
        input.followUpInstructions,
        passportFieldContext(passportVersionId, 'follow-up-instructions'),
      ),
      contentChecksum,
      implants: normalized.implants,
      materials: normalized.materials,
      prescriptions: normalized.prescriptions.map((prescription) => {
        const id = randomUUID();
        return {
          id,
          encryptedMedication: this.cipher.encrypt(
            prescription.medication,
            prescriptionFieldContext(passportVersionId, id, 'medication'),
          ),
          encryptedDosage: this.cipher.encrypt(
            prescription.dosage,
            prescriptionFieldContext(passportVersionId, id, 'dosage'),
          ),
          encryptedInstructions: this.cipher.encrypt(
            prescription.instructions,
            prescriptionFieldContext(passportVersionId, id, 'instructions'),
          ),
          prescribedAt: dateOnly(prescription.prescribedAt),
        };
      }),
      actor,
      command: command(access, idempotencyKey, 'passport.draft.create', { caseId, input }),
      requestId: access.requestId,
    });
    return this.passportView(version);
  }

  async getPassport(access: AccessContext, caseId: string, versionId?: string) {
    const resource = await this.resource(caseId);
    assertJourneyReadAccess(access, resource);
    const isPatientOwner = resource.patientUserId === access.userId;
    const version = await this.journey.findPassportVersion(caseId, versionId, !isPatientOwner);
    if (!version) throw new NotFoundException();
    if (version.status === 'DRAFT' && isPatientOwner) {
      throw new NotFoundException();
    }
    return this.passportView(version);
  }

  async publishPassport(
    access: AccessContext,
    caseId: string,
    passportVersionId: string,
    idempotencyKey: string,
  ) {
    const organizationId = await this.assertClinicMutation(access, caseId, publisherRoles);
    const version = await this.journey.findPassportVersion(caseId, passportVersionId);
    if (!version || version.status !== 'DRAFT') throw new NotFoundException();
    const plaintext = this.passportPlaintext(version);
    if (checksumPassport(plaintext.manifest) !== version.contentChecksum) {
      throw new JourneyConflictError('Passport integrity verification failed.');
    }
    const pdfInput: PassportPdfInput = {
      caseNumber: version.dentalPassport.dentalCase.caseNumber,
      version: version.version,
      schemaVersion: version.schemaVersion,
      clinicName: version.clinic.name,
      dentistName: version.treatingDentist.fullName,
      treatmentCompletedAt: toDateOnly(version.treatmentCompletedAt),
      treatmentSummary: plaintext.treatmentSummary,
      dischargeInstructions: plaintext.dischargeInstructions,
      followUpInstructions: plaintext.followUpInstructions,
      implants: plaintext.implants,
      materials: plaintext.materials,
      prescriptions: plaintext.prescriptions,
      contentChecksum: version.contentChecksum,
      ...(version.previousVersionChecksum
        ? { previousVersionChecksum: version.previousVersionChecksum }
        : {}),
      generatedAt: version.createdAt.toISOString(),
    };
    const pdf = await this.pdf.render(pdfInput);
    const pdfChecksum = sha256(pdf);
    const objectKey = `generated/passports/${caseId}/${passportVersionId}-${version.contentChecksum}-${pdfChecksum}.pdf`;
    await this.storage.putGeneratedObject({
      objectKey,
      body: pdf,
      contentType: 'application/pdf',
      checksumSha256: pdfChecksum,
    });
    const published = await this.journey.publishPassport({
      caseId,
      passportVersionId,
      contentChecksum: version.contentChecksum,
      objectKey,
      fileName: `dental-passport-${version.dentalPassport.dentalCase.caseNumber}-v${version.version}.pdf`,
      sizeBytes: pdf.length,
      pdfChecksum,
      publishedAt: new Date(),
      actor: actorFrom(access, organizationId),
      command: command(access, idempotencyKey, 'passport.publish', {
        caseId,
        passportVersionId,
        contentChecksum: version.contentChecksum,
      }),
      requestId: access.requestId,
    });
    return this.passportView(published);
  }

  async downloadPassport(access: AccessContext, caseId: string, passportVersionId: string) {
    const resource = await this.resource(caseId);
    const organizationId = assertJourneyReadAccess(access, resource);
    const version = await this.journey.findPassportVersion(caseId, passportVersionId);
    if (
      !version?.generatedFile ||
      !['PUBLISHED', 'SUPERSEDED'].includes(version.status) ||
      version.generatedFile.status !== 'AVAILABLE' ||
      version.generatedFile.scanStatus !== 'CLEAN'
    ) {
      throw new NotFoundException();
    }
    await this.journey.recordPassportDownload({
      caseId,
      passportVersionId,
      actor: actorFrom(access, organizationId),
      requestId: access.requestId,
    });
    const download = await this.storage.createPrivateDownload(version.generatedFile.objectKey);
    return { url: download.signedUrl, expiresAt: download.expiresAt.toISOString() };
  }

  async createShare(
    access: AccessContext,
    caseId: string,
    passportVersionId: string,
    input: PassportShareRequest,
    idempotencyKey: string,
  ) {
    const resource = await this.resource(caseId);
    assertPatientOwner(access, resource, true);
    const token = deterministicPassportShareToken(
      this.environment.AUTH_SECRET,
      access.userId,
      idempotencyKey,
      caseId,
      passportVersionId,
    );
    const share = await this.journey.createPassportShare({
      caseId,
      passportVersionId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000),
      ...(input.maxAccessCount ? { maxAccessCount: input.maxAccessCount } : {}),
      actor: actorFrom(access),
      command: command(access, idempotencyKey, 'passport.share.create', {
        caseId,
        passportVersionId,
        input,
      }),
      requestId: access.requestId,
    });
    const shareUrl = new URL(
      `/api/v1/passport-shares/${token}`,
      this.environment.API_URL,
    ).toString();
    return {
      id: share.id,
      url: shareUrl,
      expiresAt: share.expiresAt.toISOString(),
      maxAccessCount: share.maxAccessCount,
      accessCount: share.accessCount,
    };
  }

  async revokeShare(
    access: AccessContext,
    caseId: string,
    shareId: string,
    idempotencyKey: string,
  ) {
    const resource = await this.resource(caseId);
    assertPatientOwner(access, resource, true);
    const share = await this.journey.revokeShare({
      caseId,
      shareId,
      actor: actorFrom(access),
      command: command(access, idempotencyKey, 'passport.share.revoke', { caseId, shareId }),
      requestId: access.requestId,
    });
    return { id: share.id, revokedAt: share.revokedAt?.toISOString() ?? null };
  }

  async accessShare(
    token: string,
    metadata: { readonly ip?: string; readonly userAgent?: string },
  ) {
    const result = await this.journey.accessShare({
      tokenHash: sha256(token),
      ...(metadata.ip
        ? { ipAddressHash: sha256(`${this.environment.AUTH_SECRET}:share-ip:${metadata.ip}`) }
        : {}),
      ...(metadata.userAgent
        ? {
            userAgentHash: sha256(
              `${this.environment.AUTH_SECRET}:share-user-agent:${metadata.userAgent}`,
            ),
          }
        : {}),
    });
    if (!result.allowed) throw new NotFoundException();
    return this.storage.createPrivateDownload(result.objectKey);
  }

  private async resource(caseId: string): Promise<CaseAccessResource> {
    const resource = await this.cases.loadAccessResource(caseId);
    if (!resource) throw new NotFoundException();
    return resource;
  }

  private async assertClinicMutation(
    access: AccessContext,
    caseId: string,
    allowedRoles: ReadonlySet<string>,
  ): Promise<string> {
    const resource = await this.resource(caseId);
    return assertAssignedClinicRole(access, resource, allowedRoles);
  }

  private passportPlaintext(version: PassportVersionRecord) {
    const treatmentSummary = this.cipher.decrypt(
      version.encryptedTreatmentSummary,
      passportFieldContext(version.id, 'treatment-summary'),
    );
    const dischargeInstructions = this.cipher.decrypt(
      version.encryptedDischargeInstructions,
      passportFieldContext(version.id, 'discharge-instructions'),
    );
    const followUpInstructions = this.cipher.decrypt(
      version.encryptedFollowUpInstructions,
      passportFieldContext(version.id, 'follow-up-instructions'),
    );
    const implants = version.implants.map(
      ({ toothNumber, system, manufacturer, dimensions, abutmentDetails, lotNumber }) => ({
        toothNumber,
        system,
        manufacturer,
        dimensions,
        ...(abutmentDetails ? { abutmentDetails } : {}),
        ...(lotNumber ? { lotNumber } : {}),
      }),
    );
    const materials = version.materials.map(
      ({ procedureCode, material, manufacturer, lotNumber }) => ({
        procedureCode,
        material,
        ...(manufacturer ? { manufacturer } : {}),
        ...(lotNumber ? { lotNumber } : {}),
      }),
    );
    const prescriptions = version.prescriptions.map((prescription) => ({
      medication: this.cipher.decrypt(
        prescription.encryptedMedication,
        prescriptionFieldContext(version.id, prescription.id, 'medication'),
      ),
      dosage: this.cipher.decrypt(
        prescription.encryptedDosage,
        prescriptionFieldContext(version.id, prescription.id, 'dosage'),
      ),
      instructions: this.cipher.decrypt(
        prescription.encryptedInstructions,
        prescriptionFieldContext(version.id, prescription.id, 'instructions'),
      ),
      prescribedAt: toDateOnly(prescription.prescribedAt),
    }));
    const manifest = passportManifest({
      caseId: version.dentalPassport.caseId,
      clinicId: version.clinicId,
      treatingDentistId: version.treatingDentistId,
      treatmentCompletedAt: toDateOnly(version.treatmentCompletedAt),
      treatmentSummary,
      dischargeInstructions,
      followUpInstructions,
      implants,
      materials,
      prescriptions,
    });
    return {
      treatmentSummary,
      dischargeInstructions,
      followUpInstructions,
      implants,
      materials,
      prescriptions,
      manifest,
    };
  }

  private passportView(version: PassportVersionRecord) {
    const plaintext = this.passportPlaintext(version);
    const integrityVerified = checksumPassport(plaintext.manifest) === version.contentChecksum;
    if (!integrityVerified)
      throw new JourneyConflictError('Passport integrity verification failed.');
    return {
      id: version.id,
      caseId: version.dentalPassport.caseId,
      caseNumber: version.dentalPassport.dentalCase.caseNumber,
      version: version.version,
      schemaVersion: version.schemaVersion,
      status: version.status,
      clinic: { id: version.clinic.id, name: version.clinic.name },
      treatingDentist: {
        id: version.treatingDentist.id,
        fullName: version.treatingDentist.fullName,
      },
      treatmentCompletedAt: toDateOnly(version.treatmentCompletedAt),
      treatmentSummary: plaintext.treatmentSummary,
      dischargeInstructions: plaintext.dischargeInstructions,
      followUpInstructions: plaintext.followUpInstructions,
      implants: plaintext.implants,
      materials: plaintext.materials,
      prescriptions: plaintext.prescriptions,
      integrity: {
        algorithm: 'SHA-256',
        contentChecksum: version.contentChecksum,
        previousVersionChecksum: version.previousVersionChecksum,
        verified: true,
      },
      publishedAt: version.publishedAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
      downloadable: Boolean(version.generatedFile),
    };
  }
}

type PassportVersionRecord = NonNullable<
  Awaited<ReturnType<JourneyRepository['findPassportVersion']>>
>;

function assertJourneyReadAccess(
  access: AccessContext,
  resource: CaseAccessResource,
): string | undefined {
  if (requiresMfa(access) || access.impersonation) throw new ForbiddenException();
  if (resource.patientUserId === access.userId && hasPermission(access, 'case:read:own')) {
    return undefined;
  }
  const organizationId = access.selectedOrganizationId;
  if (
    organizationId &&
    hasPermission(access, 'case:read:assigned') &&
    resource.assignments.some(
      (assignment) => assignment.active && assignment.organizationId === organizationId,
    )
  ) {
    return organizationId;
  }
  throw new ForbiddenException();
}

function assertAssignedClinicRole(
  access: AccessContext,
  resource: CaseAccessResource,
  allowedRoles: ReadonlySet<string>,
): string {
  if (requiresMfa(access) || access.impersonation) throw new ForbiddenException();
  const organizationId = access.selectedOrganizationId;
  const membership = access.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  if (
    !organizationId ||
    !membership ||
    !allowedRoles.has(membership.role) ||
    !resource.assignments.some(
      (assignment) => assignment.active && assignment.organizationId === organizationId,
    )
  ) {
    throw new ForbiddenException();
  }
  return organizationId;
}

function assertPatientOwner(
  access: AccessContext,
  resource: CaseAccessResource,
  requireSharePermission = false,
): void {
  if (
    requiresMfa(access) ||
    access.impersonation ||
    resource.patientUserId !== access.userId ||
    !hasPermission(access, requireSharePermission ? 'case:share' : 'case:read:own')
  ) {
    throw new ForbiddenException();
  }
}

function actorFrom(access: AccessContext, organizationId?: string): JourneyActor {
  return {
    userId: access.userId,
    sessionId: access.sessionId,
    ...(organizationId ? { organizationId } : {}),
  };
}

function command(
  access: AccessContext,
  key: string,
  operation: string,
  request: Readonly<Record<string, unknown>>,
) {
  return {
    userId: access.userId,
    key,
    operation,
    requestHash: sha256(canonicalPassportContent(request)),
  };
}

function planChangesFrom(before: Prisma.JsonValue, after: Prisma.JsonValue) {
  if (!isJsonObject(before) || !isJsonObject(after)) {
    throw new JourneyConflictError('Stored plan-change values are invalid.');
  }
  return Object.keys(before)
    .sort()
    .map((field) => ({
      field,
      beforeValue: jsonScalar(before[field]),
      afterValue: jsonScalar(after[field]),
    }));
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function jsonScalar(value: Prisma.JsonValue | undefined): string {
  if (typeof value !== 'string')
    throw new JourneyConflictError('Stored plan-change value is invalid.');
  return value;
}

function normalizePassportInput(caseId: string, clinicId: string, input: PassportDraftRequest) {
  const implants = sortCanonical(
    input.implants.map((implant) => ({
      toothNumber: implant.toothNumber,
      system: implant.system,
      manufacturer: implant.manufacturer,
      dimensions: implant.dimensions,
      ...(implant.abutmentDetails ? { abutmentDetails: implant.abutmentDetails } : {}),
      ...(implant.lotNumber ? { lotNumber: implant.lotNumber } : {}),
    })),
  );
  const materials = sortCanonical(
    input.materials.map((material) => ({
      procedureCode: material.procedureCode,
      material: material.material,
      ...(material.manufacturer ? { manufacturer: material.manufacturer } : {}),
      ...(material.lotNumber ? { lotNumber: material.lotNumber } : {}),
    })),
  );
  const prescriptions = sortCanonical(
    input.prescriptions.map((prescription) => ({ ...prescription })),
  );
  const manifest = passportManifest({
    caseId,
    clinicId,
    treatingDentistId: input.treatingDentistId,
    treatmentCompletedAt: input.treatmentCompletedAt,
    treatmentSummary: input.treatmentSummary,
    dischargeInstructions: input.dischargeInstructions,
    followUpInstructions: input.followUpInstructions,
    implants,
    materials,
    prescriptions,
  });
  return { implants, materials, prescriptions, manifest };
}

function passportManifest(input: {
  readonly caseId: string;
  readonly clinicId: string;
  readonly treatingDentistId: string;
  readonly treatmentCompletedAt: string;
  readonly treatmentSummary: string;
  readonly dischargeInstructions: string;
  readonly followUpInstructions: string;
  readonly implants: readonly Readonly<Record<string, unknown>>[];
  readonly materials: readonly Readonly<Record<string, unknown>>[];
  readonly prescriptions: readonly Readonly<Record<string, unknown>>[];
}) {
  return {
    schemaVersion: 1,
    caseId: input.caseId,
    clinicId: input.clinicId,
    treatingDentistId: input.treatingDentistId,
    treatmentCompletedAt: input.treatmentCompletedAt,
    treatmentSummary: input.treatmentSummary,
    dischargeInstructions: input.dischargeInstructions,
    followUpInstructions: input.followUpInstructions,
    implants: sortCanonical(input.implants),
    materials: sortCanonical(input.materials),
    prescriptions: sortCanonical(input.prescriptions),
  };
}

function checksumPassport(manifest: Readonly<Record<string, unknown>>): string {
  return sha256(canonicalPassportContent(manifest));
}

function sortCanonical<T extends Readonly<Record<string, unknown>>>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    canonicalPassportContent(left).localeCompare(canonicalPassportContent(right)),
  );
}

function instructionContext(instructionId: string): string {
  return `journey-instruction:${instructionId}`;
}

function passportFieldContext(versionId: string, field: string): string {
  return `passport:${versionId}:${field}`;
}

function prescriptionFieldContext(versionId: string, recordId: string, field: string): string {
  return `passport:${versionId}:prescription:${recordId}:${field}`;
}

export function deterministicPassportShareToken(
  secret: string,
  userId: string,
  idempotencyKey: string,
  caseId: string,
  passportVersionId: string,
): string {
  const digest = createHmac('sha384', secret)
    .update(`passport-share:v1:${userId}:${idempotencyKey}:${caseId}:${passportVersionId}`)
    .digest('base64url');
  return `dtp_${digest}`;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
