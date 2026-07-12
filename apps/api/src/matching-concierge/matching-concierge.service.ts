import { randomUUID } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { hasPermission, requiresMfa, type AccessContext } from '@dental-trust/auth';
import type {
  CalculateMatchesRequest,
  ConciergeAssignmentRequest,
  ConciergeCommunicationRequest,
  ConciergeHandoffAcceptRequest,
  ConciergeHandoffRequest,
  ConciergeInternalNoteRequest,
  ConciergeQueueQuery,
  ConciergeSupervisorReviewRequest,
  ConciergeTaskRequest,
  ConciergeTaskTransitionRequest,
  ConciergeTravelNoteRequest,
  ConciergeWorkspaceUpdate,
  IntroductionRequest,
  MatchingCriteriaRequest,
  ShortlistInterestRequest,
  ShortlistRecommendationRequest,
} from '@dental-trust/contracts';
import {
  CaseRepository,
  MatchingConciergeRepository,
  type MatchingActor,
  type Prisma,
  type PrismaClient,
} from '@dental-trust/database';
import {
  assertRecommendationOverride,
  conciergeSlaDueAt,
  DomainRuleError,
  rankOrganicClinicMatches,
} from '@dental-trust/domain';
import type { ServerEnvironment } from '@dental-trust/config/server';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';

@Injectable()
export class MatchingConciergeService {
  private readonly cases: CaseRepository;
  private readonly repository: MatchingConciergeRepository;
  private readonly cipher: SensitiveFieldCipher;

  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(SERVER_ENV) environment: ServerEnvironment,
  ) {
    this.cases = new CaseRepository(db);
    this.repository = new MatchingConciergeRepository(db);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
  }

  async listSaved(access: AccessContext, limit: number, cursor?: string) {
    this.assertPatientPermission(access, 'matching:read:own');
    const records = await this.repository.listSavedClinics(access.userId, limit, cursor);
    const hasNext = records.length > limit;
    const page = hasNext ? records.slice(0, limit) : records;
    return {
      data: page.map((saved) => ({
        id: saved.id,
        clinicId: saved.clinicId,
        clinicName: saved.clinic.name,
        clinicSlug: saved.clinic.slug,
        verificationStatus: saved.clinic.verificationStatus,
        createdAt: saved.createdAt.toISOString(),
      })),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async saveClinic(access: AccessContext, clinicId: string, idempotencyKey: string) {
    this.assertPatientPermission(access, 'matching:manage:own');
    const savedClinicId = randomUUID();
    const saved = await this.repository.saveClinic({
      savedClinicId,
      clinicId,
      actor: actorFrom(access),
      command: command(access, idempotencyKey, 'matching.clinic.save', { clinicId }),
    });
    return { id: saved.id, clinicId: saved.clinicId, createdAt: saved.createdAt.toISOString() };
  }

  async removeSaved(access: AccessContext, savedClinicId: string, idempotencyKey: string) {
    this.assertPatientPermission(access, 'matching:manage:own');
    return this.repository.removeSavedClinic({
      savedClinicId,
      actor: actorFrom(access),
      command: command(access, idempotencyKey, 'matching.clinic.remove', { savedClinicId }),
    });
  }

  async introductionConsent(access: AccessContext, locale: 'vi-VN' | 'en-US') {
    this.assertPatientPermission(access, 'matching:manage:own');
    const consent = await this.db.consentTextVersion.findFirst({
      where: { purpose: 'CLINIC_INTRODUCTION', locale },
      orderBy: { publishedAt: 'desc' },
    });
    if (!consent) throw new NotFoundException();
    return {
      id: consent.id,
      purpose: consent.purpose,
      version: consent.version,
      locale: consent.locale,
      contentHash: consent.contentHash,
      publishedAt: consent.publishedAt.toISOString(),
    };
  }

  async createCriteria(
    access: AccessContext,
    caseId: string,
    input: MatchingCriteriaRequest,
    idempotencyKey: string,
  ) {
    const source = await this.matchingSource(access, caseId, true);
    const criteriaId = randomUUID();
    const record = await this.repository.createCriteria({
      criteriaId,
      caseId,
      source,
      procedureCode: input.procedureCode,
      ...(input.preferredCity ? { preferredCity: input.preferredCity } : {}),
      ...(input.preferredDistrict ? { preferredDistrict: input.preferredDistrict } : {}),
      ...(input.arrivalDate ? { arrivalDate: dateOnly(input.arrivalDate) } : {}),
      ...(input.departureDate ? { departureDate: dateOnly(input.departureDate) } : {}),
      preferredLanguages: input.preferredLanguages,
      ...(input.budgetMinimumMinor !== undefined
        ? { budgetMinimumMinor: BigInt(input.budgetMinimumMinor) }
        : {}),
      ...(input.budgetMaximumMinor !== undefined
        ? { budgetMaximumMinor: BigInt(input.budgetMaximumMinor) }
        : {}),
      ...(input.budgetCurrency ? { budgetCurrency: input.budgetCurrency } : {}),
      complexityCategory: input.complexityCategory,
      requiresAftercare: input.requiresAftercare,
      requiresWarranty: input.requiresWarranty,
      accessibilityNeeds: input.accessibilityNeeds,
      preferredEquipment: input.preferredEquipment,
      preferences: input.preferences as Prisma.InputJsonObject,
      inputChecksum: sha256(JSON.stringify(input)),
      actor: this.actorForSource(access, source),
      command: command(access, idempotencyKey, 'matching.criteria.create', { caseId, input }),
    });
    return criteriaView(record);
  }

  async listCriteria(access: AccessContext, caseId: string) {
    const source = await this.matchingSource(access, caseId, false);
    const records = await this.repository.listCriteria(caseId);
    if (source === 'CONCIERGE') {
      await this.repository.recordConciergeRead(
        caseId,
        this.conciergeActor(access, 'concierge:case:manage'),
        false,
      );
    }
    return records.map(criteriaView);
  }

  async calculateMatches(
    access: AccessContext,
    caseId: string,
    input: CalculateMatchesRequest,
    idempotencyKey: string,
  ) {
    const source = await this.matchingSource(access, caseId, true);
    const criteria = await this.repository.findCriteria(caseId, input.criteriaVersionId);
    const candidates = await this.repository.matchingCandidates(criteria.procedureCode);
    const ranked = rankOrganicClinicMatches(
      {
        procedureCode: criteria.procedureCode,
        ...(criteria.preferredCity ? { preferredCity: criteria.preferredCity } : {}),
        ...(criteria.preferredDistrict ? { preferredDistrict: criteria.preferredDistrict } : {}),
        ...(criteria.arrivalDate
          ? { arrivalDate: criteria.arrivalDate.toISOString().slice(0, 10) }
          : {}),
        ...(criteria.departureDate
          ? { departureDate: criteria.departureDate.toISOString().slice(0, 10) }
          : {}),
        preferredLanguages: criteria.preferredLanguages,
        ...(criteria.budgetMinimumMinor !== null
          ? { budgetMinimumMinor: safeNumber(criteria.budgetMinimumMinor) }
          : {}),
        ...(criteria.budgetMaximumMinor !== null
          ? { budgetMaximumMinor: safeNumber(criteria.budgetMaximumMinor) }
          : {}),
        ...(criteria.budgetCurrency ? { budgetCurrency: criteria.budgetCurrency } : {}),
        complexityCategory: criteria.complexityCategory,
        requiresAftercare: criteria.requiresAftercare,
        requiresWarranty: criteria.requiresWarranty,
        accessibilityNeeds: criteria.accessibilityNeeds,
        preferredEquipment: criteria.preferredEquipment,
      },
      candidates,
    );
    const results = await this.repository.persistMatches({
      caseId,
      criteriaVersionId: criteria.id,
      matches: ranked.map((match, index) => ({
        id: randomUUID(),
        clinicId: match.clinicId,
        organicRank: index + 1,
        fitScore: match.fitScore,
        reasons: match.reasonCodes,
        limitations: match.limitationCodes,
        evidenceIds: match.evidenceIds,
        algorithmVersion: match.algorithmVersion,
      })),
      actor: this.actorForSource(access, source),
      command: command(access, idempotencyKey, 'matching.calculate', { caseId, input }),
    });
    return results.map(matchView);
  }

  async listMatches(access: AccessContext, caseId: string, criteriaVersionId?: string) {
    const source = await this.matchingSource(access, caseId, false);
    const matches = await this.repository.listMatches(caseId, criteriaVersionId);
    if (source === 'CONCIERGE') {
      await this.repository.recordConciergeRead(
        caseId,
        this.conciergeActor(access, 'concierge:case:manage'),
        false,
      );
    }
    return matches.map(matchView);
  }

  async patientShortlist(access: AccessContext, caseId: string) {
    await this.assertPatientCase(access, caseId, 'matching:read:own');
    return (await this.repository.listShortlist(caseId, true)).map((entry) =>
      this.shortlistView(caseId, entry),
    );
  }

  async updateShortlist(
    access: AccessContext,
    caseId: string,
    input: ShortlistRecommendationRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const results = await this.repository.listMatches(caseId);
    const resultById = new Map(results.map((result) => [result.id, result] as const));
    const recommendations = input.recommendations.map((recommendation) => {
      const result = resultById.get(recommendation.matchingResultId);
      if (!result?.organicRank) throw new NotFoundException();
      assertRecommendationOverride(
        result.organicRank,
        recommendation.displayedRank,
        recommendation.overrideReason,
      );
      return {
        matchingResultId: recommendation.matchingResultId,
        displayedRank: recommendation.displayedRank,
        ...(recommendation.overrideReason
          ? {
              encryptedOverrideReason: this.cipher.encrypt(
                recommendation.overrideReason,
                shortlistOverrideContext(caseId, recommendation.matchingResultId),
              ),
            }
          : {}),
      };
    });
    const entries = await this.repository.updateShortlist({
      caseId,
      expectedWorkspaceVersion: input.expectedWorkspaceVersion,
      shareWithPatient: input.shareWithPatient,
      recommendations,
      actor,
      command: command(access, idempotencyKey, 'matching.shortlist.update', { caseId, input }),
    });
    return entries.map((entry) => this.shortlistView(caseId, entry));
  }

  async setInterest(
    access: AccessContext,
    caseId: string,
    shortlistEntryId: string,
    input: ShortlistInterestRequest,
    idempotencyKey: string,
  ) {
    await this.assertPatientCase(access, caseId, 'matching:manage:own');
    const entry = await this.repository.setShortlistInterest({
      caseId,
      shortlistEntryId,
      interested: input.interested,
      actor: actorFrom(access),
      command: command(access, idempotencyKey, 'matching.shortlist.interest', {
        caseId,
        shortlistEntryId,
        input,
      }),
    });
    return {
      id: entry.id,
      status: entry.status,
      patientInterestedAt: iso(entry.patientInterestedAt),
    };
  }

  async requestIntroduction(
    access: AccessContext,
    caseId: string,
    shortlistEntryId: string,
    input: IntroductionRequest,
    idempotencyKey: string,
  ) {
    await this.assertPatientCase(access, caseId, 'matching:manage:own');
    const introductionId = randomUUID();
    const introduction = await this.repository.createIntroduction({
      introductionId,
      consentRecordId: randomUUID(),
      caseId,
      shortlistEntryId,
      consentTextVersionId: input.consentTextVersionId,
      ...(input.patientNote
        ? {
            encryptedPatientNote: this.cipher.encrypt(
              input.patientNote,
              introductionNoteContext(introductionId),
            ),
          }
        : {}),
      actor: actorFrom(access),
      command: command(access, idempotencyKey, 'matching.introduction.request', {
        caseId,
        shortlistEntryId,
        input,
      }),
    });
    return {
      id: introduction.id,
      status: introduction.status,
      consentRecordId: introduction.consentRecordId,
      createdAt: introduction.createdAt.toISOString(),
    };
  }

  async queue(access: AccessContext, query: ConciergeQueueQuery) {
    const actor = this.conciergeActor(access, 'concierge:queue:read');
    if (query.assignment !== 'MINE' && !hasPermission(access, 'concierge:supervise')) {
      throw new ForbiddenException();
    }
    const records = await this.repository.queue({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      limit: query.limit,
      assignment: query.assignment,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.sla ? { sla: query.sla } : {}),
    });
    await this.repository.recordConciergeQueueRead(actor, 'queue');
    const hasNext = records.length > query.limit;
    const page = hasNext ? records.slice(0, query.limit) : records;
    return {
      data: page.map((workspace) => ({
        ...workspace,
        slaDueAt: workspace.slaDueAt.toISOString(),
        lastActivityAt: workspace.lastActivityAt.toISOString(),
        case: {
          ...workspace.dentalCase,
          updatedAt: workspace.dentalCase.updatedAt.toISOString(),
        },
        dentalCase: undefined,
      })),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async dashboard(access: AccessContext) {
    const actor = this.conciergeActor(access, 'concierge:queue:read');
    const dashboard = await this.repository.dashboard(actor.organizationId);
    await this.repository.recordConciergeQueueRead(actor, 'dashboard');
    return dashboard;
  }

  async detail(access: AccessContext, caseId: string) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const organizationWide = hasPermission(access, 'concierge:supervise');
    const workspace = await this.repository.detail(caseId, actor, organizationWide);
    await this.repository.recordConciergeRead(caseId, actor, organizationWide);
    return this.conciergeDetailView(workspace);
  }

  async assign(
    access: AccessContext,
    caseId: string,
    input: ConciergeAssignmentRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:supervise');
    const workspace = await this.repository.assignWorkspace({
      workspaceId: randomUUID(),
      caseId,
      assignedAgentUserId: input.assignedAgentUserId,
      ...(input.supervisorUserId ? { supervisorUserId: input.supervisorUserId } : {}),
      priority: input.priority,
      slaDueAt: conciergeSlaDueAt(input.priority),
      expectedVersion: input.expectedVersion,
      actor,
      command: command(access, idempotencyKey, 'concierge.case.assign', { caseId, input }),
    });
    return workspaceView(workspace);
  }

  async updateWorkspace(
    access: AccessContext,
    caseId: string,
    input: ConciergeWorkspaceUpdate,
    idempotencyKey: string,
  ) {
    if (input.status === 'UNASSIGNED') {
      throw new DomainRuleError(
        'CONCIERGE_ASSIGNED_CASE_CANNOT_BE_UNASSIGNED',
        'Use an attributable handoff instead of clearing an assigned case.',
      );
    }
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const current = await this.repository.detail(caseId, actor, false);
    const priorityChanged = current.priority !== input.priority;
    if (priorityChanged && !input.priorityChangeReason) {
      throw new DomainRuleError(
        'CONCIERGE_PRIORITY_REASON_REQUIRED',
        'A reason code is required when changing case priority and SLA.',
      );
    }
    const workspace = await this.repository.updateWorkspace({
      caseId,
      expectedVersion: input.expectedVersion,
      priority: input.priority,
      ...(input.priorityChangeReason ? { priorityChangeReason: input.priorityChangeReason } : {}),
      status: input.status,
      encryptedPatientSummary: this.cipher.encrypt(
        input.patientSummary,
        workspaceSummaryContext(caseId),
      ),
      missingDocumentCategories: input.missingDocumentCategories,
      slaDueAt: priorityChanged ? conciergeSlaDueAt(input.priority) : current.slaDueAt,
      actor,
      command: command(access, idempotencyKey, 'concierge.workspace.update', { caseId, input }),
    });
    return workspaceView(workspace);
  }

  async addInternalNote(
    access: AccessContext,
    caseId: string,
    input: ConciergeInternalNoteRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const noteId = randomUUID();
    const note = await this.repository.createInternalNote({
      noteId,
      caseId,
      encryptedBody: this.cipher.encrypt(input.body, internalNoteContext(noteId)),
      actor,
      command: command(access, idempotencyKey, 'concierge.note.create', { caseId, input }),
    });
    return { id: note.id, createdAt: note.createdAt.toISOString() };
  }

  async addTravelNote(
    access: AccessContext,
    caseId: string,
    input: ConciergeTravelNoteRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const noteId = randomUUID();
    const note = await this.repository.createTravelNote({
      noteId,
      caseId,
      encryptedBody: this.cipher.encrypt(input.body, travelNoteContext(noteId)),
      actor,
      command: command(access, idempotencyKey, 'concierge.travel-note.create', {
        caseId,
        input,
      }),
    });
    return { id: note.id, createdAt: note.createdAt.toISOString() };
  }

  async addCommunication(
    access: AccessContext,
    caseId: string,
    input: ConciergeCommunicationRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const eventId = randomUUID();
    const event = await this.repository.createCommunication({
      eventId,
      caseId,
      channel: input.channel,
      direction: input.direction,
      occurredAt: new Date(input.occurredAt),
      encryptedSummary: this.cipher.encrypt(input.summary, communicationContext(eventId)),
      actor,
      command: command(access, idempotencyKey, 'concierge.communication.create', {
        caseId,
        input,
      }),
    });
    return {
      id: event.id,
      channel: event.channel,
      direction: event.direction,
      occurredAt: event.occurredAt.toISOString(),
    };
  }

  async createTask(
    access: AccessContext,
    caseId: string,
    input: ConciergeTaskRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const taskId = randomUUID();
    const task = await this.repository.createTask({
      taskId,
      caseId,
      kind: input.kind,
      encryptedTitle: this.cipher.encrypt(input.title, taskTitleContext(taskId)),
      ...(input.details
        ? { encryptedDetails: this.cipher.encrypt(input.details, taskDetailsContext(taskId)) }
        : {}),
      ...(input.assignedUserId ? { assignedUserId: input.assignedUserId } : {}),
      dueAt: new Date(input.dueAt),
      actor,
      command: command(access, idempotencyKey, 'concierge.task.create', { caseId, input }),
    });
    return this.taskView(task);
  }

  async transitionTask(
    access: AccessContext,
    caseId: string,
    taskId: string,
    input: ConciergeTaskTransitionRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const task = await this.repository.transitionTask({
      caseId,
      taskId,
      status: input.status,
      expectedVersion: input.expectedVersion,
      actor,
      command: command(access, idempotencyKey, 'concierge.task.transition', {
        caseId,
        taskId,
        input,
      }),
    });
    return this.taskView(task);
  }

  async handoff(
    access: AccessContext,
    caseId: string,
    input: ConciergeHandoffRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const handoffId = randomUUID();
    const handoff = await this.repository.createHandoff({
      handoffId,
      caseId,
      toAgentUserId: input.toAgentUserId,
      encryptedReason: this.cipher.encrypt(input.reason, handoffContext(handoffId)),
      expectedVersion: input.expectedVersion,
      actor,
      command: command(access, idempotencyKey, 'concierge.handoff.create', { caseId, input }),
    });
    return {
      id: handoff.id,
      fromUserId: handoff.fromUserId,
      toUserId: handoff.toUserId,
      status: handoff.status,
      createdAt: handoff.createdAt.toISOString(),
    };
  }

  async acceptHandoff(
    access: AccessContext,
    caseId: string,
    handoffId: string,
    input: ConciergeHandoffAcceptRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    return workspaceView(
      await this.repository.acceptHandoff({
        caseId,
        handoffId,
        expectedVersion: input.expectedVersion,
        actor,
        command: command(access, idempotencyKey, 'concierge.handoff.accept', {
          caseId,
          handoffId,
          input,
        }),
      }),
    );
  }

  async supervisorReview(
    access: AccessContext,
    caseId: string,
    input: ConciergeSupervisorReviewRequest,
    idempotencyKey: string,
  ) {
    const actor = this.conciergeActor(access, 'concierge:supervise');
    const reviewId = randomUUID();
    const review = await this.repository.createSupervisorReview({
      reviewId,
      caseId,
      decision: input.decision,
      encryptedNote: this.cipher.encrypt(input.note, supervisorReviewContext(reviewId)),
      expectedVersion: input.expectedVersion,
      actor,
      command: command(access, idempotencyKey, 'concierge.supervisor-review.create', {
        caseId,
        input,
      }),
    });
    return {
      id: review.id,
      decision: review.decision,
      workspaceVersion: review.workspaceVersion,
      createdAt: review.createdAt.toISOString(),
    };
  }

  private async matchingSource(
    access: AccessContext,
    caseId: string,
    manage: boolean,
  ): Promise<'PATIENT' | 'CONCIERGE'> {
    const resource = await this.cases.loadAccessResource(caseId);
    if (!resource) throw new NotFoundException();
    if (resource.patientUserId === access.userId) {
      this.assertPatientPermission(access, manage ? 'matching:manage:own' : 'matching:read:own');
      return 'PATIENT';
    }
    const actor = this.conciergeActor(access, 'concierge:case:manage');
    const direct = resource.assignments.some(
      (assignment) =>
        assignment.active &&
        assignment.userId === access.userId &&
        assignment.organizationId === actor.organizationId,
    );
    if (!direct) throw new NotFoundException();
    return 'CONCIERGE';
  }

  private async assertPatientCase(
    access: AccessContext,
    caseId: string,
    permission: 'matching:read:own' | 'matching:manage:own',
  ): Promise<void> {
    this.assertPatientPermission(access, permission);
    const resource = await this.cases.loadAccessResource(caseId);
    if (!resource || resource.patientUserId !== access.userId) throw new NotFoundException();
  }

  private assertPatientPermission(
    access: AccessContext,
    permission: 'matching:read:own' | 'matching:manage:own',
  ): void {
    if (requiresMfa(access) || !hasPermission(access, permission)) throw new ForbiddenException();
  }

  private conciergeActor(
    access: AccessContext,
    permission: 'concierge:queue:read' | 'concierge:case:manage' | 'concierge:supervise',
  ): MatchingActor & { readonly organizationId: string } {
    if (requiresMfa(access) || !hasPermission(access, permission)) throw new ForbiddenException();
    const organizationId = access.selectedOrganizationId;
    if (
      !organizationId ||
      !access.memberships.some(
        (membership) =>
          membership.organizationId === organizationId && membership.role === 'CONCIERGE_AGENT',
      )
    ) {
      throw new ForbiddenException();
    }
    return { ...actorFrom(access, organizationId), organizationId };
  }

  private actorForSource(access: AccessContext, source: 'PATIENT' | 'CONCIERGE'): MatchingActor {
    return source === 'PATIENT'
      ? actorFrom(access)
      : this.conciergeActor(access, 'concierge:case:manage');
  }

  private shortlistView(caseId: string, entry: ShortlistRecord) {
    return {
      id: entry.id,
      clinicId: entry.clinicId,
      clinicName: entry.clinic.name,
      clinicSlug: entry.clinic.slug,
      fitScore: entry.matchingResult.fitScore,
      organicRank: entry.organicRank,
      displayedRank: entry.displayedRank,
      overrideReason: entry.encryptedOverrideReason
        ? this.cipher.decrypt(
            entry.encryptedOverrideReason,
            shortlistOverrideContext(caseId, entry.matchingResultId),
          )
        : null,
      status: entry.status,
      reasons: entry.matchingResult.reasons,
      limitations: entry.matchingResult.limitations,
      evidenceIds: entry.matchingResult.evidenceIds,
      patientInterestedAt: iso(entry.patientInterestedAt),
      introductionRequest: entry.introductionRequest
        ? {
            ...entry.introductionRequest,
            createdAt: entry.introductionRequest.createdAt.toISOString(),
          }
        : null,
    };
  }

  private conciergeDetailView(workspace: ConciergeDetailRecord) {
    const caseId = workspace.caseId;
    return {
      id: workspace.id,
      caseId,
      priority: workspace.priority,
      status: workspace.status,
      version: workspace.version,
      assignedAgent: workspace.assignedAgent,
      supervisor: workspace.supervisor,
      slaDueAt: workspace.slaDueAt.toISOString(),
      lastActivityAt: workspace.lastActivityAt.toISOString(),
      patientSummary: workspace.encryptedPatientSummary
        ? this.cipher.decrypt(workspace.encryptedPatientSummary, workspaceSummaryContext(caseId))
        : null,
      missingDocumentCategories: workspace.missingDocumentCategories,
      patient: workspace.dentalCase.patientProfile,
      case: {
        id: workspace.dentalCase.id,
        caseNumber: workspace.dentalCase.caseNumber,
        title: workspace.dentalCase.title,
        status: workspace.dentalCase.status,
        desiredProcedureCode: workspace.dentalCase.desiredProcedureCode,
        preferredLocation: workspace.dentalCase.preferredLocation,
        expectedArrivalDate: isoDate(workspace.dentalCase.expectedArrivalDate),
        expectedDepartureDate: isoDate(workspace.dentalCase.expectedDepartureDate),
      },
      documents: workspace.dentalCase.documents.map((document) => ({
        ...document,
        createdAt: document.createdAt.toISOString(),
      })),
      matchingCriteria: workspace.dentalCase.matchingCriteria.map(criteriaView),
      matchingResults: workspace.dentalCase.matchingResults.map(matchView),
      shortlist: workspace.dentalCase.shortlistEntries.map((entry) =>
        this.shortlistView(caseId, entry),
      ),
      appointments: workspace.dentalCase.appointments.map((appointment) => ({
        ...appointment,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
      })),
      aftercarePlans: workspace.dentalCase.aftercarePlans,
      incidents: workspace.dentalCase.incidents,
      internalNotes: workspace.internalNotes.map((note) => ({
        id: note.id,
        authorUserId: note.authorUserId,
        body: this.cipher.decrypt(note.encryptedBody, internalNoteContext(note.id)),
        createdAt: note.createdAt.toISOString(),
      })),
      travelNotes: workspace.travelNotes.map((note) => ({
        id: note.id,
        authorUserId: note.authorUserId,
        body: this.cipher.decrypt(note.encryptedBody, travelNoteContext(note.id)),
        createdAt: note.createdAt.toISOString(),
      })),
      communications: workspace.communications.map((event) => ({
        id: event.id,
        actorUserId: event.actorUserId,
        channel: event.channel,
        direction: event.direction,
        summary: this.cipher.decrypt(event.encryptedSummary, communicationContext(event.id)),
        occurredAt: event.occurredAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
      })),
      tasks: workspace.tasks.map((task) => this.taskView(task)),
      handoffs: workspace.handoffs.map((handoff) => ({
        id: handoff.id,
        fromUserId: handoff.fromUserId,
        toUserId: handoff.toUserId,
        reason: this.cipher.decrypt(handoff.encryptedReason, handoffContext(handoff.id)),
        status: handoff.status,
        createdAt: handoff.createdAt.toISOString(),
        acceptedAt: iso(handoff.acceptedAt),
      })),
      supervisorReviews: workspace.supervisorReviews.map((review) => ({
        id: review.id,
        reviewerUserId: review.reviewerUserId,
        decision: review.decision,
        note: this.cipher.decrypt(review.encryptedNote, supervisorReviewContext(review.id)),
        workspaceVersion: review.workspaceVersion,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }

  private taskView(task: TaskRecord) {
    return {
      id: task.id,
      kind: task.kind,
      title: this.cipher.decrypt(task.encryptedTitle, taskTitleContext(task.id)),
      details: task.encryptedDetails
        ? this.cipher.decrypt(task.encryptedDetails, taskDetailsContext(task.id))
        : null,
      assignedUserId: task.assignedUserId,
      createdByUserId: task.createdByUserId,
      status: task.status,
      dueAt: task.dueAt.toISOString(),
      completedAt: iso(task.completedAt),
      version: task.version,
      createdAt: task.createdAt.toISOString(),
    };
  }
}

type ShortlistRecord = Awaited<ReturnType<MatchingConciergeRepository['listShortlist']>>[number];
type ConciergeDetailRecord = Awaited<ReturnType<MatchingConciergeRepository['detail']>>;
type TaskRecord = ConciergeDetailRecord['tasks'][number];

function actorFrom(access: AccessContext, organizationId?: string): MatchingActor {
  return {
    userId: access.userId,
    sessionId: access.sessionId,
    requestId: access.requestId,
    ...(organizationId ? { organizationId } : {}),
  };
}

function command(access: AccessContext, key: string, operation: string, payload: unknown) {
  return { userId: access.userId, key, operation, requestHash: sha256(JSON.stringify(payload)) };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainRuleError('MATCHING_BUDGET_TOO_LARGE', 'Budget cannot be safely ranked.');
  }
  return Number(value);
}

function criteriaView(criteria: Awaited<ReturnType<MatchingConciergeRepository['findCriteria']>>) {
  return {
    ...criteria,
    arrivalDate: isoDate(criteria.arrivalDate),
    departureDate: isoDate(criteria.departureDate),
    budgetMinimumMinor: criteria.budgetMinimumMinor?.toString() ?? null,
    budgetMaximumMinor: criteria.budgetMaximumMinor?.toString() ?? null,
    createdAt: criteria.createdAt.toISOString(),
  };
}

function matchView(match: Awaited<ReturnType<MatchingConciergeRepository['listMatches']>>[number]) {
  return {
    id: match.id,
    clinicId: match.clinicId,
    clinicName: match.clinic.name,
    clinicSlug: match.clinic.slug,
    organicRank: match.organicRank,
    fitScore: match.fitScore,
    reasons: match.reasons,
    limitations: match.limitations,
    evidenceIds: match.evidenceIds,
    algorithmVersion: match.algorithmVersion,
    calculatedAt: match.calculatedAt.toISOString(),
  };
}

function workspaceView(workspace: {
  id: string;
  caseId: string;
  priority: string;
  status: string;
  version: number;
  assignedAgentUserId: string | null;
  supervisorUserId: string | null;
  slaDueAt: Date;
  lastActivityAt: Date;
}) {
  return {
    ...workspace,
    slaDueAt: workspace.slaDueAt.toISOString(),
    lastActivityAt: workspace.lastActivityAt.toISOString(),
  };
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function isoDate(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function shortlistOverrideContext(caseId: string, matchingResultId: string): string {
  return `matching:${caseId}:result:${matchingResultId}:override`;
}
function introductionNoteContext(id: string): string {
  return `matching:introduction:${id}:patient-note`;
}
function workspaceSummaryContext(caseId: string): string {
  return `concierge:case:${caseId}:summary`;
}
function internalNoteContext(id: string): string {
  return `concierge:internal-note:${id}:body`;
}
function travelNoteContext(id: string): string {
  return `concierge:travel-note:${id}:body`;
}
function communicationContext(id: string): string {
  return `concierge:communication:${id}:summary`;
}
function taskTitleContext(id: string): string {
  return `concierge:task:${id}:title`;
}
function taskDetailsContext(id: string): string {
  return `concierge:task:${id}:details`;
}
function handoffContext(id: string): string {
  return `concierge:handoff:${id}:reason`;
}
function supervisorReviewContext(id: string): string {
  return `concierge:supervisor-review:${id}:note`;
}
