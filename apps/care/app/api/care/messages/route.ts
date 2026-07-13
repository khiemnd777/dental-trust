import { forwardCareAction } from '@/lib/care-actions';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    caseId?: string;
    threadId?: string;
    messageBody?: string;
  };
  if (!body.caseId || !body.threadId || !body.messageBody?.trim())
    return Response.json({ error: 'Invalid message' }, { status: 400 });
  return forwardCareAction(`/cases/${body.caseId}/threads/${body.threadId}/messages`, 'POST', {
    messageBody: body.messageBody.trim(),
    fileAssetIds: [],
  });
}
