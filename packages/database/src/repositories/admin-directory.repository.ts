import type {
  AccountStatus,
  DentalCaseStatus,
  PaymentStatus,
  PrismaClient,
  VerificationStatus,
} from '@prisma/client';

export interface AdminDirectoryPageInput {
  readonly cursor?: string;
  readonly limit: number;
  readonly search?: string;
}

export class AdminDirectoryRepository {
  constructor(private readonly db: PrismaClient) {}

  async users(input: AdminDirectoryPageInput & { readonly status?: AccountStatus }) {
    const rows = await this.db.user.findMany({
      where: {
        ...(input.search
          ? { email: { contains: input.search, mode: 'insensitive' as const } }
          : {}),
        ...(input.status ? { accountStatus: input.status } : {}),
      },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        email: true,
        accountStatus: true,
        emailVerifiedAt: true,
        createdAt: true,
        roles: { select: { role: { select: { code: true } } }, orderBy: { role: { code: 'asc' } } },
        mfaConfigurations: {
          where: { enabledAt: { not: null }, revokedAt: null },
          select: { id: true },
          take: 1,
        },
        _count: {
          select: {
            sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } },
          },
        },
      },
    });
    return page(rows, input.limit, (row) => ({
      id: row.id,
      email: row.email,
      accountStatus: row.accountStatus,
      emailVerified: row.emailVerifiedAt !== null,
      roles: row.roles.map(({ role }) => role.code),
      mfaEnabled: row.mfaConfigurations.length > 0,
      activeSessionCount: row._count.sessions,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async organizations(input: AdminDirectoryPageInput & { readonly status?: 'ACTIVE' | 'DELETED' }) {
    const rows = await this.db.organization.findMany({
      where: {
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: 'insensitive' as const } },
                { slug: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(input.status === 'ACTIVE'
          ? { deletedAt: null }
          : input.status === 'DELETED'
            ? { deletedAt: { not: null } }
            : {}),
      },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        type: true,
        name: true,
        slug: true,
        deletedAt: true,
        createdAt: true,
        _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
      },
    });
    return page(rows, input.limit, (row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      slug: row.slug,
      active: row.deletedAt === null,
      memberCount: row._count.memberships,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async clinics(input: AdminDirectoryPageInput & { readonly status?: VerificationStatus }) {
    const rows = await this.db.clinic.findMany({
      where: {
        deletedAt: null,
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: 'insensitive' as const } },
                { slug: { contains: input.search, mode: 'insensitive' as const } },
                { legalEntityName: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(input.status ? { verificationStatus: input.status } : {}),
      },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        verificationStatus: true,
        createdAt: true,
        _count: {
          select: {
            locations: { where: { active: true } },
            affiliations: { where: { active: true, endedAt: null } },
          },
        },
      },
    });
    return page(rows, input.limit, (row) => ({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      slug: row.slug,
      verificationStatus: row.verificationStatus,
      activeLocationCount: row._count.locations,
      activeDentistCount: row._count.affiliations,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async dentists(input: AdminDirectoryPageInput & { readonly status?: VerificationStatus }) {
    const rows = await this.db.dentist.findMany({
      where: {
        ...(input.search
          ? {
              OR: [
                { fullName: { contains: input.search, mode: 'insensitive' as const } },
                { slug: { contains: input.search, mode: 'insensitive' as const } },
                { licenseNumber: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(input.status ? { licenseStatus: input.status } : {}),
      },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        fullName: true,
        slug: true,
        licenseStatus: true,
        createdAt: true,
        _count: { select: { affiliations: { where: { active: true, endedAt: null } } } },
      },
    });
    return page(rows, input.limit, (row) => ({
      id: row.id,
      fullName: row.fullName,
      slug: row.slug,
      licenseStatus: row.licenseStatus,
      activeClinicCount: row._count.affiliations,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async cases(input: AdminDirectoryPageInput & { readonly status?: DentalCaseStatus }) {
    const rows = await this.db.dentalCase.findMany({
      where: {
        ...(input.search
          ? { caseNumber: { contains: input.search, mode: 'insensitive' as const } }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        caseNumber: true,
        status: true,
        preferredLocation: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { assignments: { where: { endedAt: null } } } },
      },
    });
    return page(rows, input.limit, (row) => ({
      id: row.id,
      caseNumber: row.caseNumber,
      status: row.status,
      preferredLocation: row.preferredLocation,
      activeAssignmentCount: row._count.assignments,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async payments(input: AdminDirectoryPageInput & { readonly status?: PaymentStatus }) {
    const rows = await this.db.payment.findMany({
      where: {
        ...(input.search
          ? {
              OR: [
                { providerPaymentIntentId: { contains: input.search } },
                {
                  booking: {
                    dentalCase: { caseNumber: { contains: input.search, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      ...cursor(input),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        bookingId: true,
        provider: true,
        status: true,
        amountMinor: true,
        currency: true,
        createdAt: true,
        _count: { select: { refunds: true } },
      },
    });
    return page(rows, input.limit, (row) => ({
      id: row.id,
      bookingId: row.bookingId,
      provider: row.provider,
      status: row.status,
      amountMinor: row.amountMinor.toString(),
      currency: row.currency,
      refundCount: row._count.refunds,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async roles() {
    const rows = await this.db.roleDefinition.findMany({
      orderBy: { code: 'asc' },
      select: {
        code: true,
        displayName: true,
        isPrivileged: true,
        permissions: {
          select: { permission: { select: { code: true } } },
          orderBy: { permission: { code: 'asc' } },
        },
        _count: { select: { users: true, memberships: true } },
      },
    });
    return rows.map((row) => ({
      code: row.code,
      displayName: row.displayName,
      privileged: row.isPrivileged,
      permissions: row.permissions.map(({ permission }) => permission.code),
      userCount: row._count.users,
      membershipCount: row._count.memberships,
    }));
  }
}

function cursor(input: AdminDirectoryPageInput): { cursor?: { id: string }; skip?: number } {
  return input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {};
}

function page<T extends { readonly id: string }, V>(
  rows: readonly T[],
  limit: number,
  view: (row: T) => V,
) {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  return {
    records: selected.map(view),
    nextCursor: hasMore ? (selected.at(-1)?.id ?? null) : null,
  };
}
