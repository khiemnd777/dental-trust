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
  TransitionCaseRequest,
} from '@dental-trust/contracts';
import { CaseRepository, type DentalCaseRecord, type PrismaClient } from '@dental-trust/database';
import { assertActorMayTransitionCase, type CaseTransitionActor } from '@dental-trust/domain';
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
    status: dentalCase.status,
    version: dentalCase.version,
    createdAt: dentalCase.createdAt.toISOString(),
    updatedAt: dentalCase.updatedAt.toISOString(),
  };
}
