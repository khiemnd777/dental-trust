import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';
import { developmentCaseId, developmentCaseNumber, type PortalArea } from '@/lib/routing';

const allowedAreas = new Set<PortalArea>([
  'patient',
  'clinic',
  'concierge',
  'verification',
  'admin',
]);
const allowedCommands = new Set([
  'save',
  'message',
  'complete',
  'advance',
  'create_case',
  'accept_plan',
  'aftercare_checkin',
  'invite_caregiver',
  'revoke_caregiver',
  'save_treatment_plan',
  'publish_treatment_plan',
  'create_appointment',
  'reschedule_appointment',
  'cancel_appointment',
  'record_attendance',
  'create_message_thread',
  'send_message',
  'mark_message_read',
  'create_internal_note',
  'complete_milestone',
  'create_treatment_instruction',
  'create_plan_change',
  'acknowledge_plan_change',
  'create_passport_draft',
  'publish_passport',
  'create_passport_share',
  'revoke_passport_share',
  'verification_assign',
  'verification_review_evidence',
  'verification_decide',
  'verification_second_approve',
  'verification_schedule_audit',
  'verification_complete_audit',
  'verification_create_corrective',
  'verification_decide_corrective',
  'shortlist_interest',
  'request_introduction',
  'matching_create_criteria',
  'matching_calculate',
  'matching_recommendations',
  'concierge_assign',
  'concierge_workspace',
  'concierge_note',
  'concierge_travel_note',
  'concierge_communication',
  'concierge_task',
  'concierge_task_transition',
  'concierge_handoff',
  'concierge_handoff_accept',
  'concierge_supervisor_review',
  'clinic_update_profile',
  'clinic_upsert_location',
  'clinic_upsert_declaration',
  'clinic_add_document',
  'clinic_accept_terms',
  'clinic_begin_payout',
  'clinic_refresh_payout',
  'clinic_submit_onboarding',
  'clinic_add_dentist',
  'clinic_update_dentist',
  'clinic_invite_team',
  'clinic_update_team_access',
  'clinic_suspend_team',
  'clinic_remove_team',
  'clinic_case_decision',
  'clinic_assign_dentist',
  'clinic_upsert_availability_rule',
  'clinic_create_availability_block',
  'clinic_update_scheduling_policy',
  'clinic_connect_calendar',
  'clinic_sync_calendar',
  'clinic_disconnect_calendar',
  'clinic_publish_service',
  'clinic_archive_service',
  'booking_checkout',
  'booking_cancel',
  'booking_complete',
  'payment_recover',
  'patient_profile',
  'patient_emergency',
  'intake_create',
  'intake_update',
  'intake_submit',
  'intake_revise',
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resourceScopedPages = new Set([
  'patient:case',
  'patient:intake',
  'patient:records',
  'patient:shortlist',
  'patient:plans',
  'patient:planDetail',
  'patient:aftercare',
  'patient:caregivers',
  'patient:consultations',
  'patient:messages',
  'patient:journey',
  'patient:passport',
  'clinic:caseDetail',
  'clinic:planBuilder',
  'clinic:scheduling',
  'clinic:messages',
  'clinic:progress',
  'clinic:passport',
  'concierge:cases',
  'concierge:matching',
  'concierge:scheduling',
  'concierge:aftercare',
  'concierge:incidents',
  'concierge:tasks',
  'verification:clinic',
  'verification:dentist',
  'verification:audit',
]);

function allowedOrigin(origin: string | null) {
  if (!origin) return false;
  try {
    const requested = new URL(origin).origin;
    const configured = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').origin;
    return requested === configured;
  } catch {
    return false;
  }
}

function safeDevelopmentReturnUrl(value: unknown, fallbackPath: string) {
  const configured = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
  if (typeof value === 'string') {
    try {
      const candidate = new URL(value);
      if (candidate.origin === configured.origin) return candidate.toString();
    } catch {
      // Use the configured same-origin fallback below.
    }
  }
  return new URL(fallbackPath, configured).toString();
}

export async function POST(request: Request) {
  const requestHeaders = await headers();
  if (!allowedOrigin(requestHeaders.get('origin')))
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: {
    area?: PortalArea;
    pageKey?: string;
    command?: string;
    entityId?: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (
    !body.area ||
    !allowedAreas.has(body.area) ||
    !body.pageKey ||
    !body.command ||
    !allowedCommands.has(body.command) ||
    !body.entityId
  )
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  if (!body.idempotencyKey)
    return NextResponse.json({ error: 'idempotency_key_required' }, { status: 400 });
  if (!uuidPattern.test(body.idempotencyKey))
    return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 });
  const resourceId = uuidPattern.test(body.entityId) ? body.entityId : undefined;
  if (resourceScopedPages.has(`${body.area}:${body.pageKey}`) && !resourceId)
    return NextResponse.json({ error: 'invalid_resource_id' }, { status: 400 });
  if (
    body.area === 'patient' &&
    session.roles.includes('CAREGIVER') &&
    !session.roles.includes('PATIENT') &&
    (!resourceId || ['checkout', 'payments'].includes(body.pageKey))
  )
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await authorizePortalRoute(session, body.area, body.pageKey, resourceId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (
    (body.command.startsWith('booking_') || body.command === 'payment_recover') &&
    !commandTarget(body.area, body.command, resourceId, body.payload)
  )
    return NextResponse.json({ error: 'invalid_command_payload' }, { status: 400 });
  if (session.source === 'development') {
    if (body.command === 'booking_checkout' || body.command === 'payment_recover')
      return NextResponse.json(
        {
          data: { depositIntent: { status: 'REQUIRES_ACTION', clientSecret: null } },
          adapter: 'development',
        },
        { status: 201 },
      );
    if (body.command === 'clinic_begin_payout')
      return NextResponse.json(
        {
          data: {
            onboardingUrl: safeDevelopmentReturnUrl(
              body.payload?.returnUrl,
              body.pageKey === 'onboarding'
                ? '/en/clinic/onboarding?developmentPayout=1'
                : '/en/clinic/billing?developmentPayout=1',
            ),
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
            status: 'ACTIVE',
          },
          adapter: 'development',
        },
        { status: 200 },
      );
    if (body.command === 'create_case')
      return NextResponse.json(
        {
          data: {
            id: developmentCaseId,
            caseNumber: developmentCaseNumber,
          },
          adapter: 'development',
        },
        { status: 201 },
      );
    if (body.command === 'save_treatment_plan')
      return NextResponse.json(
        {
          data: {
            id: crypto.randomUUID(),
            version: 4,
            contentChecksum: 'd'.repeat(64),
          },
          adapter: 'development',
        },
        { status: 201 },
      );
    if (body.command === 'create_passport_draft')
      return NextResponse.json(
        {
          data: {
            id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9eb1',
            version: 1,
            status: 'DRAFT',
          },
          adapter: 'development',
        },
        { status: 201 },
      );
    if (body.command === 'create_passport_share')
      return NextResponse.json(
        {
          data: {
            id: crypto.randomUUID(),
            url: 'http://localhost:4000/api/v1/passport-shares/dtp_developmentOpaqueTokenOnly000000000000000000000000000000000000',
            expiresAt: '2026-07-13T08:00:00.000Z',
          },
          adapter: 'development',
        },
        { status: 201 },
      );
    return NextResponse.json(
      { accepted: true, commandId: crypto.randomUUID(), adapter: 'development' },
      { status: 202 },
    );
  }
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  if (!api || !token) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const target = commandTarget(body.area, body.command, resourceId, body.payload);
  if (!target) return NextResponse.json({ error: 'invalid_command_payload' }, { status: 400 });
  try {
    const upstream = await fetch(`${api}/${target.path}`, {
      method: target.method ?? 'POST',
      headers: {
        ...sessionApiHeaders(session, token),
        'content-type': 'application/json',
        'x-idempotency-key': body.idempotencyKey,
      },
      ...(target.method === 'DELETE' ? {} : { body: JSON.stringify(target.payload) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

interface CommandTarget {
  readonly path: string;
  readonly payload: Record<string, unknown>;
  readonly method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
}

function commandTarget(
  area: PortalArea,
  command: string,
  caseId: string | undefined,
  payload: Record<string, unknown> | undefined,
): CommandTarget | null {
  if (command === 'create_case') return { path: 'cases', payload: payload ?? {} };
  if (command === 'patient_profile') {
    if (area !== 'patient') return null;
    return { path: 'patient/profile', payload: payload ?? {}, method: 'PUT' };
  }
  if (command === 'patient_emergency') {
    if (area !== 'patient') return null;
    return { path: 'patient/emergency-contact', payload: payload ?? {}, method: 'PUT' };
  }
  if (command === 'booking_checkout') {
    const acceptanceId = stringId(payload?.treatmentPlanAcceptanceId);
    const expectedDepositBasisPoints = payload?.expectedDepositBasisPoints;
    const expectedCancellationPolicyVersion = payload?.expectedCancellationPolicyVersion;
    if (
      area !== 'patient' ||
      !acceptanceId ||
      typeof expectedDepositBasisPoints !== 'number' ||
      typeof expectedCancellationPolicyVersion !== 'number'
    )
      return null;
    return {
      path: 'bookings/checkout',
      payload: {
        treatmentPlanAcceptanceId: acceptanceId,
        expectedDepositBasisPoints,
        expectedCancellationPolicyVersion,
      },
    };
  }
  if (command === 'booking_cancel') {
    const bookingId = stringId(payload?.bookingId);
    const expectedVersion = payload?.expectedVersion;
    const reason = payload?.reason;
    if (
      !['patient', 'clinic'].includes(area) ||
      !bookingId ||
      typeof expectedVersion !== 'number' ||
      typeof reason !== 'string'
    )
      return null;
    return {
      path: `bookings/${bookingId}/cancel`,
      payload: { expectedVersion, reason },
    };
  }
  if (command === 'booking_complete') {
    const bookingId = stringId(payload?.bookingId);
    const expectedVersion = payload?.expectedVersion;
    if (area !== 'clinic' || !bookingId || typeof expectedVersion !== 'number') return null;
    return { path: `bookings/${bookingId}/complete`, payload: { expectedVersion } };
  }
  if (command === 'payment_recover') {
    const bookingId = stringId(payload?.bookingId);
    const expectedPaymentVersion = payload?.expectedPaymentVersion;
    if (area !== 'patient' || !bookingId || typeof expectedPaymentVersion !== 'number') return null;
    return {
      path: 'payments/deposit-intents/recover',
      payload: { bookingId, expectedPaymentVersion },
    };
  }
  if (area === 'clinic' && command.startsWith('clinic_'))
    return clinicCommandTarget(command, payload);
  if (!caseId) return null;
  if (command === 'intake_create') {
    if (area !== 'patient') return null;
    return { path: `cases/${caseId}/intake/drafts`, payload: payload ?? {} };
  }
  if (command === 'intake_update') {
    if (area !== 'patient') return null;
    const versionId = stringId(payload?.versionId);
    if (!versionId) return null;
    const request = Object.fromEntries(
      Object.entries(payload ?? {}).filter(([key]) => key !== 'versionId'),
    );
    return {
      path: `cases/${caseId}/intake/drafts/${versionId}`,
      payload: request,
      method: 'PATCH',
    };
  }
  if (command === 'intake_submit') {
    if (area !== 'patient') return null;
    const versionId = stringId(payload?.versionId);
    if (!versionId) return null;
    return {
      path: `cases/${caseId}/intake/drafts/${versionId}/submit`,
      payload: {
        expectedDraftRevision: payload?.expectedDraftRevision,
        consentGranted: payload?.consentGranted,
        consentTextVersionIds: payload?.consentTextVersionIds,
      },
    };
  }
  if (command === 'intake_revise') {
    if (area !== 'patient') return null;
    const versionId = stringId(payload?.versionId);
    if (!versionId) return null;
    return {
      path: `cases/${caseId}/intake/versions/${versionId}/revisions`,
      payload: { expectedQuestionnaireVersion: payload?.expectedQuestionnaireVersion },
    };
  }
  if (command === 'shortlist_interest') {
    if (area !== 'patient') return null;
    const entryId = typeof payload?.entryId === 'string' ? payload.entryId : '';
    if (!uuidPattern.test(entryId) || typeof payload?.interested !== 'boolean') return null;
    return {
      path: `cases/${caseId}/shortlist/${entryId}/interest`,
      payload: { interested: payload.interested },
    };
  }
  if (command === 'request_introduction') {
    if (area !== 'patient') return null;
    const entryId = typeof payload?.entryId === 'string' ? payload.entryId : '';
    const consentTextVersionId =
      typeof payload?.consentTextVersionId === 'string' ? payload.consentTextVersionId : '';
    if (
      !uuidPattern.test(entryId) ||
      !uuidPattern.test(consentTextVersionId) ||
      payload?.consentGranted !== true
    )
      return null;
    return {
      path: `cases/${caseId}/shortlist/${entryId}/introduction-requests`,
      payload: {
        consentTextVersionId,
        consentGranted: true,
        ...(typeof payload?.patientNote === 'string' ? { patientNote: payload.patientNote } : {}),
      },
    };
  }
  if (command === 'matching_create_criteria')
    return { path: `cases/${caseId}/matching/criteria`, payload: payload ?? {} };
  if (command === 'matching_calculate')
    return { path: `cases/${caseId}/matching/runs`, payload: payload ?? {} };
  if (area === 'concierge') {
    if (command === 'matching_recommendations')
      return {
        path: `concierge/cases/${caseId}/recommendations`,
        payload: payload ?? {},
        method: 'PUT',
      };
    if (command === 'concierge_assign')
      return { path: `concierge/cases/${caseId}/assignment`, payload: payload ?? {} };
    if (command === 'concierge_workspace')
      return {
        path: `concierge/cases/${caseId}/workspace`,
        payload: payload ?? {},
        method: 'PATCH',
      };
    if (command === 'concierge_note')
      return { path: `concierge/cases/${caseId}/internal-notes`, payload: payload ?? {} };
    if (command === 'concierge_travel_note')
      return { path: `concierge/cases/${caseId}/travel-notes`, payload: payload ?? {} };
    if (command === 'concierge_communication')
      return { path: `concierge/cases/${caseId}/communications`, payload: payload ?? {} };
    if (command === 'concierge_task')
      return { path: `concierge/cases/${caseId}/tasks`, payload: payload ?? {} };
    if (command === 'concierge_task_transition') {
      const taskId = typeof payload?.taskId === 'string' ? payload.taskId : '';
      if (!uuidPattern.test(taskId)) return null;
      return {
        path: `concierge/cases/${caseId}/tasks/${taskId}/transitions`,
        payload: { status: payload?.status, expectedVersion: payload?.expectedVersion },
      };
    }
    if (command === 'concierge_handoff')
      return { path: `concierge/cases/${caseId}/handoffs`, payload: payload ?? {} };
    if (command === 'concierge_handoff_accept') {
      const handoffId = typeof payload?.handoffId === 'string' ? payload.handoffId : '';
      if (!uuidPattern.test(handoffId)) return null;
      return {
        path: `concierge/cases/${caseId}/handoffs/${handoffId}/accept`,
        payload: { expectedVersion: payload?.expectedVersion },
      };
    }
    if (command === 'concierge_supervisor_review')
      return { path: `concierge/cases/${caseId}/supervisor-reviews`, payload: payload ?? {} };
  }
  if (area === 'verification') {
    if (command === 'verification_assign')
      return { path: `verification/cases/${caseId}/assign`, payload: payload ?? {} };
    if (command === 'verification_review_evidence') {
      const evidenceId = typeof payload?.evidenceId === 'string' ? payload.evidenceId : '';
      if (!uuidPattern.test(evidenceId)) return null;
      return {
        path: `verification/cases/${caseId}/evidence/${evidenceId}/review`,
        payload: {
          decision: payload?.decision,
          notes: payload?.notes,
          expectedCaseVersion: payload?.expectedCaseVersion,
        },
      };
    }
    if (command === 'verification_decide')
      return { path: `verification/cases/${caseId}/decisions`, payload: payload ?? {} };
    if (command === 'verification_second_approve')
      return { path: `verification/reviews/${caseId}/second-approval`, payload: payload ?? {} };
    if (command === 'verification_schedule_audit')
      return { path: `verification/cases/${caseId}/site-audits`, payload: payload ?? {} };
    if (command === 'verification_complete_audit')
      return { path: `verification/site-audits/${caseId}/complete`, payload: payload ?? {} };
    if (command === 'verification_create_corrective')
      return { path: `verification/cases/${caseId}/corrective-actions`, payload: payload ?? {} };
    if (command === 'verification_decide_corrective')
      return {
        path: `verification/corrective-actions/${caseId}/decision`,
        payload: payload ?? {},
      };
    return null;
  }
  if (command === 'invite_caregiver') {
    const caregiverEmail = typeof payload?.email === 'string' ? payload.email : undefined;
    if (!caregiverEmail) return null;
    return {
      path: `cases/${caseId}/caregivers`,
      payload: { caregiverEmail, permissions: payload?.permissions, expiresAt: payload?.expiresAt },
    };
  }
  if (command === 'revoke_caregiver') {
    const grantId = typeof payload?.caregiverGrantId === 'string' ? payload.caregiverGrantId : '';
    if (!uuidPattern.test(grantId)) return null;
    return { path: `cases/${caseId}/caregivers/${grantId}/revoke`, payload: {} };
  }
  if (command === 'aftercare_checkin')
    return { path: `cases/${caseId}/aftercare/check-ins`, payload: payload ?? {} };
  if (command === 'save_treatment_plan')
    return { path: `cases/${caseId}/treatment-plans/drafts`, payload: payload ?? {} };
  if (command === 'publish_treatment_plan') {
    const versionId = typeof payload?.versionId === 'string' ? payload.versionId : '';
    if (!uuidPattern.test(versionId)) return null;
    return {
      path: `cases/${caseId}/treatment-plans/${versionId}/publish`,
      payload: {
        expectedVersion: payload?.expectedVersion,
        contentChecksum: payload?.contentChecksum,
      },
    };
  }
  if (command === 'accept_plan') {
    const versionId = typeof payload?.planId === 'string' ? payload.planId : '';
    if (!uuidPattern.test(versionId)) return null;
    return {
      path: `cases/${caseId}/treatment-plans/${versionId}/accept`,
      payload: { consentTextVersionId: payload?.consentTextVersionId },
    };
  }
  if (command === 'create_appointment') {
    if (area !== 'clinic') return null;
    return { path: `cases/${caseId}/appointments`, payload: payload ?? {} };
  }
  if (command === 'reschedule_appointment') {
    const appointmentId = typeof payload?.appointmentId === 'string' ? payload.appointmentId : '';
    if (!uuidPattern.test(appointmentId)) return null;
    return {
      path: `cases/${caseId}/appointments/${appointmentId}/reschedule`,
      payload: {
        startsAt: payload?.startsAt,
        endsAt: payload?.endsAt,
        timezone: payload?.timezone,
        expectedVersion: payload?.expectedVersion,
      },
    };
  }
  if (command === 'cancel_appointment') {
    const appointmentId = typeof payload?.appointmentId === 'string' ? payload.appointmentId : '';
    if (!uuidPattern.test(appointmentId)) return null;
    return {
      path: `cases/${caseId}/appointments/${appointmentId}/cancel`,
      payload: { reason: payload?.reason, expectedVersion: payload?.expectedVersion },
    };
  }
  if (command === 'record_attendance') {
    if (area !== 'clinic') return null;
    const appointmentId = typeof payload?.appointmentId === 'string' ? payload.appointmentId : '';
    if (!uuidPattern.test(appointmentId)) return null;
    return {
      path: `cases/${caseId}/appointments/${appointmentId}/attendance`,
      payload: { outcome: payload?.outcome, expectedVersion: payload?.expectedVersion },
    };
  }
  if (command === 'create_message_thread')
    return { path: `cases/${caseId}/threads`, payload: payload ?? {} };
  if (command === 'send_message') {
    const threadId = typeof payload?.threadId === 'string' ? payload.threadId : '';
    if (!uuidPattern.test(threadId)) return null;
    return {
      path: `cases/${caseId}/threads/${threadId}/messages`,
      payload: { messageBody: payload?.messageBody, fileAssetIds: payload?.fileAssetIds },
    };
  }
  if (command === 'mark_message_read') {
    const threadId = typeof payload?.threadId === 'string' ? payload.threadId : '';
    const messageId = typeof payload?.messageId === 'string' ? payload.messageId : '';
    if (!uuidPattern.test(threadId) || !uuidPattern.test(messageId)) return null;
    return {
      path: `cases/${caseId}/threads/${threadId}/messages/read`,
      payload: { messageId },
    };
  }
  if (command === 'create_internal_note') {
    if (area !== 'clinic') return null;
    const threadId = typeof payload?.threadId === 'string' ? payload.threadId : '';
    if (!uuidPattern.test(threadId)) return null;
    return {
      path: `cases/${caseId}/threads/${threadId}/internal-notes`,
      payload: { internalNote: payload?.internalNote },
    };
  }
  if (command === 'complete_milestone') {
    if (area !== 'clinic') return null;
    const milestoneId = typeof payload?.milestoneId === 'string' ? payload.milestoneId : '';
    if (!uuidPattern.test(milestoneId)) return null;
    return {
      path: `cases/${caseId}/journey/milestones/${milestoneId}/complete`,
      payload: {
        expectedVersion: payload?.expectedVersion,
        providerNote: payload?.providerNote,
      },
    };
  }
  if (command === 'create_treatment_instruction') {
    if (area !== 'clinic') return null;
    return { path: `cases/${caseId}/journey/instructions`, payload: payload ?? {} };
  }
  if (command === 'create_plan_change') {
    if (area !== 'clinic') return null;
    return { path: `cases/${caseId}/journey/changes`, payload: payload ?? {} };
  }
  if (command === 'acknowledge_plan_change') {
    if (area !== 'patient') return null;
    const changeId = typeof payload?.changeId === 'string' ? payload.changeId : '';
    if (!uuidPattern.test(changeId)) return null;
    return {
      path: `cases/${caseId}/journey/changes/${changeId}/acknowledge`,
      payload: {},
    };
  }
  if (command === 'create_passport_draft') {
    if (area !== 'clinic') return null;
    return { path: `cases/${caseId}/passport/drafts`, payload: payload ?? {} };
  }
  if (command === 'publish_passport') {
    if (area !== 'clinic') return null;
    const versionId = typeof payload?.versionId === 'string' ? payload.versionId : '';
    if (!uuidPattern.test(versionId)) return null;
    return {
      path: `cases/${caseId}/passport/versions/${versionId}/publish`,
      payload: {},
    };
  }
  if (command === 'create_passport_share') {
    if (area !== 'patient') return null;
    const versionId = typeof payload?.versionId === 'string' ? payload.versionId : '';
    if (!uuidPattern.test(versionId)) return null;
    return {
      path: `cases/${caseId}/passport/versions/${versionId}/shares`,
      payload: {
        expiresInMinutes: payload?.expiresInMinutes,
        maxAccessCount: payload?.maxAccessCount,
      },
    };
  }
  if (command === 'revoke_passport_share') {
    if (area !== 'patient') return null;
    const shareId = typeof payload?.shareId === 'string' ? payload.shareId : '';
    if (!uuidPattern.test(shareId)) return null;
    return {
      path: `cases/${caseId}/passport/shares/${shareId}`,
      payload: {},
      method: 'DELETE' as const,
    };
  }
  return null;
}

function clinicCommandTarget(
  command: string,
  payload: Record<string, unknown> | undefined,
): CommandTarget | null {
  const body = payload ?? {};
  if (command === 'clinic_update_profile')
    return { path: 'clinic-operations/onboarding/profile', payload: body };
  if (command === 'clinic_upsert_location')
    return { path: 'clinic-operations/onboarding/locations', payload: body };
  if (command === 'clinic_upsert_declaration')
    return { path: 'clinic-operations/onboarding/declarations', payload: body };
  if (command === 'clinic_add_document')
    return { path: 'clinic-operations/onboarding/documents', payload: body };
  if (command === 'clinic_accept_terms')
    return { path: 'clinic-operations/onboarding/terms', payload: body };
  if (command === 'clinic_begin_payout')
    return { path: 'clinic-operations/onboarding/payout', payload: body };
  if (command === 'clinic_refresh_payout')
    return { path: 'clinic-operations/onboarding/payout/refresh', payload: body };
  if (command === 'clinic_submit_onboarding')
    return { path: 'clinic-operations/onboarding/submit', payload: body };
  if (command === 'clinic_add_dentist')
    return { path: 'clinic-operations/dentists', payload: body };
  if (command === 'clinic_update_dentist') {
    const dentistId = stringId(body.dentistId);
    if (!dentistId) return null;
    return {
      path: `clinic-operations/dentists/${dentistId}`,
      payload: { active: body.active, reason: body.reason },
    };
  }
  if (command === 'clinic_invite_team')
    return { path: 'clinic-operations/team/invitations', payload: body };
  if (
    command === 'clinic_update_team_access' ||
    command === 'clinic_suspend_team' ||
    command === 'clinic_remove_team'
  ) {
    const membershipId = stringId(body.membershipId);
    if (!membershipId) return null;
    const operation =
      command === 'clinic_update_team_access'
        ? 'access'
        : command === 'clinic_suspend_team'
          ? 'suspend'
          : 'remove';
    const scopedPayload =
      operation === 'access'
        ? {
            expectedVersion: body.expectedVersion,
            role: body.role,
            locationIds: body.locationIds,
            permissions: body.permissions,
            jobTitle: body.jobTitle,
          }
        : { expectedVersion: body.expectedVersion, reason: body.reason };
    return { path: `clinic-operations/team/${membershipId}/${operation}`, payload: scopedPayload };
  }
  if (command === 'clinic_case_decision' || command === 'clinic_assign_dentist') {
    const caseId = stringId(body.caseId);
    if (!caseId) return null;
    return command === 'clinic_case_decision'
      ? {
          path: `clinic-operations/cases/${caseId}/decision`,
          payload: {
            expectedVersion: body.expectedVersion,
            decision: body.decision,
            reason: body.reason,
          },
        }
      : {
          path: `clinic-operations/cases/${caseId}/assign-dentist`,
          payload: { dentistId: body.dentistId },
        };
  }
  if (command === 'clinic_upsert_availability_rule')
    return { path: 'clinic-operations/availability/rules', payload: body };
  if (command === 'clinic_create_availability_block')
    return { path: 'clinic-operations/availability/blocks', payload: body };
  if (command === 'clinic_update_scheduling_policy')
    return { path: 'clinic-operations/availability/policy', payload: body };
  if (command === 'clinic_connect_calendar')
    return { path: 'clinic-operations/availability/calendars', payload: body };
  if (command === 'clinic_sync_calendar' || command === 'clinic_disconnect_calendar') {
    const connectionId = stringId(body.connectionId);
    if (!connectionId) return null;
    return command === 'clinic_sync_calendar'
      ? {
          path: `clinic-operations/availability/calendars/${connectionId}/sync`,
          payload: { expectedStatus: body.expectedStatus },
        }
      : {
          path: `clinic-operations/availability/calendars/${connectionId}/disconnect`,
          payload: { reason: body.reason },
        };
  }
  if (command === 'clinic_publish_service')
    return { path: 'clinic-operations/services', payload: body };
  if (command === 'clinic_archive_service') {
    const clinicServiceId = stringId(body.clinicServiceId);
    if (!clinicServiceId) return null;
    return {
      path: `clinic-operations/services/${clinicServiceId}/archive`,
      payload: { reason: body.reason },
    };
  }
  return null;
}

function stringId(value: unknown): string | null {
  return typeof value === 'string' && uuidPattern.test(value) ? value : null;
}
