import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  calculateMatchesRequestSchema,
  conciergeAssignmentRequestSchema,
  conciergeCommunicationRequestSchema,
  conciergeHandoffAcceptRequestSchema,
  conciergeHandoffRequestSchema,
  conciergeInternalNoteRequestSchema,
  conciergeQueueQuerySchema,
  conciergeSupervisorReviewRequestSchema,
  conciergeTaskRequestSchema,
  conciergeTaskTransitionRequestSchema,
  conciergeTravelNoteRequestSchema,
  conciergeWorkspaceUpdateSchema,
  idempotencyKeySchema,
  introductionRequestSchema,
  matchingCriteriaRequestSchema,
  paginationQuerySchema,
  saveClinicRequestSchema,
  shortlistInterestRequestSchema,
  shortlistRecommendationRequestSchema,
  type CalculateMatchesRequest,
  type ConciergeAssignmentRequest,
  type ConciergeCommunicationRequest,
  type ConciergeHandoffAcceptRequest,
  type ConciergeHandoffRequest,
  type ConciergeInternalNoteRequest,
  type ConciergeQueueQuery,
  type ConciergeSupervisorReviewRequest,
  type ConciergeTaskRequest,
  type ConciergeTaskTransitionRequest,
  type ConciergeTravelNoteRequest,
  type ConciergeWorkspaceUpdate,
  type IntroductionRequest,
  type MatchingCriteriaRequest,
  type SaveClinicRequest,
  type ShortlistInterestRequest,
  type ShortlistRecommendationRequest,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MatchingConciergeService } from './matching-concierge.service.js';

const uuidSchema = z.uuid();
const savedQuerySchema = paginationQuerySchema.extend({ cursor: uuidSchema.optional() });
const matchesQuerySchema = z.object({ criteriaVersionId: uuidSchema.optional() });
const consentQuerySchema = z.object({ locale: z.enum(['vi-VN', 'en-US']).default('vi-VN') });

@Controller()
@UseGuards(SessionAuthGuard)
export class PatientMatchingController {
  constructor(
    @Inject(MatchingConciergeService) private readonly matching: MatchingConciergeService,
  ) {}

  @Get('saved-clinics')
  async savedClinics(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(savedQuerySchema))
    query: z.infer<typeof savedQuerySchema>,
  ) {
    const page = await this.matching.listSaved(access, query.limit, query.cursor);
    return {
      data: page.data,
      page: { count: page.data.length, nextCursor: page.nextCursor },
      requestId: access.requestId,
    };
  }

  @Post('saved-clinics')
  async saveClinic(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(saveClinicRequestSchema)) body: SaveClinicRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.matching.saveClinic(access, body.clinicId, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Delete('saved-clinics/:savedClinicId')
  async removeSavedClinic(
    @CurrentAccess() access: AccessContext,
    @Param('savedClinicId', new ZodValidationPipe(uuidSchema)) savedClinicId: string,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.matching.removeSaved(access, savedClinicId, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Get('matching/introduction-consent')
  async introductionConsent(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(consentQuerySchema))
    query: z.infer<typeof consentQuerySchema>,
  ) {
    return {
      data: await this.matching.introductionConsent(access, query.locale),
      requestId: access.requestId,
    };
  }

  @Get('cases/:caseId/matching/criteria')
  async criteria(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return { data: await this.matching.listCriteria(access, caseId), requestId: access.requestId };
  }

  @Post('cases/:caseId/matching/criteria')
  async createCriteria(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(matchingCriteriaRequestSchema)) body: MatchingCriteriaRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.matching.createCriteria(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/matching/runs')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async calculate(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(calculateMatchesRequestSchema)) body: CalculateMatchesRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.matching.calculateMatches(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Get('cases/:caseId/matches')
  async matches(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Query(new ZodValidationPipe(matchesQuerySchema)) query: z.infer<typeof matchesQuerySchema>,
  ) {
    return {
      data: await this.matching.listMatches(access, caseId, query.criteriaVersionId),
      requestId: access.requestId,
    };
  }

  @Get('cases/:caseId/shortlist')
  async shortlist(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return {
      data: await this.matching.patientShortlist(access, caseId),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/shortlist/:entryId/interest')
  async interest(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('entryId', new ZodValidationPipe(uuidSchema)) entryId: string,
    @Body(new ZodValidationPipe(shortlistInterestRequestSchema)) body: ShortlistInterestRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.matching.setInterest(access, caseId, entryId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/shortlist/:entryId/introduction-requests')
  async requestIntroduction(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('entryId', new ZodValidationPipe(uuidSchema)) entryId: string,
    @Body(new ZodValidationPipe(introductionRequestSchema)) body: IntroductionRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.matching.requestIntroduction(
        access,
        caseId,
        entryId,
        body,
        idempotencyKey(rawKey),
      ),
      requestId: access.requestId,
    };
  }
}

@Controller('concierge')
@UseGuards(SessionAuthGuard)
export class ConciergeController {
  constructor(
    @Inject(MatchingConciergeService) private readonly concierge: MatchingConciergeService,
  ) {}

  @Get('dashboard')
  async dashboard(@CurrentAccess() access: AccessContext) {
    return { data: await this.concierge.dashboard(access), requestId: access.requestId };
  }

  @Get('queue')
  async queue(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(conciergeQueueQuerySchema)) query: ConciergeQueueQuery,
  ) {
    const page = await this.concierge.queue(access, query);
    return {
      data: page.data,
      page: { count: page.data.length, nextCursor: page.nextCursor },
      requestId: access.requestId,
    };
  }

  @Get('cases/:caseId')
  async detail(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
  ) {
    return { data: await this.concierge.detail(access, caseId), requestId: access.requestId };
  }

  @Post('cases/:caseId/assignment')
  async assign(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(conciergeAssignmentRequestSchema)) body: ConciergeAssignmentRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.assign(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Patch('cases/:caseId/workspace')
  async updateWorkspace(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(conciergeWorkspaceUpdateSchema)) body: ConciergeWorkspaceUpdate,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.updateWorkspace(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Put('cases/:caseId/recommendations')
  async recommendations(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(shortlistRecommendationRequestSchema))
    body: ShortlistRecommendationRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.updateShortlist(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/internal-notes')
  async note(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(conciergeInternalNoteRequestSchema))
    body: ConciergeInternalNoteRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.addInternalNote(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/travel-notes')
  async travelNote(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(conciergeTravelNoteRequestSchema))
    body: ConciergeTravelNoteRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.addTravelNote(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/communications')
  async communication(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(conciergeCommunicationRequestSchema))
    body: ConciergeCommunicationRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.addCommunication(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/tasks')
  async task(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(conciergeTaskRequestSchema)) body: ConciergeTaskRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.createTask(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/tasks/:taskId/transitions')
  async transitionTask(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('taskId', new ZodValidationPipe(uuidSchema)) taskId: string,
    @Body(new ZodValidationPipe(conciergeTaskTransitionRequestSchema))
    body: ConciergeTaskTransitionRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.transitionTask(
        access,
        caseId,
        taskId,
        body,
        idempotencyKey(rawKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/handoffs')
  async handoff(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(conciergeHandoffRequestSchema)) body: ConciergeHandoffRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.handoff(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/handoffs/:handoffId/accept')
  async acceptHandoff(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Param('handoffId', new ZodValidationPipe(uuidSchema)) handoffId: string,
    @Body(new ZodValidationPipe(conciergeHandoffAcceptRequestSchema))
    body: ConciergeHandoffAcceptRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.acceptHandoff(
        access,
        caseId,
        handoffId,
        body,
        idempotencyKey(rawKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/supervisor-reviews')
  async supervisorReview(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(conciergeSupervisorReviewRequestSchema))
    body: ConciergeSupervisorReviewRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return {
      data: await this.concierge.supervisorReview(access, caseId, body, idempotencyKey(rawKey)),
      requestId: access.requestId,
    };
  }
}

function idempotencyKey(raw: string | undefined): string {
  return parseWithSchema(idempotencyKeySchema, raw);
}
