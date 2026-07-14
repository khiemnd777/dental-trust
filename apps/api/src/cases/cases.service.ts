import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  authorizeCaseAction,
  effectiveRoles,
  hasPermission,
  requiresMfa,
  type AccessContext,
} from '@dental-trust/auth';
import type {
  CaseListQuery,
  CreateCaseRequest,
  DentalCaseView,
  JourneySummaryListQuery,
  JourneySummaryView,
  TransitionCaseRequest,
} from '@dental-trust/contracts';
import {
  CaseRepository,
  type DentalCaseRecord,
  type JourneySummaryRecord,
  type PrismaClient,
} from '@dental-trust/database';
import {
  assertActorMayTransitionCase,
  projectJourney,
  type CaseTransitionActor,
  type JourneyPerspective,
  type JourneyUrgency,
} from '@dental-trust/domain';
import { sha256 } from '@dental-trust/security';

import { PRISMA } from '../common/tokens.js';

@Injectable()
export class CasesService {
  private readonly cases: CaseRepository;

  constructor(@Inject(PRISMA) db: PrismaClient) {
    this.cases = new CaseRepository(db);
  }

  async create(
    access: AccessContext,
    input: CreateCaseRequest,
    idempotencyKey: string,
  ): Promise<DentalCaseView> {
    if (!hasPermission(access, 'case:create')) throw new ForbiddenException();
    const result = await this.cases.createForPatient(
      access.userId,
      {
        title: input.title,
        desiredProcedureCode: input.desiredProcedureCode,
        preferredCurrency: input.preferredCurrency,
        ...(input.timingPreference ? { timingPreference: input.timingPreference } : {}),
        ...(input.decisionPriority ? { decisionPriority: input.decisionPriority } : {}),
        ...(input.preferredLocation ? { preferredLocation: input.preferredLocation } : {}),
        ...(input.expectedArrivalDate ? { expectedArrivalDate: input.expectedArrivalDate } : {}),
        ...(input.expectedDepartureDate
          ? { expectedDepartureDate: input.expectedDepartureDate }
          : {}),
      },
      auditActor(access),
      access.requestId,
      {
        userId: access.userId,
        key: idempotencyKey,
        operation: 'case.create',
        requestHash: sha256(JSON.stringify(input)),
      },
    );
    return toView(result);
  }

  async list(
    access: AccessContext,
    query: CaseListQuery,
  ): Promise<{ readonly data: readonly DentalCaseView[]; readonly nextCursor: string | null }> {
    if (
      requiresMfa(access) ||
      !(['case:read:own', 'case:read:shared', 'case:read:assigned', 'case:read:any'] as const).some(
        (permission) => hasPermission(access, permission),
      )
    ) {
      throw new ForbiddenException();
    }
    const results = await this.cases.listScoped(scopeFor(access), {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    const hasNext = results.length > query.limit;
    const page = hasNext ? results.slice(0, query.limit) : results;
    return {
      data: page.map(toView),
      nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(access: AccessContext, caseId: string): Promise<DentalCaseView> {
    const scopedCase = await this.cases.findScoped(scopeFor(access), caseId);
    if (!scopedCase) throw new NotFoundException();
    const resource = await this.cases.loadAccessResource(caseId);
    if (!resource) throw new NotFoundException();
    const decision = authorizeCaseAction(access, resource, 'READ_SUMMARY');
    if (!decision.allowed) throw new ForbiddenException();
    return toView(scopedCase);
  }

  async today(
    access: AccessContext,
    query: JourneySummaryListQuery,
  ): Promise<readonly JourneySummaryView[]> {
    assertCaseReadAccess(access);
    const records = await this.cases.listJourneySummaries(scopeFor(access), query.limit);
    return records
      .map((record) => toJourneySummary(record, access))
      .sort((left, right) => journeyPriority(left) - journeyPriority(right));
  }

  async journeySummary(access: AccessContext, caseId: string): Promise<JourneySummaryView> {
    assertCaseReadAccess(access);
    const record = await this.cases.findJourneySummary(scopeFor(access), caseId);
    if (!record) throw new NotFoundException();
    const resource = await this.cases.loadAccessResource(caseId);
    if (!resource) throw new NotFoundException();
    const decision = authorizeCaseAction(access, resource, 'READ_SUMMARY');
    if (!decision.allowed) throw new ForbiddenException();
    return toJourneySummary(record, access);
  }

  async transition(
    access: AccessContext,
    caseId: string,
    input: TransitionCaseRequest,
    idempotencyKey: string,
  ): Promise<DentalCaseView> {
    const command = {
      userId: access.userId,
      key: idempotencyKey,
      operation: 'case.transition' as const,
      requestHash: sha256(JSON.stringify({ caseId, ...input })),
    };
    const scopedCase = await this.cases.findScoped(scopeFor(access), caseId);
    if (!scopedCase) throw new NotFoundException();
    const replay = await this.cases.findIdempotentCaseResponse(command);
    if (replay) return toView(replay);
    const resource = await this.cases.loadAccessResource(caseId);
    if (!resource) throw new NotFoundException();
    const decision = authorizeCaseAction(access, resource, 'TRANSITION');
    if (!decision.allowed) throw new ForbiddenException();
    assertActorMayTransitionCase(
      transitionActor(access, resource.patientUserId === access.userId),
      scopedCase.status,
      input.toStatus,
    );
    return toView(
      await this.cases.transition(
        scopeFor(access),
        caseId,
        input.toStatus,
        input.expectedVersion,
        input.reason,
        auditActor(access, decision.organizationId),
        access.requestId,
        command,
      ),
    );
  }
}

function scopeFor(access: AccessContext) {
  return {
    userId: access.userId,
    organizationIds: access.memberships.map(({ organizationId }) => organizationId),
    includeAll: hasPermission(access, 'case:read:any'),
  };
}

function assertCaseReadAccess(access: AccessContext): void {
  if (
    requiresMfa(access) ||
    !(['case:read:own', 'case:read:shared', 'case:read:assigned', 'case:read:any'] as const).some(
      (permission) => hasPermission(access, permission),
    )
  ) {
    throw new ForbiddenException();
  }
}

function auditActor(access: AccessContext, authorizingOrganizationId?: string) {
  return {
    userId: access.userId,
    sessionId: access.sessionId,
    ...(authorizingOrganizationId ? { organizationId: authorizingOrganizationId } : {}),
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}

function transitionActor(access: AccessContext, isOwner: boolean): CaseTransitionActor {
  const roles = new Set(effectiveRoles(access));
  if (roles.has('SUPER_ADMIN') || roles.has('PLATFORM_ADMIN')) return 'PLATFORM_ADMIN';
  if (isOwner) return 'PATIENT_OWNER';
  if (roles.has('CONCIERGE_AGENT')) return 'CONCIERGE';
  if (roles.has('DENTIST')) return 'DENTIST';
  return 'CLINIC_TEAM';
}

function toView(dentalCase: DentalCaseRecord): DentalCaseView {
  return {
    id: dentalCase.id,
    caseNumber: dentalCase.caseNumber,
    patientUserId: dentalCase.patientProfile.userId,
    title: dentalCase.title,
    desiredProcedureCode: dentalCase.desiredProcedureCode,
    preferredLocation: dentalCase.preferredLocation,
    expectedArrivalDate: dentalCase.expectedArrivalDate?.toISOString().slice(0, 10) ?? null,
    expectedDepartureDate: dentalCase.expectedDepartureDate?.toISOString().slice(0, 10) ?? null,
    preferredCurrency: dentalCase.preferredCurrency,
    timingPreference: dentalCase.timingPreference,
    decisionPriority: dentalCase.decisionPriority,
    status: dentalCase.status,
    version: dentalCase.version,
    createdAt: dentalCase.createdAt.toISOString(),
    updatedAt: dentalCase.updatedAt.toISOString(),
  };
}

function toJourneySummary(record: JourneySummaryRecord, access: AccessContext): JourneySummaryView {
  const perspective = journeyPerspective(record, access);
  const projection = projectJourney({
    status: record.status,
    perspective,
    hasOpenIncident: record.incidents.length > 0,
  });
  const expectedAt = expectedDate(record, projection.expectedWithinHours);
  const urgency: JourneyUrgency =
    projection.urgency === 'URGENT'
      ? 'URGENT'
      : expectedAt && expectedAt.getTime() < Date.now()
        ? 'ATTENTION'
        : projection.urgency;
  const assignment = record.assignments.find((candidate) =>
    projection.ownerType === 'SUPPORT'
      ? candidate.kind === 'CONCIERGE' || candidate.kind === 'SUPPORT'
      : projection.ownerType === 'CLINIC'
        ? candidate.kind === 'CLINIC' || candidate.kind === 'DENTIST'
        : false,
  );
  const appointment = record.appointments[0];
  const milestone = record.treatmentMilestones[0];
  return {
    caseId: record.id,
    caseNumber: record.caseNumber,
    title: record.title,
    status: record.status,
    perspective,
    stage: projection.stage,
    progress: projection.progress,
    urgency,
    primaryAction: { code: projection.primaryActionCode },
    blockers: projection.blockerCodes.map((code) => ({ code })),
    owner: projection.ownerType
      ? {
          type: projection.ownerType,
          displayName: assignment?.assignedUser?.email ?? assignment?.organization?.name ?? null,
        }
      : null,
    expectedAt: expectedAt?.toISOString() ?? null,
    nextAppointment: appointment
      ? {
          id: appointment.id,
          kind: appointment.kind,
          startsAt: appointment.startsAt.toISOString(),
          timezone: appointment.timezone,
          status: appointment.status as 'TENTATIVE' | 'CONFIRMED',
        }
      : null,
    activeMilestone: milestone
      ? {
          id: milestone.id,
          code: milestone.code,
          title: milestone.title,
          status: milestone.status as 'PENDING' | 'IN_PROGRESS',
          scheduledAt: milestone.scheduledAt?.toISOString() ?? null,
        }
      : null,
    timeline: record.statusHistory.map((event) => ({
      id: event.id,
      status: event.toStatus,
      occurredAt: event.createdAt.toISOString(),
    })),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function journeyPerspective(
  record: JourneySummaryRecord,
  access: AccessContext,
): JourneyPerspective {
  if (record.patientProfile.userId === access.userId) return 'PATIENT';
  const roles = new Set(effectiveRoles(access));
  return roles.has('DENTIST') || roles.has('CLINIC_STAFF') || roles.has('CLINIC_ADMIN')
    ? 'CLINIC'
    : 'PATIENT';
}

function expectedDate(
  record: JourneySummaryRecord,
  expectedWithinHours: number | null,
): Date | null {
  const incidentDueAt = record.incidents[0]?.slaDueAt;
  if (incidentDueAt) return incidentDueAt;
  const milestoneAt = record.treatmentMilestones[0]?.scheduledAt;
  if (milestoneAt) return milestoneAt;
  if (expectedWithinHours === null) return record.appointments[0]?.startsAt ?? null;
  return new Date(record.updatedAt.getTime() + expectedWithinHours * 60 * 60_000);
}

function journeyPriority(summary: JourneySummaryView): number {
  if (summary.stage === 'CLOSED') return 100;
  const urgency = summary.urgency === 'URGENT' ? 0 : summary.urgency === 'ATTENTION' ? 20 : 40;
  const actingOwner =
    (summary.perspective === 'PATIENT' && summary.owner?.type === 'PATIENT') ||
    (summary.perspective === 'CLINIC' && summary.owner?.type === 'CLINIC');
  return urgency + (actingOwner ? 0 : 10);
}
