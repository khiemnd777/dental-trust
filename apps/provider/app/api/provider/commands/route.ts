import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  archiveClinicServiceRequestSchema,
  assignClinicDentistRequestSchema,
  createAppointmentRequestSchema,
  createAvailabilityBlockRequestSchema,
  createMessageThreadRequestSchema,
  decideClinicOpportunityRequestSchema,
  inviteClinicTeamMemberRequestSchema,
  publishClinicServiceRequestSchema,
  sendMessageRequestSchema,
  submitClinicOnboardingRequestSchema,
  treatmentPlanDraftRequestSchema,
  treatmentPlanPublishRequestSchema,
  updateClinicProfileRequestSchema,
  updateClinicSchedulingPolicyRequestSchema,
  upsertAvailabilityRuleRequestSchema,
} from '@dental-trust/contracts';
import { ProviderApiError, providerApiForSession } from '@/lib/provider-api';
import { isSameOriginRequest } from '@/lib/request-origin';
import { readProviderSession } from '@/lib/require-session';

const commandRequestSchema = z.object({
  command: z.enum([
    'clinic_case_decision',
    'clinic_assign_dentist',
    'create_appointment',
    'create_message_thread',
    'send_message',
    'create_treatment_plan',
    'publish_treatment_plan',
    'clinic_create_availability_rule',
    'clinic_create_availability_block',
    'clinic_update_scheduling_policy',
    'clinic_invite_team',
    'clinic_publish_service',
    'clinic_archive_service',
    'clinic_update_profile',
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

function commandTarget(input: CommandRequest): CommandTarget {
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
