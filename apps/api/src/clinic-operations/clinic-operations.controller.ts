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
  acceptClinicTeamInvitationRequestSchema,
  acceptClinicTermsRequestSchema,
  addClinicDentistRequestSchema,
  addClinicOnboardingDocumentRequestSchema,
  archiveClinicServiceRequestSchema,
  assignClinicDentistRequestSchema,
  beginPayoutOnboardingRequestSchema,
  changeClinicTeamStatusRequestSchema,
  connectClinicCalendarRequestSchema,
  clinicActivityQuerySchema,
  clinicOpportunityQuerySchema,
  createAvailabilityBlockRequestSchema,
  createClinicOrganizationRequestSchema,
  decideClinicOpportunityRequestSchema,
  disconnectClinicCalendarRequestSchema,
  idempotencyKeySchema,
  inviteClinicTeamMemberRequestSchema,
  publishClinicServiceRequestSchema,
  refreshPayoutOnboardingRequestSchema,
  submitClinicOnboardingRequestSchema,
  syncClinicCalendarRequestSchema,
  updateClinicDentistRequestSchema,
  updateClinicProfileRequestSchema,
  updateClinicSchedulingPolicyRequestSchema,
  updateClinicTeamAccessRequestSchema,
  upsertAvailabilityRuleRequestSchema,
  upsertClinicDeclarationRequestSchema,
  upsertClinicLocationRequestSchema,
  type AcceptClinicTeamInvitationRequest,
  type AcceptClinicTermsRequest,
  type AddClinicDentistRequest,
  type AddClinicOnboardingDocumentRequest,
  type ArchiveClinicServiceRequest,
  type AssignClinicDentistRequest,
  type BeginPayoutOnboardingRequest,
  type ChangeClinicTeamStatusRequest,
  type ConnectClinicCalendarRequest,
  type ClinicActivityQuery,
  type ClinicOpportunityQuery,
  type CreateAvailabilityBlockRequest,
  type CreateClinicOrganizationRequest,
  type DecideClinicOpportunityRequest,
  type DisconnectClinicCalendarRequest,
  type InviteClinicTeamMemberRequest,
  type PublishClinicServiceRequest,
  type RefreshPayoutOnboardingRequest,
  type SubmitClinicOnboardingRequest,
  type SyncClinicCalendarRequest,
  type UpdateClinicDentistRequest,
  type UpdateClinicProfileRequest,
  type UpdateClinicSchedulingPolicyRequest,
  type UpdateClinicTeamAccessRequest,
  type UpsertAvailabilityRuleRequest,
  type UpsertClinicDeclarationRequest,
  type UpsertClinicLocationRequest,
} from '@dental-trust/contracts';
import { parseWithSchema } from '@dental-trust/validation';

import { CurrentAccess } from '../auth/current-access.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ClinicOperationsService } from './clinic-operations.service.js';

const uuidSchema = z.uuid();

@Controller('clinic-operations')
@UseGuards(SessionAuthGuard)
export class ClinicOperationsController {
  constructor(
    @Inject(ClinicOperationsService) private readonly operations: ClinicOperationsService,
  ) {}

  @Post('organizations')
  async createOrganization(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createClinicOrganizationRequestSchema))
    input: CreateClinicOrganizationRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.createOrganization(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Get('overview')
  async overview(@CurrentAccess() access: AccessContext) {
    return envelope(await this.operations.overview(access), access.requestId);
  }

  @Get('onboarding')
  async onboarding(@CurrentAccess() access: AccessContext) {
    return envelope(await this.operations.onboarding(access), access.requestId);
  }

  @Post('onboarding/profile')
  async updateProfile(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(updateClinicProfileRequestSchema))
    input: UpdateClinicProfileRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.updateProfile(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('onboarding/locations')
  async upsertLocation(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(upsertClinicLocationRequestSchema))
    input: UpsertClinicLocationRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.upsertLocation(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('onboarding/declarations')
  async upsertDeclaration(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(upsertClinicDeclarationRequestSchema))
    input: UpsertClinicDeclarationRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.upsertDeclaration(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('onboarding/documents')
  async addDocument(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(addClinicOnboardingDocumentRequestSchema))
    input: AddClinicOnboardingDocumentRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.addDocument(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('onboarding/terms')
  async acceptTerms(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(acceptClinicTermsRequestSchema)) input: AcceptClinicTermsRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.acceptTerms(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('onboarding/payout')
  async beginPayout(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(beginPayoutOnboardingRequestSchema))
    input: BeginPayoutOnboardingRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.beginPayoutOnboarding(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('onboarding/payout/refresh')
  async refreshPayout(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(refreshPayoutOnboardingRequestSchema))
    input: RefreshPayoutOnboardingRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.refreshPayoutOnboarding(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('onboarding/submit')
  async submitOnboarding(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(submitClinicOnboardingRequestSchema))
    input: SubmitClinicOnboardingRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.submitOnboarding(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Get('dentists')
  async dentists(@CurrentAccess() access: AccessContext) {
    return envelope(await this.operations.dentists(access), access.requestId);
  }

  @Post('dentists')
  async addDentist(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(addClinicDentistRequestSchema)) input: AddClinicDentistRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.addDentist(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('dentists/:dentistId')
  async updateDentist(
    @CurrentAccess() access: AccessContext,
    @Param('dentistId', new ZodValidationPipe(uuidSchema)) dentistId: string,
    @Body(new ZodValidationPipe(updateClinicDentistRequestSchema))
    input: UpdateClinicDentistRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.updateDentist(access, dentistId, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Get('team')
  async team(@CurrentAccess() access: AccessContext) {
    return envelope(await this.operations.team(access), access.requestId);
  }

  @Post('team/invitations')
  async inviteTeamMember(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(inviteClinicTeamMemberRequestSchema))
    input: InviteClinicTeamMemberRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.inviteTeamMember(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('team/invitations/accept')
  async acceptInvitation(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(acceptClinicTeamInvitationRequestSchema))
    input: AcceptClinicTeamInvitationRequest,
  ) {
    return envelope(await this.operations.acceptInvitation(access, input.token), access.requestId);
  }

  @Post('team/:membershipId/access')
  async updateTeamAccess(
    @CurrentAccess() access: AccessContext,
    @Param('membershipId', new ZodValidationPipe(uuidSchema)) membershipId: string,
    @Body(new ZodValidationPipe(updateClinicTeamAccessRequestSchema))
    input: UpdateClinicTeamAccessRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.updateTeamAccess(access, membershipId, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('team/:membershipId/suspend')
  async suspendTeamMember(
    @CurrentAccess() access: AccessContext,
    @Param('membershipId', new ZodValidationPipe(uuidSchema)) membershipId: string,
    @Body(new ZodValidationPipe(changeClinicTeamStatusRequestSchema))
    input: ChangeClinicTeamStatusRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.changeTeamStatus(
        access,
        membershipId,
        input,
        'SUSPENDED',
        idempotency(rawKey),
      ),
      access.requestId,
    );
  }

  @Post('team/:membershipId/remove')
  async removeTeamMember(
    @CurrentAccess() access: AccessContext,
    @Param('membershipId', new ZodValidationPipe(uuidSchema)) membershipId: string,
    @Body(new ZodValidationPipe(changeClinicTeamStatusRequestSchema))
    input: ChangeClinicTeamStatusRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.changeTeamStatus(
        access,
        membershipId,
        input,
        'REMOVED',
        idempotency(rawKey),
      ),
      access.requestId,
    );
  }

  @Get('team/activity')
  async teamActivity(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(clinicActivityQuerySchema)) query: ClinicActivityQuery,
  ) {
    const page = await this.operations.activity(access, query);
    return pageEnvelope(page, access.requestId);
  }

  @Get('cases')
  async opportunities(
    @CurrentAccess() access: AccessContext,
    @Query(new ZodValidationPipe(clinicOpportunityQuerySchema)) query: ClinicOpportunityQuery,
  ) {
    const page = await this.operations.opportunities(access, query);
    return pageEnvelope(page, access.requestId);
  }

  @Post('cases/:caseId/decision')
  async decideOpportunity(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(decideClinicOpportunityRequestSchema))
    input: DecideClinicOpportunityRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.decideOpportunity(access, caseId, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('cases/:caseId/assign-dentist')
  async assignDentist(
    @CurrentAccess() access: AccessContext,
    @Param('caseId', new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(assignClinicDentistRequestSchema))
    input: AssignClinicDentistRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.assignDentist(access, caseId, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Get('availability')
  async availability(@CurrentAccess() access: AccessContext) {
    return envelope(await this.operations.availability(access), access.requestId);
  }

  @Post('availability/rules')
  async upsertAvailabilityRule(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(upsertAvailabilityRuleRequestSchema))
    input: UpsertAvailabilityRuleRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.upsertAvailabilityRule(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('availability/blocks')
  async createAvailabilityBlock(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(createAvailabilityBlockRequestSchema))
    input: CreateAvailabilityBlockRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.createAvailabilityBlock(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('availability/policy')
  async updateSchedulingPolicy(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(updateClinicSchedulingPolicyRequestSchema))
    input: UpdateClinicSchedulingPolicyRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.updateSchedulingPolicy(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('availability/calendars')
  async connectCalendar(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(connectClinicCalendarRequestSchema))
    input: ConnectClinicCalendarRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.connectCalendar(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('availability/calendars/:connectionId/sync')
  async syncCalendar(
    @CurrentAccess() access: AccessContext,
    @Param('connectionId', new ZodValidationPipe(uuidSchema)) connectionId: string,
    @Body(new ZodValidationPipe(syncClinicCalendarRequestSchema)) input: SyncClinicCalendarRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.syncCalendar(access, connectionId, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('availability/calendars/:connectionId/disconnect')
  async disconnectCalendar(
    @CurrentAccess() access: AccessContext,
    @Param('connectionId', new ZodValidationPipe(uuidSchema)) connectionId: string,
    @Body(new ZodValidationPipe(disconnectClinicCalendarRequestSchema))
    input: DisconnectClinicCalendarRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.disconnectCalendar(access, connectionId, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Get('services')
  async services(@CurrentAccess() access: AccessContext) {
    return envelope(await this.operations.services(access), access.requestId);
  }

  @Post('services')
  async publishService(
    @CurrentAccess() access: AccessContext,
    @Body(new ZodValidationPipe(publishClinicServiceRequestSchema))
    input: PublishClinicServiceRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.publishService(access, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Post('services/:clinicServiceId/archive')
  async archiveService(
    @CurrentAccess() access: AccessContext,
    @Param('clinicServiceId', new ZodValidationPipe(uuidSchema)) clinicServiceId: string,
    @Body(new ZodValidationPipe(archiveClinicServiceRequestSchema))
    input: ArchiveClinicServiceRequest,
    @Headers('x-idempotency-key') rawKey: string | undefined,
  ) {
    return envelope(
      await this.operations.archiveService(access, clinicServiceId, input, idempotency(rawKey)),
      access.requestId,
    );
  }

  @Get('analytics')
  async analytics(@CurrentAccess() access: AccessContext) {
    return envelope(await this.operations.analytics(access), access.requestId);
  }

  @Get('billing')
  async billing(@CurrentAccess() access: AccessContext) {
    return envelope(await this.operations.billing(access), access.requestId);
  }
}

function idempotency(rawKey: string | undefined): string {
  return parseWithSchema(idempotencyKeySchema, rawKey);
}

function envelope<T>(data: T, requestId: string) {
  return { data, requestId };
}

function pageEnvelope<T>(
  page: { readonly records: readonly T[]; readonly nextCursor: string | null },
  requestId: string,
) {
  return {
    data: page.records,
    page: { count: page.records.length, nextCursor: page.nextCursor },
    requestId,
  };
}
