import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { AccessContext } from '@dental-trust/auth';
import type {
  AcceptClinicTermsRequest,
  AddClinicDentistRequest,
  AddClinicOnboardingDocumentRequest,
  ArchiveClinicServiceRequest,
  AssignClinicDentistRequest,
  BeginPayoutOnboardingRequest,
  ChangeClinicTeamStatusRequest,
  ConnectClinicCalendarRequest,
  ClinicActivityQuery,
  ClinicOpportunityQuery,
  ClinicOnboardingView,
  CreateAvailabilityBlockRequest,
  CreateClinicOrganizationRequest,
  DecideClinicOpportunityRequest,
  DisconnectClinicCalendarRequest,
  InviteClinicTeamMemberRequest,
  PublishClinicServiceRequest,
  RefreshPayoutOnboardingRequest,
  SubmitClinicOnboardingRequest,
  SyncClinicCalendarRequest,
  UpdateClinicDentistRequest,
  UpdateClinicProfileRequest,
  UpdateClinicSchedulingPolicyRequest,
  UpdateClinicTeamAccessRequest,
  UpsertAvailabilityRuleRequest,
  UpsertClinicDeclarationRequest,
  UpsertClinicLocationRequest,
  VerificationRequirementView,
} from '@dental-trust/contracts';
import type { ServerEnvironment } from '@dental-trust/config/server';
import {
  ClinicOperationsRepository,
  type ClinicOperationsActor,
  type ClinicOperationsCommand,
  type ClinicOperatorScope,
  type Prisma,
  type PrismaClient,
} from '@dental-trust/database';
import { DomainRuleError } from '@dental-trust/domain';
import { createOpaqueToken, SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { CALENDAR_SYNC_PROVIDER, PAYOUT_PROVIDER, PRISMA, SERVER_ENV } from '../common/tokens.js';
import type {
  CalendarSyncProvider,
  CalendarSyncResult,
} from '../infrastructure/providers/calendar-sync.provider.js';
import type { PayoutProvider } from '../infrastructure/providers/payout.provider.js';
import { VerificationService } from '../verification/verification.service.js';
import {
  assertClinicOrganizationCreator,
  assertTargetPermissions,
  clinicScope,
} from './clinic-operations.policy.js';

@Injectable()
export class ClinicOperationsService {
  private readonly operations: ClinicOperationsRepository;
  private readonly cipher: SensitiveFieldCipher;

  constructor(
    @Inject(PRISMA) database: PrismaClient,
    @Inject(SERVER_ENV) private readonly environment: ServerEnvironment,
    @Inject(PAYOUT_PROVIDER) private readonly payoutProvider: PayoutProvider,
    @Inject(CALENDAR_SYNC_PROVIDER) private readonly calendarSyncProvider: CalendarSyncProvider,
    @Inject(VerificationService) private readonly verification: VerificationService,
  ) {
    this.operations = new ClinicOperationsRepository(database);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
  }

  createOrganization(
    access: AccessContext,
    input: CreateClinicOrganizationRequest,
    idempotencyKey: string,
  ) {
    assertClinicOrganizationCreator(access);
    return this.operations.createOrganization(
      input,
      actor(access),
      command(idempotencyKey, 'clinic.organization.create', input),
    );
  }

  async overview(access: AccessContext) {
    const scope = await this.scope(access, 'clinic:read');
    const result = await this.operations.overview(scope.clinicId, scope.organizationId);
    return {
      clinicId: scope.clinicId,
      newCases: result.newCases,
      activeAppointments: result.activeAppointments,
      activeTeam: result.activeTeam,
      openIncidents: result.openIncidents,
      activeServices: result.activeServices,
      onboarding: result.onboarding ? this.onboardingView(result.onboarding) : null,
    };
  }

  async onboarding(access: AccessContext): Promise<ClinicOnboardingView> {
    const scope = await this.scope(access, 'clinic:read');
    const result = await this.operations.onboarding(scope.clinicId);
    if (!result) throw new NotFoundException();
    return this.onboardingView(result);
  }

  async updateProfile(
    access: AccessContext,
    input: UpdateClinicProfileRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    await this.operations.updateProfile(
      scope.clinicId,
      {
        expectedVersion: input.expectedVersion,
        legalEntityName: input.legalEntityName,
        registrationNumber: input.registrationNumber,
        registrationCountry: input.registrationCountry,
        encryptedBusinessContact: this.cipher.encrypt(
          JSON.stringify(input.businessContact),
          businessContactContext(scope.clinicId),
        ),
        responsibleClinicalLeaderDentistId: input.responsibleClinicalLeaderDentistId,
        aftercarePolicy: input.aftercarePolicy,
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.onboarding.profile', input),
    );
    return this.onboarding(access);
  }

  async upsertLocation(
    access: AccessContext,
    input: UpsertClinicLocationRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    await this.operations.upsertLocation(
      scope.clinicId,
      {
        ...(input.locationId ? { locationId: input.locationId } : {}),
        name: input.name,
        address: input.address,
        city: input.city,
        ...(input.district ? { district: input.district } : {}),
        ...(input.coordinates !== undefined ? { coordinates: input.coordinates } : {}),
        timezone: input.timezone,
        encryptedBusinessContact: this.cipher.encrypt(
          JSON.stringify(input.businessContact),
          `clinic:${scope.clinicId}:location-business-contact`,
        ),
        active: input.active,
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.onboarding.location', input),
    );
    return this.onboarding(access);
  }

  async upsertDeclaration(
    access: AccessContext,
    input: UpsertClinicDeclarationRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    await this.operations.upsertDeclaration(
      scope.clinicId,
      {
        ...(input.declarationId ? { declarationId: input.declarationId } : {}),
        kind: input.kind,
        code: input.code,
        name: input.name,
        details: input.details,
        active: input.active,
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.onboarding.declaration', input),
    );
    return this.onboarding(access);
  }

  async addDocument(
    access: AccessContext,
    input: AddClinicOnboardingDocumentRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    await this.operations.addOnboardingDocument(
      scope.clinicId,
      {
        kind: input.kind,
        fileAssetId: input.fileAssetId,
        ...(input.professionalLicenseId
          ? { professionalLicenseId: input.professionalLicenseId }
          : {}),
        label: input.label,
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.onboarding.document', input),
    );
    return this.onboarding(access);
  }

  async acceptTerms(
    access: AccessContext,
    input: AcceptClinicTermsRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    await this.operations.acceptTerms(
      scope.clinicId,
      input,
      actor(access, scope),
      command(idempotencyKey, 'clinic.onboarding.terms', input),
    );
    return this.onboarding(access);
  }

  async beginPayoutOnboarding(
    access: AccessContext,
    input: BeginPayoutOnboardingRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    const onboarding = await this.operations.onboarding(scope.clinicId);
    if (!onboarding || onboarding.profile.version !== input.expectedVersion) {
      throw new ConflictException();
    }
    const existingAccountId = onboarding.profile.encryptedPayoutAccountId
      ? this.cipher.decrypt(
          onboarding.profile.encryptedPayoutAccountId,
          payoutAccountContext(scope.clinicId),
        )
      : undefined;
    let providerResult;
    try {
      providerResult = await this.payoutProvider.createOnboardingSession({
        clinicId: scope.clinicId,
        ...(existingAccountId ? { existingAccountId } : {}),
        returnUrl: input.returnUrl,
        refreshUrl: input.refreshUrl,
        idempotencyKey,
      });
    } catch {
      throw new ServiceUnavailableException('Payout onboarding is temporarily unavailable.');
    }
    await this.operations.savePayoutAccount(
      scope.clinicId,
      {
        expectedVersion: input.expectedVersion,
        provider: providerResult.provider,
        encryptedAccountId: this.cipher.encrypt(
          providerResult.accountId,
          payoutAccountContext(scope.clinicId),
        ),
        status: providerResult.status,
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.onboarding.payout-begin', input),
    );
    return {
      onboardingUrl: providerResult.onboardingUrl,
      expiresAt: providerResult.expiresAt.toISOString(),
      status: providerResult.status,
    };
  }

  async refreshPayoutOnboarding(
    access: AccessContext,
    input: RefreshPayoutOnboardingRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    const onboarding = await this.operations.onboarding(scope.clinicId);
    if (
      !onboarding?.profile.encryptedPayoutAccountId ||
      onboarding.profile.version !== input.expectedVersion
    ) {
      throw new ConflictException();
    }
    const accountId = this.cipher.decrypt(
      onboarding.profile.encryptedPayoutAccountId,
      payoutAccountContext(scope.clinicId),
    );
    let status;
    try {
      status = await this.payoutProvider.retrieveAccount(accountId);
    } catch {
      throw new ServiceUnavailableException('Payout status is temporarily unavailable.');
    }
    await this.operations.savePayoutAccount(
      scope.clinicId,
      {
        expectedVersion: input.expectedVersion,
        provider: status.provider,
        encryptedAccountId: onboarding.profile.encryptedPayoutAccountId,
        status: status.status,
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.onboarding.payout-refresh', input),
    );
    return this.onboarding(access);
  }

  async submitOnboarding(
    access: AccessContext,
    input: SubmitClinicOnboardingRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    const onboarding = await this.operations.onboarding(scope.clinicId);
    if (!onboarding || onboarding.profile.version !== input.expectedVersion) {
      throw new ConflictException();
    }
    const view = this.onboardingView(onboarding);
    if (view.missingRequirements.length > 0) {
      throw new DomainRuleError(
        'CLINIC_ONBOARDING_INCOMPLETE',
        `Clinic onboarding is missing: ${view.missingRequirements.join(', ')}.`,
      );
    }
    let verification = await this.verification.ensureClinicCase(
      access,
      scope.clinicId,
      `${idempotencyKey}:case`,
    );
    if (
      verification.status === 'DRAFT' ||
      verification.status === 'ADDITIONAL_INFORMATION_REQUIRED'
    ) {
      const sources = await this.operations.verificationEvidenceSources(scope.clinicId);
      for (const requirement of verification.requirements) {
        if (requirement.evidence.some((evidence) => !evidence.revokedAt)) continue;
        const evidence = evidenceFor(requirement, sources);
        if (!evidence) {
          throw new DomainRuleError(
            'CLINIC_VERIFICATION_EVIDENCE_MISSING',
            `No governed evidence source exists for ${requirement.category}.`,
          );
        }
        verification = await this.verification.addEvidence(
          access,
          verification.id,
          {
            expectedCaseVersion: verification.version,
            requirementId: requirement.id,
            category: requirement.category,
            ...evidence,
          },
          `${idempotencyKey}:evidence:${requirement.id}`,
        );
      }
      verification = await this.verification.submitClinicCase(
        access,
        verification.id,
        { expectedVersion: verification.version, attestation: input.attestation },
        `${idempotencyKey}:submit`,
      );
    }
    if (!onboarding.profile.verificationCaseId) {
      await this.operations.linkVerificationCase(
        scope.clinicId,
        input.expectedVersion,
        verification.id,
        actor(access, scope),
        command(idempotencyKey, 'clinic.onboarding.submit-link', {
          clinicId: scope.clinicId,
          verificationCaseId: verification.id,
          expectedVersion: input.expectedVersion,
        }),
      );
    }
    return { onboarding: await this.onboarding(access), verification };
  }

  async dentists(access: AccessContext) {
    const scope = await this.scope(access, 'clinic:read');
    return (await this.operations.listDentists(scope.clinicId)).map((affiliation) => ({
      id: affiliation.dentist.id,
      fullName: affiliation.dentist.fullName,
      slug: affiliation.dentist.slug,
      licenseNumber: affiliation.dentist.licenseNumber,
      licenseStatus: affiliation.dentist.licenseStatus,
      active: affiliation.active && !affiliation.endedAt,
      startedAt: affiliation.startedAt.toISOString(),
      endedAt: affiliation.endedAt?.toISOString() ?? null,
    }));
  }

  async addDentist(access: AccessContext, input: AddClinicDentistRequest, idempotencyKey: string) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    await this.operations.addDentist(
      scope.clinicId,
      'dentistId' in input
        ? input
        : {
            fullName: input.fullName,
            slug: input.slug,
            licenseNumber: input.licenseNumber,
            authority: input.authority,
            ...(input.scopeOfPractice ? { scopeOfPractice: input.scopeOfPractice } : {}),
            ...(input.issuedAt ? { issuedAt: new Date(`${input.issuedAt}T00:00:00.000Z`) } : {}),
            ...(input.expiresAt ? { expiresAt: new Date(`${input.expiresAt}T00:00:00.000Z`) } : {}),
          },
      actor(access, scope),
      command(idempotencyKey, 'clinic.dentist.add', input),
    );
    return this.dentists(access);
  }

  async updateDentist(
    access: AccessContext,
    dentistId: string,
    input: UpdateClinicDentistRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:onboarding');
    await this.operations.updateDentist(
      scope.clinicId,
      dentistId,
      input.active,
      actor(access, scope),
      command(idempotencyKey, 'clinic.dentist.update', { dentistId, ...input }),
    );
    return this.dentists(access);
  }

  async team(access: AccessContext) {
    const scope = await this.scope(access, 'clinic:read');
    const [members, invitations, activity] = await Promise.all([
      this.operations.listTeam(scope.clinicId, scope.organizationId),
      scope.role === 'CLINIC_ADMIN'
        ? this.operations.listPendingInvitations(scope.clinicId)
        : Promise.resolve([]),
      scope.role === 'CLINIC_ADMIN'
        ? this.operations.activity(scope.organizationId, { limit: 25 })
        : Promise.resolve({ records: [], nextCursor: null }),
    ]);
    return {
      members: members.map((member) => ({
        ...member,
        acceptedAt: member.acceptedAt?.toISOString() ?? null,
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: parseEncryptedEmail(
          this.cipher.decrypt(invitation.encryptedEmail, invitationEmailContext(invitation.id)),
        ),
        role: invitation.role,
        permissions: invitation.permissions,
        jobTitle: invitation.jobTitle,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      })),
      activity: activity.records,
    };
  }

  async inviteTeamMember(
    access: AccessContext,
    input: InviteClinicTeamMemberRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:team');
    assertTargetPermissions(input.role, input.permissions);
    const invitationId = randomUUID();
    const token = `dti_${createOpaqueToken(48)}`;
    await this.operations.inviteTeamMember(
      scope.clinicId,
      scope.organizationId,
      {
        id: invitationId,
        encryptedEmail: this.cipher.encrypt(
          input.email.toLowerCase(),
          invitationEmailContext(invitationId),
        ),
        emailHash: invitationEmailHash(input.email),
        role: input.role,
        permissions: input.permissions,
        ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
        locationIds: input.locationIds,
        tokenHash: sha256(token),
        encryptedToken: this.cipher.encrypt(token, invitationTokenContext(invitationId)),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.team.invite', { invitationId, ...input }),
    );
    return this.team(access);
  }

  async acceptInvitation(access: AccessContext, token: string) {
    if (access.impersonation || !access.mfaVerified) throw new ForbiddenException();
    const userEmail = await this.operations.userEmail(access.userId);
    if (!userEmail) throw new NotFoundException();
    const accepted = await this.operations.acceptTeamInvitation(
      sha256(token),
      access.userId,
      invitationEmailHash(userEmail),
      actor(access),
    );
    if (!accepted) throw new NotFoundException();
    return accepted;
  }

  async updateTeamAccess(
    access: AccessContext,
    membershipId: string,
    input: UpdateClinicTeamAccessRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:team');
    assertTargetPermissions(input.role, input.permissions);
    await this.operations.updateTeamAccess(
      scope.clinicId,
      scope.organizationId,
      membershipId,
      {
        expectedVersion: input.expectedVersion,
        role: input.role,
        permissions: input.permissions,
        locationIds: input.locationIds,
        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.team.access', { membershipId, ...input }),
    );
    return this.team(access);
  }

  async changeTeamStatus(
    access: AccessContext,
    membershipId: string,
    input: ChangeClinicTeamStatusRequest,
    status: 'SUSPENDED' | 'REMOVED',
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:team');
    await this.operations.changeTeamStatus(
      scope.clinicId,
      scope.organizationId,
      membershipId,
      input.expectedVersion,
      status,
      input.reason,
      actor(access, scope),
      command(idempotencyKey, `clinic.team.${status.toLowerCase()}`, {
        membershipId,
        expectedVersion: input.expectedVersion,
      }),
    );
    return this.team(access);
  }

  async activity(access: AccessContext, query: ClinicActivityQuery) {
    const scope = await this.scope(access, 'clinic:manage:team');
    return this.operations.activity(scope.organizationId, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.action ? { action: query.action } : {}),
    });
  }

  async opportunities(access: AccessContext, query: ClinicOpportunityQuery) {
    const scope = await this.scope(access, 'clinic:manage:cases', 'CASE_INBOX');
    return this.opportunityPage(scope, query);
  }

  private async opportunityPage(scope: ClinicOperatorScope, query: ClinicOpportunityQuery) {
    const page = await this.operations.opportunities(scope.clinicId, scope.organizationId, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    return {
      records: page.records.map((record) => ({
        ...record,
        expectedArrivalDate: record.expectedArrivalDate?.toISOString().slice(0, 10) ?? null,
        expectedDepartureDate: record.expectedDepartureDate?.toISOString().slice(0, 10) ?? null,
        assignedAt: record.assignedAt.toISOString(),
        respondedAt: record.respondedAt?.toISOString() ?? null,
      })),
      nextCursor: page.nextCursor,
    };
  }

  async decideOpportunity(
    access: AccessContext,
    caseId: string,
    input: DecideClinicOpportunityRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:cases', 'CASE_INBOX');
    const status =
      input.decision === 'ACCEPT'
        ? 'ACCEPTED'
        : input.decision === 'DECLINE'
          ? 'DECLINED'
          : 'ADDITIONAL_RECORDS_REQUESTED';
    await this.operations.decideOpportunity(
      scope.clinicId,
      scope.organizationId,
      caseId,
      {
        expectedVersion: input.expectedVersion,
        status,
        ...(input.reason
          ? {
              encryptedReason: this.cipher.encrypt(
                input.reason,
                opportunityReasonContext(scope.clinicId, caseId, status),
              ),
            }
          : {}),
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.opportunity.decide', {
        caseId,
        decision: input.decision,
        expectedVersion: input.expectedVersion,
      }),
    );
    return this.opportunities(access, { limit: 25 });
  }

  async assignDentist(
    access: AccessContext,
    caseId: string,
    input: AssignClinicDentistRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:cases', 'CASE_ASSIGN_DENTIST');
    await this.operations.assignDentist(
      scope.clinicId,
      scope.organizationId,
      caseId,
      input.dentistId,
      actor(access, scope),
      command(idempotencyKey, 'clinic.case.assign-dentist', { caseId, ...input }),
    );
    return this.opportunityPage(scope, { limit: 25 });
  }

  async availability(access: AccessContext) {
    const scope = await this.scope(access, 'clinic:manage:availability', 'SCHEDULING');
    const result = await this.operations.availability(scope.clinicId);
    return {
      rules: result.rules.map((rule) => ({
        id: rule.id,
        locationId: rule.locationId,
        dentistId: rule.dentistId,
        slotKind: rule.slotKind,
        dayOfWeek: rule.dayOfWeek,
        startsAtLocal: minuteToLocalTime(rule.startsAtMinute),
        endsAtLocal: minuteToLocalTime(rule.endsAtMinute),
        timezone: rule.timezone,
        capacity: rule.capacity,
        procedureDurationMinutes: rule.procedureDurationMinutes,
        effectiveFrom: rule.effectiveFrom.toISOString().slice(0, 10),
        effectiveUntil: rule.effectiveUntil?.toISOString().slice(0, 10) ?? null,
        active: rule.active,
        version: rule.version,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      })),
      blocks: result.blocks.map((block) => ({
        id: block.id,
        locationId: block.locationId,
        dentistId: block.dentistId,
        kind: block.kind,
        startsAt: block.startsAt.toISOString(),
        endsAt: block.endsAt.toISOString(),
        reason: this.cipher.decrypt(block.encryptedReason, availabilityBlockContext(block.id)),
        createdAt: block.createdAt.toISOString(),
      })),
      policy: result.policy
        ? {
            id: result.policy.id,
            clinicId: result.policy.clinicId,
            minimumNoticeMinutes: result.policy.minimumNoticeMinutes,
            maximumAdvanceDays: result.policy.maximumAdvanceDays,
            rescheduleCutoffMinutes: result.policy.rescheduleCutoffMinutes,
            cancellationCutoffMinutes: result.policy.cancellationCutoffMinutes,
            defaultConsultationMinutes: result.policy.defaultConsultationMinutes,
            defaultTreatmentMinutes: result.policy.defaultTreatmentMinutes,
            overbookingAllowed: result.policy.overbookingAllowed,
            version: result.policy.version,
            createdAt: result.policy.createdAt.toISOString(),
            updatedAt: result.policy.updatedAt.toISOString(),
          }
        : null,
      calendarConnections: result.connections.map((connection) => ({
        id: connection.id,
        dentistId: connection.dentistId,
        provider: connection.provider,
        status: connection.status,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
        lastErrorCode: connection.lastErrorCode,
      })),
    };
  }

  async upsertAvailabilityRule(
    access: AccessContext,
    input: UpsertAvailabilityRuleRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:availability', 'SCHEDULING');
    await this.operations.upsertAvailabilityRule(
      scope.clinicId,
      {
        ...(input.ruleId ? { ruleId: input.ruleId } : {}),
        locationId: input.locationId,
        ...(input.dentistId ? { dentistId: input.dentistId } : {}),
        slotKind: input.slotKind,
        dayOfWeek: input.dayOfWeek,
        startsAtMinute: localTimeToMinute(input.startsAtLocal),
        endsAtMinute: localTimeToMinute(input.endsAtLocal),
        timezone: input.timezone,
        capacity: input.capacity,
        procedureDurationMinutes: input.procedureDurationMinutes,
        effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
        ...(input.effectiveUntil
          ? { effectiveUntil: new Date(`${input.effectiveUntil}T00:00:00.000Z`) }
          : {}),
        active: input.active,
        ...(input.expectedVersion ? { expectedVersion: input.expectedVersion } : {}),
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.availability.rule', input),
    );
    return this.availability(access);
  }

  async createAvailabilityBlock(
    access: AccessContext,
    input: CreateAvailabilityBlockRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:availability', 'SCHEDULING');
    const blockId = randomUUID();
    await this.operations.createAvailabilityBlock(
      scope.clinicId,
      {
        id: blockId,
        ...(input.locationId ? { locationId: input.locationId } : {}),
        ...(input.dentistId ? { dentistId: input.dentistId } : {}),
        kind: input.kind,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        encryptedReason: this.cipher.encrypt(input.reason, availabilityBlockContext(blockId)),
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.availability.block', { blockId, ...input }),
    );
    return this.availability(access);
  }

  async updateSchedulingPolicy(
    access: AccessContext,
    input: UpdateClinicSchedulingPolicyRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:availability', 'SCHEDULING');
    await this.operations.updateSchedulingPolicy(
      scope.clinicId,
      input,
      actor(access, scope),
      command(idempotencyKey, 'clinic.scheduling-policy.update', input),
    );
    return this.availability(access);
  }

  async connectCalendar(
    access: AccessContext,
    input: ConnectClinicCalendarRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:availability', 'SCHEDULING');
    const requestedId = randomUUID();
    const connection = await this.operations.reserveCalendarConnection(
      scope.clinicId,
      {
        id: requestedId,
        ...(input.dentistId ? { dentistId: input.dentistId } : {}),
        provider: input.provider.toLowerCase(),
        externalCalendarReferenceHash: sha256(input.externalCalendarReference.trim()),
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.calendar.connect', {
        clinicId: scope.clinicId,
        dentistId: input.dentistId ?? null,
        provider: input.provider.toLowerCase(),
        externalCalendarReferenceHash: sha256(input.externalCalendarReference.trim()),
      }),
    );
    let result: CalendarSyncResult;
    try {
      result = await this.calendarSyncProvider.connect({
        connectionId: connection.id,
        clinicId: scope.clinicId,
        ...(input.dentistId ? { dentistId: input.dentistId } : {}),
        provider: input.provider.toLowerCase(),
        externalCalendarReference: input.externalCalendarReference,
        idempotencyKey,
      });
    } catch {
      await this.operations.recordCalendarConnectionStatus(
        scope.clinicId,
        connection.id,
        { status: 'ERROR', lastSyncedAt: null, lastErrorCode: 'PROVIDER_UNAVAILABLE' },
        actor(access, scope),
        command(`${idempotencyKey}:error`, 'clinic.calendar.connect-error', {
          calendarConnectionId: connection.id,
          status: 'ERROR',
          errorCode: 'PROVIDER_UNAVAILABLE',
        }),
      );
      throw new ServiceUnavailableException('Calendar synchronization is temporarily unavailable.');
    }
    await this.operations.recordCalendarConnectionStatus(
      scope.clinicId,
      connection.id,
      {
        status: result.status,
        lastSyncedAt: result.syncedAt,
        lastErrorCode: result.errorCode,
      },
      actor(access, scope),
      command(`${idempotencyKey}:result`, 'clinic.calendar.connect-result', {
        calendarConnectionId: connection.id,
        status: result.status,
        errorCode: result.errorCode,
      }),
    );
    return this.availability(access);
  }

  async syncCalendar(
    access: AccessContext,
    connectionId: string,
    input: SyncClinicCalendarRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:availability', 'SCHEDULING');
    const connection = await this.operations.calendarConnection(scope.clinicId, connectionId);
    if (!connection || connection.status !== input.expectedStatus) throw new ConflictException();
    let result: CalendarSyncResult;
    try {
      result = await this.calendarSyncProvider.sync({ connectionId, idempotencyKey });
    } catch {
      await this.operations.recordCalendarConnectionStatus(
        scope.clinicId,
        connectionId,
        { status: 'ERROR', lastSyncedAt: null, lastErrorCode: 'PROVIDER_UNAVAILABLE' },
        actor(access, scope),
        command(`${idempotencyKey}:error`, 'clinic.calendar.sync-error', {
          calendarConnectionId: connectionId,
          expectedStatus: input.expectedStatus,
          resultStatus: 'ERROR',
          errorCode: 'PROVIDER_UNAVAILABLE',
        }),
      );
      throw new ServiceUnavailableException('Calendar synchronization is temporarily unavailable.');
    }
    await this.operations.recordCalendarConnectionStatus(
      scope.clinicId,
      connectionId,
      {
        status: result.status,
        lastSyncedAt: result.syncedAt,
        lastErrorCode: result.errorCode,
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.calendar.sync', {
        calendarConnectionId: connectionId,
        expectedStatus: input.expectedStatus,
        resultStatus: result.status,
        errorCode: result.errorCode,
      }),
    );
    return this.availability(access);
  }

  async disconnectCalendar(
    access: AccessContext,
    connectionId: string,
    input: DisconnectClinicCalendarRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:availability', 'SCHEDULING');
    const connection = await this.operations.calendarConnection(scope.clinicId, connectionId);
    if (!connection || connection.status === 'DISCONNECTED') throw new ConflictException();
    try {
      await this.calendarSyncProvider.disconnect({ connectionId, idempotencyKey });
    } catch {
      throw new ServiceUnavailableException('Calendar synchronization is temporarily unavailable.');
    }
    await this.operations.disconnectCalendar(
      scope.clinicId,
      connectionId,
      input.reason,
      actor(access, scope),
      command(idempotencyKey, 'clinic.calendar.disconnect', {
        calendarConnectionId: connectionId,
      }),
    );
    return this.availability(access);
  }

  async services(access: AccessContext) {
    const scope = await this.scope(access, 'clinic:read');
    const [services, catalog] = await Promise.all([
      this.operations.listServices(scope.clinicId),
      this.operations.listProcedureCatalog(),
    ]);
    return {
      services: services.map((service) => ({
        id: service.id,
        procedureDefinitionId: service.procedureDefinitionId,
        procedureCode: service.procedureDefinition.code,
        displayNames: localizedMap(service.displayNames),
        active: service.active,
        versions: service.prices.map((price) => ({
          id: price.id,
          minimumMinor: Number(price.minimumMinor),
          maximumMinor: Number(price.maximumMinor),
          currency: price.currency,
          materialOptions: stringArray(price.materialOptions),
          brandOptions: stringArray(price.brandOptions),
          serviceSnapshot: jsonObject(price.serviceSnapshot),
          effectiveAt: price.effectiveAt.toISOString(),
          expiresAt: price.expiresAt?.toISOString() ?? null,
        })),
      })),
      catalog: catalog.map((procedure) => ({
        id: procedure.id,
        code: procedure.code,
        names: localizedMap(procedure.names),
      })),
    };
  }

  async publishService(
    access: AccessContext,
    input: PublishClinicServiceRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:services');
    await this.operations.publishService(
      scope.clinicId,
      {
        ...(input.clinicServiceId ? { clinicServiceId: input.clinicServiceId } : {}),
        procedureDefinitionId: input.procedureDefinitionId,
        displayNames: input.displayNames,
        includedServices: input.includedServices,
        exclusions: input.exclusions,
        estimatedDurationDays: input.estimatedDurationDays,
        warrantyName: input.warrantyPolicy.name,
        warrantyTerms: jsonValue(input.warrantyPolicy.terms),
        minimumMinor: BigInt(input.minimumMinor),
        maximumMinor: BigInt(input.maximumMinor),
        currency: input.currency,
        materialOptions: input.materialOptions,
        brandOptions: input.brandOptions,
        effectiveAt: new Date(input.effectiveAt),
      },
      actor(access, scope),
      command(idempotencyKey, 'clinic.service.publish', input),
    );
    return this.services(access);
  }

  async archiveService(
    access: AccessContext,
    clinicServiceId: string,
    input: ArchiveClinicServiceRequest,
    idempotencyKey: string,
  ) {
    const scope = await this.scope(access, 'clinic:manage:services');
    await this.operations.archiveService(
      scope.clinicId,
      clinicServiceId,
      input.reason,
      actor(access, scope),
      command(idempotencyKey, 'clinic.service.archive', { clinicServiceId }),
    );
    return this.services(access);
  }

  async analytics(access: AccessContext) {
    const scope = await this.scope(access, 'clinic:read:analytics', 'ANALYTICS_READ');
    const result = await this.operations.analytics(scope.clinicId, scope.organizationId);
    return {
      generatedAt: result.generatedAt.toISOString(),
      periodDays: result.periodDays,
      metrics: {
        ...result.metrics,
        nextVerificationExpiry:
          result.metrics.nextVerificationExpiry?.toISOString().slice(0, 10) ?? null,
      },
      paymentSummaries: result.paymentSummaries.map((summary) => ({
        ...summary,
        grossAmountMinor: Number(summary.grossAmountMinor),
      })),
      unavailableMetrics: result.unavailableMetrics,
    };
  }

  async billing(access: AccessContext) {
    const scope = await this.scope(access, 'clinic:read:billing');
    const result = await this.operations.billing(scope.clinicId);
    return {
      payout: result.payout
        ? {
            provider: result.payout.payoutProvider,
            status: result.payout.payoutStatus,
            updatedAt: result.payout.updatedAt.toISOString(),
          }
        : null,
      payments: result.payments.map((payment) => ({
        ...payment,
        amountMinor: Number(payment.amountMinor),
      })),
    };
  }

  private scope(
    access: AccessContext,
    permission:
      | 'clinic:read'
      | 'clinic:manage:onboarding'
      | 'clinic:manage:team'
      | 'clinic:manage:cases'
      | 'clinic:manage:availability'
      | 'clinic:manage:services'
      | 'clinic:read:analytics'
      | 'clinic:read:billing',
    operationPermission?: Parameters<typeof clinicScope>[3],
  ) {
    return clinicScope(access, this.operations, permission, operationPermission);
  }

  private onboardingView(
    record: NonNullable<Awaited<ReturnType<ClinicOperationsRepository['onboarding']>>>,
  ): ClinicOnboardingView {
    const missing = onboardingMissing(record);
    return {
      clinicId: record.clinic.id,
      organizationId: record.clinic.organizationId,
      clinicName: record.clinic.name,
      slug: record.clinic.slug,
      verificationStatus: record.clinic.verificationStatus,
      version: record.profile.version,
      progressPercent: Math.round(
        ((onboardingRequirementCount - missing.length) / onboardingRequirementCount) * 100,
      ),
      missingRequirements: missing,
      legalEntityName: record.clinic.legalEntityName,
      registrationNumber: record.profile.registrationNumber,
      registrationCountry: record.profile.registrationCountry,
      businessContact: record.profile.encryptedBusinessContact
        ? parseBusinessContact(
            this.cipher.decrypt(
              record.profile.encryptedBusinessContact,
              businessContactContext(record.clinic.id),
            ),
          )
        : null,
      responsibleClinicalLeaderDentistId: record.profile.responsibleClinicalLeaderDentistId,
      aftercarePolicy: jsonObject(record.profile.aftercarePolicy),
      payoutStatus: record.profile.payoutStatus,
      termsVersion: record.profile.termsVersion,
      termsAcceptedAt: record.profile.termsAcceptedAt?.toISOString() ?? null,
      verificationCaseId: record.profile.verificationCaseId,
      submittedAt: record.profile.submittedAt?.toISOString() ?? null,
      locations: record.locations.map((location) => ({
        id: location.id,
        name: location.name,
        address: location.address,
        city: location.city,
        district: location.district,
        coordinates:
          location.latitude !== null && location.longitude !== null
            ? { latitude: location.latitude, longitude: location.longitude }
            : null,
        timezone: location.timezone,
        active: location.active,
        businessContact: location.encryptedBusinessContact
          ? parseBusinessContact(
              this.cipher.decrypt(
                location.encryptedBusinessContact,
                `clinic:${record.clinic.id}:location-business-contact`,
              ),
            )
          : null,
      })),
      declarations: record.declarations.map((declaration) => ({
        id: declaration.id,
        kind: declaration.kind,
        code: declaration.code,
        name: declaration.name,
        details: jsonObject(declaration.details),
        active: declaration.active,
      })),
      documents: record.documents.map((document) => ({
        id: document.id,
        kind: document.kind,
        fileAssetId: document.fileAssetId,
        label: document.label,
        status: document.status,
        scanStatus: document.scanStatus,
        createdAt: document.createdAt.toISOString(),
      })),
    };
  }
}

const complianceDeclarationCodes = [
  'SCOPE_OF_PRACTICE',
  'INFECTION_CONTROL_PROCESS',
  'EMERGENCY_PROCEDURES',
  'MATERIAL_TRACEABILITY',
  'CLINICAL_RECORD_PROCESS',
  'INTERNATIONAL_PATIENT_SUPPORT',
  'ENGLISH_RECORDS_CAPABILITY',
] as const;
const onboardingRequirementCount = 14 + complianceDeclarationCodes.length;

function onboardingMissing(
  record: NonNullable<Awaited<ReturnType<ClinicOperationsRepository['onboarding']>>>,
): string[] {
  const missing: string[] = [];
  if (
    !record.clinic.legalEntityName ||
    !record.profile.registrationNumber ||
    !record.profile.registrationCountry
  )
    missing.push('LEGAL_ENTITY');
  if (!record.profile.encryptedBusinessContact) missing.push('BUSINESS_CONTACT');
  if (!record.locations.some(({ active }) => active)) missing.push('LOCATION');
  if (!record.profile.responsibleClinicalLeaderDentistId) missing.push('CLINICAL_LEADER');
  if (
    !record.documents.some(
      ({ kind, status, scanStatus }) =>
        kind === 'OPERATING_LICENSE' && status === 'AVAILABLE' && scanStatus === 'CLEAN',
    )
  )
    missing.push('OPERATING_LICENSE');
  if (
    !record.documents.some(
      ({ kind, status, scanStatus }) =>
        kind === 'PROFESSIONAL_LICENSE' && status === 'AVAILABLE' && scanStatus === 'CLEAN',
    )
  )
    missing.push('PROFESSIONAL_LICENSE');
  if (record.dentistCount === 0) missing.push('DENTIST_ROSTER');
  if (record.staffCount === 0) missing.push('STAFF');
  if (record.serviceCount === 0) missing.push('SERVICE_CAPABILITY');
  if (!record.declarations.some(({ kind, active }) => kind === 'EQUIPMENT' && active))
    missing.push('EQUIPMENT');
  if (record.warrantyCount === 0) missing.push('WARRANTY');
  if (!record.profile.aftercarePolicy) missing.push('AFTERCARE');
  if (record.profile.payoutStatus !== 'ACTIVE') missing.push('PAYOUT');
  if (!record.profile.termsAcceptedAt) missing.push('TERMS');
  for (const code of complianceDeclarationCodes) {
    if (
      !record.declarations.some((declaration) => declaration.active && declaration.code === code)
    ) {
      missing.push(`DECLARATION:${code}`);
    }
  }
  return missing;
}

function evidenceFor(
  requirement: VerificationRequirementView,
  sources: Awaited<ReturnType<ClinicOperationsRepository['verificationEvidenceSources']>>,
): { readonly fileAssetId: string } | { readonly sourceReference: string } | null {
  const documentKind =
    requirement.category === 'CLINIC_OPERATING_LICENSE'
      ? 'OPERATING_LICENSE'
      : requirement.category === 'DENTIST_PRACTICE_LICENSE'
        ? 'PROFESSIONAL_LICENSE'
        : null;
  if (documentKind) {
    const document = sources.documents.find(({ kind }) => kind === documentKind);
    return document ? { fileAssetId: document.fileAssetId } : null;
  }
  if (requirement.category === 'LOCATION') {
    const location = sources.locations[0];
    return location ? { sourceReference: `clinic-location:${location.id}` } : null;
  }
  if (
    requirement.category === 'DENTIST_CLINIC_AFFILIATION' ||
    requirement.category === 'RESPONSIBLE_CLINICAL_LEADER'
  ) {
    const affiliation =
      requirement.category === 'RESPONSIBLE_CLINICAL_LEADER'
        ? sources.affiliations.find(
            ({ dentistId }) => dentistId === sources.profile?.responsibleClinicalLeaderDentistId,
          )
        : sources.affiliations[0];
    return affiliation ? { sourceReference: `dentist-affiliation:${affiliation.id}` } : null;
  }
  if (requirement.category === 'SERVICE_CAPABILITIES') {
    const service = sources.services[0];
    return service ? { sourceReference: `clinic-service:${service.id}` } : null;
  }
  if (requirement.category === 'WARRANTY_PROCESS') {
    const warranty = sources.warranties[0];
    return warranty ? { sourceReference: `warranty-policy:${warranty.id}` } : null;
  }
  const declaration = sources.declarations.find(
    ({ code, kind }) =>
      code === requirement.category ||
      (requirement.category === 'EQUIPMENT' && kind === 'EQUIPMENT'),
  );
  return declaration ? { sourceReference: `clinic-declaration:${declaration.id}` } : null;
}

function actor(access: AccessContext, scope?: ClinicOperatorScope): ClinicOperationsActor {
  return {
    userId: access.userId,
    requestId: access.requestId,
    sessionId: access.sessionId,
    ...(scope ? { organizationId: scope.organizationId } : {}),
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}

function command(
  key: string,
  operation: string,
  request: Readonly<Record<string, unknown>>,
): ClinicOperationsCommand {
  return { key, operation, requestHash: sha256(JSON.stringify(request)) };
}

function businessContactContext(clinicId: string): string {
  return `clinic:${clinicId}:business-contact`;
}

function payoutAccountContext(clinicId: string): string {
  return `clinic:${clinicId}:payout-account`;
}

function invitationEmailContext(invitationId: string): string {
  return `clinic-invitation:${invitationId}:email`;
}

function invitationTokenContext(invitationId: string): string {
  return `clinic-invitation:${invitationId}:token`;
}

function invitationEmailHash(email: string): string {
  return sha256(email.trim().toLowerCase());
}

function opportunityReasonContext(clinicId: string, caseId: string, status: string): string {
  return `clinic:${clinicId}:case:${caseId}:opportunity:${status}`;
}

function availabilityBlockContext(blockId: string): string {
  return `availability-block:${blockId}:reason`;
}

function localTimeToMinute(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function minuteToLocalTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function parseBusinessContact(value: string): ClinicOnboardingView['businessContact'] {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid encrypted contact record.');
  const contact = parsed as Record<string, unknown>;
  if (
    typeof contact.email !== 'string' ||
    typeof contact.phone !== 'string' ||
    typeof contact.contactName !== 'string'
  ) {
    throw new Error('Invalid encrypted contact record.');
  }
  return {
    email: contact.email,
    phone: contact.phone,
    contactName: contact.contactName,
    ...(typeof contact.website === 'string' ? { website: contact.website } : {}),
  };
}

function parseEncryptedEmail(value: string): string {
  if (!value.includes('@')) throw new Error('Invalid encrypted invitation email.');
  return value;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function localizedMap(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(jsonObject(value)).flatMap(([key, item]) =>
      typeof item === 'string' ? [[key, item]] : [],
    ),
  );
}
