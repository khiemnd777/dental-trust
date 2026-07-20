import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ProviderApiError, providerApiForSession } from '@/lib/provider-api';
import { readProviderSession } from '@/lib/require-session';

const uuidSchema = z.uuid();
const fileDownloadViewSchema = z.object({
  fileAssetId: z.uuid(),
  downloadUrl: z.url(),
  expiresAt: z.string().datetime({ offset: true }),
  mediaType: z.string().nullable(),
});

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly fileAssetId: string }> },
) {
  const session = await readProviderSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { fileAssetId } = await context.params;
  const caseIds = new URL(request.url).searchParams.getAll('caseId');
  const caseId = caseIds[0];
  if (
    !uuidSchema.safeParse(fileAssetId).success ||
    caseIds.length > 1 ||
    (caseId !== undefined && !uuidSchema.safeParse(caseId).success)
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const path = caseId
      ? `files/${fileAssetId}/download?caseId=${caseId}`
      : `files/clinic-uploads/${fileAssetId}/download`;
    const rawAccess = await providerApiForSession<unknown>(session, path);
    const parsed = fileDownloadViewSchema.safeParse(rawAccess);
    if (!parsed.success || parsed.data.fileAssetId !== fileAssetId) {
      return NextResponse.json({ error: 'invalid_download_response' }, { status: 502 });
    }
    const target = safeDownloadTarget(parsed.data.downloadUrl);
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

export function safeDownloadTarget(value: string): URL | null {
  try {
    const target = new URL(value);
    if (target.username || target.password) return null;
    if (target.protocol === 'https:') return target;
    if (target.protocol !== 'http:') return null;
    const hostname = target.hostname.toLowerCase();
    return hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
      ? target
      : null;
  } catch {
    return null;
  }
}
