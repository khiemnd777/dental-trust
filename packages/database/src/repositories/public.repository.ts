import type { Prisma, PrismaClient } from '@prisma/client';

export class ContactIdempotencyConflictError extends Error {
  constructor() {
    super('The contact idempotency key was already used for different content.');
    this.name = 'ContactIdempotencyConflictError';
  }
}

export interface PublicDirectoryPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export class PublicRepository {
  constructor(private readonly db: PrismaClient) {}

  async listClinics(input: {
    readonly locale: 'vi-VN' | 'en-US';
    readonly limit: number;
    readonly cursor?: string;
    readonly slug?: string;
  }): Promise<PublicDirectoryPage<Readonly<Record<string, unknown>>>> {
    const now = new Date();
    const records = await this.db.clinic.findMany({
      where: { ...validClinicWhere(now), ...(input.slug ? { slug: input.slug } : {}) },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        slug: true,
        name: true,
        verifiedAt: true,
        updatedAt: true,
        locations: {
          where: { active: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { address: true, city: true, district: true },
        },
        verificationCases: {
          where: validVerificationCaseWhere(now),
          orderBy: { expiresAt: 'asc' },
          take: 1,
          select: {
            expiresAt: true,
            evidence: {
              where: validEvidenceWhere(now),
              orderBy: { category: 'asc' },
              select: { category: true },
            },
          },
        },
        licenses: {
          where: validLicenseWhere(now),
          orderBy: { expiresAt: 'asc' },
          take: 1,
          select: { licenseNumber: true, expiresAt: true },
        },
        services: {
          where: {
            active: true,
            procedureDefinition: { active: true, serviceCategory: { active: true } },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            displayNames: true,
            prices: {
              where: {
                effectiveAt: { lte: now },
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
              orderBy: { effectiveAt: 'desc' },
              take: 1,
              select: { minimumMinor: true, maximumMinor: true, currency: true },
            },
          },
        },
        reviews: {
          where: { verified: true, moderationStatus: 'PUBLISHED' },
          select: { overallRating: true },
        },
      },
    });

    const hasMore = records.length > input.limit;
    const pageRecords = records.slice(0, input.limit);
    return {
      items: pageRecords.flatMap((clinic) => {
        const verification = clinic.verificationCases[0];
        const license = clinic.licenses[0];
        if (!verification?.expiresAt || !license?.expiresAt) return [];
        const location = clinic.locations[0];
        const prices = clinic.services.flatMap((service) => service.prices);
        const minimum = prices.reduce<bigint | null>(
          (value, price) =>
            value === null || price.minimumMinor < value ? price.minimumMinor : value,
          null,
        );
        const maximum = prices.reduce<bigint | null>(
          (value, price) =>
            value === null || price.maximumMinor > value ? price.maximumMinor : value,
          null,
        );
        const currencies = new Set(prices.map((price) => price.currency));
        const ratingTotal = clinic.reviews.reduce((sum, review) => sum + review.overallRating, 0);
        return [
          {
            slug: clinic.slug,
            name: clinic.name,
            locationLabel: [location?.district, location?.city].filter(Boolean).join(', '),
            address: location?.address ?? '',
            services: clinic.services.map((service) =>
              localizedText(service.displayNames, input.locale),
            ),
            languages: [],
            rating:
              clinic.reviews.length > 0 ? (ratingTotal / clinic.reviews.length).toFixed(1) : '',
            reviewCount: String(clinic.reviews.length),
            estimatedPriceLabel:
              minimum !== null && maximum !== null && currencies.size === 1
                ? `${[...currencies][0]} ${minimum.toString()}–${maximum.toString()}`
                : '',
            nextConsultationLabel: '',
            licenseIdentifier: license.licenseNumber,
            updatedAt: clinic.updatedAt.toISOString(),
            verification: {
              status: 'VERIFIED',
              verifiedAt: clinic.verifiedAt?.toISOString() ?? '',
              expiresAt: earliestDate(verification.expiresAt, license.expiresAt).toISOString(),
              evidence: verification.evidence.map(({ category }) => category),
            },
          },
        ];
      }),
      nextCursor: hasMore ? (pageRecords.at(-1)?.id ?? null) : null,
    };
  }

  async findClinic(
    slug: string,
    locale: 'vi-VN' | 'en-US',
  ): Promise<Readonly<Record<string, unknown>> | null> {
    const result = await this.listClinics({ locale, limit: 1, slug });
    return result.items[0] ?? null;
  }

  async listDentists(input: {
    readonly locale: 'vi-VN' | 'en-US';
    readonly limit: number;
    readonly cursor?: string;
  }): Promise<PublicDirectoryPage<Readonly<Record<string, unknown>>>> {
    return this.queryDentists(input);
  }

  async findDentist(
    slug: string,
    locale: 'vi-VN' | 'en-US',
  ): Promise<Readonly<Record<string, unknown>> | null> {
    const result = await this.queryDentists({ locale, limit: 1, slug });
    return result.items[0] ?? null;
  }

  async createContact(input: {
    readonly reference: string;
    readonly encryptedName: string;
    readonly encryptedEmail: string;
    readonly encryptedTopic: string;
    readonly encryptedMessage: string;
    readonly locale: string;
    readonly requestId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
  }): Promise<{ readonly id: string; readonly reference: string }> {
    const existing = await this.db.contactRequest.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, reference: true, requestHash: true },
    });
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new ContactIdempotencyConflictError();
      return existing;
    }

    try {
      return await this.db.$transaction(async (transaction) => {
        const contact = await transaction.contactRequest.create({ data: input });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'contact_request',
            aggregateId: contact.id,
            eventType: 'contact.requested',
            payload: { contactRequestId: contact.id, reference: contact.reference },
            correlationId: input.requestId,
            idempotencyKey: `contact-requested:${contact.id}`,
          },
        });
        return { id: contact.id, reference: contact.reference };
      });
    } catch (error) {
      const replay = await this.db.contactRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, reference: true, requestHash: true },
      });
      if (!replay) throw error;
      if (replay.requestHash !== input.requestHash) throw new ContactIdempotencyConflictError();
      return replay;
    }
  }

  private async queryDentists(input: {
    readonly locale: 'vi-VN' | 'en-US';
    readonly limit: number;
    readonly cursor?: string;
    readonly slug?: string;
  }): Promise<PublicDirectoryPage<Readonly<Record<string, unknown>>>> {
    const now = new Date();
    const records = await this.db.dentist.findMany({
      where: {
        ...(input.slug ? { slug: input.slug } : {}),
        licenseStatus: { in: ['VERIFIED', 'VERIFICATION_EXPIRING'] },
        licenses: { some: validLicenseWhere(now) },
        verificationCases: { some: validVerificationCaseWhere(now) },
        affiliations: {
          some: {
            active: true,
            startedAt: { lte: now },
            OR: [{ endedAt: null }, { endedAt: { gt: now } }],
            clinic: validClinicWhere(now),
          },
        },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        slug: true,
        fullName: true,
        licenseNumber: true,
        updatedAt: true,
        licenses: {
          where: validLicenseWhere(now),
          orderBy: { expiresAt: 'asc' },
          take: 1,
          select: { scopeOfPractice: true, expiresAt: true },
        },
        verificationCases: {
          where: validVerificationCaseWhere(now),
          orderBy: { expiresAt: 'asc' },
          take: 1,
          select: { expiresAt: true },
        },
        affiliations: {
          where: {
            active: true,
            startedAt: { lte: now },
            OR: [{ endedAt: null }, { endedAt: { gt: now } }],
            clinic: validClinicWhere(now),
          },
          orderBy: { startedAt: 'asc' },
          select: {
            clinic: {
              select: {
                name: true,
                verificationCases: {
                  where: validVerificationCaseWhere(now),
                  orderBy: { expiresAt: 'asc' },
                  take: 1,
                  select: { expiresAt: true },
                },
                services: {
                  where: {
                    active: true,
                    procedureDefinition: { active: true, serviceCategory: { active: true } },
                  },
                  select: { displayNames: true },
                },
              },
            },
          },
        },
      },
    });
    const hasMore = records.length > input.limit;
    const pageRecords = records.slice(0, input.limit);
    return {
      items: pageRecords.flatMap((dentist) => {
        const license = dentist.licenses[0];
        const dentistVerificationExpiresAt = dentist.verificationCases[0]?.expiresAt;
        const primaryAffiliation = dentist.affiliations[0];
        const clinicVerificationExpiresAt =
          primaryAffiliation?.clinic.verificationCases[0]?.expiresAt;
        if (
          !license?.expiresAt ||
          !dentistVerificationExpiresAt ||
          !primaryAffiliation ||
          !clinicVerificationExpiresAt
        )
          return [];
        return [
          {
            slug: dentist.slug,
            name: dentist.fullName,
            specialty: license.scopeOfPractice ?? '',
            introduction: '',
            licenseIdentifier: dentist.licenseNumber,
            updatedAt: dentist.updatedAt.toISOString(),
            scopeOfPractice: license.scopeOfPractice ?? '',
            clinicName: primaryAffiliation.clinic.name,
            nextConsultationLabel: '',
            education: [],
            procedures: uniqueStrings(
              dentist.affiliations.flatMap(({ clinic }) =>
                clinic.services.map((service) => localizedText(service.displayNames, input.locale)),
              ),
            ),
            affiliations: uniqueStrings(dentist.affiliations.map(({ clinic }) => clinic.name)),
            verification: {
              status: 'VERIFIED',
              expiresAt: earliestDate(
                earliestDate(license.expiresAt, dentistVerificationExpiresAt),
                clinicVerificationExpiresAt,
              ).toISOString(),
            },
          },
        ];
      }),
      nextCursor: hasMore ? (pageRecords.at(-1)?.id ?? null) : null,
    };
  }
}

function validClinicWhere(now: Date): Prisma.ClinicWhereInput {
  return {
    verificationStatus: { in: ['VERIFIED', 'VERIFICATION_EXPIRING'] },
    verifiedAt: { not: null },
    deletedAt: null,
    organization: { deletedAt: null },
    verificationCases: { some: validVerificationCaseWhere(now) },
    licenses: { some: validLicenseWhere(now) },
    locations: { some: { active: true } },
  };
}

function validVerificationCaseWhere(now: Date): Prisma.VerificationCaseWhereInput {
  return {
    status: { in: ['VERIFIED', 'VERIFICATION_EXPIRING'] },
    decidedAt: { not: null },
    expiresAt: { gt: now },
    reviews: { some: { toStatus: 'VERIFIED', status: 'APPLIED', appliedAt: { not: null } } },
    requirements: {
      some: { required: true },
      every: {
        OR: [
          { required: false },
          { status: 'APPROVED', evidence: { some: validEvidenceWhere(now) } },
        ],
      },
    },
  };
}

function validEvidenceWhere(now: Date): Prisma.VerificationEvidenceWhereInput {
  return {
    approvedAt: { not: null },
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

function validLicenseWhere(now: Date): Prisma.ProfessionalLicenseWhereInput {
  return {
    status: 'VERIFIED',
    verifiedAt: { not: null },
    expiresAt: { gt: now },
  };
}

function localizedText(value: Prisma.JsonValue, locale: 'vi-VN' | 'en-US'): string {
  if (!value || Array.isArray(value) || typeof value !== 'object') return '';
  const localized = value as Record<string, unknown>;
  const candidate = localized[locale] ?? localized['vi-VN'] ?? localized['en-US'];
  return typeof candidate === 'string' ? candidate : '';
}

function earliestDate(left: Date, right: Date): Date {
  return left <= right ? left : right;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))];
}
