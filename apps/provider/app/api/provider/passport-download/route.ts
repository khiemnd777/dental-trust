import { NextResponse } from 'next/server';
import { z } from 'zod';

import { safeDownloadTarget } from '@/app/api/provider/files/[fileAssetId]/download/route';
import { ProviderApiError, providerApiForSession } from '@/lib/provider-api';
import { readProviderSession } from '@/lib/require-session';

const uuidSchema = z.uuid();
const passportDownloadSchema = z.object({
  url: z.url(),
  expiresAt: z.string().datetime({ offset: true }),
});

export async function GET(request: Request) {
  const session = await readProviderSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const caseIds = searchParams.getAll('caseId');
  const versionIds = searchParams.getAll('versionId');
  const caseId = caseIds[0];
  const versionId = versionIds[0];
  if (
    caseIds.length !== 1 ||
    versionIds.length !== 1 ||
    !uuidSchema.safeParse(caseId).success ||
    !uuidSchema.safeParse(versionId).success
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const rawAccess = await providerApiForSession<unknown>(
      session,
      `cases/${caseId}/passport/versions/${versionId}/download`,
    );
    const parsed = passportDownloadSchema.safeParse(rawAccess);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_download_response' }, { status: 502 });
    }
    const target = safeDownloadTarget(parsed.data.url);
    if (!target) {
      return NextResponse.json({ error: 'unsafe_download_url' }, { status: 502 });
    }
    const response = NextResponse.redirect(target);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    if (error instanceof ProviderApiError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
