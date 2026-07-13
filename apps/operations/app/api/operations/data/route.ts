import { NextResponse } from 'next/server';

import { OperationsApiError } from '@/lib/operations-api';
import { getCoordinationDetail, getVerificationDetail } from '@/lib/operations-data';
import { readOperationsSession } from '@/lib/require-session';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: Request) {
  const session = await readOperationsSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const resourceId = url.searchParams.get('resourceId');
  if (
    (kind !== 'coordination' && kind !== 'verification') ||
    !resourceId ||
    !uuidPattern.test(resourceId)
  )
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const data =
      kind === 'coordination'
        ? await getCoordinationDetail(resourceId)
        : await getVerificationDetail(resourceId);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof OperationsApiError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
