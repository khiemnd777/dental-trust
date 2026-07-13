import { NextResponse } from 'next/server';

import type { VerificationEvidenceAccessView } from '@dental-trust/contracts';
import { OperationsApiError, operationsApiForSession } from '@/lib/operations-api';
import { readOperationsSession } from '@/lib/require-session';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly caseId: string; readonly evidenceId: string }> },
) {
  const session = await readOperationsSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { caseId, evidenceId } = await context.params;
  if (!uuidPattern.test(caseId) || !uuidPattern.test(evidenceId)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const access = await operationsApiForSession<VerificationEvidenceAccessView>(
      session,
      `verification/cases/${caseId}/evidence/${evidenceId}/access`,
    );
    const target =
      access.kind === 'FILE'
        ? access.downloadUrl
        : safeSourceUrl(access.sourceReference, request.url);
    if (!target) {
      return NextResponse.json({ error: 'evidence_source_not_openable' }, { status: 422 });
    }
    return NextResponse.redirect(target);
  } catch (error) {
    if (error instanceof OperationsApiError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

function safeSourceUrl(reference: string, requestUrl: string): URL | null {
  if (reference.startsWith('/')) return new URL(reference, requestUrl);
  try {
    const url = new URL(reference);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}
