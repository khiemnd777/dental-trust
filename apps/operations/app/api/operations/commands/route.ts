import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  adminAccountStatusCommandSchema,
  adminNotificationRetryCommandSchema,
  adminRetryCommandSchema,
  assignVerificationCaseSchema,
  conciergeInternalNoteRequestSchema,
  conciergeWorkspaceUpdateSchema,
  decideVerificationCaseSchema,
  reviewVerificationEvidenceSchema,
  secondApprovalSchema,
} from '@dental-trust/contracts';
import { OperationsApiError, operationsApiForSession } from '@/lib/operations-api';
import { isSameOriginRequest } from '@/lib/request-origin';
import { readOperationsSession } from '@/lib/require-session';

const commandRequestSchema = z.object({
  command: z.enum([
    'coordination_update',
    'coordination_note',
    'verification_assign',
    'verification_review_evidence',
    'verification_decide',
    'verification_second_approve',
    'admin_retry_outbox',
    'admin_retry_notification',
    'admin_change_user_status',
  ]),
  resourceId: z.uuid(),
  secondaryId: z.uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.uuid(),
});

type CommandRequest = z.infer<typeof commandRequestSchema>;

interface CommandTarget {
  readonly path: string;
  readonly method: 'POST' | 'PATCH';
  readonly payload: unknown;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }
  const session = await readOperationsSession();
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
    case 'coordination_update':
      return {
        path: `concierge/cases/${input.resourceId}/workspace`,
        method: 'PATCH',
        payload: conciergeWorkspaceUpdateSchema.parse(input.payload),
      };
    case 'coordination_note':
      return {
        path: `concierge/cases/${input.resourceId}/internal-notes`,
        method: 'POST',
        payload: conciergeInternalNoteRequestSchema.parse(input.payload),
      };
    case 'verification_assign':
      return {
        path: `verification/cases/${input.resourceId}/assign`,
        method: 'POST',
        payload: assignVerificationCaseSchema.parse(input.payload),
      };
    case 'verification_review_evidence':
      return {
        path: `verification/cases/${input.resourceId}/evidence/${required(input.secondaryId)}/review`,
        method: 'POST',
        payload: reviewVerificationEvidenceSchema.parse(input.payload),
      };
    case 'verification_decide':
      return {
        path: `verification/cases/${input.resourceId}/decisions`,
        method: 'POST',
        payload: decideVerificationCaseSchema.parse(input.payload),
      };
    case 'verification_second_approve':
      return {
        path: `verification/reviews/${input.resourceId}/second-approval`,
        method: 'POST',
        payload: secondApprovalSchema.parse(input.payload),
      };
    case 'admin_retry_outbox':
      return {
        path: `admin/operations/jobs/outbox/${input.resourceId}/retry`,
        method: 'POST',
        payload: adminRetryCommandSchema.parse(input.payload),
      };
    case 'admin_retry_notification':
      return {
        path: `admin/operations/jobs/notifications/${input.resourceId}/retry`,
        method: 'POST',
        payload: adminNotificationRetryCommandSchema.parse(input.payload),
      };
    case 'admin_change_user_status':
      return {
        path: `admin/directory/users/${input.resourceId}/status`,
        method: 'POST',
        payload: adminAccountStatusCommandSchema.parse(input.payload),
      };
  }
}

function required(value: string | undefined): string {
  if (!value) throw new Error('missing_secondary_id');
  return value;
}
