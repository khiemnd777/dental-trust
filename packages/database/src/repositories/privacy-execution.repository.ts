import type {
  Prisma,
  PrismaClient,
  PrivacyExecutionOutcome,
  PrivacyExecutionStatus,
} from '@prisma/client';

const executionInclude = {
  privacyRequest: {
    include: {
      requester: {
        select: {
          id: true,
          email: true,
          preferredLocale: true,
          accountStatus: true,
          patientProfile: { select: { id: true } },
        },
      },
    },
  },
  noticeNotification: { select: { id: true, status: true, deliveredAt: true } },
  artifactFileAsset: true,
} satisfies Prisma.PrivacyRequestExecutionInclude;

export type PrivacyExecutionRecord = Prisma.PrivacyRequestExecutionGetPayload<{
  include: typeof executionInclude;
}>;

export interface PrivacyCategoryDispositionRecord {
  readonly category: string;
  readonly action: string;
  readonly reasonCode: string;
  readonly recordCount: number;
}

export interface PrivacyExportFileRecord {
  readonly id: string;
  readonly objectKey: string;
  readonly originalFileName: string;
  readonly mediaType: string;
  readonly sizeBytes: bigint;
  readonly checksumSha256: string;
  readonly createdAt: Date;
}

export class PrivacyExecutionRepository {
  constructor(private readonly db: PrismaClient) {}

  execution(executionId: string): Promise<PrivacyExecutionRecord | null> {
    return this.db.privacyRequestExecution.findUnique({
      where: { id: executionId },
      include: executionInclude,
    });
  }

  async claimExecution(
    executionId: string,
    now: Date,
    leaseMilliseconds: number,
  ): Promise<
    | { readonly kind: 'CLAIMED'; readonly execution: PrivacyExecutionRecord }
    | {
        readonly kind: 'WAITING_NOTICE';
        readonly execution: PrivacyExecutionRecord;
        readonly notificationStatus: 'PENDING' | 'PROCESSING';
      }
    | { readonly kind: 'NOTICE_FAILED'; readonly execution: PrivacyExecutionRecord }
    | { readonly kind: 'COMPLETE' }
  > {
    return this.db.$transaction(
      async (transaction) => {
        const current = await transaction.privacyRequestExecution.findUnique({
          where: { id: executionId },
          include: executionInclude,
        });
        if (!current) throw new Error('PRIVACY_EXECUTION_NOT_FOUND');
        if (current.status === 'SUCCEEDED') return { kind: 'COMPLETE' } as const;
        if (current.status === 'BLOCKED') return { kind: 'COMPLETE' } as const;
        if (current.status === 'NOTICE_PENDING') {
          if (
            current.noticeNotification?.status === 'FAILED' ||
            current.noticeNotification?.status === 'SUPPRESSED'
          ) {
            return { kind: 'NOTICE_FAILED', execution: current } as const;
          }
          if (current.noticeNotification?.status !== 'DELIVERED') {
            return {
              kind: 'WAITING_NOTICE',
              execution: current,
              notificationStatus: current.noticeNotification?.status ?? 'PENDING',
            } as const;
          }
        } else if (!['PENDING', 'FAILED'].includes(current.status)) {
          if (
            current.status === 'PROCESSING' &&
            current.leaseExpiresAt &&
            current.leaseExpiresAt > now
          )
            throw new Error('PRIVACY_EXECUTION_LEASE_ACTIVE');
        }
        const leaseExpiresAt = new Date(now.getTime() + leaseMilliseconds);
        const changed = await transaction.privacyRequestExecution.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
            ...(current.status === 'PROCESSING' ? { leaseExpiresAt: { lte: now } } : {}),
          },
          data: {
            status: 'PROCESSING',
            attemptCount: { increment: 1 },
            leaseExpiresAt,
            lastErrorCode: null,
            blockerCodes: [],
            startedAt: current.startedAt ?? now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new Error('PRIVACY_EXECUTION_CLAIM_CONFLICT');
        if (current.privacyRequest.status === 'APPROVED') {
          const requestChanged = await transaction.privacyRequest.updateMany({
            where: {
              id: current.privacyRequestId,
              version: current.privacyRequest.version,
              status: 'APPROVED',
            },
            data: { status: 'PROCESSING', version: { increment: 1 } },
          });
          if (requestChanged.count !== 1) throw new Error('PRIVACY_REQUEST_CLAIM_CONFLICT');
        } else if (current.privacyRequest.status !== 'PROCESSING') {
          throw new Error('PRIVACY_REQUEST_NOT_EXECUTABLE');
        }
        await transaction.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            action: 'privacy-request.execution-started',
            resourceType: 'PrivacyRequestExecution',
            resourceId: current.id,
            requestId: `privacy-execution:${current.id}:${current.version + 1}`,
            success: true,
            beforeMetadata: { status: current.status, version: current.version },
            afterMetadata: {
              status: 'PROCESSING',
              version: current.version + 1,
              attemptCount: current.attemptCount + 1,
              leaseExpiresAt: leaseExpiresAt.toISOString(),
            },
          },
        });
        return {
          kind: 'CLAIMED',
          execution: await transaction.privacyRequestExecution.findUniqueOrThrow({
            where: { id: current.id },
            include: executionInclude,
          }),
        } as const;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async recordFailure(
    executionId: string,
    expectedVersion: number,
    errorCode: string,
  ): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const changed = await transaction.privacyRequestExecution.updateMany({
        where: { id: executionId, version: expectedVersion, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          leaseExpiresAt: null,
          lastErrorCode: errorCode.slice(0, 120),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) return;
      await transaction.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'privacy-request.execution-failed',
          resourceType: 'PrivacyRequestExecution',
          resourceId: executionId,
          requestId: `privacy-execution:${executionId}:failed:${expectedVersion + 1}`,
          success: false,
          afterMetadata: { status: 'FAILED', errorCode: errorCode.slice(0, 120) },
        },
      });
    });
  }

  async blockExecution(
    execution: PrivacyExecutionRecord,
    blockerCodes: readonly string[],
  ): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const changed = await transaction.privacyRequestExecution.updateMany({
        where: { id: execution.id, version: execution.version, status: 'PROCESSING' },
        data: {
          status: 'BLOCKED',
          blockerCodes: [...new Set(blockerCodes)],
          leaseExpiresAt: null,
          lastErrorCode: 'POLICY_BLOCKED',
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('PRIVACY_EXECUTION_BLOCK_CONFLICT');
      await transaction.privacyRequest.update({
        where: { id: execution.privacyRequestId },
        data: { status: 'IN_REVIEW', version: { increment: 1 } },
      });
      await transaction.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'privacy-request.execution-blocked',
          resourceType: 'PrivacyRequestExecution',
          resourceId: execution.id,
          requestId: `privacy-execution:${execution.id}:blocked:${execution.version + 1}`,
          success: true,
          afterMetadata: { status: 'BLOCKED', blockerCodes: [...new Set(blockerCodes)] },
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'PrivacyRequestExecution',
          aggregateId: execution.id,
          eventType: 'privacy-request.execution-blocked',
          payload: {
            privacyRequestId: execution.privacyRequestId,
            privacyExecutionId: execution.id,
            blockerCodes: [...new Set(blockerCodes)],
          },
          correlationId: `privacy-execution:${execution.id}`,
          idempotencyKey: `privacy-request.execution-blocked:${execution.id}:${execution.version + 1}`,
        },
      });
    });
  }

  async blockFailedDeletionNotice(execution: PrivacyExecutionRecord): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const changed = await transaction.privacyRequestExecution.updateMany({
        where: { id: execution.id, version: execution.version, status: 'NOTICE_PENDING' },
        data: {
          status: 'BLOCKED',
          blockerCodes: ['NOTICE_DELIVERY_FAILED'],
          lastErrorCode: 'NOTICE_DELIVERY_FAILED',
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('PRIVACY_NOTICE_BLOCK_CONFLICT');
      await transaction.privacyRequest.update({
        where: { id: execution.privacyRequestId },
        data: { status: 'IN_REVIEW', version: { increment: 1 } },
      });
      await transaction.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'privacy-request.deletion-notice-failed',
          resourceType: 'PrivacyRequestExecution',
          resourceId: execution.id,
          requestId: `privacy-execution:${execution.id}:notice-failed:${execution.version + 1}`,
          success: false,
          afterMetadata: { status: 'BLOCKED', blockerCodes: ['NOTICE_DELIVERY_FAILED'] },
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'PrivacyRequestExecution',
          aggregateId: execution.id,
          eventType: 'privacy-request.execution-blocked',
          payload: {
            privacyRequestId: execution.privacyRequestId,
            privacyExecutionId: execution.id,
            blockerCodes: ['NOTICE_DELIVERY_FAILED'],
          },
          correlationId: `privacy-execution:${execution.id}`,
          idempotencyKey: `privacy-request.execution-blocked:${execution.id}:${execution.version + 1}`,
        },
      });
    });
  }

  async createDeletionNotice(execution: PrivacyExecutionRecord): Promise<void> {
    const notificationId = crypto.randomUUID();
    await this.db.$transaction(async (transaction) => {
      await transaction.notification.create({
        data: {
          id: notificationId,
          userId: execution.privacyRequest.requesterUserId,
          category: 'PRIVACY_REQUEST',
          channel: 'EMAIL',
          templateKey: 'privacy.deletion-execution-notice',
          templateLocale: execution.privacyRequest.requester.preferredLocale,
          payload: { privacyRequestId: execution.privacyRequestId },
          idempotencyKey: `privacy-deletion-notice:${execution.id}:${execution.version}`,
        },
      });
      const changed = await transaction.privacyRequestExecution.updateMany({
        where: { id: execution.id, version: execution.version, status: 'PROCESSING' },
        data: {
          status: 'NOTICE_PENDING',
          noticeNotificationId: notificationId,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('PRIVACY_NOTICE_STATE_CONFLICT');
      await transaction.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'privacy-request.deletion-notice-queued',
          resourceType: 'PrivacyRequestExecution',
          resourceId: execution.id,
          requestId: `privacy-execution:${execution.id}:notice:${execution.version + 1}`,
          success: true,
          afterMetadata: { status: 'NOTICE_PENDING', notificationId },
        },
      });
    });
  }

  async deletionPreflight(userId: string, at = new Date()) {
    const profile = await this.db.patientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new Error('PRIVACY_SUBJECT_PROFILE_NOT_FOUND');
    const [
      holds,
      memberships,
      activeTreatment,
      unsettledPayments,
      unsettledRefunds,
      openIncidents,
    ] = await Promise.all([
      this.db.privacyLegalHold.findMany({
        where: {
          subjectUserId: userId,
          releasedAt: null,
          startsAt: { lte: at },
          OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
        },
        select: { id: true, scopes: true },
        take: 100,
      }),
      this.db.organizationMembership.count({ where: { userId, status: 'ACTIVE' } }),
      this.db.dentalCase.count({
        where: {
          patientProfileId: profile.id,
          status: { in: ['BOOKED', 'IN_TREATMENT', 'AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE'] },
        },
      }),
      this.db.payment.count({
        where: {
          booking: { dentalCase: { patientProfileId: profile.id } },
          status: { in: ['REQUIRES_PAYMENT_METHOD', 'REQUIRES_ACTION', 'PROCESSING'] },
        },
      }),
      this.db.refund.count({
        where: {
          payment: { booking: { dentalCase: { patientProfileId: profile.id } } },
          status: { in: ['REQUESTED', 'UNDER_REVIEW', 'PROCESSING'] },
        },
      }),
      this.db.incident.count({
        where: {
          dentalCase: { patientProfileId: profile.id },
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
      }),
    ]);
    const blockerCodes: string[] = [];
    if (memberships > 0) blockerCodes.push('ACTIVE_PROFESSIONAL_MEMBERSHIP');
    if (activeTreatment > 0) blockerCodes.push('ACTIVE_TREATMENT');
    if (unsettledPayments + unsettledRefunds > 0) blockerCodes.push('UNSETTLED_FINANCIAL_ACTIVITY');
    if (openIncidents > 0) blockerCodes.push('OPEN_TRUST_SAFETY_MATTER');
    return { profileId: profile.id, holds, blockerCodes };
  }

  async completeExport(input: {
    readonly execution: PrivacyExecutionRecord;
    readonly objectKey: string;
    readonly archiveChecksumSha256: string;
    readonly manifestChecksumSha256: string;
    readonly archiveSizeBytes: bigint;
    readonly recordCount: number;
    readonly expiresAt: Date;
    readonly dispositions: readonly PrivacyCategoryDispositionRecord[];
  }): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const file = await transaction.fileAsset.upsert({
        where: { objectKey: input.objectKey },
        update: {},
        create: {
          ownerUserId: input.execution.privacyRequest.requesterUserId,
          objectKey: input.objectKey,
          originalFileName: `dental-trust-export-${input.execution.privacyRequestId}.zip`,
          declaredMediaType: 'application/zip',
          detectedMediaType: 'application/zip',
          sizeBytes: input.archiveSizeBytes,
          checksumSha256: input.archiveChecksumSha256,
          status: 'AVAILABLE',
          scanStatus: 'CLEAN',
          retentionUntil: input.expiresAt,
        },
      });
      const changed = await transaction.privacyRequestExecution.updateMany({
        where: {
          id: input.execution.id,
          version: input.execution.version,
          status: 'PROCESSING',
        },
        data: {
          status: 'SUCCEEDED',
          outcome: 'EXPORT_READY',
          artifactFileAssetId: file.id,
          artifactExpiresAt: input.expiresAt,
          archiveChecksumSha256: input.archiveChecksumSha256,
          manifestChecksumSha256: input.manifestChecksumSha256,
          archiveSizeBytes: input.archiveSizeBytes,
          recordCount: input.recordCount,
          categoryDisposition: input.dispositions as unknown as Prisma.InputJsonValue,
          leaseExpiresAt: null,
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('PRIVACY_EXPORT_COMPLETION_CONFLICT');
      await transaction.privacyRequest.update({
        where: { id: input.execution.privacyRequestId },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
      });
      for (const channel of ['IN_APP', 'EMAIL'] as const) {
        await transaction.notification.upsert({
          where: {
            idempotencyKey: `privacy-export-ready:${input.execution.id}:${channel}`,
          },
          update: {},
          create: {
            userId: input.execution.privacyRequest.requesterUserId,
            category: 'PRIVACY_REQUEST',
            channel,
            templateKey: 'privacy.export-ready',
            templateLocale: input.execution.privacyRequest.requester.preferredLocale,
            payload: {
              privacyRequestId: input.execution.privacyRequestId,
              expiresAt: input.expiresAt.toISOString(),
            },
            idempotencyKey: `privacy-export-ready:${input.execution.id}:${channel}`,
          },
        });
      }
      await recordSystemCompletion(
        transaction,
        input.execution,
        'EXPORT_READY',
        input.dispositions,
      );
    });
  }

  async completeDeletion(input: {
    readonly execution: PrivacyExecutionRecord;
    readonly outcome: Extract<
      PrivacyExecutionOutcome,
      'DEIDENTIFIED_WITH_RETENTION' | 'RETAINED_LEGAL_HOLD'
    >;
    readonly profileId: string;
    readonly tombstoneEmail: string;
    readonly tombstonePasswordHash: string;
    readonly dispositions: readonly PrivacyCategoryDispositionRecord[];
  }): Promise<void> {
    await this.db.$transaction(
      async (transaction) => {
        const now = new Date();
        await transaction.session.updateMany({
          where: { userId: input.execution.privacyRequest.requesterUserId, revokedAt: null },
          data: { revokedAt: now, ipAddressHash: null, userAgent: null },
        });
        await transaction.accountLifecycleToken.updateMany({
          where: {
            userId: input.execution.privacyRequest.requesterUserId,
            consumedAt: null,
          },
          data: { consumedAt: now },
        });
        await transaction.mfaConfiguration.deleteMany({
          where: { userId: input.execution.privacyRequest.requesterUserId },
        });
        await transaction.organizationMembership.updateMany({
          where: {
            userId: input.execution.privacyRequest.requesterUserId,
            status: { in: ['INVITED', 'ACTIVE', 'SUSPENDED'] },
          },
          data: { status: 'REMOVED', removedAt: now },
        });
        await transaction.clinicStaff.updateMany({
          where: {
            userId: input.execution.privacyRequest.requesterUserId,
            removedAt: null,
          },
          data: { active: false, removedAt: now },
        });
        await transaction.caregiverGrant.updateMany({
          where: {
            OR: [
              { caregiverUserId: input.execution.privacyRequest.requesterUserId },
              { patientProfileId: input.profileId },
            ],
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await transaction.secureShare.updateMany({
          where: {
            dentalCase: { patientProfileId: input.profileId },
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokedByUserId: input.execution.privacyRequest.requesterUserId,
          },
        });
        if (input.outcome === 'DEIDENTIFIED_WITH_RETENTION') {
          await transaction.emergencyContact.deleteMany({ where: { patientId: input.profileId } });
          await transaction.patientProfile.update({
            where: { id: input.profileId },
            data: {
              currentCountry: null,
              currentCity: null,
              timezone: 'UTC',
              encryptedIdentityData: null,
              encryptedContactData: null,
              encryptedPreferences: null,
              version: { increment: 1 },
            },
          });
          await transaction.notificationPreference.deleteMany({
            where: { userId: input.execution.privacyRequest.requesterUserId },
          });
          await transaction.notification.updateMany({
            where: {
              userId: input.execution.privacyRequest.requesterUserId,
              ...(input.execution.noticeNotificationId
                ? { id: { not: input.execution.noticeNotificationId } }
                : {}),
            },
            data: { payload: { redacted: true }, status: 'SUPPRESSED' },
          });
          await transaction.review.updateMany({
            where: { patientUserId: input.execution.privacyRequest.requesterUserId },
            data: { moderationStatus: 'HIDDEN' },
          });
          await transaction.userRole.deleteMany({
            where: { userId: input.execution.privacyRequest.requesterUserId },
          });
          await transaction.user.update({
            where: { id: input.execution.privacyRequest.requesterUserId },
            data: {
              email: input.tombstoneEmail,
              passwordHash: input.tombstonePasswordHash,
              accountStatus: 'DELETED',
              emailVerifiedAt: null,
              failedLoginCount: 0,
              lockedUntil: null,
              deletedAt: now,
            },
          });
        } else {
          await transaction.user.update({
            where: { id: input.execution.privacyRequest.requesterUserId },
            data: { accountStatus: 'DELETION_REQUESTED', lockedUntil: null },
          });
        }
        const changed = await transaction.privacyRequestExecution.updateMany({
          where: {
            id: input.execution.id,
            version: input.execution.version,
            status: 'PROCESSING',
          },
          data: {
            status: 'SUCCEEDED',
            outcome: input.outcome,
            categoryDisposition: input.dispositions as unknown as Prisma.InputJsonValue,
            recordCount: input.dispositions.reduce((sum, item) => sum + item.recordCount, 0),
            leaseExpiresAt: null,
            completedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new Error('PRIVACY_DELETION_COMPLETION_CONFLICT');
        await transaction.privacyRequest.update({
          where: { id: input.execution.privacyRequestId },
          data: { status: 'COMPLETED', completedAt: now, version: { increment: 1 } },
        });
        await recordSystemCompletion(
          transaction,
          input.execution,
          input.outcome,
          input.dispositions,
        );
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async exportFiles(userId: string): Promise<PrivacyExportFileRecord[]> {
    const rows = await this.db.fileAsset.findMany({
      where: {
        status: 'AVAILABLE',
        scanStatus: 'CLEAN',
        checksumSha256: { not: null },
        OR: [
          { documents: { some: { dentalCase: { patientProfile: { userId } } } } },
          {
            passportVersions: {
              some: { dentalPassport: { dentalCase: { patientProfile: { userId } } } },
            },
          },
          {
            incidentAttachments: {
              some: { incident: { dentalCase: { patientProfile: { userId } } } },
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 10_000,
      select: {
        id: true,
        objectKey: true,
        originalFileName: true,
        detectedMediaType: true,
        declaredMediaType: true,
        sizeBytes: true,
        checksumSha256: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      objectKey: row.objectKey,
      originalFileName: row.originalFileName,
      mediaType: row.detectedMediaType ?? row.declaredMediaType,
      sizeBytes: row.sizeBytes,
      checksumSha256: row.checksumSha256 as string,
      createdAt: row.createdAt,
    }));
  }

  async exportSnapshot(userId: string) {
    const profile = await this.db.patientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new Error('PRIVACY_SUBJECT_PROFILE_NOT_FOUND');
    const [account, consents, cases, notifications, privacyRequests, auditActivity] =
      await Promise.all([
        this.db.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            preferredLocale: true,
            accountStatus: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
            patientProfile: {
              select: {
                id: true,
                preferredCurrency: true,
                currentCountry: true,
                currentCity: true,
                timezone: true,
                encryptedIdentityData: true,
                encryptedContactData: true,
                encryptedPreferences: true,
                encryptedMedicalData: true,
                onboardingCompletedAt: true,
                version: true,
                createdAt: true,
                updatedAt: true,
                emergencyContacts: true,
              },
            },
            notificationPreferences: true,
          },
        }),
        this.db.consentRecord.findMany({
          where: { userId },
          orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            grantedAt: true,
            withdrawnAt: true,
            requestId: true,
            consentTextVersion: {
              select: {
                purpose: true,
                version: true,
                locale: true,
                contentHash: true,
                publishedAt: true,
              },
            },
          },
        }),
        this.db.dentalCase.findMany({
          where: { patientProfileId: profile.id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            statusHistory: true,
            assignments: { include: { organization: { select: { name: true, type: true } } } },
            caregiverGrants: {
              select: {
                id: true,
                permissions: true,
                grantedAt: true,
                expiresAt: true,
                revokedAt: true,
              },
            },
            matchingResults: true,
            treatmentPlans: {
              include: { versions: { include: { items: true, acceptances: true } } },
            },
            appointments: {
              select: {
                id: true,
                clinicId: true,
                clinicLocationId: true,
                dentistId: true,
                kind: true,
                startsAt: true,
                endsAt: true,
                status: true,
                timezone: true,
                meetingProvider: true,
                cancellationReason: true,
                cancelledAt: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            bookings: {
              include: {
                payment: { include: { refunds: true, invoice: true, receipt: true } },
                invoice: true,
              },
            },
            documents: {
              include: {
                fileAsset: {
                  select: {
                    id: true,
                    originalFileName: true,
                    detectedMediaType: true,
                    sizeBytes: true,
                    checksumSha256: true,
                    status: true,
                    createdAt: true,
                  },
                },
              },
            },
            messageThreads: {
              include: {
                messages: {
                  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                  select: { id: true, authorUserId: true, encryptedBody: true, createdAt: true },
                },
              },
            },
            treatmentMilestones: true,
            treatmentEvents: true,
            planChangeRequests: { include: { acknowledgement: true } },
            treatmentInstructions: true,
            dentalPassport: {
              include: {
                versions: {
                  include: {
                    implants: true,
                    materials: true,
                    prescriptions: true,
                    secureShares: true,
                  },
                },
              },
            },
            aftercarePlans: { include: { checkIns: { include: { escalations: true } } } },
            reviews: { include: { clinicResponse: true, followUps: true, abuseReports: true } },
            incidents: {
              include: {
                events: { where: { visibility: 'PARTICIPANTS' } },
                warrantyClaim: true,
                attachments: { select: { fileAssetId: true } },
              },
            },
            intakeQuestionnaire: {
              include: {
                versions: {
                  include: {
                    medicalConditions: true,
                    medications: true,
                    allergies: true,
                    consents: true,
                  },
                },
              },
            },
          },
        }),
        this.db.notification.findMany({
          where: { userId },
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            category: true,
            channel: true,
            templateKey: true,
            templateLocale: true,
            status: true,
            scheduledAt: true,
            deliveredAt: true,
            readAt: true,
          },
        }),
        this.db.privacyRequest.findMany({
          where: { requesterUserId: userId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            type: true,
            status: true,
            dueAt: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.db.auditLog.findMany({
          where: { actorUserId: userId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 10_000,
          select: {
            id: true,
            action: true,
            resourceType: true,
            resourceId: true,
            success: true,
            createdAt: true,
          },
        }),
      ]);
    return { account, consents, cases, notifications, privacyRequests, auditActivity };
  }

  expiredArtifacts(now: Date, limit = 100) {
    return this.db.privacyRequestExecution.findMany({
      where: {
        status: 'SUCCEEDED',
        outcome: 'EXPORT_READY',
        artifactExpiresAt: { lte: now },
        artifactPurgedAt: null,
        artifactFileAsset: { is: { deletedAt: null } },
      },
      orderBy: [{ artifactExpiresAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: { artifactFileAsset: true },
    });
  }

  async markArtifactPurged(
    executionId: string,
    fileAssetId: string,
    purgedAt: Date,
  ): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      await transaction.fileAsset.updateMany({
        where: { id: fileAssetId, deletedAt: null },
        data: { status: 'DELETED', deletedAt: purgedAt },
      });
      await transaction.privacyRequestExecution.updateMany({
        where: { id: executionId, status: 'SUCCEEDED', artifactPurgedAt: null },
        data: { artifactPurgedAt: purgedAt },
      });
      await transaction.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'privacy-request.export-artifact-purged',
          resourceType: 'PrivacyRequestExecution',
          resourceId: executionId,
          requestId: `privacy-export-purge:${executionId}:${purgedAt.toISOString()}`,
          success: true,
          afterMetadata: { fileAssetId, purgedAt: purgedAt.toISOString() },
        },
      });
    });
  }
}

async function recordSystemCompletion(
  transaction: Prisma.TransactionClient,
  execution: PrivacyExecutionRecord,
  outcome: PrivacyExecutionOutcome,
  dispositions: readonly PrivacyCategoryDispositionRecord[],
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      action: 'privacy-request.execution-completed',
      resourceType: 'PrivacyRequestExecution',
      resourceId: execution.id,
      requestId: `privacy-execution:${execution.id}:completed`,
      success: true,
      afterMetadata: {
        outcome,
        categoryDisposition: dispositions as unknown as Prisma.InputJsonValue,
      },
    },
  });
  await transaction.outboxEvent.create({
    data: {
      aggregateType: 'PrivacyRequestExecution',
      aggregateId: execution.id,
      eventType: 'privacy-request.execution-completed',
      payload: {
        privacyRequestId: execution.privacyRequestId,
        privacyExecutionId: execution.id,
        outcome,
      },
      correlationId: `privacy-execution:${execution.id}`,
      idempotencyKey: `privacy-request.execution-completed:${execution.id}`,
    },
  });
}

export function isTerminalPrivacyExecution(status: PrivacyExecutionStatus): boolean {
  return status === 'SUCCEEDED' || status === 'BLOCKED';
}
