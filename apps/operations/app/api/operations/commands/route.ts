import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  adminGovernanceCommandEnvelopeSchema,
  adminAccountStatusCommandSchema,
  adminNotificationRetryCommandSchema,
  adminRetryCommandSchema,
  adminUserRoleCommandSchema,
  assignVerificationCaseSchema,
  closeIncidentRequestSchema,
  completeSiteAuditSchema,
  conciergeAssignmentRequestSchema,
  conciergeCommunicationRequestSchema,
  conciergeHandoffAcceptRequestSchema,
  conciergeHandoffRequestSchema,
  conciergeInternalNoteRequestSchema,
  conciergeSupervisorReviewRequestSchema,
  conciergeTaskRequestSchema,
  conciergeTaskTransitionRequestSchema,
  conciergeTravelNoteRequestSchema,
  conciergeWorkspaceUpdateSchema,
  createCorrectiveActionSchema,
  createSiteAuditSchema,
  createSupportElevationRequestSchema,
  decideVerificationCaseSchema,
  decideCorrectiveActionSchema,
  decideReviewAbuseReportRequestSchema,
  processPrivacyRequestSchema,
  requestRefundRequestSchema,
  respondCorrectiveActionSchema,
  retryPrivacyExecutionRequestSchema,
  revokeSupportElevationRequestSchema,
  shortlistRecommendationRequestSchema,
  reviewVerificationEvidenceSchema,
  secondApprovalSchema,
  triageIncidentRequestSchema,
} from '@dental-trust/contracts';
import { OperationsApiError, operationsApiForSession } from '@/lib/operations-api';
import { isSameOriginRequest } from '@/lib/request-origin';
import { readOperationsSession } from '@/lib/require-session';

const commandRequestSchema = z.object({
  command: z.enum([
    'coordination_update',
    'coordination_note',
    'coordination_assign',
    'coordination_travel_note',
    'coordination_communication',
    'coordination_recommendations',
    'coordination_task_create',
    'coordination_task_transition',
    'coordination_handoff',
    'coordination_handoff_accept',
    'coordination_supervisor_review',
    'verification_assign',
    'verification_review_evidence',
    'verification_decide',
    'verification_second_approve',
    'verification_site_audit_create',
    'verification_site_audit_complete',
    'verification_corrective_create',
    'verification_corrective_respond',
    'verification_corrective_decide',
    'admin_retry_outbox',
    'admin_retry_notification',
    'admin_change_user_status',
    'admin_change_user_role',
    'admin_governance_mutate',
    'finance_refund',
    'trust_incident_triage',
    'trust_incident_close',
    'trust_incident_reopen',
    'trust_review_report_decide',
    'trust_privacy_process',
    'trust_privacy_retry',
    'trust_support_elevation_create',
    'trust_support_elevation_revoke',
  ]),
  resourceId: z.uuid().optional(),
  secondaryId: z.uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.uuid(),
});

type CommandRequest = z.infer<typeof commandRequestSchema>;

interface CommandTarget {
  readonly path: string;
  readonly method: 'POST' | 'PUT' | 'PATCH';
  readonly payload: unknown;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }
  const session = await readOperationsSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!session.mfaVerified) {
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
    const data = await operationsApiForSession<unknown>(session, target.path, {
      method: target.method,
      body: target.payload,
      idempotencyKey: input.idempotencyKey,
    });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof OperationsApiError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

function commandTarget(input: CommandRequest): CommandTarget {
  switch (input.command) {
    case 'coordination_assign':
      return {
        path: `concierge/cases/${required(input.resourceId)}/assignment`,
        method: 'POST',
        payload: conciergeAssignmentRequestSchema.parse(input.payload),
      };
    case 'coordination_update':
      return {
        path: `concierge/cases/${required(input.resourceId)}/workspace`,
        method: 'PATCH',
        payload: conciergeWorkspaceUpdateSchema.parse(input.payload),
      };
    case 'coordination_note':
      return {
        path: `concierge/cases/${required(input.resourceId)}/internal-notes`,
        method: 'POST',
        payload: conciergeInternalNoteRequestSchema.parse(input.payload),
      };
    case 'coordination_travel_note':
      return {
        path: `concierge/cases/${required(input.resourceId)}/travel-notes`,
        method: 'POST',
        payload: conciergeTravelNoteRequestSchema.parse(input.payload),
      };
    case 'coordination_communication':
      return {
        path: `concierge/cases/${required(input.resourceId)}/communications`,
        method: 'POST',
        payload: conciergeCommunicationRequestSchema.parse(input.payload),
      };
    case 'coordination_recommendations':
      return {
        path: `concierge/cases/${required(input.resourceId)}/recommendations`,
        method: 'PUT',
        payload: shortlistRecommendationRequestSchema.parse(input.payload),
      };
    case 'coordination_task_create':
      return {
        path: `concierge/cases/${required(input.resourceId)}/tasks`,
        method: 'POST',
        payload: conciergeTaskRequestSchema.parse(input.payload),
      };
    case 'coordination_task_transition':
      return {
        path: `concierge/cases/${required(input.resourceId)}/tasks/${required(input.secondaryId)}/transitions`,
        method: 'POST',
        payload: conciergeTaskTransitionRequestSchema.parse(input.payload),
      };
    case 'coordination_handoff':
      return {
        path: `concierge/cases/${required(input.resourceId)}/handoffs`,
        method: 'POST',
        payload: conciergeHandoffRequestSchema.parse(input.payload),
      };
    case 'coordination_handoff_accept':
      return {
        path: `concierge/cases/${required(input.resourceId)}/handoffs/${required(input.secondaryId)}/accept`,
        method: 'POST',
        payload: conciergeHandoffAcceptRequestSchema.parse(input.payload),
      };
    case 'coordination_supervisor_review':
      return {
        path: `concierge/cases/${required(input.resourceId)}/supervisor-reviews`,
        method: 'POST',
        payload: conciergeSupervisorReviewRequestSchema.parse(input.payload),
      };
    case 'verification_assign':
      return {
        path: `verification/cases/${required(input.resourceId)}/assign`,
        method: 'POST',
        payload: assignVerificationCaseSchema.parse(input.payload),
      };
    case 'verification_review_evidence':
      return {
        path: `verification/cases/${required(input.resourceId)}/evidence/${required(input.secondaryId)}/review`,
        method: 'POST',
        payload: reviewVerificationEvidenceSchema.parse(input.payload),
      };
    case 'verification_decide':
      return {
        path: `verification/cases/${required(input.resourceId)}/decisions`,
        method: 'POST',
        payload: decideVerificationCaseSchema.parse(input.payload),
      };
    case 'verification_second_approve':
      return {
        path: `verification/reviews/${required(input.resourceId)}/second-approval`,
        method: 'POST',
        payload: secondApprovalSchema.parse(input.payload),
      };
    case 'verification_site_audit_create':
      return {
        path: `verification/cases/${required(input.resourceId)}/site-audits`,
        method: 'POST',
        payload: createSiteAuditSchema.parse(input.payload),
      };
    case 'verification_site_audit_complete':
      return {
        path: `verification/site-audits/${required(input.resourceId)}/complete`,
        method: 'POST',
        payload: completeSiteAuditSchema.parse(input.payload),
      };
    case 'verification_corrective_create':
      return {
        path: `verification/cases/${required(input.resourceId)}/corrective-actions`,
        method: 'POST',
        payload: createCorrectiveActionSchema.parse(input.payload),
      };
    case 'verification_corrective_respond':
      return {
        path: `verification/corrective-actions/${required(input.resourceId)}/respond`,
        method: 'POST',
        payload: respondCorrectiveActionSchema.parse(input.payload),
      };
    case 'verification_corrective_decide':
      return {
        path: `verification/corrective-actions/${required(input.resourceId)}/decision`,
        method: 'POST',
        payload: decideCorrectiveActionSchema.parse(input.payload),
      };
    case 'admin_retry_outbox':
      return {
        path: `admin/operations/jobs/outbox/${required(input.resourceId)}/retry`,
        method: 'POST',
        payload: adminRetryCommandSchema.parse(input.payload),
      };
    case 'admin_retry_notification':
      return {
        path: `admin/operations/jobs/notifications/${required(input.resourceId)}/retry`,
        method: 'POST',
        payload: adminNotificationRetryCommandSchema.parse(input.payload),
      };
    case 'admin_change_user_status':
      return {
        path: `admin/directory/users/${required(input.resourceId)}/status`,
        method: 'POST',
        payload: adminAccountStatusCommandSchema.parse(input.payload),
      };
    case 'admin_change_user_role':
      return {
        path: `admin/directory/users/${required(input.resourceId)}/roles`,
        method: 'POST',
        payload: adminUserRoleCommandSchema.parse(input.payload),
      };
    case 'admin_governance_mutate':
      return {
        path: 'admin/governance',
        method: 'POST',
        payload: adminGovernanceCommandEnvelopeSchema.parse(input.payload),
      };
    case 'finance_refund':
      return {
        path: `payments/${required(input.resourceId)}/refunds`,
        method: 'POST',
        payload: requestRefundRequestSchema.parse(input.payload),
      };
    case 'trust_incident_triage':
      return {
        path: `trust/incidents/${required(input.resourceId)}/triage`,
        method: 'POST',
        payload: triageIncidentRequestSchema.parse(input.payload),
      };
    case 'trust_incident_close':
      return {
        path: `trust/incidents/${required(input.resourceId)}/close`,
        method: 'POST',
        payload: closeIncidentRequestSchema.parse(input.payload),
      };
    case 'trust_incident_reopen':
      return {
        path: `trust/incidents/${required(input.resourceId)}/reopen`,
        method: 'POST',
        payload: closeIncidentRequestSchema.parse(input.payload),
      };
    case 'trust_review_report_decide':
      return {
        path: `trust/review-reports/${required(input.resourceId)}/decision`,
        method: 'POST',
        payload: decideReviewAbuseReportRequestSchema.parse(input.payload),
      };
    case 'trust_privacy_process':
      return {
        path: `trust/privacy/requests/${required(input.resourceId)}/transitions`,
        method: 'POST',
        payload: processPrivacyRequestSchema.parse(input.payload),
      };
    case 'trust_privacy_retry':
      return {
        path: `trust/privacy/requests/${required(input.resourceId)}/execution/retry`,
        method: 'POST',
        payload: retryPrivacyExecutionRequestSchema.parse(input.payload),
      };
    case 'trust_support_elevation_create':
      return {
        path: 'trust/support/elevations',
        method: 'POST',
        payload: createSupportElevationRequestSchema.parse(input.payload),
      };
    case 'trust_support_elevation_revoke':
      return {
        path: `trust/support/elevations/${required(input.resourceId)}/revoke`,
        method: 'POST',
        payload: revokeSupportElevationRequestSchema.parse(input.payload),
      };
  }
}

function required(value: string | undefined): string {
  if (!value) throw new Error('missing_secondary_id');
  return value;
}
