import {
  Prisma,
  type ConfigurationValueType,
  type Currency,
  type GovernancePublicationStatus,
  type NotificationChannel,
  type PrismaClient,
} from '@prisma/client';

import { IdempotencyConflictError, OptimisticConcurrencyError } from './case.repository.js';

export interface AdminGovernanceActor {
  readonly userId: string;
  readonly requestId: string;
}

export interface AdminGovernanceCommand {
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface GovernancePageInput {
  readonly cursor?: string;
  readonly limit: number;
}

export interface GovernanceMutationResult extends Prisma.InputJsonObject {
  readonly resourceId: string;
  readonly version: number;
}

interface MutationEvidence {
  readonly actor: AdminGovernanceActor;
  readonly command: AdminGovernanceCommand;
  readonly reason: string;
}

interface LocalizedNames extends Prisma.InputJsonObject {
  readonly 'vi-VN': string;
  readonly 'en-US': string;
}

export class AdminGovernanceRepository {
  constructor(private readonly db: PrismaClient) {}

  async content(input: GovernancePageInput) {
    const rows = await this.db.contentPage.findMany({
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        slug: true,
        locale: true,
        version: true,
        title: true,
        summary: true,
        publicationStatus: true,
        publishedAt: true,
        archivedAt: true,
        createdAt: true,
      },
    });
    return page(rows, input.limit, (row) => ({
      ...row,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async taxonomy(input: GovernancePageInput) {
    const [categories, procedures] = await Promise.all([
      this.db.serviceCategory.findMany({
        take: input.limit,
        orderBy: { code: 'asc' },
        select: {
          id: true,
          parentId: true,
          code: true,
          names: true,
          active: true,
          version: true,
          updatedAt: true,
        },
      }),
      this.db.procedureDefinition.findMany({
        take: input.limit,
        orderBy: { code: 'asc' },
        select: {
          id: true,
          serviceCategoryId: true,
          code: true,
          names: true,
          descriptions: true,
          active: true,
          version: true,
          updatedAt: true,
        },
      }),
    ]);
    return {
      records: [
        ...categories.map((record) => ({
          ...record,
          kind: 'service_category' as const,
          updatedAt: record.updatedAt.toISOString(),
        })),
        ...procedures.map((record) => ({
          ...record,
          kind: 'procedure' as const,
          updatedAt: record.updatedAt.toISOString(),
        })),
      ],
      nextCursor: null,
    };
  }

  async templates(input: GovernancePageInput) {
    const rows = await this.db.notificationTemplate.findMany({
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        key: true,
        category: true,
        channel: true,
        locale: true,
        createdAt: true,
        versions: {
          take: 1,
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            subject: true,
            publicationStatus: true,
            createdAt: true,
          },
        },
      },
    });
    return page(rows, input.limit, (row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      latestVersion: row.versions[0]
        ? { ...row.versions[0], createdAt: row.versions[0].createdAt.toISOString() }
        : null,
      versions: undefined,
    }));
  }

  async featureFlags(input: GovernancePageInput) {
    const rows = await this.db.featureFlag.findMany({
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        key: true,
        description: true,
        createdAt: true,
        versions: {
          take: 1,
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            enabled: true,
            environment: true,
            audiences: true,
            createdAt: true,
          },
        },
      },
    });
    return page(rows, input.limit, (row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      latestVersion: row.versions[0]
        ? { ...row.versions[0], createdAt: row.versions[0].createdAt.toISOString() }
        : null,
      versions: undefined,
    }));
  }

  async configurations(input: GovernancePageInput) {
    const rows = await this.db.systemConfiguration.findMany({
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: { secret: false },
      select: {
        id: true,
        key: true,
        description: true,
        valueType: true,
        createdAt: true,
        versions: {
          take: 1,
          orderBy: { version: 'desc' },
          select: { id: true, version: true, value: true, createdAt: true },
        },
      },
    });
    return page(rows, input.limit, (row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      latestVersion: row.versions[0]
        ? { ...row.versions[0], createdAt: row.versions[0].createdAt.toISOString() }
        : null,
      versions: undefined,
    }));
  }

  async locations(input: GovernancePageInput) {
    const [countries, cities, locales] = await Promise.all([
      this.db.countryConfiguration.findMany({
        take: input.limit,
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          names: true,
          currency: true,
          callingCode: true,
          active: true,
          version: true,
          updatedAt: true,
        },
      }),
      this.db.cityConfiguration.findMany({
        take: input.limit,
        orderBy: [{ country: { code: 'asc' } }, { code: 'asc' }],
        select: {
          id: true,
          countryId: true,
          code: true,
          names: true,
          timezone: true,
          active: true,
          version: true,
          updatedAt: true,
        },
      }),
      this.db.localeConfiguration.findMany({
        take: input.limit,
        orderBy: { locale: 'asc' },
        select: {
          id: true,
          locale: true,
          names: true,
          active: true,
          isDefault: true,
          version: true,
          updatedAt: true,
        },
      }),
    ]);
    return {
      records: [
        ...countries.map((record) => ({
          ...record,
          kind: 'country' as const,
          updatedAt: record.updatedAt.toISOString(),
        })),
        ...cities.map((record) => ({
          ...record,
          kind: 'city' as const,
          updatedAt: record.updatedAt.toISOString(),
        })),
        ...locales.map((record) => ({
          ...record,
          kind: 'locale' as const,
          updatedAt: record.updatedAt.toISOString(),
        })),
      ],
      nextCursor: null,
    };
  }

  appendContent(
    input: MutationEvidence & {
      readonly slug: string;
      readonly locale: string;
      readonly expectedVersion: number;
      readonly title: string;
      readonly summary?: string | undefined;
      readonly body: string;
      readonly publicationStatus: GovernancePublicationStatus;
    },
  ) {
    return this.runCommand(input, async (transaction) => {
      const latest = await transaction.contentPage.findFirst({
        where: { slug: input.slug, locale: input.locale },
        orderBy: { version: 'desc' },
        select: { version: true, publicationStatus: true },
      });
      requireVersion(latest?.version ?? 0, input.expectedVersion);
      const now = new Date();
      const created = await transaction.contentPage.create({
        data: {
          slug: input.slug,
          locale: input.locale,
          version: input.expectedVersion + 1,
          title: input.title,
          ...(input.summary ? { summary: input.summary } : {}),
          body: input.body,
          publicationStatus: input.publicationStatus,
          createdByUserId: input.actor.userId,
          ...(input.publicationStatus === 'PUBLISHED' ? { publishedAt: now } : {}),
          ...(input.publicationStatus === 'ARCHIVED' ? { archivedAt: now } : {}),
        },
      });
      await governanceEvidence(transaction, input, {
        action: 'admin.content-version-created',
        resourceType: 'ContentPage',
        resourceId: created.id,
        before: latest ?? {},
        after: {
          slug: input.slug,
          locale: input.locale,
          version: created.version,
          publicationStatus: created.publicationStatus,
        },
      });
      return { resourceId: created.id, version: created.version };
    });
  }

  appendTemplate(
    input: MutationEvidence & {
      readonly key: string;
      readonly category: string;
      readonly channel: NotificationChannel;
      readonly locale: string;
      readonly expectedVersion: number;
      readonly subject: string;
      readonly body: string;
      readonly publicationStatus: GovernancePublicationStatus;
    },
  ) {
    return this.runCommand(input, async (transaction) => {
      const template = await transaction.notificationTemplate.upsert({
        where: {
          key_channel_locale: { key: input.key, channel: input.channel, locale: input.locale },
        },
        create: {
          key: input.key,
          category: input.category,
          channel: input.channel,
          locale: input.locale,
        },
        update: {},
        select: {
          id: true,
          category: true,
          versions: { take: 1, orderBy: { version: 'desc' }, select: { version: true } },
        },
      });
      if (template.category !== input.category) throw new OptimisticConcurrencyError();
      requireVersion(template.versions[0]?.version ?? 0, input.expectedVersion);
      const created = await transaction.notificationTemplateVersion.create({
        data: {
          templateId: template.id,
          version: input.expectedVersion + 1,
          subject: input.subject,
          body: input.body,
          publicationStatus: input.publicationStatus,
          reason: input.reason,
          createdByUserId: input.actor.userId,
        },
      });
      await governanceEvidence(transaction, input, {
        action: 'admin.notification-template-version-created',
        resourceType: 'NotificationTemplate',
        resourceId: template.id,
        before: { version: input.expectedVersion },
        after: { version: created.version, publicationStatus: created.publicationStatus },
      });
      return { resourceId: template.id, version: created.version };
    });
  }

  appendFeatureFlag(
    input: MutationEvidence & {
      readonly key: string;
      readonly description: string;
      readonly expectedVersion: number;
      readonly enabled: boolean;
      readonly environment: string;
      readonly audiences: readonly string[];
    },
  ) {
    return this.runCommand(input, async (transaction) => {
      const flag = await transaction.featureFlag.upsert({
        where: { key: input.key },
        create: { key: input.key, description: input.description },
        update: {},
        select: {
          id: true,
          description: true,
          versions: { take: 1, orderBy: { version: 'desc' }, select: { version: true } },
        },
      });
      if (flag.description !== input.description) throw new OptimisticConcurrencyError();
      requireVersion(flag.versions[0]?.version ?? 0, input.expectedVersion);
      const created = await transaction.featureFlagVersion.create({
        data: {
          featureFlagId: flag.id,
          version: input.expectedVersion + 1,
          enabled: input.enabled,
          environment: input.environment,
          audiences: [...input.audiences],
          reason: input.reason,
          changedByUserId: input.actor.userId,
        },
      });
      await governanceEvidence(transaction, input, {
        action: 'admin.feature-flag-version-created',
        resourceType: 'FeatureFlag',
        resourceId: flag.id,
        before: { version: input.expectedVersion },
        after: {
          version: created.version,
          enabled: created.enabled,
          environment: created.environment,
          audiences: created.audiences,
        },
      });
      return { resourceId: flag.id, version: created.version };
    });
  }

  appendConfiguration(
    input: MutationEvidence & {
      readonly key: string;
      readonly description: string;
      readonly valueType: ConfigurationValueType;
      readonly expectedVersion: number;
      readonly value: string;
    },
  ) {
    return this.runCommand(input, async (transaction) => {
      const configuration = await transaction.systemConfiguration.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          description: input.description,
          valueType: input.valueType,
          secret: false,
        },
        update: {},
        select: {
          id: true,
          description: true,
          valueType: true,
          secret: true,
          versions: { take: 1, orderBy: { version: 'desc' }, select: { version: true } },
        },
      });
      if (
        configuration.secret ||
        configuration.description !== input.description ||
        configuration.valueType !== input.valueType
      ) {
        throw new OptimisticConcurrencyError();
      }
      requireVersion(configuration.versions[0]?.version ?? 0, input.expectedVersion);
      const created = await transaction.systemConfigurationVersion.create({
        data: {
          configurationId: configuration.id,
          version: input.expectedVersion + 1,
          value: input.value,
          reason: input.reason,
          changedByUserId: input.actor.userId,
        },
      });
      await governanceEvidence(transaction, input, {
        action: 'admin.system-configuration-version-created',
        resourceType: 'SystemConfiguration',
        resourceId: configuration.id,
        before: { version: input.expectedVersion },
        after: { version: created.version, valueType: input.valueType },
      });
      return { resourceId: configuration.id, version: created.version };
    });
  }

  changeTaxonomy(
    input: MutationEvidence &
      (
        | {
            readonly kind: 'service_category';
            readonly code: string;
            readonly names: LocalizedNames;
            readonly active: boolean;
            readonly parentId: string | null;
            readonly expectedVersion: number;
          }
        | {
            readonly kind: 'procedure';
            readonly code: string;
            readonly names: LocalizedNames;
            readonly descriptions: LocalizedNames;
            readonly active: boolean;
            readonly serviceCategoryId: string;
            readonly expectedVersion: number;
          }
      ),
  ) {
    return this.runCommand(input, async (transaction) => {
      if (input.kind === 'service_category') {
        const existing = await transaction.serviceCategory.findUnique({
          where: { code: input.code },
        });
        requireVersion(existing?.version ?? 0, input.expectedVersion);
        const record = existing
          ? await updateServiceCategory(transaction, existing.id, input)
          : await transaction.serviceCategory.create({
              data: {
                code: input.code,
                names: input.names,
                active: input.active,
                parentId: input.parentId,
              },
            });
        await governanceEvidence(transaction, input, {
          action: 'admin.service-taxonomy-changed',
          resourceType: 'ServiceCategory',
          resourceId: record.id,
          before: { version: input.expectedVersion },
          after: { code: record.code, version: record.version, active: record.active },
        });
        return { resourceId: record.id, version: record.version };
      }
      const existing = await transaction.procedureDefinition.findUnique({
        where: { code: input.code },
      });
      requireVersion(existing?.version ?? 0, input.expectedVersion);
      const record = existing
        ? await updateProcedure(transaction, existing.id, input)
        : await transaction.procedureDefinition.create({
            data: {
              code: input.code,
              serviceCategoryId: input.serviceCategoryId,
              names: input.names,
              descriptions: input.descriptions,
              active: input.active,
            },
          });
      await governanceEvidence(transaction, input, {
        action: 'admin.procedure-taxonomy-changed',
        resourceType: 'ProcedureDefinition',
        resourceId: record.id,
        before: { version: input.expectedVersion },
        after: { code: record.code, version: record.version, active: record.active },
      });
      return { resourceId: record.id, version: record.version };
    });
  }

  changeLocation(
    input: MutationEvidence &
      (
        | {
            readonly kind: 'country';
            readonly id?: string | undefined;
            readonly code: string;
            readonly names: LocalizedNames;
            readonly currency: Currency;
            readonly callingCode: string;
            readonly active: boolean;
            readonly expectedVersion: number;
          }
        | {
            readonly kind: 'city';
            readonly id?: string | undefined;
            readonly countryId: string;
            readonly code: string;
            readonly names: LocalizedNames;
            readonly timezone: string;
            readonly active: boolean;
            readonly expectedVersion: number;
          }
        | {
            readonly kind: 'locale';
            readonly id?: string | undefined;
            readonly locale: string;
            readonly names: LocalizedNames;
            readonly active: boolean;
            readonly isDefault: boolean;
            readonly expectedVersion: number;
          }
      ),
  ) {
    return this.runCommand(input, async (transaction) => {
      if (input.kind === 'country') {
        const existing = input.id
          ? await transaction.countryConfiguration.findUnique({ where: { id: input.id } })
          : null;
        requireVersion(existing?.version ?? 0, input.expectedVersion);
        const record = existing
          ? await updateCountry(transaction, existing.id, input)
          : await transaction.countryConfiguration.create({
              data: { ...countryData(input), updatedByUserId: input.actor.userId },
            });
        await governanceEvidence(
          transaction,
          input,
          locationEvidence(record.id, record.version, input),
        );
        return { resourceId: record.id, version: record.version };
      }
      if (input.kind === 'city') {
        const existing = input.id
          ? await transaction.cityConfiguration.findUnique({ where: { id: input.id } })
          : null;
        requireVersion(existing?.version ?? 0, input.expectedVersion);
        const record = existing
          ? await updateCity(transaction, existing.id, input)
          : await transaction.cityConfiguration.create({
              data: { ...cityData(input), updatedByUserId: input.actor.userId },
            });
        await governanceEvidence(
          transaction,
          input,
          locationEvidence(record.id, record.version, input),
        );
        return { resourceId: record.id, version: record.version };
      }
      const existing = input.id
        ? await transaction.localeConfiguration.findUnique({ where: { id: input.id } })
        : null;
      requireVersion(existing?.version ?? 0, input.expectedVersion);
      const record = existing
        ? await updateLocale(transaction, existing.id, input)
        : await transaction.localeConfiguration.create({
            data: {
              locale: input.locale,
              names: input.names,
              active: input.active,
              isDefault: input.isDefault,
              updatedByUserId: input.actor.userId,
            },
          });
      await governanceEvidence(
        transaction,
        input,
        locationEvidence(record.id, record.version, input),
      );
      return { resourceId: record.id, version: record.version };
    });
  }

  private async completed(command: AdminGovernanceCommand, userId: string) {
    const record = await this.db.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key: command.key } },
    });
    if (!record) return null;
    if (record.operation !== command.operation || record.requestHash !== command.requestHash)
      throw new IdempotencyConflictError('The idempotency key was used for different content.');
    if (
      record.status !== 'COMPLETED' ||
      !record.response ||
      Array.isArray(record.response) ||
      typeof record.response !== 'object'
    ) {
      throw new IdempotencyConflictError('The original administration command is in progress.');
    }
    const resourceId = Reflect.get(record.response, 'resourceId');
    const version = Reflect.get(record.response, 'version');
    if (typeof resourceId !== 'string' || typeof version !== 'number')
      throw new IdempotencyConflictError('The stored administration response is invalid.');
    return { resourceId, version };
  }

  private async runCommand(
    input: MutationEvidence,
    work: (transaction: Prisma.TransactionClient) => Promise<GovernanceMutationResult>,
  ): Promise<GovernanceMutationResult> {
    try {
      return await this.db.$transaction(
        async (transaction) => {
          await transaction.idempotencyRecord.create({
            data: {
              userId: input.actor.userId,
              key: input.command.key,
              operation: input.command.operation,
              requestHash: input.command.requestHash,
              expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
            },
          });
          const result = await work(transaction);
          await transaction.idempotencyRecord.update({
            where: { userId_key: { userId: input.actor.userId, key: input.command.key } },
            data: {
              status: 'COMPLETED',
              resourceId: result.resourceId,
              response: result,
              completedAt: new Date(),
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const completed = await this.completed(input.command, input.actor.userId);
      if (!completed) throw error;
      return completed;
    }
  }
}

function cursor(input: GovernancePageInput): { cursor?: { id: string }; skip?: number } {
  return input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {};
}

function page<T extends { readonly id: string }, R>(rows: T[], limit: number, map: (row: T) => R) {
  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  return {
    records: visible.map(map),
    nextCursor: hasMore ? (visible.at(-1)?.id ?? null) : null,
  };
}

function requireVersion(actual: number, expected: number) {
  if (actual !== expected) throw new OptimisticConcurrencyError();
}

async function updateServiceCategory(
  transaction: Prisma.TransactionClient,
  id: string,
  input: {
    readonly expectedVersion: number;
    readonly parentId: string | null;
    readonly names: LocalizedNames;
    readonly active: boolean;
  },
) {
  const changed = await transaction.serviceCategory.updateMany({
    where: { id, version: input.expectedVersion },
    data: {
      parentId: input.parentId,
      names: input.names,
      active: input.active,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new OptimisticConcurrencyError();
  return transaction.serviceCategory.findUniqueOrThrow({ where: { id } });
}

async function updateProcedure(
  transaction: Prisma.TransactionClient,
  id: string,
  input: {
    readonly expectedVersion: number;
    readonly serviceCategoryId: string;
    readonly names: LocalizedNames;
    readonly descriptions: LocalizedNames;
    readonly active: boolean;
  },
) {
  const changed = await transaction.procedureDefinition.updateMany({
    where: { id, version: input.expectedVersion },
    data: {
      serviceCategoryId: input.serviceCategoryId,
      names: input.names,
      descriptions: input.descriptions,
      active: input.active,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new OptimisticConcurrencyError();
  return transaction.procedureDefinition.findUniqueOrThrow({ where: { id } });
}

function countryData(input: {
  readonly code: string;
  readonly names: LocalizedNames;
  readonly currency: Currency;
  readonly callingCode: string;
  readonly active: boolean;
}) {
  return {
    code: input.code,
    names: input.names,
    currency: input.currency,
    callingCode: input.callingCode,
    active: input.active,
  };
}

async function updateCountry(
  transaction: Prisma.TransactionClient,
  id: string,
  input: Parameters<typeof countryData>[0] & {
    readonly actor: AdminGovernanceActor;
    readonly expectedVersion: number;
  },
) {
  const changed = await transaction.countryConfiguration.updateMany({
    where: { id, version: input.expectedVersion },
    data: {
      ...countryData(input),
      updatedByUserId: input.actor.userId,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new OptimisticConcurrencyError();
  return transaction.countryConfiguration.findUniqueOrThrow({ where: { id } });
}

function cityData(input: {
  readonly countryId: string;
  readonly code: string;
  readonly names: LocalizedNames;
  readonly timezone: string;
  readonly active: boolean;
}) {
  return {
    countryId: input.countryId,
    code: input.code,
    names: input.names,
    timezone: input.timezone,
    active: input.active,
  };
}

async function updateCity(
  transaction: Prisma.TransactionClient,
  id: string,
  input: Parameters<typeof cityData>[0] & {
    readonly actor: AdminGovernanceActor;
    readonly expectedVersion: number;
  },
) {
  const changed = await transaction.cityConfiguration.updateMany({
    where: { id, version: input.expectedVersion },
    data: {
      ...cityData(input),
      updatedByUserId: input.actor.userId,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new OptimisticConcurrencyError();
  return transaction.cityConfiguration.findUniqueOrThrow({ where: { id } });
}

async function updateLocale(
  transaction: Prisma.TransactionClient,
  id: string,
  input: {
    readonly locale: string;
    readonly names: LocalizedNames;
    readonly active: boolean;
    readonly isDefault: boolean;
    readonly actor: AdminGovernanceActor;
    readonly expectedVersion: number;
  },
) {
  const changed = await transaction.localeConfiguration.updateMany({
    where: { id, version: input.expectedVersion },
    data: {
      locale: input.locale,
      names: input.names,
      active: input.active,
      isDefault: input.isDefault,
      updatedByUserId: input.actor.userId,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new OptimisticConcurrencyError();
  return transaction.localeConfiguration.findUniqueOrThrow({ where: { id } });
}

function locationEvidence(
  resourceId: string,
  version: number,
  input: {
    readonly kind: 'country' | 'city' | 'locale';
    readonly expectedVersion: number;
  },
) {
  return {
    action: 'admin.location-configuration-changed',
    resourceType: `${input.kind[0]?.toUpperCase()}${input.kind.slice(1)}Configuration`,
    resourceId,
    before: { version: input.expectedVersion },
    after: { kind: input.kind, version },
  };
}

async function governanceEvidence(
  transaction: Prisma.TransactionClient,
  input: MutationEvidence,
  evidence: {
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly before: Prisma.InputJsonValue;
    readonly after: Prisma.InputJsonValue;
  },
) {
  await transaction.auditLog.create({
    data: {
      actorUserId: input.actor.userId,
      action: evidence.action,
      resourceType: evidence.resourceType,
      resourceId: evidence.resourceId,
      requestId: input.actor.requestId,
      reason: input.reason,
      success: true,
      beforeMetadata: evidence.before,
      afterMetadata: evidence.after,
    },
  });
  await transaction.outboxEvent.create({
    data: {
      aggregateType: evidence.resourceType,
      aggregateId: evidence.resourceId,
      eventType: evidence.action,
      payload: { resourceId: evidence.resourceId },
      correlationId: input.actor.requestId,
      idempotencyKey: `${evidence.action}:${evidence.resourceId}:${input.command.key}`,
    },
  });
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
