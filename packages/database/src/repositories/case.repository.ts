import { randomBytes } from 'node:crypto';

import {
  type DentalCaseStatus as PrismaCaseStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

import type { CaseAccessResource } from '@dental-trust/auth';
import { assertCaseTransition, type AuditActor, type DentalCaseStatus } from '@dental-trust/domain';

export interface CaseQueryScope {
  readonly userId: string;
  readonly organizationIds: readonly string[];
  readonly includeAll: boolean;
}

export interface CreateCasePersistenceInput {
  readonly title: string;
  readonly desiredProcedureCode: string;
  readonly preferredLocation?: string;
  readonly expectedArrivalDate?: string;
  readonly expectedDepartureDate?: string;
  readonly preferredCurrency: 'VND' | 'USD';
}

export interface PageOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly status?: DentalCaseStatus;
}

export interface IdempotencyCommand {
  readonly userId: string;
  readonly key: string;
  readonly operation: 'case.create' | 'case.transition';
  readonly requestHash: string;
}

export type DentalCaseRecord = Prisma.DentalCaseGetPayload<{
  include: { patientProfile: { select: { userId: true } } };
}>;

export class CaseNotFoundError extends Error {
  constructor() {
    super('Dental case was not found in the caller resource scope.');
    this.name = 'CaseNotFoundError';
  }
}

export class OptimisticConcurrencyError extends Error {
  constructor() {
    super('Dental case changed before this transition could be committed.');
    this.name = 'OptimisticConcurrencyError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor(
    message = 'The idempotency key is already in use for another or unfinished command.',
  ) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class CaseRepository {
  constructor(private readonly db: PrismaClient) {}

  async findIdempotentCaseResponse(command: IdempotencyCommand): Promise<DentalCaseRecord | null> {
    return this.resolveReplay(command, false);
  }

  async createForPatient(
    userId: string,
    input: CreateCasePersistenceInput,
    actor: AuditActor,
    requestId: string,
    command: IdempotencyCommand,
  ): Promise<DentalCaseRecord> {
    const replay = await this.resolveReplay(command, false);
    if (replay) return replay;
    const patient = await this.db.patientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!patient) throw new CaseNotFoundError();

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
        const dentalCase = await transaction.dentalCase.create({
          data: {
            caseNumber: createCaseNumber(),
            patientProfileId: patient.id,
            title: input.title,
            desiredProcedureCode: input.desiredProcedureCode,
            ...(input.preferredLocation ? { preferredLocation: input.preferredLocation } : {}),
            ...(input.expectedArrivalDate
              ? { expectedArrivalDate: new Date(`${input.expectedArrivalDate}T00:00:00.000Z`) }
              : {}),
            ...(input.expectedDepartureDate
              ? { expectedDepartureDate: new Date(`${input.expectedDepartureDate}T00:00:00.000Z`) }
              : {}),
            preferredCurrency: input.preferredCurrency,
            statusHistory: {
              create: {
                toStatus: 'DRAFT',
                actorUserId: actor.userId,
                reason: 'Patient created the case.',
                requestId,
              },
            },
          },
          include: { patientProfile: { select: { userId: true } } },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.userId,
            ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
            ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
            action: 'case.created',
            resourceType: 'DentalCase',
            resourceId: dentalCase.id,
            requestId,
            success: true,
            afterMetadata: { status: dentalCase.status, version: dentalCase.version },
          },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'DentalCase',
            aggregateId: dentalCase.id,
            eventType: 'case.created',
            payload: { caseId: dentalCase.id, patientUserId: userId },
            correlationId: requestId,
            idempotencyKey: `case.created:${dentalCase.id}`,
          },
        });
        await transaction.idempotencyRecord.update({
          where: { userId_key: { userId: command.userId, key: command.key } },
          data: {
            status: 'COMPLETED',
            resourceId: dentalCase.id,
            response: serializeCase(dentalCase),
            completedAt: new Date(),
          },
        });
        return dentalCase;
      })
      .catch(async (error: unknown) => {
        if (!isIdempotencyInsertRace(error)) throw error;
        const racedReplay = await this.resolveReplay(command, true);
        if (racedReplay) return racedReplay;
        throw error;
      });
  }

  async listScoped(scope: CaseQueryScope, options: PageOptions): Promise<DentalCaseRecord[]> {
    return this.db.dentalCase.findMany({
      where: {
        AND: [this.scopeWhere(scope), options.status ? { status: options.status } : {}],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor } } : {}),
      skip: options.cursor ? 1 : 0,
      take: options.limit + 1,
      include: { patientProfile: { select: { userId: true } } },
    });
  }

  async findScoped(scope: CaseQueryScope, caseId: string): Promise<DentalCaseRecord | null> {
    return this.db.dentalCase.findFirst({
      where: { AND: [{ id: caseId }, this.scopeWhere(scope)] },
      include: { patientProfile: { select: { userId: true } } },
    });
  }

  async loadAccessResource(caseId: string): Promise<CaseAccessResource | null> {
    const result = await this.db.dentalCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        patientProfile: { select: { userId: true } },
        caregiverGrants: {
          select: { caregiverUserId: true, permissions: true, expiresAt: true, revokedAt: true },
        },
        assignments: {
          select: { assignedUserId: true, organizationId: true, endedAt: true },
        },
      },
    });
    if (!result) return null;
    return {
      caseId: result.id,
      patientUserId: result.patientProfile.userId,
      caregiverGrants: result.caregiverGrants.map((grant) => ({
        caregiverUserId: grant.caregiverUserId,
        permissions: grant.permissions,
        ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
        ...(grant.revokedAt ? { revokedAt: grant.revokedAt } : {}),
      })),
      assignments: result.assignments.map((assignment) => ({
        active: assignment.endedAt === null,
        ...(assignment.assignedUserId ? { userId: assignment.assignedUserId } : {}),
        ...(assignment.organizationId ? { organizationId: assignment.organizationId } : {}),
      })),
    };
  }

  async transition(
    scope: CaseQueryScope,
    caseId: string,
    toStatus: DentalCaseStatus,
    expectedVersion: number,
    reason: string,
    actor: AuditActor,
    requestId: string,
    command: IdempotencyCommand,
  ): Promise<DentalCaseRecord> {
    const replay = await this.resolveReplay(command, false);
    if (replay) return replay;
    const current = await this.findScoped(scope, caseId);
    if (!current) throw new CaseNotFoundError();
    assertCaseTransition(current.status as DentalCaseStatus, toStatus);

    return this.db
      .$transaction(
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
          const update = await transaction.dentalCase.updateMany({
            where: {
              AND: [
                { id: caseId, version: expectedVersion, status: current.status },
                this.scopeWhere(scope),
              ],
            },
            data: { status: toStatus as PrismaCaseStatus, version: { increment: 1 } },
          });
          if (update.count !== 1) throw new OptimisticConcurrencyError();

          const updated = await transaction.dentalCase.findUniqueOrThrow({
            where: { id: caseId },
            include: { patientProfile: { select: { userId: true } } },
          });
          await transaction.caseStatusHistory.create({
            data: {
              caseId,
              fromStatus: current.status,
              toStatus: toStatus as PrismaCaseStatus,
              actorUserId: actor.userId,
              reason,
              requestId,
            },
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: actor.userId,
              ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
              ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
              action: 'case.status-transitioned',
              resourceType: 'DentalCase',
              resourceId: caseId,
              requestId,
              success: true,
              reason,
              beforeMetadata: { status: current.status, version: current.version },
              afterMetadata: { status: updated.status, version: updated.version },
            },
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateType: 'DentalCase',
              aggregateId: caseId,
              eventType: 'case.status-transitioned',
              payload: { caseId, fromStatus: current.status, toStatus, actorUserId: actor.userId },
              correlationId: requestId,
              idempotencyKey: `case.status-transitioned:${caseId}:${updated.version}`,
            },
          });
          await transaction.idempotencyRecord.update({
            where: { userId_key: { userId: command.userId, key: command.key } },
            data: {
              status: 'COMPLETED',
              resourceId: caseId,
              response: serializeCase(updated),
              completedAt: new Date(),
            },
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch(async (error: unknown) => {
        if (!isIdempotencyInsertRace(error)) throw error;
        const racedReplay = await this.resolveReplay(command, true);
        if (racedReplay) return racedReplay;
        throw error;
      });
  }

  private scopeWhere(scope: CaseQueryScope): Prisma.DentalCaseWhereInput {
    if (scope.includeAll) return {};
    return {
      OR: [
        { patientProfile: { userId: scope.userId } },
        {
          caregiverGrants: {
            some: {
              caregiverUserId: scope.userId,
              permissions: { has: 'VIEW_CASE_SUMMARY' },
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
        },
        {
          assignments: {
            some: {
              assignedUserId: scope.userId,
              organizationId: null,
              endedAt: null,
            },
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

  private async resolveReplay(
    command: IdempotencyCommand,
    waitForCompletion: boolean,
  ): Promise<DentalCaseRecord | null> {
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
        throw new IdempotencyConflictError(
          'The idempotency key was used with a different request.',
        );
      }
      if (record.expiresAt <= new Date()) {
        await this.db.idempotencyRecord.deleteMany({
          where: { id: record.id, expiresAt: { lte: new Date() } },
        });
        return null;
      }
      if (record.status === 'COMPLETED' && record.response) {
        return deserializeCase(record.response);
      }
      if (record.status === 'FAILED') {
        await this.db.idempotencyRecord.deleteMany({
          where: { id: record.id, status: 'FAILED' },
        });
        return null;
      }
      if (!waitForCompletion) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new IdempotencyConflictError('The original command is still in progress; retry shortly.');
  }
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
  const normalized = fields
    .join(' ')
    .replaceAll(/[^a-z0-9]+/giu, '')
    .toLowerCase();
  return normalized.includes('key') && normalized.includes('userid');
}

function createCaseNumber(): string {
  const year = new Date().getUTCFullYear();
  return `DT-${year}-${randomBytes(5).toString('hex').toUpperCase()}`;
}

function serializeCase(dentalCase: DentalCaseRecord): Prisma.InputJsonObject {
  return {
    id: dentalCase.id,
    caseNumber: dentalCase.caseNumber,
    patientProfileId: dentalCase.patientProfileId,
    patientUserId: dentalCase.patientProfile.userId,
    title: dentalCase.title,
    desiredProcedureCode: dentalCase.desiredProcedureCode,
    preferredLocation: dentalCase.preferredLocation,
    expectedArrivalDate: dentalCase.expectedArrivalDate?.toISOString() ?? null,
    expectedDepartureDate: dentalCase.expectedDepartureDate?.toISOString() ?? null,
    preferredCurrency: dentalCase.preferredCurrency,
    status: dentalCase.status,
    version: dentalCase.version,
    closedAt: dentalCase.closedAt?.toISOString() ?? null,
    cancelledAt: dentalCase.cancelledAt?.toISOString() ?? null,
    createdAt: dentalCase.createdAt.toISOString(),
    updatedAt: dentalCase.updatedAt.toISOString(),
  };
}

function deserializeCase(value: Prisma.JsonValue): DentalCaseRecord {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new IdempotencyConflictError('The stored idempotent response is invalid.');
  }
  const item = value as Record<string, Prisma.JsonValue>;
  const requiredString = (key: string): string => {
    const candidate = item[key];
    if (typeof candidate !== 'string') {
      throw new IdempotencyConflictError('The stored idempotent response is invalid.');
    }
    return candidate;
  };
  const nullableDate = (key: string): Date | null => {
    const candidate = item[key];
    return typeof candidate === 'string' ? new Date(candidate) : null;
  };
  const version = item.version;
  if (typeof version !== 'number') {
    throw new IdempotencyConflictError('The stored idempotent response is invalid.');
  }
  return {
    id: requiredString('id'),
    caseNumber: requiredString('caseNumber'),
    patientProfileId: requiredString('patientProfileId'),
    patientProfile: { userId: requiredString('patientUserId') },
    title: requiredString('title'),
    desiredProcedureCode: requiredString('desiredProcedureCode'),
    preferredLocation: typeof item.preferredLocation === 'string' ? item.preferredLocation : null,
    expectedArrivalDate: nullableDate('expectedArrivalDate'),
    expectedDepartureDate: nullableDate('expectedDepartureDate'),
    preferredCurrency: requiredString('preferredCurrency') as DentalCaseRecord['preferredCurrency'],
    status: requiredString('status') as DentalCaseRecord['status'],
    version,
    closedAt: nullableDate('closedAt'),
    cancelledAt: nullableDate('cancelledAt'),
    createdAt: new Date(requiredString('createdAt')),
    updatedAt: new Date(requiredString('updatedAt')),
  };
}
