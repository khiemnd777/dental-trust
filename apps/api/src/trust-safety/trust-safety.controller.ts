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
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import type { AccessContext } from '@dental-trust/auth';
import {
  closeIncidentRequestSchema,
  type CloseIncidentRequest,
  createPrivacyLegalHoldRequestSchema,
  type CreatePrivacyLegalHoldRequest,
  decideReviewAbuseReportRequestSchema,
  type DecideReviewAbuseReportRequest,
  createClinicReviewResponseRequestSchema,
  type CreateClinicReviewResponseRequest,
  createIncidentRequestSchema,
  type CreateIncidentRequest,
  createPrivacyRequestSchema,
  type CreatePrivacyRequest,
  createSupportElevationRequestSchema,
  type CreateSupportElevationRequest,
  createVerifiedReviewRequestSchema,
  type CreateVerifiedReviewRequest,
  createWarrantyClaimRequestSchema,
  type CreateWarrantyClaimRequest,
  idempotencyKeySchema,
  incidentListQuerySchema,
  type IncidentListQuery,
  incidentPatientUpdateRequestSchema,
  type IncidentPatientUpdateRequest,
  moderateReviewRequestSchema,
  type ModerateReviewRequest,
  paginationQuerySchema,
  privacyRequestListQuerySchema,
  type PrivacyRequestListQuery,
  privacyLegalHoldListQuerySchema,
  type PrivacyLegalHoldListQuery,
  processPrivacyRequestSchema,
  type ProcessPrivacyRequest,
  releasePrivacyLegalHoldRequestSchema,
  type ReleasePrivacyLegalHoldRequest,
  reopenIncidentRequestSchema,
  type ReopenIncidentRequest,
  reportReviewAbuseRequestSchema,
  type ReportReviewAbuseRequest,
  reviewAbuseReportListQuerySchema,
  type ReviewAbuseReportListQuery,
  reviewListQuerySchema,
  type ReviewListQuery,
  revokeSupportElevationRequestSchema,
  type RevokeSupportElevationRequest,
  retryPrivacyExecutionRequestSchema,
  type RetryPrivacyExecutionRequest,
  triageIncidentRequestSchema,
  type TriageIncidentRequest,
} from '@dental-trust/contracts';
import {
  incidentClinicResponseRequestSchema,
  type IncidentClinicResponseRequest,
  incidentInternalNoteRequestSchema,
  type IncidentInternalNoteRequest,
} from '@dental-trust/contracts/trust-safety-workflows';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TrustSafetyService } from './trust-safety.service.js';

const uuidParameterSchema = z.uuid();

@Controller('trust')
@UseGuards(SessionAuthGuard)
export class TrustSafetyController {
  constructor(@Inject(TrustSafetyService) private readonly trust: TrustSafetyService) {}

  @Post('incidents')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createIncident(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createIncidentRequestSchema)) body: CreateIncidentRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.createIncident(access, body, idempotencyKey(rawIdempotencyKey)),
      requestId: access.requestId,
    };
  }

  @Post('cases/:caseId/warranty-claims')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createWarrantyClaim(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidParameterSchema)) caseId: string,
    @Body(new ZodValidationPipe(createWarrantyClaimRequestSchema))
    body: CreateWarrantyClaimRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.createWarrantyClaim(
        access,
        caseId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Get('incidents')
  async listIncidents(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(incidentListQuerySchema)) query: IncidentListQuery,
  ) {
    const page = await this.trust.listIncidents(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Get('incidents/:incidentId')
  async getIncident(
    @CurrentAccess() access: AccessContext,
    @Param('incidentId', new ZodValidationPipe(uuidParameterSchema)) incidentId: string,
  ) {
    return { data: await this.trust.getIncident(access, incidentId), requestId: access.requestId };
  }

  @Post('incidents/:incidentId/updates')
  async addIncidentUpdate(
    @CurrentAccess() access: AccessContext,
    @Param('incidentId', new ZodValidationPipe(uuidParameterSchema)) incidentId: string,
    @Body(new ZodValidationPipe(incidentPatientUpdateRequestSchema))
    body: IncidentPatientUpdateRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.addIncidentUpdate(
        access,
        incidentId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('incidents/:incidentId/clinic-responses')
  async addClinicResponse(
    @CurrentAccess() access: AccessContext,
    @Param('incidentId', new ZodValidationPipe(uuidParameterSchema)) incidentId: string,
    @Body(new ZodValidationPipe(incidentClinicResponseRequestSchema))
    body: IncidentClinicResponseRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.addClinicResponse(
        access,
        incidentId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('incidents/:incidentId/internal-notes')
  async addIncidentInternalNote(
    @CurrentAccess() access: AccessContext,
    @Param('incidentId', new ZodValidationPipe(uuidParameterSchema)) incidentId: string,
    @Body(new ZodValidationPipe(incidentInternalNoteRequestSchema))
    body: IncidentInternalNoteRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.addIncidentInternalNote(
        access,
        incidentId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('incidents/:incidentId/triage')
  async triageIncident(
    @CurrentAccess() access: AccessContext,
    @Param('incidentId', new ZodValidationPipe(uuidParameterSchema)) incidentId: string,
    @Body(new ZodValidationPipe(triageIncidentRequestSchema)) body: TriageIncidentRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.triageIncident(
        access,
        incidentId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('incidents/:incidentId/close')
  async closeIncident(
    @CurrentAccess() access: AccessContext,
    @Param('incidentId', new ZodValidationPipe(uuidParameterSchema)) incidentId: string,
    @Body(new ZodValidationPipe(closeIncidentRequestSchema)) body: CloseIncidentRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.closeIncident(
        access,
        incidentId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('incidents/:incidentId/reopen')
  async reopenIncident(
    @CurrentAccess() access: AccessContext,
    @Param('incidentId', new ZodValidationPipe(uuidParameterSchema)) incidentId: string,
    @Body(new ZodValidationPipe(reopenIncidentRequestSchema)) body: ReopenIncidentRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.reopenIncident(
        access,
        incidentId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('reviews')
  async submitReview(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createVerifiedReviewRequestSchema))
    body: CreateVerifiedReviewRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.submitReview(access, body, idempotencyKey(rawIdempotencyKey)),
      requestId: access.requestId,
    };
  }

  @Get('reviews')
  async listReviews(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(reviewListQuerySchema)) query: ReviewListQuery,
  ) {
    const page = await this.trust.listReviews(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Post('reviews/:reviewId/responses')
  async respondToReview(
    @CurrentAccess() access: AccessContext,
    @Param('reviewId', new ZodValidationPipe(uuidParameterSchema)) reviewId: string,
    @Body(new ZodValidationPipe(createClinicReviewResponseRequestSchema))
    body: CreateClinicReviewResponseRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.respondToReview(
        access,
        reviewId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('reviews/:reviewId/reports')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async reportReview(
    @CurrentAccess() access: AccessContext,
    @Param('reviewId', new ZodValidationPipe(uuidParameterSchema)) reviewId: string,
    @Body(new ZodValidationPipe(reportReviewAbuseRequestSchema)) body: ReportReviewAbuseRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.reportReview(
        access,
        reviewId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('reviews/:reviewId/moderation')
  async moderateReview(
    @CurrentAccess() access: AccessContext,
    @Param('reviewId', new ZodValidationPipe(uuidParameterSchema)) reviewId: string,
    @Body(new ZodValidationPipe(moderateReviewRequestSchema)) body: ModerateReviewRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.moderateReview(
        access,
        reviewId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Get('review-reports')
  async listReviewAbuseReports(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(reviewAbuseReportListQuerySchema))
    query: ReviewAbuseReportListQuery,
  ) {
    const page = await this.trust.listReviewAbuseReports(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Post('review-reports/:reportId/decision')
  async decideReviewAbuseReport(
    @CurrentAccess() access: AccessContext,
    @Param('reportId', new ZodValidationPipe(uuidParameterSchema)) reportId: string,
    @Body(new ZodValidationPipe(decideReviewAbuseReportRequestSchema))
    body: DecideReviewAbuseReportRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.decideReviewAbuseReport(
        access,
        reportId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('privacy/requests')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createPrivacyRequest(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createPrivacyRequestSchema)) body: CreatePrivacyRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.createPrivacyRequest(access, body, idempotencyKey(rawIdempotencyKey)),
      requestId: access.requestId,
    };
  }

  @Get('privacy/requests')
  async listPrivacyRequests(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(privacyRequestListQuerySchema)) query: PrivacyRequestListQuery,
  ) {
    const page = await this.trust.listPrivacyRequests(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Get('privacy/requests/:privacyRequestId')
  async getPrivacyRequest(
    @CurrentAccess() access: AccessContext,
    @Param('privacyRequestId', new ZodValidationPipe(uuidParameterSchema)) privacyRequestId: string,
  ) {
    return {
      data: await this.trust.getPrivacyRequest(access, privacyRequestId),
      requestId: access.requestId,
    };
  }

  @Post('privacy/requests/:privacyRequestId/transitions')
  async processPrivacyRequest(
    @CurrentAccess() access: AccessContext,
    @Param('privacyRequestId', new ZodValidationPipe(uuidParameterSchema)) privacyRequestId: string,
    @Body(new ZodValidationPipe(processPrivacyRequestSchema)) body: ProcessPrivacyRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.processPrivacyRequest(
        access,
        privacyRequestId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('privacy/requests/:privacyRequestId/execution/retry')
  async retryPrivacyExecution(
    @CurrentAccess() access: AccessContext,
    @Param('privacyRequestId', new ZodValidationPipe(uuidParameterSchema)) privacyRequestId: string,
    @Body(new ZodValidationPipe(retryPrivacyExecutionRequestSchema))
    body: RetryPrivacyExecutionRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.retryPrivacyExecution(
        access,
        privacyRequestId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Get('privacy/requests/:privacyRequestId/export/download')
  async downloadPrivacyExport(
    @CurrentAccess() access: AccessContext,
    @Param('privacyRequestId', new ZodValidationPipe(uuidParameterSchema)) privacyRequestId: string,
  ) {
    return {
      data: await this.trust.downloadPrivacyExport(access, privacyRequestId),
      requestId: access.requestId,
    };
  }

  @Get('privacy/legal-holds')
  async listPrivacyLegalHolds(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(privacyLegalHoldListQuerySchema)) query: PrivacyLegalHoldListQuery,
  ) {
    const page = await this.trust.listPrivacyLegalHolds(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Post('privacy/legal-holds')
  async createPrivacyLegalHold(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createPrivacyLegalHoldRequestSchema))
    body: CreatePrivacyLegalHoldRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.createPrivacyLegalHold(
        access,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('privacy/legal-holds/:legalHoldId/release')
  async releasePrivacyLegalHold(
    @CurrentAccess() access: AccessContext,
    @Param('legalHoldId', new ZodValidationPipe(uuidParameterSchema)) legalHoldId: string,
    @Body(new ZodValidationPipe(releasePrivacyLegalHoldRequestSchema))
    body: ReleasePrivacyLegalHoldRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.releasePrivacyLegalHold(
        access,
        legalHoldId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Post('support/elevations')
  async createSupportElevation(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createSupportElevationRequestSchema))
    body: CreateSupportElevationRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.createSupportElevation(
        access,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }

  @Get('support/elevations')
  async listSupportElevations(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: { readonly cursor?: string; readonly limit: number },
  ) {
    const page = await this.trust.listSupportElevations(access, query);
    return {
      data: page.data,
      page: { nextCursor: page.nextCursor, count: page.data.length },
      requestId: access.requestId,
    };
  }

  @Post('support/elevations/:elevationId/revoke')
  async revokeSupportElevation(
    @CurrentAccess() access: AccessContext,
    @Param('elevationId', new ZodValidationPipe(uuidParameterSchema)) elevationId: string,
    @Body(new ZodValidationPipe(revokeSupportElevationRequestSchema))
    body: RevokeSupportElevationRequest,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
  ) {
    return {
      data: await this.trust.revokeSupportElevation(
        access,
        elevationId,
        body,
        idempotencyKey(rawIdempotencyKey),
      ),
      requestId: access.requestId,
    };
  }
}

function idempotencyKey(raw: string | undefined): string {
  return parseWithSchema(idempotencyKeySchema, raw);
}
