import { Prisma, type PrismaClient } from '@prisma/client';

import type { CaseAccessResource } from '@dental-trust/auth';
import { DomainRuleError } from '@dental-trust/domain';

import {
  CaseNotFoundError,
  IdempotencyConflictError,
  OptimisticConcurrencyError,
} from './case.repository.js';

const commandLifetimeMs = 24 * 60 * 60_000;

export interface CollaborationActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly organizationId?: string;
  readonly impersonatorUserId?: string;
}

export interface CollaborationCommand {
  readonly key: string;
  readonly operation: string;
  readonly requestHash: string;
}

export interface AppointmentPersistenceInput {
  readonly id: string;
  readonly clinicId: string;
  readonly clinicLocationId: string | null;
  readonly dentistId: string;
  readonly kind: 'CONSULTATION' | 'CLINICAL_VISIT';
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly meetingProvider: string | null;
  readonly encryptedJoinUrl: string | null;
}

export interface AppointmentRecord {
  readonly id: string;
  readonly caseId: string;
  readonly clinicId: string;
  readonly clinicLocationId: string | null;
  readonly dentistId: string | null;
  readonly kind: 'CONSULTATION' | 'CLINICAL_VISIT';
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: 'TENTATIVE' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  readonly timezone: string;
  readonly version: number;
  readonly meetingProvider: string | null;
  readonly encryptedJoinUrl: string | null;
  readonly encryptedCancellationReason: string | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SchedulingContextRecord {
  readonly clinicId: string;
  readonly clinicName: string;
  readonly dentists: readonly { readonly id: string; readonly fullName: string }[];
  readonly locations: readonly {
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
  }[];
}

export interface MessageThreadRecord {
  readonly id: string;
  readonly caseId: string;
  readonly encryptedSubject: string;
  readonly closedAt: Date | null;
  readonly messageCount: number;
  readonly unreadCount: number;
  readonly lastMessageAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MessageAttachmentRecord {
  readonly fileAssetId: string;
  readonly originalFileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
}

export interface MessageRecord {
  readonly id: string;
  readonly threadId: string;
  readonly authorUserId: string;
  readonly encryptedBody: string;
  readonly readByCurrentUser: boolean;
  readonly attachments: readonly MessageAttachmentRecord[];
  readonly createdAt: Date;
  readonly editedAt: Date | null;
}

export interface InternalNoteRecord {
  readonly id: string;
  readonly threadId: string;
  readonly authorUserId: string;
  readonly encryptedBody: string;
  readonly createdAt: Date;
}

interface AppointmentRow {
  readonly id: string;
  readonly case_id: string;
  readonly clinic_id: string;
  readonly clinic_location_id: string | null;
  readonly dentist_id: string | null;
  readonly kind: AppointmentRecord['kind'];
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly status: AppointmentRecord['status'];
  readonly timezone: string;
  readonly version: number;
  readonly meeting_provider: string | null;
  readonly encrypted_join_url: string | null;
  readonly cancellation_reason: string | null;
  readonly cancelled_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface ThreadRow {
  readonly id: string;
  readonly case_id: string;
  readonly subject: string;
  readonly closed_at: Date | null;
  readonly message_count: number;
  readonly unread_count: number;
  readonly last_message_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

type MessageWithAttachments = Prisma.MessageGetPayload<{
  include: {
    attachments: {
      include: {
        fileAsset: {
          select: {
            id: true;
            originalFileName: true;
            declaredMediaType: true;
            detectedMediaType: true;
            sizeBytes: true;
          };
        };
      };
    };
  };
}>;

export class SchedulingMessagingRepository {
  constructor(private readonly db: PrismaClient) {}

  async loadCaseAccessResource(caseId: string): Promise<CaseAccessResource | null> {
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

  async listAppointments(
    caseId: string,
    organizationId?: string,
  ): Promise<readonly AppointmentRecord[]> {
    const organizationPredicate = organizationId
      ? Prisma.sql`AND c."organization_id" = CAST(${organizationId} AS uuid)`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<AppointmentRow[]>(Prisma.sql`
      SELECT a.*
      FROM "appointments" a
      JOIN "clinics" c ON c."id" = a."clinic_id"
      WHERE a."case_id" = CAST(${caseId} AS uuid)
        ${organizationPredicate}
      ORDER BY a."starts_at" DESC, a."id" DESC
      LIMIT 100
    `);
    return rows.map(toAppointmentRecord);
  }

  async loadSchedulingContext(
    caseId: string,
    organizationId: string,
  ): Promise<SchedulingContextRecord | null> {
    const rows = await this.db.$queryRaw<
      { clinic_id: string; clinic_name: string; dentist_id: string; dentist_name: string }[]
    >(Prisma.sql`
      SELECT c."id" AS "clinic_id", c."name" AS "clinic_name",
             d."id" AS "dentist_id", d."full_name" AS "dentist_name"
      FROM "clinics" c
      JOIN "case_assignments" a
        ON a."case_id" = CAST(${caseId} AS uuid)
       AND a."organization_id" = c."organization_id"
       AND a."kind" = 'CLINIC'
       AND a."ended_at" IS NULL
      JOIN "dentist_clinic_affiliations" dca
        ON dca."clinic_id" = c."id" AND dca."active" = true AND dca."ended_at" IS NULL
      JOIN "dentists" d ON d."id" = dca."dentist_id"
      WHERE c."organization_id" = CAST(${organizationId} AS uuid)
        AND c."deleted_at" IS NULL
        AND d."license_status" = 'VERIFIED'
      ORDER BY d."full_name" ASC, d."id" ASC
    `);
    if (!rows[0]) return null;
    const locations = await this.db.clinicLocation.findMany({
      where: { clinicId: rows[0].clinic_id, active: true },
      take: 100,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, timezone: true },
    });
    return {
      clinicId: rows[0].clinic_id,
      clinicName: rows[0].clinic_name,
      dentists: rows.map((row) => ({ id: row.dentist_id, fullName: row.dentist_name })),
      locations,
    };
  }

  async getAppointment(
    caseId: string,
    appointmentId: string,
    organizationId?: string,
  ): Promise<AppointmentRecord | null> {
    const organizationPredicate = organizationId
      ? Prisma.sql`AND c."organization_id" = CAST(${organizationId} AS uuid)`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<AppointmentRow[]>(Prisma.sql`
      SELECT a.*
      FROM "appointments" a
      JOIN "clinics" c ON c."id" = a."clinic_id"
      WHERE a."id" = CAST(${appointmentId} AS uuid)
        AND a."case_id" = CAST(${caseId} AS uuid)
        ${organizationPredicate}
      LIMIT 1
    `);
    return rows[0] ? toAppointmentRecord(rows[0]) : null;
  }

  async isAppointmentWindowAvailable(
    caseId: string,
    clinicId: string,
    dentistId: string,
    clinicLocationId: string | undefined,
    kind: AppointmentRecord['kind'],
    startsAt: Date,
    endsAt: Date,
    organizationId?: string,
  ): Promise<boolean> {
    await this.assertClinicCaseEligibility(
      this.db,
      caseId,
      clinicId,
      dentistId,
      organizationId,
      clinicLocationId,
    );
    return !(
      (await this.hasAppointmentConflict(this.db, caseId, dentistId, startsAt, endsAt)) ||
      (await this.hasGovernedAvailabilityConflict(
        this.db,
        clinicId,
        clinicLocationId,
        dentistId,
        kind,
        startsAt,
        endsAt,
      ))
    );
  }

  async createAppointment(
    caseId: string,
    input: AppointmentPersistenceInput,
    actor: CollaborationActor,
    command: CollaborationCommand,
  ): Promise<AppointmentRecord> {
    const resourceId = await this.idempotentResource(actor, command, async (transaction) => {
      if (!actor.organizationId) throw new CaseNotFoundError();
      await this.assertClinicCaseEligibility(
        transaction,
        caseId,
        input.clinicId,
        input.dentistId,
        actor.organizationId,
        input.clinicLocationId ?? undefined,
      );
      const dentalCase = await transaction.dentalCase.findFirst({
        where: { id: caseId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
        select: { id: true },
      });
      if (!dentalCase) throw new CaseNotFoundError();
      await this.assertNoAppointmentConflict(
        transaction,
        caseId,
        input.dentistId,
        input.startsAt,
        input.endsAt,
      );
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "appointments" (
          "id", "case_id", "clinic_id", "clinic_location_id", "dentist_id", "kind", "starts_at", "ends_at",
          "status", "timezone", "version", "meeting_provider", "encrypted_join_url",
          "created_at", "updated_at"
        ) VALUES (
          CAST(${input.id} AS uuid), CAST(${caseId} AS uuid), CAST(${input.clinicId} AS uuid),
          CAST(${input.clinicLocationId} AS uuid), CAST(${input.dentistId} AS uuid), CAST(${input.kind} AS "AppointmentKind"),
          ${input.startsAt}, ${input.endsAt}, 'TENTATIVE', ${input.timezone}, 1,
          ${input.meetingProvider}, ${input.encryptedJoinUrl}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);
      await this.recordEffects(transaction, actor, command, {
        action: 'appointment.created',
        resourceType: 'Appointment',
        resourceId: input.id,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'appointment.created',
        payload: {
          caseId,
          appointmentId: input.id,
          clinicId: input.clinicId,
          clinicLocationId: input.clinicLocationId,
          dentistId: input.dentistId,
          kind: input.kind,
          startsAt: input.startsAt.toISOString(),
          endsAt: input.endsAt.toISOString(),
          timezone: input.timezone,
          status: 'TENTATIVE',
          version: 1,
        },
      });
      return input.id;
    });
    return this.requireAppointment(caseId, resourceId, actor.organizationId);
  }

  async rescheduleAppointment(
    caseId: string,
    appointmentId: string,
    input: {
      readonly startsAt: Date;
      readonly endsAt: Date;
      readonly timezone: string;
      readonly expectedVersion: number;
    },
    actor: CollaborationActor,
    command: CollaborationCommand,
  ): Promise<AppointmentRecord> {
    const resourceId = await this.idempotentResource(actor, command, async (transaction) => {
      const current = await this.lockAppointment(transaction, caseId, appointmentId);
      assertMutableAppointment(current, input.expectedVersion);
      if (!current.dentist_id) {
        throw new DomainRuleError(
          'APPOINTMENT_DENTIST_REQUIRED',
          'A dentist must be assigned before an appointment can be rescheduled.',
        );
      }
      await this.assertClinicCaseEligibility(
        transaction,
        caseId,
        current.clinic_id,
        current.dentist_id,
        actor.organizationId,
        current.clinic_location_id ?? undefined,
      );
      await this.assertNoAppointmentConflict(
        transaction,
        caseId,
        current.dentist_id,
        input.startsAt,
        input.endsAt,
        appointmentId,
      );
      const updated = await transaction.$queryRaw<AppointmentRow[]>(Prisma.sql`
        UPDATE "appointments"
        SET "starts_at" = ${input.startsAt},
            "ends_at" = ${input.endsAt},
            "timezone" = ${input.timezone},
            "version" = "version" + 1,
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = CAST(${appointmentId} AS uuid)
          AND "case_id" = CAST(${caseId} AS uuid)
          AND "version" = ${input.expectedVersion}
        RETURNING *
      `);
      if (!updated[0]) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action: 'appointment.rescheduled',
        resourceType: 'Appointment',
        resourceId: appointmentId,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'appointment.rescheduled',
        beforeMetadata: {
          startsAt: current.starts_at.toISOString(),
          endsAt: current.ends_at.toISOString(),
          timezone: current.timezone,
          version: current.version,
        },
        payload: {
          caseId,
          appointmentId,
          startsAt: input.startsAt.toISOString(),
          endsAt: input.endsAt.toISOString(),
          timezone: input.timezone,
          version: updated[0].version,
        },
      });
      return appointmentId;
    });
    return this.requireAppointment(caseId, resourceId, actor.organizationId);
  }

  async cancelAppointment(
    caseId: string,
    appointmentId: string,
    expectedVersion: number,
    encryptedReason: string,
    actor: CollaborationActor,
    command: CollaborationCommand,
  ): Promise<AppointmentRecord> {
    const resourceId = await this.idempotentResource(actor, command, async (transaction) => {
      const current = await this.lockAppointment(transaction, caseId, appointmentId);
      assertMutableAppointment(current, expectedVersion);
      if (actor.organizationId) {
        if (!current.dentist_id) throw new CaseNotFoundError();
        await this.assertClinicCaseEligibility(
          transaction,
          caseId,
          current.clinic_id,
          current.dentist_id,
          actor.organizationId,
          current.clinic_location_id ?? undefined,
        );
      }
      const updated = await transaction.$queryRaw<AppointmentRow[]>(Prisma.sql`
        UPDATE "appointments"
        SET "status" = 'CANCELLED',
            "cancellation_reason" = ${encryptedReason},
            "cancelled_at" = CURRENT_TIMESTAMP,
            "version" = "version" + 1,
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = CAST(${appointmentId} AS uuid)
          AND "case_id" = CAST(${caseId} AS uuid)
          AND "version" = ${expectedVersion}
        RETURNING *
      `);
      if (!updated[0]) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action: 'appointment.cancelled',
        resourceType: 'Appointment',
        resourceId: appointmentId,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'appointment.cancelled',
        beforeMetadata: { status: current.status, version: current.version },
        payload: {
          caseId,
          appointmentId,
          status: 'CANCELLED',
          version: updated[0].version,
        },
      });
      return appointmentId;
    });
    return this.requireAppointment(caseId, resourceId, actor.organizationId);
  }

  async recordAttendance(
    caseId: string,
    appointmentId: string,
    expectedVersion: number,
    outcome: 'COMPLETED' | 'NO_SHOW',
    actor: CollaborationActor,
    command: CollaborationCommand,
  ): Promise<AppointmentRecord> {
    const resourceId = await this.idempotentResource(actor, command, async (transaction) => {
      const current = await this.lockAppointment(transaction, caseId, appointmentId);
      if (!actor.organizationId || !current.dentist_id) throw new CaseNotFoundError();
      await this.assertClinicCaseEligibility(
        transaction,
        caseId,
        current.clinic_id,
        current.dentist_id,
        actor.organizationId,
        current.clinic_location_id ?? undefined,
      );
      if (current.version !== expectedVersion) throw new OptimisticConcurrencyError();
      if (current.status !== 'CONFIRMED' && current.status !== 'TENTATIVE') {
        throw new DomainRuleError(
          'APPOINTMENT_ATTENDANCE_INVALID_STATE',
          'Attendance can only be recorded for an active appointment.',
        );
      }
      const updated = await transaction.$queryRaw<AppointmentRow[]>(Prisma.sql`
        UPDATE "appointments"
        SET "status" = CAST(${outcome} AS "AppointmentStatus"),
            "version" = "version" + 1,
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = CAST(${appointmentId} AS uuid)
          AND "case_id" = CAST(${caseId} AS uuid)
          AND "version" = ${expectedVersion}
        RETURNING *
      `);
      if (!updated[0]) throw new OptimisticConcurrencyError();
      await this.recordEffects(transaction, actor, command, {
        action: 'appointment.attendance-recorded',
        resourceType: 'Appointment',
        resourceId: appointmentId,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'appointment.attendance-recorded',
        beforeMetadata: { status: current.status, version: current.version },
        payload: { caseId, appointmentId, status: outcome, version: updated[0].version },
      });
      return appointmentId;
    });
    return this.requireAppointment(caseId, resourceId, actor.organizationId);
  }

  async listThreads(caseId: string, userId: string): Promise<readonly MessageThreadRecord[]> {
    const rows = await this.db.$queryRaw<ThreadRow[]>(Prisma.sql`
      SELECT
        t."id", t."case_id", t."subject", t."closed_at", t."created_at", t."updated_at",
        COUNT(m."id")::integer AS "message_count",
        COUNT(m."id") FILTER (
          WHERE m."author_user_id" <> CAST(${userId} AS uuid)
            AND NOT EXISTS (
              SELECT 1 FROM "message_read_receipts" r
              WHERE r."message_id" = m."id" AND r."user_id" = CAST(${userId} AS uuid)
            )
        )::integer AS "unread_count",
        MAX(m."created_at") AS "last_message_at"
      FROM "message_threads" t
      LEFT JOIN "messages" m ON m."thread_id" = t."id"
        AND m."visibility" = 'PARTICIPANTS'
        AND m."deleted_at" IS NULL
      WHERE t."case_id" = CAST(${caseId} AS uuid)
      GROUP BY t."id"
      ORDER BY COALESCE(MAX(m."created_at"), t."created_at") DESC, t."id" DESC
      LIMIT 100
    `);
    return rows.map((row) => ({
      id: row.id,
      caseId: row.case_id,
      encryptedSubject: row.subject,
      closedAt: row.closed_at,
      messageCount: row.message_count,
      unreadCount: row.unread_count,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async createThread(
    caseId: string,
    input: {
      readonly threadId: string;
      readonly encryptedSubject: string;
      readonly messageId: string;
      readonly encryptedBody: string;
      readonly fileAssetIds: readonly string[];
    },
    actor: CollaborationActor,
    command: CollaborationCommand,
  ): Promise<MessageRecord> {
    const resourceId = await this.idempotentResource(actor, command, async (transaction) => {
      await this.assertCaseExists(transaction, caseId);
      await this.assertCleanCaseAttachments(transaction, caseId, input.fileAssetIds);
      await transaction.messageThread.create({
        data: { id: input.threadId, caseId, subject: input.encryptedSubject },
      });
      await transaction.message.create({
        data: {
          id: input.messageId,
          threadId: input.threadId,
          authorUserId: actor.userId,
          visibility: 'PARTICIPANTS',
          encryptedBody: input.encryptedBody,
          attachments: {
            create: input.fileAssetIds.map((fileAssetId) => ({ fileAssetId })),
          },
        },
      });
      await this.recordEffects(transaction, actor, command, {
        action: 'message-thread.created',
        resourceType: 'MessageThread',
        resourceId: input.threadId,
        aggregateType: 'DentalCase',
        aggregateId: caseId,
        eventType: 'message.created',
        payload: {
          caseId,
          threadId: input.threadId,
          messageId: input.messageId,
          authorUserId: actor.userId,
          attachmentCount: input.fileAssetIds.length,
        },
      });
      return input.messageId;
    });
    return this.requireMessageForCase(caseId, resourceId, actor.userId);
  }

  async listMessages(
    caseId: string,
    threadId: string,
    userId: string,
  ): Promise<readonly MessageRecord[]> {
    const thread = await this.db.messageThread.findFirst({
      where: { id: threadId, caseId },
      select: { id: true },
    });
    if (!thread) throw new CaseNotFoundError();
    const messages = await this.db.message.findMany({
      where: { threadId, visibility: 'PARTICIPANTS', deletedAt: null },
      include: {
        attachments: {
          include: {
            fileAsset: {
              select: {
                id: true,
                originalFileName: true,
                declaredMediaType: true,
                detectedMediaType: true,
                sizeBytes: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const readIds = await this.readMessageIds(
      userId,
      messages.map(({ id }) => id),
    );
    return messages.reverse().map((message) => toMessageRecord(message, userId, readIds));
  }

  async sendMessage(
    caseId: string,
    threadId: string,
    input: {
      readonly messageId: string;
      readonly encryptedBody: string;
      readonly fileAssetIds: readonly string[];
    },
    actor: CollaborationActor,
    command: CollaborationCommand,
  ): Promise<MessageRecord> {
    const resourceId = await this.idempotentResource(actor, command, async (transaction) => {
      const thread = await transaction.messageThread.findFirst({
        where: { id: threadId, caseId, closedAt: null },
        select: { id: true },
      });
      if (!thread) throw new CaseNotFoundError();
      await this.assertCleanCaseAttachments(transaction, caseId, input.fileAssetIds);
      await transaction.message.create({
        data: {
          id: input.messageId,
          threadId,
          authorUserId: actor.userId,
          visibility: 'PARTICIPANTS',
          encryptedBody: input.encryptedBody,
          attachments: {
            create: input.fileAssetIds.map((fileAssetId) => ({ fileAssetId })),
          },
        },
      });
      await transaction.messageThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });
      await this.recordEffects(transaction, actor, command, {
        action: 'message.sent',
        resourceType: 'Message',
        resourceId: input.messageId,
        aggregateType: 'MessageThread',
        aggregateId: threadId,
        eventType: 'message.created',
        payload: {
          caseId,
          threadId,
          messageId: input.messageId,
          authorUserId: actor.userId,
          attachmentCount: input.fileAssetIds.length,
        },
      });
      return input.messageId;
    });
    return this.requireMessageForCase(caseId, resourceId, actor.userId);
  }

  async markMessageRead(
    caseId: string,
    threadId: string,
    messageId: string,
    actor: CollaborationActor,
    command: CollaborationCommand,
  ): Promise<{ readonly messageId: string; readonly readAt: Date }> {
    const resourceId = await this.idempotentResource(actor, command, async (transaction) => {
      const message = await transaction.message.findFirst({
        where: {
          id: messageId,
          threadId,
          visibility: 'PARTICIPANTS',
          deletedAt: null,
          thread: { caseId },
        },
        select: { id: true },
      });
      if (!message) throw new CaseNotFoundError();
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "message_read_receipts" ("message_id", "user_id", "read_at")
        VALUES (CAST(${messageId} AS uuid), CAST(${actor.userId} AS uuid), CURRENT_TIMESTAMP)
        ON CONFLICT ("message_id", "user_id") DO NOTHING
      `);
      await this.recordEffects(transaction, actor, command, {
        action: 'message.read',
        resourceType: 'Message',
        resourceId: messageId,
        aggregateType: 'MessageThread',
        aggregateId: threadId,
        eventType: 'message.read',
        payload: { caseId, threadId, messageId, readerUserId: actor.userId },
      });
      return messageId;
    });
    const rows = await this.db.$queryRaw<{ read_at: Date }[]>(Prisma.sql`
      SELECT "read_at" FROM "message_read_receipts"
      WHERE "message_id" = CAST(${resourceId} AS uuid)
        AND "user_id" = CAST(${actor.userId} AS uuid)
      LIMIT 1
    `);
    if (!rows[0]) throw new CaseNotFoundError();
    return { messageId: resourceId, readAt: rows[0].read_at };
  }

  async listInternalNotes(
    caseId: string,
    threadId: string,
    organizationId: string,
  ): Promise<readonly InternalNoteRecord[]> {
    const thread = await this.db.messageThread.findFirst({
      where: { id: threadId, caseId },
      select: { id: true },
    });
    if (!thread) throw new CaseNotFoundError();
    return this.db.internalNote.findMany({
      where: { threadId, organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  async createInternalNote(
    caseId: string,
    threadId: string,
    noteId: string,
    encryptedBody: string,
    actor: CollaborationActor,
    command: CollaborationCommand,
  ): Promise<InternalNoteRecord> {
    if (!actor.organizationId) throw new CaseNotFoundError();
    const organizationId = actor.organizationId;
    const resourceId = await this.idempotentResource(actor, command, async (transaction) => {
      const thread = await transaction.messageThread.findFirst({
        where: { id: threadId, caseId },
        select: { id: true },
      });
      if (!thread) throw new CaseNotFoundError();
      await transaction.internalNote.create({
        data: {
          id: noteId,
          threadId,
          organizationId,
          authorUserId: actor.userId,
          encryptedBody,
        },
      });
      await this.recordEffects(transaction, actor, command, {
        action: 'internal-note.created',
        resourceType: 'InternalNote',
        resourceId: noteId,
        aggregateType: 'MessageThread',
        aggregateId: threadId,
        eventType: 'internal-note.created',
        payload: {
          caseId,
          threadId,
          organizationId,
          internalNoteId: noteId,
          authorUserId: actor.userId,
        },
      });
      return noteId;
    });
    const note = await this.db.internalNote.findFirst({
      where: { id: resourceId, threadId, organizationId, thread: { caseId } },
    });
    if (!note) throw new CaseNotFoundError();
    return note;
  }

  private async requireAppointment(caseId: string, appointmentId: string, organizationId?: string) {
    const appointment = await this.getAppointment(caseId, appointmentId, organizationId);
    if (!appointment) throw new CaseNotFoundError();
    return appointment;
  }

  private async requireMessageForCase(caseId: string, messageId: string, userId: string) {
    const message = await this.db.message.findFirst({
      where: {
        id: messageId,
        visibility: 'PARTICIPANTS',
        deletedAt: null,
        thread: { caseId },
      },
      include: {
        attachments: {
          include: {
            fileAsset: {
              select: {
                id: true,
                originalFileName: true,
                declaredMediaType: true,
                detectedMediaType: true,
                sizeBytes: true,
              },
            },
          },
        },
      },
    });
    if (!message) throw new CaseNotFoundError();
    const readIds = await this.readMessageIds(userId, [message.id]);
    return toMessageRecord(message, userId, readIds);
  }

  private async assertCaseExists(transaction: Prisma.TransactionClient, caseId: string) {
    const dentalCase = await transaction.dentalCase.findFirst({
      where: { id: caseId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      select: { id: true },
    });
    if (!dentalCase) throw new CaseNotFoundError();
  }

  private async assertCleanCaseAttachments(
    transaction: Prisma.TransactionClient,
    caseId: string,
    fileAssetIds: readonly string[],
  ) {
    if (fileAssetIds.length === 0) return;
    const available = await transaction.fileAsset.count({
      where: {
        id: { in: [...fileAssetIds] },
        status: 'AVAILABLE',
        scanStatus: 'CLEAN',
        documents: { some: { caseId } },
      },
    });
    if (available !== fileAssetIds.length) {
      throw new DomainRuleError(
        'MESSAGE_ATTACHMENT_NOT_AVAILABLE',
        'Every message attachment must be a clean, available file belonging to the case.',
      );
    }
  }

  private async assertClinicCaseEligibility(
    database: PrismaClient | Prisma.TransactionClient,
    caseId: string,
    clinicId: string,
    dentistId: string,
    organizationId?: string,
    clinicLocationId?: string,
  ) {
    const organizationPredicate = organizationId
      ? Prisma.sql`AND c."organization_id" = CAST(${organizationId} AS uuid)`
      : Prisma.empty;
    const locationPredicate = clinicLocationId
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "clinic_locations" l
          WHERE l."id" = CAST(${clinicLocationId} AS uuid)
            AND l."clinic_id" = c."id"
            AND l."active" = true
        )`
      : Prisma.empty;
    const rows = await database.$queryRaw<{ allowed: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM "clinics" c
        JOIN "case_assignments" a
          ON a."case_id" = CAST(${caseId} AS uuid)
         AND a."organization_id" = c."organization_id"
         AND a."kind" = 'CLINIC'
         AND a."ended_at" IS NULL
        JOIN "dentist_clinic_affiliations" dca
          ON dca."clinic_id" = c."id"
         AND dca."dentist_id" = CAST(${dentistId} AS uuid)
         AND dca."active" = true
         AND dca."ended_at" IS NULL
        JOIN "dentists" d
          ON d."id" = dca."dentist_id"
         AND d."license_status" = 'VERIFIED'
        WHERE c."id" = CAST(${clinicId} AS uuid)
          AND c."deleted_at" IS NULL
          ${organizationPredicate}
          ${locationPredicate}
      ) AS "allowed"
    `);
    if (!rows[0]?.allowed) {
      throw new DomainRuleError(
        'APPOINTMENT_CLINIC_ASSIGNMENT_INVALID',
        'The clinic and dentist must be actively assigned to the case.',
      );
    }
  }

  private async hasAppointmentConflict(
    database: PrismaClient | Prisma.TransactionClient,
    caseId: string,
    dentistId: string,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId?: string,
  ): Promise<boolean> {
    const exclusion = excludeAppointmentId
      ? Prisma.sql`AND a."id" <> CAST(${excludeAppointmentId} AS uuid)`
      : Prisma.empty;
    const rows = await database.$queryRaw<{ conflict: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "appointments" a
        WHERE a."status" IN ('TENTATIVE', 'CONFIRMED')
          AND (a."dentist_id" = CAST(${dentistId} AS uuid) OR a."case_id" = CAST(${caseId} AS uuid))
          AND tstzrange(a."starts_at", a."ends_at", '[)') && tstzrange(${startsAt}, ${endsAt}, '[)')
          ${exclusion}
      ) AS "conflict"
    `);
    return rows[0]?.conflict ?? true;
  }

  private async hasGovernedAvailabilityConflict(
    database: PrismaClient | Prisma.TransactionClient,
    clinicId: string,
    clinicLocationId: string | undefined,
    dentistId: string,
    kind: AppointmentRecord['kind'],
    startsAt: Date,
    endsAt: Date,
  ): Promise<boolean> {
    const locationId = clinicLocationId ?? null;
    const rows = await database.$queryRaw<{ conflict: boolean }[]>(Prisma.sql`
      WITH clinic_policy AS (
        SELECT p."minimum_notice_minutes", p."maximum_advance_days", p."overbooking_allowed"
        FROM "clinic_scheduling_policies" p
        WHERE p."clinic_id" = CAST(${clinicId} AS uuid)
      ),
      fitting_rule AS (
        SELECT r."capacity"
        FROM "availability_rules" r
        WHERE r."clinic_id" = CAST(${clinicId} AS uuid)
          AND r."active" = true
          AND (r."dentist_id" IS NULL OR r."dentist_id" = CAST(${dentistId} AS uuid))
          AND (CAST(${locationId} AS uuid) IS NULL OR r."location_id" = CAST(${locationId} AS uuid))
          AND r."effective_from" <= (${startsAt} AT TIME ZONE r."timezone")::date
          AND (r."effective_until" IS NULL OR r."effective_until" >= (${startsAt} AT TIME ZONE r."timezone")::date)
          AND r."day_of_week" = EXTRACT(DOW FROM ${startsAt} AT TIME ZONE r."timezone")::integer
          AND (${endsAt} AT TIME ZONE r."timezone")::date = (${startsAt} AT TIME ZONE r."timezone")::date
          AND r."starts_at_minute" <= EXTRACT(HOUR FROM ${startsAt} AT TIME ZONE r."timezone")::integer * 60
            + EXTRACT(MINUTE FROM ${startsAt} AT TIME ZONE r."timezone")::integer
          AND r."ends_at_minute" >= EXTRACT(HOUR FROM ${endsAt} AT TIME ZONE r."timezone")::integer * 60
            + EXTRACT(MINUTE FROM ${endsAt} AT TIME ZONE r."timezone")::integer
          AND (r."slot_kind" = 'BOTH' OR r."slot_kind"::text = CASE
            WHEN CAST(${kind} AS "AppointmentKind") = 'CONSULTATION' THEN 'CONSULTATION'
            ELSE 'TREATMENT'
          END)
        ORDER BY r."capacity" DESC
        LIMIT 1
      ),
      active_rules AS (
        SELECT EXISTS (
          SELECT 1 FROM "availability_rules" r
          WHERE r."clinic_id" = CAST(${clinicId} AS uuid) AND r."active" = true
        ) AS "present"
      ),
      location_load AS (
        SELECT COUNT(*)::integer AS "count"
        FROM "appointments" a
        WHERE CAST(${locationId} AS uuid) IS NOT NULL
          AND a."clinic_location_id" = CAST(${locationId} AS uuid)
          AND a."status" IN ('TENTATIVE', 'CONFIRMED')
          AND tstzrange(a."starts_at", a."ends_at", '[)') && tstzrange(${startsAt}, ${endsAt}, '[)')
      )
      SELECT
        EXISTS (
          SELECT 1 FROM "availability_blocks" b
          WHERE b."clinic_id" = CAST(${clinicId} AS uuid)
            AND b."deleted_at" IS NULL
            AND (b."dentist_id" IS NULL OR b."dentist_id" = CAST(${dentistId} AS uuid))
            AND (b."location_id" IS NULL OR b."location_id" = CAST(${locationId} AS uuid))
            AND tstzrange(b."starts_at", b."ends_at", '[)') && tstzrange(${startsAt}, ${endsAt}, '[)')
        )
        OR EXISTS (
          SELECT 1 FROM clinic_policy p
          WHERE ${startsAt} < CURRENT_TIMESTAMP + make_interval(mins => p."minimum_notice_minutes")
             OR ${startsAt} > CURRENT_TIMESTAMP + make_interval(days => p."maximum_advance_days")
        )
        OR ((SELECT "present" FROM active_rules) AND NOT EXISTS (SELECT 1 FROM fitting_rule))
        OR (
          CAST(${locationId} AS uuid) IS NOT NULL
          AND COALESCE((SELECT "overbooking_allowed" FROM clinic_policy), false) = false
          AND EXISTS (SELECT 1 FROM fitting_rule)
          AND (SELECT "count" FROM location_load) >= (SELECT "capacity" FROM fitting_rule)
        ) AS "conflict"
    `);
    return rows[0]?.conflict ?? true;
  }

  private async assertNoAppointmentConflict(
    database: PrismaClient | Prisma.TransactionClient,
    caseId: string,
    dentistId: string,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId?: string,
  ) {
    if (
      await this.hasAppointmentConflict(
        database,
        caseId,
        dentistId,
        startsAt,
        endsAt,
        excludeAppointmentId,
      )
    ) {
      throw new DomainRuleError(
        'APPOINTMENT_TIME_CONFLICT',
        'The dentist or patient case already has an overlapping active appointment.',
      );
    }
  }

  private async lockAppointment(
    transaction: Prisma.TransactionClient,
    caseId: string,
    appointmentId: string,
  ): Promise<AppointmentRow> {
    const rows = await transaction.$queryRaw<AppointmentRow[]>(Prisma.sql`
      SELECT a.* FROM "appointments" a
      WHERE a."id" = CAST(${appointmentId} AS uuid)
        AND a."case_id" = CAST(${caseId} AS uuid)
      FOR UPDATE
    `);
    if (!rows[0]) throw new CaseNotFoundError();
    return rows[0];
  }

  private async readMessageIds(userId: string, messageIds: readonly string[]) {
    if (messageIds.length === 0) return new Set<string>();
    const rows = await this.db.$queryRaw<{ message_id: string }[]>(Prisma.sql`
      SELECT "message_id" FROM "message_read_receipts"
      WHERE "user_id" = CAST(${userId} AS uuid)
        AND "message_id" IN (${Prisma.join(messageIds.map((id) => Prisma.sql`CAST(${id} AS uuid)`))})
    `);
    return new Set(rows.map(({ message_id }) => message_id));
  }

  private async recordEffects(
    transaction: Prisma.TransactionClient,
    actor: CollaborationActor,
    command: CollaborationCommand,
    effect: {
      readonly action: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly aggregateType: string;
      readonly aggregateId: string;
      readonly eventType: string;
      readonly payload: Prisma.InputJsonValue;
      readonly beforeMetadata?: Prisma.InputJsonValue;
    },
  ) {
    await transaction.auditLog.create({
      data: {
        actorUserId: actor.userId,
        ...(actor.impersonatorUserId ? { impersonatorUserId: actor.impersonatorUserId } : {}),
        ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
        action: effect.action,
        resourceType: effect.resourceType,
        resourceId: effect.resourceId,
        requestId: actor.requestId,
        success: true,
        ...(effect.beforeMetadata ? { beforeMetadata: effect.beforeMetadata } : {}),
        afterMetadata: effect.payload,
      },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: effect.aggregateType,
        aggregateId: effect.aggregateId,
        eventType: effect.eventType,
        payload: effect.payload,
        correlationId: actor.requestId,
        idempotencyKey: `${effect.eventType}:${command.key}`,
      },
    });
  }

  private async idempotentResource(
    actor: CollaborationActor,
    command: CollaborationCommand,
    operation: (transaction: Prisma.TransactionClient) => Promise<string>,
  ): Promise<string> {
    const replay = await this.resolveResourceReplay(actor.userId, command, false);
    if (replay) return replay;
    try {
      return await this.db.$transaction(
        async (transaction) => {
          await transaction.idempotencyRecord.create({
            data: {
              userId: actor.userId,
              key: command.key,
              operation: command.operation,
              requestHash: command.requestHash,
              expiresAt: new Date(Date.now() + commandLifetimeMs),
            },
          });
          const resourceId = await operation(transaction);
          await transaction.idempotencyRecord.update({
            where: { userId_key: { userId: actor.userId, key: command.key } },
            data: {
              status: 'COMPLETED',
              resourceId,
              response: { resourceId },
              completedAt: new Date(),
            },
          });
          return resourceId;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isIdempotencyInsertRace(error)) {
        const raced = await this.resolveResourceReplay(actor.userId, command, true);
        if (raced) return raced;
      }
      if (isPrismaCode(error, 'P2034')) {
        throw new IdempotencyConflictError('The command conflicted with another transaction.');
      }
      if (isPostgresExclusionViolation(error)) {
        throw new DomainRuleError(
          'APPOINTMENT_TIME_CONFLICT',
          'The dentist or patient case already has an overlapping active appointment.',
        );
      }
      throw error;
    }
  }

  private async resolveResourceReplay(
    userId: string,
    command: CollaborationCommand,
    wait: boolean,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < (wait ? 25 : 1); attempt += 1) {
      const record = await this.db.idempotencyRecord.findUnique({
        where: { userId_key: { userId, key: command.key } },
      });
      if (!record) {
        if (!wait) return null;
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      if (record.operation !== command.operation || record.requestHash !== command.requestHash) {
        throw new IdempotencyConflictError('The idempotency key was used for a different command.');
      }
      if (record.expiresAt <= new Date()) {
        await this.db.idempotencyRecord.deleteMany({
          where: { id: record.id, expiresAt: { lte: new Date() } },
        });
        return null;
      }
      if (record.status === 'COMPLETED' && record.resourceId) return record.resourceId;
      if (!wait) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new IdempotencyConflictError('The original command is still in progress.');
  }
}

function assertMutableAppointment(current: AppointmentRow, expectedVersion: number) {
  if (current.version !== expectedVersion) throw new OptimisticConcurrencyError();
  if (current.status !== 'TENTATIVE' && current.status !== 'CONFIRMED') {
    throw new DomainRuleError(
      'APPOINTMENT_MUTATION_INVALID_STATE',
      'Only an active appointment can be rescheduled or cancelled.',
    );
  }
}

function toAppointmentRecord(row: AppointmentRow): AppointmentRecord {
  return {
    id: row.id,
    caseId: row.case_id,
    clinicId: row.clinic_id,
    clinicLocationId: row.clinic_location_id,
    dentistId: row.dentist_id,
    kind: row.kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    timezone: row.timezone,
    version: row.version,
    meetingProvider: row.meeting_provider,
    encryptedJoinUrl: row.encrypted_join_url,
    encryptedCancellationReason: row.cancellation_reason,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessageRecord(
  message: MessageWithAttachments,
  userId: string,
  readIds: ReadonlySet<string>,
): MessageRecord {
  return {
    id: message.id,
    threadId: message.threadId,
    authorUserId: message.authorUserId,
    encryptedBody: message.encryptedBody,
    readByCurrentUser: message.authorUserId === userId || readIds.has(message.id),
    attachments: message.attachments.map(({ fileAsset }) => ({
      fileAssetId: fileAsset.id,
      originalFileName: fileAsset.originalFileName,
      mediaType: fileAsset.detectedMediaType ?? fileAsset.declaredMediaType,
      sizeBytes: Number(fileAsset.sizeBytes),
    })),
    createdAt: message.createdAt,
    editedAt: message.editedAt,
  };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

function isIdempotencyInsertRace(error: unknown): boolean {
  if (!isPrismaCode(error, 'P2002') || !error || typeof error !== 'object' || !('meta' in error)) {
    return false;
  }
  const target = (error as { readonly meta?: { readonly target?: unknown } }).meta?.target;
  return Array.isArray(target)
    ? target.includes('user_id') && target.includes('key')
    : String(target).includes('idempotency_records');
}

function isPostgresExclusionViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const meta = 'meta' in error ? (error as { readonly meta?: unknown }).meta : undefined;
  return isPrismaCode(error, 'P2010') && JSON.stringify(meta).includes('23P01');
}
