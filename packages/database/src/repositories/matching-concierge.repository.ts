import { Prisma, type PrismaClient } from '@prisma/client';

import { IdempotencyConflictError, OptimisticConcurrencyError } from './case.repository.js';

export class MatchingResourceNotFoundError extends Error {
  constructor() {
    super('Matching or concierge resource was not found in the authorized scope.');
    this.name = 'MatchingResourceNotFoundError';
  }
}

export class MatchingConflictError extends Error {
  constructor(message = 'The matching or concierge command conflicts with current state.') {
    super(message);
    this.name = 'MatchingConflictError';
  }
}

export interface MatchingActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly organizationId?: string;
}

export interface MatchingCommand {
  readonly userId: string;
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface DiscoverySearchInput {
  readonly locale: 'vi-VN' | 'en-US';
  readonly limit: number;
  readonly cursor?: string;
  readonly city?: string;
  readonly district?: string;
  readonly procedureCode?: string;
  readonly dentistSpecialization?: string;
  readonly language?: string;
  readonly consultationAvailableBy?: string;
  readonly minimumPriceMinor?: number;
  readonly maximumPriceMinor?: number;
  readonly currency?: 'VND' | 'USD';
  readonly equipment?: string;
  readonly aftercareSupport?: boolean;
  readonly warrantyAvailable?: boolean;
  readonly accessibility?: string;
  readonly minimumRating?: number;
  readonly followUpDataAvailable?: boolean;
  readonly bounds?: DiscoveryMapBounds;
}

export interface DiscoveryMapBounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

export interface CriteriaPersistenceInput {
  readonly criteriaId: string;
  readonly caseId: string;
  readonly source: 'PATIENT' | 'CONCIERGE';
  readonly procedureCode: string;
  readonly preferredCity?: string;
  readonly preferredDistrict?: string;
  readonly arrivalDate?: Date;
  readonly departureDate?: Date;
  readonly preferredLanguages: readonly string[];
  readonly budgetMinimumMinor?: bigint;
  readonly budgetMaximumMinor?: bigint;
  readonly budgetCurrency?: 'VND' | 'USD';
  readonly complexityCategory: 'UNKNOWN' | 'STANDARD' | 'COMPLEX';
  readonly requiresAftercare: boolean;
  readonly requiresWarranty: boolean;
  readonly accessibilityNeeds: readonly string[];
  readonly preferredEquipment: readonly string[];
  readonly preferences: Prisma.InputJsonObject;
  readonly inputChecksum: string;
  readonly actor: MatchingActor;
  readonly command: MatchingCommand;
}

export interface OrganicMatchPersistenceInput {
  readonly id: string;
  readonly clinicId: string;
  readonly organicRank: number;
  readonly fitScore: number;
  readonly reasons: readonly string[];
  readonly limitations: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly algorithmVersion: string;
}

export interface ConciergeQueueInput {
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  readonly status?:
    | 'UNASSIGNED'
    | 'ASSIGNED'
    | 'IN_PROGRESS'
    | 'WAITING_PATIENT'
    | 'WAITING_CLINIC'
    | 'SUPERVISOR_REVIEW'
    | 'HANDED_OFF'
    | 'RESOLVED';
  readonly assignment: 'MINE' | 'UNASSIGNED' | 'ALL';
  readonly sla?: 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK';
}

export class MatchingConciergeRepository {
  constructor(private readonly db: PrismaClient) {}

  async searchClinics(input: DiscoverySearchInput) {
    const now = new Date();
    const availableBy = input.consultationAvailableBy
      ? new Date(`${input.consultationAvailableBy}T23:59:59.999Z`)
      : undefined;
    const scanLimit = Math.min(input.limit * 3 + 1, 301);
    const locationFilter: Prisma.ClinicLocationWhereInput = {
      active: true,
      ...(input.city ? { city: { equals: input.city, mode: 'insensitive' } } : {}),
      ...(input.district ? { district: { equals: input.district, mode: 'insensitive' } } : {}),
      ...(input.bounds
        ? {
            latitude: { gte: input.bounds.south, lte: input.bounds.north },
            longitude: { gte: input.bounds.west, lte: input.bounds.east },
          }
        : {}),
    };
    const records = await this.db.clinic.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        verifiedAt: { not: null },
        deletedAt: null,
        verificationCases: {
          some: {
            status: 'VERIFIED',
            expiresAt: { gt: now },
            subjectType: 'CLINIC',
          },
        },
        licenses: {
          some: {
            status: 'VERIFIED',
            verifiedAt: { not: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
        ...(input.city || input.district || input.bounds
          ? {
              locations: {
                some: locationFilter,
              },
            }
          : {}),
        ...(input.procedureCode || input.warrantyAvailable !== undefined
          ? {
              services: {
                some: {
                  active: true,
                  ...(input.procedureCode
                    ? { procedureDefinition: { code: input.procedureCode, active: true } }
                    : {}),
                  ...(input.warrantyAvailable === true
                    ? { warrantyPolicyId: { not: null } }
                    : input.warrantyAvailable === false
                      ? { warrantyPolicyId: null }
                      : {}),
                  ...(input.currency ||
                  input.minimumPriceMinor !== undefined ||
                  input.maximumPriceMinor !== undefined
                    ? {
                        prices: {
                          some: {
                            effectiveAt: { lte: now },
                            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                            ...(input.currency ? { currency: input.currency } : {}),
                            ...(input.minimumPriceMinor !== undefined
                              ? { maximumMinor: { gte: BigInt(input.minimumPriceMinor) } }
                              : {}),
                            ...(input.maximumPriceMinor !== undefined
                              ? { minimumMinor: { lte: BigInt(input.maximumPriceMinor) } }
                              : {}),
                          },
                        },
                      }
                    : {}),
                },
              },
            }
          : {}),
        ...(input.dentistSpecialization
          ? {
              affiliations: {
                some: {
                  active: true,
                  endedAt: null,
                  dentist: {
                    licenseStatus: 'VERIFIED',
                    licenses: {
                      some: {
                        status: 'VERIFIED',
                        scopeOfPractice: {
                          contains: input.dentistSpecialization,
                          mode: 'insensitive',
                        },
                      },
                    },
                  },
                },
              },
            }
          : {}),
        ...(input.language ||
        input.equipment ||
        input.accessibility ||
        input.aftercareSupport !== undefined ||
        input.followUpDataAvailable !== undefined ||
        availableBy
          ? {
              discoveryProfile: {
                is: {
                  ...(input.language ? { languages: { has: input.language } } : {}),
                  ...(input.equipment ? { equipment: { has: input.equipment } } : {}),
                  ...(input.accessibility
                    ? { accessibilityFeatures: { has: input.accessibility } }
                    : {}),
                  ...(input.aftercareSupport !== undefined
                    ? { aftercareSupported: input.aftercareSupport }
                    : {}),
                  ...(input.followUpDataAvailable !== undefined
                    ? { followUpDataAvailable: input.followUpDataAvailable }
                    : {}),
                  ...(availableBy ? { earliestConsultationAt: { lte: availableBy } } : {}),
                },
              },
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: scanLimit,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: discoveryClinicSelect,
    });
    const mapped = records.map((clinic) =>
      discoveryClinicView(clinic, input.locale, now, input.bounds),
    );
    const filtered = mapped.filter(
      ({ rating, warrantyAvailable }) =>
        (input.minimumRating === undefined || Number(rating || 0) >= input.minimumRating) &&
        (input.warrantyAvailable === undefined || warrantyAvailable === input.warrantyAvailable),
    );
    const items = filtered.slice(0, input.limit);
    return {
      items,
      nextCursor:
        filtered.length > input.limit || records.length === scanLimit
          ? (records.at(-1)?.id ?? null)
          : null,
    };
  }

  async listSavedClinics(userId: string, limit: number, cursor?: string) {
    return this.db.savedClinic.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        clinic: { select: { id: true, slug: true, name: true, verificationStatus: true } },
      },
    });
  }

  async saveClinic(input: {
    readonly savedClinicId: string;
    readonly clinicId: string;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findSavedClinic(input.actor.userId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientUser(transaction, input.actor.userId);
        const clinic = await transaction.clinic.findFirst({
          where: { id: input.clinicId, verificationStatus: 'VERIFIED', deletedAt: null },
          select: { id: true },
        });
        if (!clinic) throw new MatchingResourceNotFoundError();
        const saved = await transaction.savedClinic.upsert({
          where: { userId_clinicId: { userId: input.actor.userId, clinicId: clinic.id } },
          update: {},
          create: { id: input.savedClinicId, userId: input.actor.userId, clinicId: clinic.id },
        });
        await writeEvidence(transaction, input.actor, {
          action: 'matching.clinic-saved',
          resourceType: 'SavedClinic',
          resourceId: saved.id,
          eventType: 'matching.clinic-saved',
          payload: { savedClinicId: saved.id, clinicId: clinic.id },
        });
        return { resourceId: saved.id, value: saved };
      },
      (resourceId) => this.findSavedClinic(input.actor.userId, resourceId),
    );
  }

  async removeSavedClinic(input: {
    readonly savedClinicId: string;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replay = await this.completedResponse(input.command);
    if (replay) return { id: jsonString(replay, 'resourceId'), removed: true as const };
    return this.runCommand(
      input.command,
      async (transaction) => {
        const saved = await transaction.savedClinic.findFirst({
          where: { id: input.savedClinicId, userId: input.actor.userId },
        });
        if (!saved) throw new MatchingResourceNotFoundError();
        await transaction.savedClinic.delete({ where: { id: saved.id } });
        await writeEvidence(transaction, input.actor, {
          action: 'matching.clinic-unsaved',
          resourceType: 'SavedClinic',
          resourceId: saved.id,
          eventType: 'matching.clinic-unsaved',
          payload: { savedClinicId: saved.id, clinicId: saved.clinicId },
        });
        return { resourceId: saved.id, value: { id: saved.id, removed: true as const } };
      },
      (resourceId) => Promise.resolve({ id: resourceId, removed: true as const }),
    );
  }

  async createCriteria(input: CriteriaPersistenceInput) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findCriteria(input.caseId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        if (input.source === 'PATIENT') {
          await assertPatientCase(transaction, input.caseId, input.actor.userId);
        } else {
          await assertDirectConciergeAssignment(transaction, input.caseId, input.actor);
        }
        await transaction.$queryRaw`SELECT "id" FROM "dental_cases" WHERE "id" = ${input.caseId}::uuid FOR UPDATE`;
        const latest = await transaction.caseMatchingCriteria.findFirst({
          where: { caseId: input.caseId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const criteria = await transaction.caseMatchingCriteria.create({
          data: {
            id: input.criteriaId,
            caseId: input.caseId,
            version: (latest?.version ?? 0) + 1,
            source: input.source,
            createdByUserId: input.actor.userId,
            procedureCode: input.procedureCode,
            ...(input.preferredCity ? { preferredCity: input.preferredCity } : {}),
            ...(input.preferredDistrict ? { preferredDistrict: input.preferredDistrict } : {}),
            ...(input.arrivalDate ? { arrivalDate: input.arrivalDate } : {}),
            ...(input.departureDate ? { departureDate: input.departureDate } : {}),
            preferredLanguages: [...input.preferredLanguages],
            ...(input.budgetMinimumMinor !== undefined
              ? { budgetMinimumMinor: input.budgetMinimumMinor }
              : {}),
            ...(input.budgetMaximumMinor !== undefined
              ? { budgetMaximumMinor: input.budgetMaximumMinor }
              : {}),
            ...(input.budgetCurrency ? { budgetCurrency: input.budgetCurrency } : {}),
            complexityCategory: input.complexityCategory,
            requiresAftercare: input.requiresAftercare,
            requiresWarranty: input.requiresWarranty,
            accessibilityNeeds: [...input.accessibilityNeeds],
            preferredEquipment: [...input.preferredEquipment],
            preferences: input.preferences,
            inputChecksum: input.inputChecksum,
          },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'matching.criteria-created',
          resourceType: 'CaseMatchingCriteria',
          resourceId: criteria.id,
          eventType: 'matching.criteria-created',
          payload: {
            caseId: input.caseId,
            criteriaVersionId: criteria.id,
            version: criteria.version,
          },
        });
        return { resourceId: criteria.id, value: criteria };
      },
      (resourceId) => this.findCriteria(input.caseId, resourceId),
    );
  }

  async findCriteria(caseId: string, criteriaId: string) {
    const criteria = await this.db.caseMatchingCriteria.findFirst({
      where: { id: criteriaId, caseId },
    });
    if (!criteria) throw new MatchingResourceNotFoundError();
    return criteria;
  }

  async listCriteria(caseId: string, limit = 25) {
    return this.db.caseMatchingCriteria.findMany({
      where: { caseId },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 25),
    });
  }

  async matchingCandidates(procedureCode: string) {
    const now = new Date();
    const clinics = await this.db.clinic.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        deletedAt: null,
        discoveryProfile: { isNot: null },
        verificationCases: { some: { status: 'VERIFIED', expiresAt: { gt: now } } },
        services: {
          some: {
            active: true,
            procedureDefinition: { code: procedureCode, active: true },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 100,
      select: {
        id: true,
        locations: { where: { active: true }, select: { city: true, district: true } },
        discoveryProfile: true,
        services: {
          where: { active: true },
          select: {
            warrantyPolicyId: true,
            procedureDefinition: { select: { code: true } },
            prices: {
              where: {
                effectiveAt: { lte: now },
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
              orderBy: { effectiveAt: 'desc' },
              take: 1,
            },
          },
        },
        verificationCases: {
          where: { status: 'VERIFIED', expiresAt: { gt: now } },
          orderBy: { decidedAt: 'desc' },
          take: 1,
          select: { evidence: { where: { revokedAt: null }, select: { id: true } } },
        },
      },
    });
    return clinics.flatMap((clinic) => {
      if (!clinic.discoveryProfile) return [];
      const prices = clinic.services.flatMap(({ prices: current }) => current);
      const currencies = new Set(prices.map(({ currency }) => currency));
      const minimum = prices.reduce<bigint | undefined>(
        (value, price) =>
          value === undefined || price.minimumMinor < value ? price.minimumMinor : value,
        undefined,
      );
      const maximum = prices.reduce<bigint | undefined>(
        (value, price) =>
          value === undefined || price.maximumMinor > value ? price.maximumMinor : value,
        undefined,
      );
      return [
        {
          clinicId: clinic.id,
          verifiedProcedureCodes: clinic.services.map(
            ({ procedureDefinition }) => procedureDefinition.code,
          ),
          cities: clinic.locations.map(({ city }) => city),
          districts: clinic.locations.flatMap(({ district }) => (district ? [district] : [])),
          ...(clinic.discoveryProfile.earliestConsultationAt
            ? {
                earliestConsultationDate: clinic.discoveryProfile.earliestConsultationAt
                  .toISOString()
                  .slice(0, 10),
              }
            : {}),
          languages: clinic.discoveryProfile.languages,
          ...(minimum !== undefined && minimum <= BigInt(Number.MAX_SAFE_INTEGER)
            ? { minimumPriceMinor: Number(minimum) }
            : {}),
          ...(maximum !== undefined && maximum <= BigInt(Number.MAX_SAFE_INTEGER)
            ? { maximumPriceMinor: Number(maximum) }
            : {}),
          ...(currencies.size === 1 ? { priceCurrency: [...currencies][0] } : {}),
          supportedComplexities: clinic.discoveryProfile.supportedComplexities,
          aftercareSupported: clinic.discoveryProfile.aftercareSupported,
          warrantySupported: clinic.services.some(
            ({ warrantyPolicyId }) => warrantyPolicyId !== null,
          ),
          accessibilityFeatures: clinic.discoveryProfile.accessibilityFeatures,
          equipment: clinic.discoveryProfile.equipment,
          evidenceIds: [
            ...new Set([
              ...clinic.discoveryProfile.evidenceIds,
              ...clinic.verificationCases.flatMap(({ evidence }) => evidence.map(({ id }) => id)),
            ]),
          ],
        },
      ];
    });
  }

  async persistMatches(input: {
    readonly caseId: string;
    readonly criteriaVersionId: string;
    readonly matches: readonly OrganicMatchPersistenceInput[];
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.listMatches(input.caseId, input.criteriaVersionId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertMatchingAccess(transaction, input.caseId, input.actor);
        const criteria = await transaction.caseMatchingCriteria.findFirst({
          where: { id: input.criteriaVersionId, caseId: input.caseId },
          select: { id: true },
        });
        if (!criteria) throw new MatchingResourceNotFoundError();
        const existing = await transaction.matchingResult.findMany({
          where: { criteriaVersionId: criteria.id },
          include: { clinic: { select: { name: true, slug: true } } },
          orderBy: [{ organicRank: 'asc' }, { id: 'asc' }],
        });
        if (existing.length > 0) {
          return { resourceId: criteria.id, value: existing };
        }
        await transaction.matchingResult.createMany({
          data: input.matches.map((match) => ({
            id: match.id,
            caseId: input.caseId,
            clinicId: match.clinicId,
            criteriaVersionId: criteria.id,
            organicRank: match.organicRank,
            fitScore: match.fitScore,
            reasons: [...match.reasons],
            limitations: [...match.limitations],
            evidenceIds: [...match.evidenceIds],
            algorithmVersion: match.algorithmVersion,
          })),
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'matching.calculated',
          resourceType: 'CaseMatchingCriteria',
          resourceId: criteria.id,
          eventType: 'matching.calculated',
          payload: {
            caseId: input.caseId,
            criteriaVersionId: criteria.id,
            resultCount: input.matches.length,
          },
        });
        return {
          resourceId: criteria.id,
          value: await listMatchesTx(transaction, input.caseId, criteria.id),
        };
      },
      () => this.listMatches(input.caseId, input.criteriaVersionId),
    );
  }

  async listMatches(caseId: string, criteriaVersionId?: string) {
    return this.db.matchingResult.findMany({
      where: {
        caseId,
        ...(criteriaVersionId ? { criteriaVersionId } : { criteriaVersionId: { not: null } }),
      },
      include: { clinic: { select: { name: true, slug: true } } },
      orderBy: [{ calculatedAt: 'desc' }, { organicRank: 'asc' }, { id: 'asc' }],
      take: 100,
    });
  }

  async listShortlist(caseId: string, patientVisibleOnly: boolean) {
    return this.db.caseShortlistEntry.findMany({
      where: {
        caseId,
        ...(patientVisibleOnly ? { status: { notIn: ['PROPOSED', 'REMOVED'] } } : {}),
      },
      include: {
        clinic: { select: { name: true, slug: true } },
        matchingResult: true,
        introductionRequest: { select: { id: true, status: true, createdAt: true } },
      },
      orderBy: [{ displayedRank: 'asc' }, { id: 'asc' }],
      take: 25,
    });
  }

  async updateShortlist(input: {
    readonly caseId: string;
    readonly expectedWorkspaceVersion: number;
    readonly shareWithPatient: boolean;
    readonly recommendations: readonly {
      readonly matchingResultId: string;
      readonly displayedRank: number;
      readonly encryptedOverrideReason?: string;
    }[];
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.listShortlist(input.caseId, false);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const workspace = await assertAssignedWorkspace(transaction, input.caseId, input.actor);
        const changed = await transaction.conciergeCaseWorkspace.updateMany({
          where: { id: workspace.id, version: input.expectedWorkspaceVersion },
          data: { version: { increment: 1 }, lastActivityAt: new Date() },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        const results = await transaction.matchingResult.findMany({
          where: {
            caseId: input.caseId,
            id: { in: input.recommendations.map(({ matchingResultId }) => matchingResultId) },
          },
        });
        if (results.length !== input.recommendations.length)
          throw new MatchingResourceNotFoundError();
        const resultById = new Map(results.map((result) => [result.id, result]));
        const existingEntries = await transaction.caseShortlistEntry.findMany({
          where: { caseId: input.caseId },
          select: { clinicId: true, status: true, sharedAt: true },
        });
        const existingByClinic = new Map(
          existingEntries.map((entry) => [entry.clinicId, entry] as const),
        );
        const keepClinics: string[] = [];
        for (const recommendation of input.recommendations) {
          const result = resultById.get(recommendation.matchingResultId);
          if (!result?.organicRank)
            throw new MatchingConflictError('Organic ranking metadata is missing.');
          keepClinics.push(result.clinicId);
          const overridden = result.organicRank !== recommendation.displayedRank;
          let encryptedOverrideReason: string | null = null;
          if (overridden) {
            const reason = recommendation.encryptedOverrideReason;
            if (!reason) {
              throw new MatchingConflictError(
                'A documented override reason is required when displayed rank differs.',
              );
            }
            encryptedOverrideReason = reason;
          }
          const existing = existingByClinic.get(result.clinicId);
          if (existing && ['INTRO_REQUESTED', 'INTRODUCED'].includes(existing.status)) {
            throw new MatchingConflictError(
              'A clinic with an active or completed introduction cannot be reordered.',
            );
          }
          const status =
            existing?.status === 'INTERESTED'
              ? ('INTERESTED' as const)
              : input.shareWithPatient
                ? ('SHARED' as const)
                : ('PROPOSED' as const);
          await transaction.caseShortlistEntry.upsert({
            where: { caseId_clinicId: { caseId: input.caseId, clinicId: result.clinicId } },
            update: {
              matchingResultId: result.id,
              organicRank: result.organicRank,
              displayedRank: recommendation.displayedRank,
              status,
              ...(input.shareWithPatient || existing?.sharedAt
                ? { sharedAt: existing?.sharedAt ?? new Date() }
                : {}),
              encryptedOverrideReason,
              overrideByUserId: overridden ? input.actor.userId : null,
              overriddenAt: overridden ? new Date() : null,
            },
            create: {
              caseId: input.caseId,
              clinicId: result.clinicId,
              matchingResultId: result.id,
              organicRank: result.organicRank,
              displayedRank: recommendation.displayedRank,
              status: input.shareWithPatient ? 'SHARED' : 'PROPOSED',
              ...(input.shareWithPatient ? { sharedAt: new Date() } : {}),
              ...(overridden
                ? {
                    encryptedOverrideReason,
                    overrideByUserId: input.actor.userId,
                    overriddenAt: new Date(),
                  }
                : {}),
            },
          });
        }
        await transaction.caseShortlistEntry.updateMany({
          where: {
            caseId: input.caseId,
            clinicId: { notIn: keepClinics },
            status: { in: ['PROPOSED', 'SHARED', 'DECLINED'] },
          },
          data: { status: 'REMOVED' },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'matching.shortlist-updated',
          resourceType: 'ConciergeCaseWorkspace',
          resourceId: workspace.id,
          eventType: 'matching.shortlist-updated',
          payload: {
            caseId: input.caseId,
            shortlistCount: keepClinics.length,
            shared: input.shareWithPatient,
          },
        });
        return {
          resourceId: workspace.id,
          value: await listShortlistTx(transaction, input.caseId, false),
        };
      },
      () => this.listShortlist(input.caseId, false),
    );
  }

  async setShortlistInterest(input: {
    readonly caseId: string;
    readonly shortlistEntryId: string;
    readonly interested: boolean;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findShortlistEntry(input.caseId, replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientCase(transaction, input.caseId, input.actor.userId);
        const changed = await transaction.caseShortlistEntry.updateMany({
          where: {
            id: input.shortlistEntryId,
            caseId: input.caseId,
            status: { in: ['SHARED', 'INTERESTED', 'DECLINED'] },
          },
          data: {
            status: input.interested ? 'INTERESTED' : 'DECLINED',
            patientInterestedAt: input.interested ? new Date() : null,
          },
        });
        if (changed.count !== 1) throw new MatchingResourceNotFoundError();
        const entry = await transaction.caseShortlistEntry.findUniqueOrThrow({
          where: { id: input.shortlistEntryId },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'matching.shortlist-interest-recorded',
          resourceType: 'CaseShortlistEntry',
          resourceId: entry.id,
          eventType: 'matching.shortlist-interest-recorded',
          payload: {
            caseId: input.caseId,
            shortlistEntryId: entry.id,
            interested: input.interested,
          },
        });
        return { resourceId: entry.id, value: entry };
      },
      (resourceId) => this.findShortlistEntry(input.caseId, resourceId),
    );
  }

  async createIntroduction(input: {
    readonly introductionId: string;
    readonly consentRecordId: string;
    readonly caseId: string;
    readonly shortlistEntryId: string;
    readonly consentTextVersionId: string;
    readonly encryptedPatientNote?: string;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findIntroduction(replayId, input.actor.userId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        await assertPatientCase(transaction, input.caseId, input.actor.userId);
        const entry = await transaction.caseShortlistEntry.findFirst({
          where: { id: input.shortlistEntryId, caseId: input.caseId, status: 'INTERESTED' },
          select: { id: true },
        });
        if (!entry) throw new MatchingResourceNotFoundError();
        const consentText = await transaction.consentTextVersion.findFirst({
          where: { id: input.consentTextVersionId, purpose: 'CLINIC_INTRODUCTION' },
          select: { id: true },
        });
        if (!consentText) throw new MatchingResourceNotFoundError();
        await transaction.consentRecord.create({
          data: {
            id: input.consentRecordId,
            userId: input.actor.userId,
            consentTextVersionId: consentText.id,
            requestId: input.actor.requestId,
            sessionId: input.actor.sessionId,
          },
        });
        const introduction = await transaction.introductionRequest.create({
          data: {
            id: input.introductionId,
            shortlistEntryId: entry.id,
            consentRecordId: input.consentRecordId,
            patientUserId: input.actor.userId,
            sessionId: input.actor.sessionId,
            ...(input.encryptedPatientNote
              ? { encryptedPatientNote: input.encryptedPatientNote }
              : {}),
          },
        });
        await transaction.caseShortlistEntry.update({
          where: { id: entry.id },
          data: { status: 'INTRO_REQUESTED' },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'matching.introduction-requested',
          resourceType: 'IntroductionRequest',
          resourceId: introduction.id,
          eventType: 'matching.introduction-requested',
          payload: {
            caseId: input.caseId,
            introductionRequestId: introduction.id,
            shortlistEntryId: entry.id,
          },
        });
        return { resourceId: introduction.id, value: introduction };
      },
      (resourceId) => this.findIntroduction(resourceId, input.actor.userId),
    );
  }

  async queue(input: ConciergeQueueInput) {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 4 * 60 * 60_000);
    return this.db.conciergeCaseWorkspace.findMany({
      where: {
        conciergeOrganizationId: input.organizationId,
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.assignment === 'MINE'
          ? {
              OR: [
                { assignedAgentUserId: input.actorUserId },
                { supervisorUserId: input.actorUserId },
              ],
            }
          : input.assignment === 'UNASSIGNED'
            ? { assignedAgentUserId: null }
            : {}),
        ...(input.sla
          ? {
              AND: [
                input.sla === 'OVERDUE'
                  ? { slaDueAt: { lt: now }, status: { not: 'RESOLVED' as const } }
                  : input.sla === 'DUE_SOON'
                    ? {
                        slaDueAt: { gte: now, lte: dueSoon },
                        status: { not: 'RESOLVED' as const },
                      }
                    : { OR: [{ slaDueAt: { gt: dueSoon } }, { status: 'RESOLVED' as const }] },
              ],
            }
          : {}),
      },
      orderBy: [{ slaDueAt: 'asc' }, { priority: 'desc' }, { id: 'asc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        caseId: true,
        priority: true,
        status: true,
        slaDueAt: true,
        version: true,
        assignedAgentUserId: true,
        supervisorUserId: true,
        missingDocumentCategories: true,
        lastActivityAt: true,
        dentalCase: { select: { caseNumber: true, title: true, status: true, updatedAt: true } },
      },
    });
  }

  async dashboard(organizationId: string) {
    const now = new Date();
    const records = await this.db.conciergeCaseWorkspace.findMany({
      where: { conciergeOrganizationId: organizationId },
      select: { status: true, priority: true, slaDueAt: true, assignedAgentUserId: true },
      take: 1_000,
    });
    const workload = new Map<string, number>();
    for (const record of records) {
      if (record.assignedAgentUserId && record.status !== 'RESOLVED') {
        workload.set(
          record.assignedAgentUserId,
          (workload.get(record.assignedAgentUserId) ?? 0) + 1,
        );
      }
    }
    return {
      total: records.length,
      overdue: records.filter(({ slaDueAt, status }) => status !== 'RESOLVED' && slaDueAt < now)
        .length,
      unassigned: records.filter(({ assignedAgentUserId }) => assignedAgentUserId === null).length,
      urgent: records.filter(
        ({ priority, status }) => priority === 'URGENT' && status !== 'RESOLVED',
      ).length,
      workload: [...workload.entries()]
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId)),
    };
  }

  async detail(caseId: string, actor: MatchingActor, allowOrganizationWide: boolean) {
    if (!actor.organizationId) throw new MatchingResourceNotFoundError();
    const workspace = await this.db.conciergeCaseWorkspace.findFirst({
      where: {
        caseId,
        conciergeOrganizationId: actor.organizationId,
        ...(allowOrganizationWide
          ? {}
          : { OR: [{ assignedAgentUserId: actor.userId }, { supervisorUserId: actor.userId }] }),
      },
      include: conciergeDetailInclude,
    });
    if (!workspace) throw new MatchingResourceNotFoundError();
    return workspace;
  }

  async recordConciergeRead(
    caseId: string,
    actor: MatchingActor,
    allowOrganizationWide: boolean,
  ): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const organizationId = await assertConciergeOrganizationCase(transaction, caseId, actor);
      const workspace = await transaction.conciergeCaseWorkspace.findFirst({
        where: {
          caseId,
          conciergeOrganizationId: organizationId,
          ...(allowOrganizationWide
            ? {}
            : { OR: [{ assignedAgentUserId: actor.userId }, { supervisorUserId: actor.userId }] }),
        },
        select: { id: true },
      });
      if (!workspace) throw new MatchingResourceNotFoundError();
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId,
          action: 'concierge.case-read',
          resourceType: 'ConciergeCaseWorkspace',
          resourceId: workspace.id,
          requestId: actor.requestId,
          success: true,
          afterMetadata: { caseId },
        },
      });
    });
  }

  async recordConciergeQueueRead(actor: MatchingActor, view: 'queue' | 'dashboard'): Promise<void> {
    if (!actor.organizationId) throw new MatchingResourceNotFoundError();
    await this.db.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        action: `concierge.${view}-read`,
        resourceType: 'Organization',
        resourceId: actor.organizationId,
        requestId: actor.requestId,
        success: true,
      },
    });
  }

  async assignWorkspace(input: {
    readonly workspaceId: string;
    readonly caseId: string;
    readonly assignedAgentUserId: string;
    readonly supervisorUserId?: string;
    readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    readonly slaDueAt: Date;
    readonly expectedVersion: number;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findWorkspace(replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const organizationId = await assertConciergeOrganizationCase(
          transaction,
          input.caseId,
          input.actor,
        );
        await assertActiveConciergeMember(transaction, organizationId, input.assignedAgentUserId);
        if (input.supervisorUserId) {
          await assertActiveConciergeMember(transaction, organizationId, input.supervisorUserId);
        }
        let workspace;
        if (input.expectedVersion === 0) {
          workspace = await transaction.conciergeCaseWorkspace.create({
            data: {
              id: input.workspaceId,
              caseId: input.caseId,
              conciergeOrganizationId: organizationId,
              assignedAgentUserId: input.assignedAgentUserId,
              ...(input.supervisorUserId ? { supervisorUserId: input.supervisorUserId } : {}),
              priority: input.priority,
              status: 'ASSIGNED',
              slaDueAt: input.slaDueAt,
            },
          });
        } else {
          const changed = await transaction.conciergeCaseWorkspace.updateMany({
            where: {
              caseId: input.caseId,
              conciergeOrganizationId: organizationId,
              version: input.expectedVersion,
            },
            data: {
              assignedAgentUserId: input.assignedAgentUserId,
              ...(input.supervisorUserId ? { supervisorUserId: input.supervisorUserId } : {}),
              priority: input.priority,
              status: 'ASSIGNED',
              slaDueAt: input.slaDueAt,
              version: { increment: 1 },
              lastActivityAt: new Date(),
            },
          });
          if (changed.count !== 1) throw new OptimisticConcurrencyError();
          workspace = await transaction.conciergeCaseWorkspace.findUniqueOrThrow({
            where: { caseId: input.caseId },
          });
        }
        await transaction.caseAssignment.updateMany({
          where: {
            caseId: input.caseId,
            kind: 'CONCIERGE',
            assignedUserId: { not: null },
            endedAt: null,
          },
          data: { endedAt: new Date() },
        });
        await transaction.caseAssignment.create({
          data: {
            caseId: input.caseId,
            kind: 'CONCIERGE',
            organizationId,
            assignedUserId: input.assignedAgentUserId,
          },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'concierge.case-assigned',
          resourceType: 'ConciergeCaseWorkspace',
          resourceId: workspace.id,
          eventType: 'concierge.case-assigned',
          payload: {
            caseId: input.caseId,
            workspaceId: workspace.id,
            assignedAgentUserId: input.assignedAgentUserId,
            priority: input.priority,
          },
        });
        return { resourceId: workspace.id, value: workspace };
      },
      (resourceId) => this.findWorkspace(resourceId),
    );
  }

  async updateWorkspace(input: {
    readonly caseId: string;
    readonly expectedVersion: number;
    readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    readonly priorityChangeReason?: string;
    readonly status: NonNullable<ConciergeQueueInput['status']>;
    readonly encryptedPatientSummary: string;
    readonly missingDocumentCategories: readonly string[];
    readonly slaDueAt: Date;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findWorkspace(replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const workspace = await assertAssignedWorkspace(transaction, input.caseId, input.actor);
        const changed = await transaction.conciergeCaseWorkspace.updateMany({
          where: { id: workspace.id, version: input.expectedVersion },
          data: {
            priority: input.priority,
            status: input.status,
            encryptedPatientSummary: input.encryptedPatientSummary,
            missingDocumentCategories: [...input.missingDocumentCategories],
            slaDueAt: input.slaDueAt,
            version: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        const updated = await transaction.conciergeCaseWorkspace.findUniqueOrThrow({
          where: { id: workspace.id },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'concierge.workspace-updated',
          resourceType: 'ConciergeCaseWorkspace',
          resourceId: workspace.id,
          eventType: 'concierge.workspace-updated',
          payload: {
            caseId: input.caseId,
            workspaceId: workspace.id,
            priority: input.priority,
            status: input.status,
            ...(input.priorityChangeReason
              ? { priorityChangeReason: input.priorityChangeReason }
              : {}),
          },
        });
        return { resourceId: workspace.id, value: updated };
      },
      (resourceId) => this.findWorkspace(resourceId),
    );
  }

  async createInternalNote(
    input: AppendConciergeRecordInput & { readonly noteId: string; readonly encryptedBody: string },
  ) {
    return this.createAppendOnlyRecord(input, 'note');
  }

  async createTravelNote(
    input: AppendConciergeRecordInput & { readonly noteId: string; readonly encryptedBody: string },
  ) {
    return this.createAppendOnlyRecord(input, 'travel');
  }

  async createCommunication(
    input: AppendConciergeRecordInput & {
      readonly eventId: string;
      readonly channel: 'PHONE' | 'EMAIL' | 'MESSAGE' | 'VIDEO' | 'IN_PERSON' | 'SYSTEM';
      readonly direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
      readonly encryptedSummary: string;
      readonly occurredAt: Date;
    },
  ) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId)
      return this.db.conciergeCommunicationEvent.findUniqueOrThrow({ where: { id: replayId } });
    return this.runCommand(
      input.command,
      async (transaction) => {
        const workspace = await assertAssignedWorkspace(transaction, input.caseId, input.actor);
        const event = await transaction.conciergeCommunicationEvent.create({
          data: {
            id: input.eventId,
            workspaceId: workspace.id,
            actorUserId: input.actor.userId,
            channel: input.channel,
            direction: input.direction,
            encryptedSummary: input.encryptedSummary,
            occurredAt: input.occurredAt,
          },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'concierge.communication-recorded',
          resourceType: 'ConciergeCommunicationEvent',
          resourceId: event.id,
          eventType: 'concierge.communication-recorded',
          payload: {
            caseId: input.caseId,
            eventId: event.id,
            channel: event.channel,
            direction: event.direction,
          },
        });
        return { resourceId: event.id, value: event };
      },
      (resourceId) =>
        this.db.conciergeCommunicationEvent.findUniqueOrThrow({ where: { id: resourceId } }),
    );
  }

  async createTask(
    input: AppendConciergeRecordInput & {
      readonly taskId: string;
      readonly kind:
        | 'MISSING_DOCUMENT'
        | 'MATCHING'
        | 'APPOINTMENT'
        | 'TRAVEL'
        | 'AFTERCARE'
        | 'INCIDENT'
        | 'FOLLOW_UP'
        | 'OTHER';
      readonly encryptedTitle: string;
      readonly encryptedDetails?: string;
      readonly assignedUserId?: string;
      readonly dueAt: Date;
    },
  ) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.db.conciergeTask.findUniqueOrThrow({ where: { id: replayId } });
    return this.runCommand(
      input.command,
      async (transaction) => {
        const workspace = await assertAssignedWorkspace(transaction, input.caseId, input.actor);
        if (input.assignedUserId)
          await assertActiveConciergeMember(
            transaction,
            workspace.conciergeOrganizationId,
            input.assignedUserId,
          );
        const task = await transaction.conciergeTask.create({
          data: {
            id: input.taskId,
            workspaceId: workspace.id,
            kind: input.kind,
            encryptedTitle: input.encryptedTitle,
            ...(input.encryptedDetails ? { encryptedDetails: input.encryptedDetails } : {}),
            ...(input.assignedUserId ? { assignedUserId: input.assignedUserId } : {}),
            createdByUserId: input.actor.userId,
            dueAt: input.dueAt,
          },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'concierge.task-created',
          resourceType: 'ConciergeTask',
          resourceId: task.id,
          eventType: 'concierge.task-created',
          payload: {
            caseId: input.caseId,
            taskId: task.id,
            kind: task.kind,
            dueAt: task.dueAt.toISOString(),
          },
        });
        return { resourceId: task.id, value: task };
      },
      (resourceId) => this.db.conciergeTask.findUniqueOrThrow({ where: { id: resourceId } }),
    );
  }

  async transitionTask(input: {
    readonly caseId: string;
    readonly taskId: string;
    readonly status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
    readonly expectedVersion: number;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.db.conciergeTask.findUniqueOrThrow({ where: { id: replayId } });
    return this.runCommand(
      input.command,
      async (transaction) => {
        const workspace = await assertAssignedWorkspace(transaction, input.caseId, input.actor);
        const changed = await transaction.conciergeTask.updateMany({
          where: { id: input.taskId, workspaceId: workspace.id, version: input.expectedVersion },
          data: {
            status: input.status,
            completedAt: input.status === 'DONE' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        const task = await transaction.conciergeTask.findUniqueOrThrow({
          where: { id: input.taskId },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'concierge.task-transitioned',
          resourceType: 'ConciergeTask',
          resourceId: task.id,
          eventType: 'concierge.task-transitioned',
          payload: { caseId: input.caseId, taskId: task.id, status: task.status },
        });
        return { resourceId: task.id, value: task };
      },
      (resourceId) => this.db.conciergeTask.findUniqueOrThrow({ where: { id: resourceId } }),
    );
  }

  async createHandoff(input: {
    readonly handoffId: string;
    readonly caseId: string;
    readonly toAgentUserId: string;
    readonly encryptedReason: string;
    readonly expectedVersion: number;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.db.conciergeHandoff.findUniqueOrThrow({ where: { id: replayId } });
    return this.runCommand(
      input.command,
      async (transaction) => {
        const workspace = await assertAssignedWorkspace(transaction, input.caseId, input.actor);
        if (workspace.assignedAgentUserId !== input.actor.userId)
          throw new MatchingResourceNotFoundError();
        if (workspace.version !== input.expectedVersion) throw new OptimisticConcurrencyError();
        await assertActiveConciergeMember(
          transaction,
          workspace.conciergeOrganizationId,
          input.toAgentUserId,
        );
        const handoff = await transaction.conciergeHandoff.create({
          data: {
            id: input.handoffId,
            workspaceId: workspace.id,
            fromUserId: input.actor.userId,
            toUserId: input.toAgentUserId,
            encryptedReason: input.encryptedReason,
            requestId: input.actor.requestId,
          },
        });
        const changed = await transaction.conciergeCaseWorkspace.updateMany({
          where: { id: workspace.id, version: input.expectedVersion },
          data: {
            status: 'HANDED_OFF',
            version: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'concierge.handoff-requested',
          resourceType: 'ConciergeHandoff',
          resourceId: handoff.id,
          eventType: 'concierge.handoff-requested',
          payload: {
            caseId: input.caseId,
            handoffId: handoff.id,
            toAgentUserId: input.toAgentUserId,
          },
        });
        return { resourceId: handoff.id, value: handoff };
      },
      (resourceId) => this.db.conciergeHandoff.findUniqueOrThrow({ where: { id: resourceId } }),
    );
  }

  async acceptHandoff(input: {
    readonly caseId: string;
    readonly handoffId: string;
    readonly expectedVersion: number;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) return this.findWorkspace(replayId);
    return this.runCommand(
      input.command,
      async (transaction) => {
        const organizationId = input.actor.organizationId;
        if (!organizationId) throw new MatchingResourceNotFoundError();
        const handoff = await transaction.conciergeHandoff.findFirst({
          where: {
            id: input.handoffId,
            status: 'PENDING',
            toUserId: input.actor.userId,
            workspace: {
              caseId: input.caseId,
              conciergeOrganizationId: organizationId,
            },
          },
          include: { workspace: true },
        });
        if (!handoff) throw new MatchingResourceNotFoundError();
        const changed = await transaction.conciergeCaseWorkspace.updateMany({
          where: { id: handoff.workspaceId, version: input.expectedVersion },
          data: {
            assignedAgentUserId: input.actor.userId,
            status: 'HANDED_OFF',
            version: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });
        if (changed.count !== 1) throw new OptimisticConcurrencyError();
        await transaction.conciergeHandoff.update({
          where: { id: handoff.id },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        });
        await transaction.caseAssignment.updateMany({
          where: {
            caseId: input.caseId,
            kind: 'CONCIERGE',
            assignedUserId: { not: null },
            endedAt: null,
          },
          data: { endedAt: new Date() },
        });
        await transaction.caseAssignment.create({
          data: {
            caseId: input.caseId,
            kind: 'CONCIERGE',
            organizationId: handoff.workspace.conciergeOrganizationId,
            assignedUserId: input.actor.userId,
          },
        });
        const workspace = await transaction.conciergeCaseWorkspace.findUniqueOrThrow({
          where: { id: handoff.workspaceId },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'concierge.handoff-accepted',
          resourceType: 'ConciergeHandoff',
          resourceId: handoff.id,
          eventType: 'concierge.handoff-accepted',
          payload: {
            caseId: input.caseId,
            handoffId: handoff.id,
            assignedAgentUserId: input.actor.userId,
          },
        });
        return { resourceId: workspace.id, value: workspace };
      },
      (resourceId) => this.findWorkspace(resourceId),
    );
  }

  async createSupervisorReview(input: {
    readonly reviewId: string;
    readonly caseId: string;
    readonly decision: 'APPROVED' | 'CHANGES_REQUESTED';
    readonly encryptedNote: string;
    readonly expectedVersion: number;
    readonly actor: MatchingActor;
    readonly command: MatchingCommand;
  }) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId)
      return this.db.conciergeSupervisorReview.findUniqueOrThrow({ where: { id: replayId } });
    return this.runCommand(
      input.command,
      async (transaction) => {
        const workspace = await assertAssignedWorkspace(transaction, input.caseId, input.actor);
        if (
          workspace.supervisorUserId !== input.actor.userId ||
          workspace.version !== input.expectedVersion
        ) {
          throw new OptimisticConcurrencyError();
        }
        const review = await transaction.conciergeSupervisorReview.create({
          data: {
            id: input.reviewId,
            workspaceId: workspace.id,
            reviewerUserId: input.actor.userId,
            decision: input.decision,
            encryptedNote: input.encryptedNote,
            workspaceVersion: workspace.version,
          },
        });
        await transaction.conciergeCaseWorkspace.update({
          where: { id: workspace.id },
          data: {
            status: input.decision === 'APPROVED' ? 'IN_PROGRESS' : 'SUPERVISOR_REVIEW',
            version: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action: 'concierge.supervisor-reviewed',
          resourceType: 'ConciergeSupervisorReview',
          resourceId: review.id,
          eventType: 'concierge.supervisor-reviewed',
          payload: { caseId: input.caseId, reviewId: review.id, decision: review.decision },
        });
        return { resourceId: review.id, value: review };
      },
      (resourceId) =>
        this.db.conciergeSupervisorReview.findUniqueOrThrow({ where: { id: resourceId } }),
    );
  }

  private async createAppendOnlyRecord(
    input: AppendConciergeRecordInput & { readonly noteId: string; readonly encryptedBody: string },
    kind: 'note' | 'travel',
  ) {
    const replayId = await this.completedResourceId(input.command);
    if (replayId) {
      return kind === 'note'
        ? this.db.conciergeInternalNote.findUniqueOrThrow({ where: { id: replayId } })
        : this.db.conciergeTravelNote.findUniqueOrThrow({ where: { id: replayId } });
    }
    return this.runCommand(
      input.command,
      async (transaction) => {
        const workspace = await assertAssignedWorkspace(transaction, input.caseId, input.actor);
        const value =
          kind === 'note'
            ? await transaction.conciergeInternalNote.create({
                data: {
                  id: input.noteId,
                  workspaceId: workspace.id,
                  authorUserId: input.actor.userId,
                  encryptedBody: input.encryptedBody,
                },
              })
            : await transaction.conciergeTravelNote.create({
                data: {
                  id: input.noteId,
                  workspaceId: workspace.id,
                  authorUserId: input.actor.userId,
                  encryptedBody: input.encryptedBody,
                },
              });
        await writeEvidence(transaction, input.actor, {
          caseId: input.caseId,
          action:
            kind === 'note' ? 'concierge.internal-note-created' : 'concierge.travel-note-created',
          resourceType: kind === 'note' ? 'ConciergeInternalNote' : 'ConciergeTravelNote',
          resourceId: value.id,
          eventType:
            kind === 'note' ? 'concierge.internal-note-created' : 'concierge.travel-note-created',
          payload: { caseId: input.caseId, recordId: value.id },
        });
        return { resourceId: value.id, value };
      },
      async (resourceId) => {
        return kind === 'note'
          ? this.db.conciergeInternalNote.findUniqueOrThrow({ where: { id: resourceId } })
          : this.db.conciergeTravelNote.findUniqueOrThrow({ where: { id: resourceId } });
      },
    );
  }

  private async findSavedClinic(userId: string, id: string) {
    const saved = await this.db.savedClinic.findFirst({ where: { id, userId } });
    if (!saved) throw new MatchingResourceNotFoundError();
    return saved;
  }

  private async findShortlistEntry(caseId: string, id: string) {
    const entry = await this.db.caseShortlistEntry.findFirst({ where: { id, caseId } });
    if (!entry) throw new MatchingResourceNotFoundError();
    return entry;
  }

  private async findIntroduction(id: string, patientUserId: string) {
    const request = await this.db.introductionRequest.findFirst({ where: { id, patientUserId } });
    if (!request) throw new MatchingResourceNotFoundError();
    return request;
  }

  private async findWorkspace(id: string) {
    const workspace = await this.db.conciergeCaseWorkspace.findUnique({ where: { id } });
    if (!workspace) throw new MatchingResourceNotFoundError();
    return workspace;
  }

  private async completedResourceId(command: MatchingCommand): Promise<string | null> {
    const response = await this.completedResponse(command);
    return response ? jsonString(response, 'resourceId') : null;
  }

  private async completedResponse(command: MatchingCommand): Promise<Prisma.JsonObject | null> {
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
    command: MatchingCommand,
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
      const response = await this.completedResponse(command);
      if (!response) throw error;
      return replay(jsonString(response, 'resourceId'));
    }
  }
}

interface AppendConciergeRecordInput {
  readonly caseId: string;
  readonly actor: MatchingActor;
  readonly command: MatchingCommand;
}

const discoveryClinicSelect = {
  id: true,
  slug: true,
  name: true,
  verifiedAt: true,
  locations: {
    where: { active: true },
    orderBy: { createdAt: 'asc' as const },
    select: { city: true, district: true, address: true, latitude: true, longitude: true },
  },
  discoveryProfile: true,
  services: {
    where: { active: true },
    select: {
      displayNames: true,
      warrantyPolicyId: true,
      procedureDefinition: { select: { code: true } },
      prices: { orderBy: { effectiveAt: 'desc' as const }, take: 10 },
    },
  },
  verificationCases: {
    where: { status: 'VERIFIED' as const },
    orderBy: { decidedAt: 'desc' as const },
    take: 10,
    select: {
      expiresAt: true,
      decidedAt: true,
      evidence: {
        where: { revokedAt: null },
        orderBy: { category: 'asc' as const },
        select: { id: true, category: true },
      },
    },
  },
  reviews: {
    where: { verified: true, moderationStatus: 'PUBLISHED' as const },
    select: { overallRating: true },
  },
} satisfies Prisma.ClinicSelect;

type DiscoveryClinicRecord = Prisma.ClinicGetPayload<{ select: typeof discoveryClinicSelect }>;

function discoveryClinicView(
  clinic: DiscoveryClinicRecord,
  locale: 'vi-VN' | 'en-US',
  now: Date,
  bounds?: DiscoveryMapBounds,
) {
  const location = bounds
    ? clinic.locations.find(({ latitude, longitude }) =>
        locationFallsWithinBounds(latitude, longitude, bounds),
      )
    : clinic.locations[0];
  const activeVerification = clinic.verificationCases.find(
    ({ expiresAt }) => expiresAt !== null && expiresAt > now,
  );
  const currentPrices = clinic.services.flatMap(({ prices }) =>
    prices.filter(
      ({ effectiveAt, expiresAt }) => effectiveAt <= now && (!expiresAt || expiresAt > now),
    ),
  );
  const minimum = currentPrices.reduce<bigint | null>(
    (value, price) => (value === null || price.minimumMinor < value ? price.minimumMinor : value),
    null,
  );
  const maximum = currentPrices.reduce<bigint | null>(
    (value, price) => (value === null || price.maximumMinor > value ? price.maximumMinor : value),
    null,
  );
  const currencies = [...new Set(currentPrices.map(({ currency }) => currency))];
  const rating = clinic.reviews.length
    ? (
        clinic.reviews.reduce((sum, review) => sum + review.overallRating, 0) /
        clinic.reviews.length
      ).toFixed(1)
    : '';
  return {
    id: clinic.id,
    slug: clinic.slug,
    name: clinic.name,
    locationLabel: [location?.district, location?.city].filter(Boolean).join(', '),
    address: location?.address ?? '',
    coordinates:
      location?.latitude !== null &&
      location?.latitude !== undefined &&
      location.longitude !== null &&
      location.longitude !== undefined
        ? { latitude: location.latitude, longitude: location.longitude }
        : null,
    verificationStatus: 'VERIFIED',
    verificationDate:
      activeVerification?.decidedAt?.toISOString() ?? clinic.verifiedAt?.toISOString() ?? '',
    evidence: activeVerification?.evidence.map(({ id, category }) => ({ id, category })) ?? [],
    services: clinic.services.map(({ displayNames, procedureDefinition }) => ({
      code: procedureDefinition.code,
      name: localizedText(displayNames, locale),
    })),
    languages: clinic.discoveryProfile?.languages ?? [],
    equipment: clinic.discoveryProfile?.equipment ?? [],
    accessibility: clinic.discoveryProfile?.accessibilityFeatures ?? [],
    aftercareSupported: clinic.discoveryProfile?.aftercareSupported ?? false,
    warrantyAvailable: clinic.services.some(({ warrantyPolicyId }) => warrantyPolicyId !== null),
    followUpDataAvailable: clinic.discoveryProfile?.followUpDataAvailable ?? false,
    earliestConsultation: clinic.discoveryProfile?.earliestConsultationAt?.toISOString() ?? null,
    rating,
    reviewCount: clinic.reviews.length,
    estimatedPrice:
      minimum !== null && maximum !== null && currencies.length === 1
        ? {
            minimumMinor: minimum.toString(),
            maximumMinor: maximum.toString(),
            currency: currencies[0],
          }
        : null,
  };
}

function locationFallsWithinBounds(
  latitude: number | null,
  longitude: number | null,
  bounds: DiscoveryMapBounds,
): boolean {
  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= bounds.south &&
    latitude <= bounds.north &&
    longitude >= bounds.west &&
    longitude <= bounds.east
  );
}

const conciergeDetailInclude = {
  dentalCase: {
    include: {
      patientProfile: {
        select: { userId: true, currentCountry: true, currentCity: true, timezone: true },
      },
      documents: {
        select: { category: true, createdAt: true },
        orderBy: { createdAt: 'desc' as const },
        take: 100,
      },
      appointments: {
        select: {
          id: true,
          kind: true,
          status: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          clinic: { select: { name: true } },
        },
        orderBy: { startsAt: 'desc' as const },
        take: 100,
      },
      aftercarePlans: {
        select: {
          id: true,
          active: true,
          startsAt: true,
          completedAt: true,
          checkIns: {
            select: {
              id: true,
              submittedAt: true,
              escalations: {
                select: { id: true, severity: true, status: true, dueAt: true },
                orderBy: { createdAt: 'desc' as const },
                take: 25,
              },
            },
            orderBy: { submittedAt: 'desc' as const },
            take: 25,
          },
        },
        orderBy: { startsAt: 'desc' as const },
        take: 25,
      },
      incidents: {
        select: {
          id: true,
          type: true,
          severity: true,
          status: true,
          slaDueAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' as const },
        take: 50,
      },
      matchingCriteria: {
        orderBy: { version: 'desc' as const },
        take: 25,
      },
      matchingResults: {
        where: { criteriaVersionId: { not: null } },
        include: { clinic: { select: { name: true, slug: true } } },
        orderBy: [{ calculatedAt: 'desc' as const }, { organicRank: 'asc' as const }],
        take: 100,
      },
      shortlistEntries: {
        where: { status: { not: 'REMOVED' as const } },
        include: {
          clinic: { select: { name: true, slug: true } },
          matchingResult: true,
          introductionRequest: {
            select: { id: true, status: true, createdAt: true, handledAt: true },
          },
        },
        orderBy: { displayedRank: 'asc' as const },
        take: 25,
      },
    },
  },
  assignedAgent: { select: { id: true, email: true } },
  supervisor: { select: { id: true, email: true } },
  internalNotes: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  travelNotes: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  communications: { orderBy: { occurredAt: 'desc' as const }, take: 100 },
  tasks: { orderBy: [{ status: 'asc' as const }, { dueAt: 'asc' as const }], take: 100 },
  handoffs: { orderBy: { createdAt: 'desc' as const }, take: 50 },
  supervisorReviews: { orderBy: { createdAt: 'desc' as const }, take: 50 },
} satisfies Prisma.ConciergeCaseWorkspaceInclude;

async function listMatchesTx(
  transaction: Prisma.TransactionClient,
  caseId: string,
  criteriaVersionId: string,
) {
  return transaction.matchingResult.findMany({
    where: { caseId, criteriaVersionId },
    include: { clinic: { select: { name: true, slug: true } } },
    orderBy: [{ organicRank: 'asc' }, { id: 'asc' }],
  });
}

async function listShortlistTx(
  transaction: Prisma.TransactionClient,
  caseId: string,
  patientVisibleOnly: boolean,
) {
  return transaction.caseShortlistEntry.findMany({
    where: {
      caseId,
      ...(patientVisibleOnly ? { status: { notIn: ['PROPOSED', 'REMOVED'] } } : {}),
    },
    include: {
      clinic: { select: { name: true, slug: true } },
      matchingResult: true,
      introductionRequest: true,
    },
    orderBy: [{ displayedRank: 'asc' }, { id: 'asc' }],
    take: 25,
  });
}

async function assertPatientUser(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const patient = await transaction.patientProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!patient) throw new MatchingResourceNotFoundError();
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
  if (!dentalCase) throw new MatchingResourceNotFoundError();
}

async function assertMatchingAccess(
  transaction: Prisma.TransactionClient,
  caseId: string,
  actor: MatchingActor,
): Promise<void> {
  const owned = await transaction.dentalCase.findFirst({
    where: { id: caseId, patientProfile: { userId: actor.userId } },
    select: { id: true },
  });
  if (owned) return;
  await assertDirectConciergeAssignment(transaction, caseId, actor);
}

async function assertConciergeOrganizationCase(
  transaction: Prisma.TransactionClient,
  caseId: string,
  actor: MatchingActor,
): Promise<string> {
  if (!actor.organizationId) throw new MatchingResourceNotFoundError();
  const assignment = await transaction.caseAssignment.findFirst({
    where: {
      caseId,
      kind: 'CONCIERGE',
      organizationId: actor.organizationId,
      endedAt: null,
      organization: {
        type: 'CONCIERGE',
        deletedAt: null,
        memberships: {
          some: { userId: actor.userId, status: 'ACTIVE', role: { code: 'CONCIERGE_AGENT' } },
        },
      },
    },
    select: { organizationId: true },
  });
  if (!assignment?.organizationId) throw new MatchingResourceNotFoundError();
  return assignment.organizationId;
}

async function assertDirectConciergeAssignment(
  transaction: Prisma.TransactionClient,
  caseId: string,
  actor: MatchingActor,
): Promise<void> {
  const organizationId = await assertConciergeOrganizationCase(transaction, caseId, actor);
  const direct = await transaction.caseAssignment.findFirst({
    where: {
      caseId,
      kind: 'CONCIERGE',
      organizationId,
      assignedUserId: actor.userId,
      endedAt: null,
    },
    select: { id: true },
  });
  if (!direct) throw new MatchingResourceNotFoundError();
}

async function assertAssignedWorkspace(
  transaction: Prisma.TransactionClient,
  caseId: string,
  actor: MatchingActor,
) {
  const organizationId = await assertConciergeOrganizationCase(transaction, caseId, actor);
  const workspace = await transaction.conciergeCaseWorkspace.findFirst({
    where: {
      caseId,
      conciergeOrganizationId: organizationId,
      OR: [{ assignedAgentUserId: actor.userId }, { supervisorUserId: actor.userId }],
    },
  });
  if (!workspace) throw new MatchingResourceNotFoundError();
  return workspace;
}

async function assertActiveConciergeMember(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  const membership = await transaction.organizationMembership.findFirst({
    where: { organizationId, userId, status: 'ACTIVE', role: { code: 'CONCIERGE_AGENT' } },
    select: { id: true },
  });
  if (!membership) throw new MatchingResourceNotFoundError();
}

async function writeEvidence(
  transaction: Prisma.TransactionClient,
  actor: MatchingActor,
  input: {
    readonly caseId?: string;
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly eventType: string;
    readonly payload: Prisma.InputJsonObject;
  },
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorUserId: actor.userId,
      ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: actor.requestId,
      success: true,
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

function localizedText(value: Prisma.JsonValue, locale: 'vi-VN' | 'en-US'): string {
  if (!value || Array.isArray(value) || typeof value !== 'object') return '';
  const record = value as Prisma.JsonObject;
  const selected = record[locale] ?? record[locale.startsWith('vi') ? 'vi' : 'en'];
  return typeof selected === 'string' ? selected : '';
}

function jsonString(record: Prisma.JsonObject, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new IdempotencyConflictError('Stored response is invalid.');
  return value;
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
