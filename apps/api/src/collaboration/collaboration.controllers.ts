import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  appointmentAvailabilityQuerySchema,
  cancelAppointmentRequestSchema,
  createAppointmentRequestSchema,
  createInternalNoteRequestSchema,
  createMessageThreadRequestSchema,
  idempotencyKeySchema,
  markMessageReadRequestSchema,
  recordAttendanceRequestSchema,
  rescheduleAppointmentRequestSchema,
  sendMessageRequestSchema,
  type AppointmentAvailabilityQuery,
  type CancelAppointmentRequest,
  type CreateAppointmentRequest,
  type CreateInternalNoteRequest,
  type CreateMessageThreadRequest,
  type MarkMessageReadRequest,
  type RecordAttendanceRequest,
  type RescheduleAppointmentRequest,
  type SendMessageRequest,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CollaborationService } from './collaboration.service.js';

const uuidSchema = z.uuid();

@Controller('cases/:caseId/appointments')
@UseGuards(SessionAuthGuard)
export class AppointmentsController {
  constructor(@Inject(CollaborationService) private readonly collaboration: CollaborationService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return {
      data: await this.collaboration.listAppointments(access, caseId),
      requestId: access.requestId,
    };
  }

  @Get('availability')
  async availability(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Query(new ZodValidationPipe(appointmentAvailabilityQuerySchema))
    query: AppointmentAvailabilityQuery,
  ) {
    return {
      data: await this.collaboration.checkAvailability(access, caseId, query),
      requestId: access.requestId,
    };
  }

  @Post()
  async create(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(createAppointmentRequestSchema)) body: CreateAppointmentRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.collaboration.createAppointment(access, caseId, body, key),
      requestId: access.requestId,
    };
  }

  @Post(':appointmentId/reschedule')
  async reschedule(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('appointmentId', new ZodValidationPipe(uuidSchema)) appointmentId: string,
    @Body(new ZodValidationPipe(rescheduleAppointmentRequestSchema))
    body: RescheduleAppointmentRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.collaboration.rescheduleAppointment(
        access,
        caseId,
        appointmentId,
        body,
        key,
      ),
      requestId: access.requestId,
    };
  }

  @Post(':appointmentId/cancel')
  async cancel(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('appointmentId', new ZodValidationPipe(uuidSchema)) appointmentId: string,
    @Body(new ZodValidationPipe(cancelAppointmentRequestSchema)) body: CancelAppointmentRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.collaboration.cancelAppointment(access, caseId, appointmentId, body, key),
      requestId: access.requestId,
    };
  }

  @Post(':appointmentId/attendance')
  async attendance(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('appointmentId', new ZodValidationPipe(uuidSchema)) appointmentId: string,
    @Body(new ZodValidationPipe(recordAttendanceRequestSchema)) body: RecordAttendanceRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.collaboration.recordAttendance(access, caseId, appointmentId, body, key),
      requestId: access.requestId,
    };
  }
}

@Controller('cases/:caseId/threads')
@UseGuards(SessionAuthGuard)
export class MessageThreadsController {
  constructor(@Inject(CollaborationService) private readonly collaboration: CollaborationService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return {
      data: { threads: await this.collaboration.listThreads(access, caseId) },
      requestId: access.requestId,
    };
  }

  @Post()
  async create(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(createMessageThreadRequestSchema))
    body: CreateMessageThreadRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.collaboration.createThread(access, caseId, body, key),
      requestId: access.requestId,
    };
  }
}

@Controller('cases/:caseId/threads/:threadId/messages')
@UseGuards(SessionAuthGuard)
export class MessagesController {
  constructor(@Inject(CollaborationService) private readonly collaboration: CollaborationService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('threadId', new ZodValidationPipe(uuidSchema)) threadId: string,
  ) {
    return {
      data: { messages: await this.collaboration.listMessages(access, caseId, threadId) },
      requestId: access.requestId,
    };
  }

  @Post()
  async send(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('threadId', new ZodValidationPipe(uuidSchema)) threadId: string,
    @Body(new ZodValidationPipe(sendMessageRequestSchema)) body: SendMessageRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.collaboration.sendMessage(access, caseId, threadId, body, key),
      requestId: access.requestId,
    };
  }

  @Post('read')
  async markRead(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('threadId', new ZodValidationPipe(uuidSchema)) threadId: string,
    @Body(new ZodValidationPipe(markMessageReadRequestSchema)) body: MarkMessageReadRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.collaboration.markMessageRead(access, caseId, threadId, body.messageId, key),
      requestId: access.requestId,
    };
  }
}

@Controller('cases/:caseId/threads/:threadId/internal-notes')
@UseGuards(SessionAuthGuard)
export class InternalNotesController {
  constructor(@Inject(CollaborationService) private readonly collaboration: CollaborationService) {}

  @Get()
  async list(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('threadId', new ZodValidationPipe(uuidSchema)) threadId: string,
  ) {
    return {
      data: { internalNotes: await this.collaboration.listInternalNotes(access, caseId, threadId) },
      requestId: access.requestId,
    };
  }

  @Post()
  async create(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('threadId', new ZodValidationPipe(uuidSchema)) threadId: string,
    @Body(new ZodValidationPipe(createInternalNoteRequestSchema)) body: CreateInternalNoteRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    const key = parseWithSchema(idempotencyKeySchema, rawKey);
    return {
      data: await this.collaboration.createInternalNote(access, caseId, threadId, body, key),
      requestId: access.requestId,
    };
  }
}
