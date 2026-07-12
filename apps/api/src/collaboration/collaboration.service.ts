import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import type { AccessContext, CaseAccessResource } from '@dental-trust/auth';
import type {
  AppointmentAvailabilityQuery,
  AppointmentAvailabilityView,
  AppointmentView,
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  CreateInternalNoteRequest,
  CreateMessageThreadRequest,
  InternalNoteView,
  MessageThreadView,
  MessageView,
  RecordAttendanceRequest,
  RescheduleAppointmentRequest,
  SchedulingContextView,
  SendMessageRequest,
} from '@dental-trust/contracts';
import type { ServerEnvironment } from '@dental-trust/config/server';
import {
  SchedulingMessagingRepository,
  type AppointmentRecord,
  type CollaborationActor,
  type CollaborationCommand,
  type InternalNoteRecord,
  type MessageRecord,
  type MessageThreadRecord,
  type PrismaClient,
} from '@dental-trust/database';
import { DomainRuleError } from '@dental-trust/domain';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { MEETING_PROVIDER, PRISMA, SERVER_ENV } from '../common/tokens.js';
import type { MeetingProvider } from '../infrastructure/providers/meeting.provider.js';
import {
  assertAppointmentAttendanceAccess,
  assertAppointmentCreateAccess,
  assertAppointmentMutationAccess,
  assertAppointmentReadAccess,
  assertInternalNoteAccess,
  assertMessageParticipantAccess,
} from './collaboration.policy.js';

@Injectable()
export class CollaborationService {
  private readonly workflows: SchedulingMessagingRepository;
  private readonly cipher: SensitiveFieldCipher;

  constructor(
    @Inject(PRISMA) database: PrismaClient,
    @Inject(MEETING_PROVIDER) private readonly meetingProvider: MeetingProvider,
    @Inject(SERVER_ENV) environment: ServerEnvironment,
  ) {
    this.workflows = new SchedulingMessagingRepository(database);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
  }

  async listAppointments(
    access: AccessContext,
    caseId: string,
  ): Promise<{
    readonly appointments: readonly AppointmentView[];
    readonly schedulingContext: SchedulingContextView | null;
  }> {
    const resource = await this.resource(caseId);
    assertAppointmentReadAccess(access, resource);
    const schedulingContext = access.selectedOrganizationId
      ? await this.workflows.loadSchedulingContext(caseId, access.selectedOrganizationId)
      : null;
    return {
      appointments: (
        await this.workflows.listAppointments(caseId, access.selectedOrganizationId)
      ).map((record) => this.appointmentView(record)),
      schedulingContext: schedulingContext
        ? {
            clinicId: schedulingContext.clinicId,
            clinicName: schedulingContext.clinicName,
            dentists: schedulingContext.dentists.map((dentist) => ({ ...dentist })),
            locations: schedulingContext.locations.map((location) => ({ ...location })),
          }
        : null,
    };
  }

  async checkAvailability(
    access: AccessContext,
    caseId: string,
    query: AppointmentAvailabilityQuery,
  ): Promise<AppointmentAvailabilityView> {
    const resource = await this.resource(caseId);
    assertAppointmentReadAccess(access, resource);
    const startsAt = new Date(query.startsAt);
    const endsAt = new Date(query.endsAt);
    return {
      caseId,
      clinicId: query.clinicId,
      clinicLocationId: query.clinicLocationId ?? null,
      dentistId: query.dentistId,
      startsAt: query.startsAt,
      endsAt: query.endsAt,
      available: await this.workflows.isAppointmentWindowAvailable(
        caseId,
        query.clinicId,
        query.dentistId,
        query.clinicLocationId,
        query.kind,
        startsAt,
        endsAt,
        access.selectedOrganizationId,
      ),
    };
  }

  async createAppointment(
    access: AccessContext,
    caseId: string,
    input: CreateAppointmentRequest,
    idempotencyKey: string,
  ): Promise<AppointmentView> {
    const resource = await this.resource(caseId);
    const organizationId = assertAppointmentCreateAccess(access, resource);
    assertFutureWindow(input.startsAt);
    const appointmentId = randomUUID();
    let meetingProvider: string | null = null;
    let encryptedJoinUrl: string | null = null;
    if (input.kind === 'CONSULTATION') {
      try {
        const meeting = await this.meetingProvider.resolveJoinLink({
          appointmentId,
          ...(input.meetingJoinUrl ? { manualJoinUrl: input.meetingJoinUrl } : {}),
        });
        meetingProvider = meeting.provider;
        encryptedJoinUrl = this.cipher.encrypt(
          meeting.joinUrl,
          `appointment:${appointmentId}:join-url`,
        );
      } catch {
        throw new ServiceUnavailableException('A meeting link could not be provisioned safely.');
      }
    } else if (input.meetingJoinUrl) {
      throw new DomainRuleError(
        'APPOINTMENT_MEETING_NOT_ALLOWED',
        'Clinical visits cannot contain a remote meeting link.',
      );
    }
    const record = await this.workflows.createAppointment(
      caseId,
      {
        id: appointmentId,
        clinicId: input.clinicId,
        clinicLocationId: input.clinicLocationId ?? null,
        dentistId: input.dentistId,
        kind: input.kind,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        timezone: input.timezone,
        meetingProvider,
        encryptedJoinUrl,
      },
      actor(access, organizationId),
      command(idempotencyKey, 'appointment.create', { caseId, input }),
    );
    return this.appointmentView(record);
  }

  async rescheduleAppointment(
    access: AccessContext,
    caseId: string,
    appointmentId: string,
    input: RescheduleAppointmentRequest,
    idempotencyKey: string,
  ): Promise<AppointmentView> {
    const resource = await this.resource(caseId);
    const organizationId = assertAppointmentMutationAccess(access, resource);
    assertFutureWindow(input.startsAt);
    const record = await this.workflows.rescheduleAppointment(
      caseId,
      appointmentId,
      {
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        timezone: input.timezone,
        expectedVersion: input.expectedVersion,
      },
      actor(access, organizationId),
      command(idempotencyKey, 'appointment.reschedule', { caseId, appointmentId, input }),
    );
    return this.appointmentView(record);
  }

  async cancelAppointment(
    access: AccessContext,
    caseId: string,
    appointmentId: string,
    input: CancelAppointmentRequest,
    idempotencyKey: string,
  ): Promise<AppointmentView> {
    const resource = await this.resource(caseId);
    const organizationId = assertAppointmentMutationAccess(access, resource);
    const record = await this.workflows.cancelAppointment(
      caseId,
      appointmentId,
      input.expectedVersion,
      this.cipher.encrypt(input.reason, `appointment:${appointmentId}:cancellation-reason`),
      actor(access, organizationId),
      command(idempotencyKey, 'appointment.cancel', { caseId, appointmentId, input }),
    );
    return this.appointmentView(record);
  }

  async recordAttendance(
    access: AccessContext,
    caseId: string,
    appointmentId: string,
    input: RecordAttendanceRequest,
    idempotencyKey: string,
  ): Promise<AppointmentView> {
    const resource = await this.resource(caseId);
    const organizationId = assertAppointmentAttendanceAccess(access, resource);
    const record = await this.workflows.recordAttendance(
      caseId,
      appointmentId,
      input.expectedVersion,
      input.outcome,
      actor(access, organizationId),
      command(idempotencyKey, 'appointment.attendance', { caseId, appointmentId, input }),
    );
    return this.appointmentView(record);
  }

  async listThreads(access: AccessContext, caseId: string): Promise<readonly MessageThreadView[]> {
    const resource = await this.resource(caseId);
    assertMessageParticipantAccess(access, resource);
    return (await this.workflows.listThreads(caseId, access.userId)).map((record) =>
      this.threadView(record),
    );
  }

  async createThread(
    access: AccessContext,
    caseId: string,
    input: CreateMessageThreadRequest,
    idempotencyKey: string,
  ): Promise<MessageView> {
    const resource = await this.resource(caseId);
    const organizationId = assertMessageParticipantAccess(access, resource);
    const threadId = randomUUID();
    const messageId = randomUUID();
    const record = await this.workflows.createThread(
      caseId,
      {
        threadId,
        encryptedSubject: this.cipher.encrypt(
          input.threadSubject,
          `message-thread:${threadId}:subject`,
        ),
        messageId,
        encryptedBody: this.cipher.encrypt(input.messageBody, `message:${messageId}:body`),
        fileAssetIds: input.fileAssetIds,
      },
      actor(access, organizationId),
      command(idempotencyKey, 'message-thread.create', { caseId, input }),
    );
    return this.messageView(record);
  }

  async listMessages(
    access: AccessContext,
    caseId: string,
    threadId: string,
  ): Promise<readonly MessageView[]> {
    const resource = await this.resource(caseId);
    assertMessageParticipantAccess(access, resource);
    return (await this.workflows.listMessages(caseId, threadId, access.userId)).map((record) =>
      this.messageView(record),
    );
  }

  async sendMessage(
    access: AccessContext,
    caseId: string,
    threadId: string,
    input: SendMessageRequest,
    idempotencyKey: string,
  ): Promise<MessageView> {
    const resource = await this.resource(caseId);
    const organizationId = assertMessageParticipantAccess(access, resource);
    const messageId = randomUUID();
    const record = await this.workflows.sendMessage(
      caseId,
      threadId,
      {
        messageId,
        encryptedBody: this.cipher.encrypt(input.messageBody, `message:${messageId}:body`),
        fileAssetIds: input.fileAssetIds,
      },
      actor(access, organizationId),
      command(idempotencyKey, 'message.send', { caseId, threadId, input }),
    );
    return this.messageView(record);
  }

  async markMessageRead(
    access: AccessContext,
    caseId: string,
    threadId: string,
    messageId: string,
    idempotencyKey: string,
  ) {
    const resource = await this.resource(caseId);
    const organizationId = assertMessageParticipantAccess(access, resource);
    const receipt = await this.workflows.markMessageRead(
      caseId,
      threadId,
      messageId,
      actor(access, organizationId),
      command(idempotencyKey, 'message.mark-read', { caseId, threadId, messageId }),
    );
    return { messageId: receipt.messageId, readAt: receipt.readAt.toISOString() };
  }

  async listInternalNotes(
    access: AccessContext,
    caseId: string,
    threadId: string,
  ): Promise<readonly InternalNoteView[]> {
    const resource = await this.resource(caseId);
    const organizationId = assertInternalNoteAccess(access, resource);
    return (await this.workflows.listInternalNotes(caseId, threadId, organizationId)).map(
      (record) => this.internalNoteView(record),
    );
  }

  async createInternalNote(
    access: AccessContext,
    caseId: string,
    threadId: string,
    input: CreateInternalNoteRequest,
    idempotencyKey: string,
  ): Promise<InternalNoteView> {
    const resource = await this.resource(caseId);
    const organizationId = assertInternalNoteAccess(access, resource);
    const noteId = randomUUID();
    const record = await this.workflows.createInternalNote(
      caseId,
      threadId,
      noteId,
      this.cipher.encrypt(input.internalNote, `internal-note:${noteId}:body`),
      actor(access, organizationId),
      command(idempotencyKey, 'internal-note.create', { caseId, threadId, input }),
    );
    return this.internalNoteView(record);
  }

  private async resource(caseId: string): Promise<CaseAccessResource> {
    const resource = await this.workflows.loadCaseAccessResource(caseId);
    if (!resource) throw new NotFoundException();
    return resource;
  }

  private appointmentView(record: AppointmentRecord): AppointmentView {
    return {
      id: record.id,
      caseId: record.caseId,
      clinicId: record.clinicId,
      clinicLocationId: record.clinicLocationId,
      dentistId: record.dentistId,
      kind: record.kind,
      startsAt: record.startsAt.toISOString(),
      endsAt: record.endsAt.toISOString(),
      timezone: record.timezone,
      status: record.status,
      version: record.version,
      meetingProvider: record.meetingProvider,
      meetingJoinUrl: record.encryptedJoinUrl
        ? this.cipher.decrypt(record.encryptedJoinUrl, `appointment:${record.id}:join-url`)
        : null,
      cancellationReason: record.encryptedCancellationReason
        ? this.cipher.decrypt(
            record.encryptedCancellationReason,
            `appointment:${record.id}:cancellation-reason`,
          )
        : null,
      cancelledAt: record.cancelledAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private threadView(record: MessageThreadRecord): MessageThreadView {
    return {
      id: record.id,
      caseId: record.caseId,
      threadSubject: this.cipher.decrypt(
        record.encryptedSubject,
        `message-thread:${record.id}:subject`,
      ),
      closedAt: record.closedAt?.toISOString() ?? null,
      messageCount: record.messageCount,
      unreadCount: record.unreadCount,
      lastMessageAt: record.lastMessageAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private messageView(record: MessageRecord): MessageView {
    return {
      id: record.id,
      threadId: record.threadId,
      authorUserId: record.authorUserId,
      messageBody: this.cipher.decrypt(record.encryptedBody, `message:${record.id}:body`),
      readByCurrentUser: record.readByCurrentUser,
      attachments: [...record.attachments],
      createdAt: record.createdAt.toISOString(),
      editedAt: record.editedAt?.toISOString() ?? null,
    };
  }

  private internalNoteView(record: InternalNoteRecord): InternalNoteView {
    return {
      id: record.id,
      threadId: record.threadId,
      authorUserId: record.authorUserId,
      internalNote: this.cipher.decrypt(record.encryptedBody, `internal-note:${record.id}:body`),
      createdAt: record.createdAt.toISOString(),
    };
  }
}

function assertFutureWindow(startsAt: string, now = new Date()): void {
  if (new Date(startsAt).getTime() <= now.getTime()) {
    throw new DomainRuleError(
      'APPOINTMENT_MUST_BE_FUTURE',
      'An appointment must start in the future.',
    );
  }
}

function actor(access: AccessContext, organizationId?: string): CollaborationActor {
  return {
    userId: access.userId,
    sessionId: access.sessionId,
    requestId: access.requestId,
    ...(organizationId ? { organizationId } : {}),
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}

function command(
  key: string,
  operation: string,
  request: Readonly<Record<string, unknown>>,
): CollaborationCommand {
  return { key, operation, requestHash: sha256(JSON.stringify(request)) };
}
