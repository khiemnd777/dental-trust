import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  archiveClinicServiceRequestSchema,
  addClinicDentistRequestSchema,
  assignClinicDentistRequestSchema,
  beginPayoutOnboardingRequestSchema,
  cancelAppointmentRequestSchema,
  changeClinicTeamStatusRequestSchema,
  connectClinicCalendarRequestSchema,
  createAppointmentRequestSchema,
  createAvailabilityBlockRequestSchema,
  createInternalNoteRequestSchema,
  createMessageThreadRequestSchema,
  decideClinicOpportunityRequestSchema,
  disconnectClinicCalendarRequestSchema,
  inviteClinicTeamMemberRequestSchema,
  markMessageReadRequestSchema,
  milestoneCompleteRequestSchema,
  passportDraftRequestSchema,
  planChangeRequestSchema,
  publishClinicServiceRequestSchema,
  recordAttendanceRequestSchema,
  refreshPayoutOnboardingRequestSchema,
  rescheduleAppointmentRequestSchema,
  sendMessageRequestSchema,
  submitClinicOnboardingRequestSchema,
  syncClinicCalendarRequestSchema,
  treatmentPlanDraftRequestSchema,
  treatmentPlanPublishRequestSchema,
  treatmentInstructionRequestSchema,
  updateClinicProfileRequestSchema,
  updateClinicSchedulingPolicyRequestSchema,
  updateClinicDentistRequestSchema,
  updateClinicTeamAccessRequestSchema,
  upsertClinicLocationRequestSchema,
  upsertAvailabilityRuleRequestSchema,
} from '@dental-trust/contracts';
import {
  incidentClinicResponseRequestSchema,
  incidentInternalNoteRequestSchema,
} from '@dental-trust/contracts/trust-safety-workflows';
import { ProviderApiError, providerApiForSession } from '@/lib/provider-api';
import { isSameOriginRequest } from '@/lib/request-origin';
import { readProviderSession } from '@/lib/require-session';

const commandRequestSchema = z.object({
  command: z.enum([
    'clinic_case_decision',
    'clinic_assign_dentist',
    'create_appointment',
    'reschedule_appointment',
    'cancel_appointment',
    'record_appointment_attendance',
    'create_message_thread',
    'send_message',
    'mark_message_read',
    'create_internal_note',
    'incident_clinic_response',
    'incident_internal_note',
    'create_treatment_plan',
    'publish_treatment_plan',
    'complete_journey_milestone',
    'create_treatment_instruction',
    'create_plan_change',
    'create_passport_draft',
    'publish_passport',
    'clinic_create_availability_rule',
    'clinic_create_availability_block',
    'clinic_update_scheduling_policy',
    'clinic_invite_team',
    'clinic_upsert_location',
    'clinic_add_dentist',
    'clinic_update_dentist',
    'clinic_update_team_access',
    'clinic_suspend_team_member',
    'clinic_remove_team_member',
    'clinic_connect_calendar',
    'clinic_sync_calendar',
    'clinic_disconnect_calendar',
    'clinic_publish_service',
    'clinic_archive_service',
    'clinic_update_profile',
    'clinic_begin_payout',
    'clinic_refresh_payout',
    'clinic_submit_onboarding',
  ]),
  resourceId: z.uuid().optional(),
  secondaryId: z.uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.uuid(),
});

type CommandRequest = z.infer<typeof commandRequestSchema>;

interface CommandTarget {
  readonly path: string;
  readonly payload: unknown;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }
  const session = await readProviderSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.mfaRequired && !session.mfaVerified) {
    return NextResponse.json({ error: 'mfa_required' }, { status: 403 });
  }
  let input: CommandRequest;
  try {
    input = commandRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  }
  let target: CommandTarget;
  try {
    target = commandTarget(input);
  } catch {
    return NextResponse.json({ error: 'invalid_command_payload' }, { status: 400 });
  }
  try {
    const data = await providerApiForSession<unknown>(session, target.path, {
      method: 'POST',
      body: target.payload,
      idempotencyKey: input.idempotencyKey,
    });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof ProviderApiError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

export function commandTarget(input: CommandRequest): CommandTarget {
  const resourceId = input.resourceId;
  const secondaryId = input.secondaryId;
  switch (input.command) {
    case 'clinic_case_decision':
      return {
        path: `clinic-operations/cases/${required(resourceId)}/decision`,
        payload: decideClinicOpportunityRequestSchema.parse(input.payload),
      };
    case 'clinic_assign_dentist':
      return {
        path: `clinic-operations/cases/${required(resourceId)}/assign-dentist`,
        payload: assignClinicDentistRequestSchema.parse(input.payload),
      };
    case 'create_appointment':
      return {
        path: `cases/${required(resourceId)}/appointments`,
        payload: createAppointmentRequestSchema.parse(input.payload),
      };
    case 'reschedule_appointment':
      return {
        path: `cases/${required(resourceId)}/appointments/${required(secondaryId)}/reschedule`,
        payload: rescheduleAppointmentRequestSchema.parse(input.payload),
      };
    case 'cancel_appointment':
      return {
        path: `cases/${required(resourceId)}/appointments/${required(secondaryId)}/cancel`,
        payload: cancelAppointmentRequestSchema.parse(input.payload),
      };
    case 'record_appointment_attendance':
      return {
        path: `cases/${required(resourceId)}/appointments/${required(secondaryId)}/attendance`,
        payload: recordAttendanceRequestSchema.parse(input.payload),
      };
    case 'create_message_thread':
      return {
        path: `cases/${required(resourceId)}/threads`,
        payload: createMessageThreadRequestSchema.parse(input.payload),
      };
    case 'send_message':
      return {
        path: `cases/${required(resourceId)}/threads/${required(secondaryId)}/messages`,
        payload: sendMessageRequestSchema.parse(input.payload),
      };
    case 'mark_message_read':
      return {
        path: `cases/${required(resourceId)}/threads/${required(secondaryId)}/messages/read`,
        payload: markMessageReadRequestSchema.parse(input.payload),
      };
    case 'create_internal_note':
      return {
        path: `cases/${required(resourceId)}/threads/${required(secondaryId)}/internal-notes`,
        payload: createInternalNoteRequestSchema.parse(input.payload),
      };
    case 'incident_clinic_response':
      return {
        path: `trust/incidents/${required(resourceId)}/clinic-responses`,
        payload: incidentClinicResponseRequestSchema.parse(input.payload),
      };
    case 'incident_internal_note':
      return {
        path: `trust/incidents/${required(resourceId)}/internal-notes`,
        payload: incidentInternalNoteRequestSchema.parse(input.payload),
      };
    case 'create_treatment_plan':
      return {
        path: `cases/${required(resourceId)}/treatment-plans/drafts`,
        payload: treatmentPlanDraftRequestSchema.parse(input.payload),
      };
    case 'publish_treatment_plan':
      return {
        path: `cases/${required(resourceId)}/treatment-plans/${required(secondaryId)}/publish`,
        payload: treatmentPlanPublishRequestSchema.parse(input.payload),
      };
    case 'complete_journey_milestone':
      return {
        path: `cases/${required(resourceId)}/journey/milestones/${required(secondaryId)}/complete`,
        payload: milestoneCompleteRequestSchema.parse(input.payload),
      };
    case 'create_treatment_instruction':
      return {
        path: `cases/${required(resourceId)}/journey/instructions`,
        payload: treatmentInstructionRequestSchema.parse(input.payload),
      };
    case 'create_plan_change':
      return {
        path: `cases/${required(resourceId)}/journey/changes`,
        payload: planChangeRequestSchema.parse(input.payload),
      };
    case 'create_passport_draft':
      return {
        path: `cases/${required(resourceId)}/passport/drafts`,
        payload: passportDraftRequestSchema.parse(input.payload),
      };
    case 'publish_passport':
      return {
        path: `cases/${required(resourceId)}/passport/versions/${required(secondaryId)}/publish`,
        payload: z.object({}).strict().parse(input.payload),
      };
    case 'clinic_create_availability_rule':
      return {
        path: 'clinic-operations/availability/rules',
        payload: upsertAvailabilityRuleRequestSchema.parse(input.payload),
      };
    case 'clinic_create_availability_block':
      return {
        path: 'clinic-operations/availability/blocks',
        payload: createAvailabilityBlockRequestSchema.parse(input.payload),
      };
    case 'clinic_update_scheduling_policy':
      return {
        path: 'clinic-operations/availability/policy',
        payload: updateClinicSchedulingPolicyRequestSchema.parse(input.payload),
      };
    case 'clinic_invite_team':
      return {
        path: 'clinic-operations/team/invitations',
        payload: inviteClinicTeamMemberRequestSchema.parse(input.payload),
      };
    case 'clinic_upsert_location':
      return {
        path: 'clinic-operations/onboarding/locations',
        payload: upsertClinicLocationRequestSchema.parse(input.payload),
      };
    case 'clinic_add_dentist':
      return {
        path: 'clinic-operations/dentists',
        payload: addClinicDentistRequestSchema.parse(input.payload),
      };
    case 'clinic_update_dentist':
      return {
        path: `clinic-operations/dentists/${required(resourceId)}`,
        payload: updateClinicDentistRequestSchema.parse(input.payload),
      };
    case 'clinic_update_team_access':
      return {
        path: `clinic-operations/team/${required(resourceId)}/access`,
        payload: updateClinicTeamAccessRequestSchema.parse(input.payload),
      };
    case 'clinic_suspend_team_member':
      return {
        path: `clinic-operations/team/${required(resourceId)}/suspend`,
        payload: changeClinicTeamStatusRequestSchema.parse(input.payload),
      };
    case 'clinic_remove_team_member':
      return {
        path: `clinic-operations/team/${required(resourceId)}/remove`,
        payload: changeClinicTeamStatusRequestSchema.parse(input.payload),
      };
    case 'clinic_connect_calendar':
      return {
        path: 'clinic-operations/availability/calendars',
        payload: connectClinicCalendarRequestSchema.parse(input.payload),
      };
    case 'clinic_sync_calendar':
      return {
        path: `clinic-operations/availability/calendars/${required(resourceId)}/sync`,
        payload: syncClinicCalendarRequestSchema.parse(input.payload),
      };
    case 'clinic_disconnect_calendar':
      return {
        path: `clinic-operations/availability/calendars/${required(resourceId)}/disconnect`,
        payload: disconnectClinicCalendarRequestSchema.parse(input.payload),
      };
    case 'clinic_publish_service':
      return {
        path: 'clinic-operations/services',
        payload: publishClinicServiceRequestSchema.parse(input.payload),
      };
    case 'clinic_archive_service':
      return {
        path: `clinic-operations/services/${required(resourceId)}/archive`,
        payload: archiveClinicServiceRequestSchema.parse(input.payload),
      };
    case 'clinic_update_profile':
      return {
        path: 'clinic-operations/onboarding/profile',
        payload: updateClinicProfileRequestSchema.parse(input.payload),
      };
    case 'clinic_begin_payout':
      return {
        path: 'clinic-operations/onboarding/payout',
        payload: beginPayoutOnboardingRequestSchema.parse(input.payload),
      };
    case 'clinic_refresh_payout':
      return {
        path: 'clinic-operations/onboarding/payout/refresh',
        payload: refreshPayoutOnboardingRequestSchema.parse(input.payload),
      };
    case 'clinic_submit_onboarding':
      return {
        path: 'clinic-operations/onboarding/submit',
        payload: submitClinicOnboardingRequestSchema.parse(input.payload),
      };
  }
}

function required(value: string | undefined): string {
  if (!value) throw new Error('missing_resource_id');
  return value;
}
