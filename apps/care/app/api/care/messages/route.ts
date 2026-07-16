import { careIdempotencyKey, forwardCareAction } from '@/lib/care-actions';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    caseId?: string;
    threadId?: string;
    messageBody?: string;
  };
  if (!body.caseId || !body.threadId || !body.messageBody?.trim())
    return Response.json({ error: 'Invalid message' }, { status: 400 });
  return forwardCareAction(
    `/cases/${body.caseId}/threads/${body.threadId}/messages`,
    'POST',
    {
      messageBody: body.messageBody.trim(),
      fileAssetIds: [],
    },
    8_000,
    careIdempotencyKey(request),
  );
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    caseId?: string;
    threadId?: string;
    messageIds?: unknown;
  };
  if (
    !body.caseId ||
    !body.threadId ||
    !Array.isArray(body.messageIds) ||
    !body.messageIds.length ||
    body.messageIds.length > 100 ||
    !body.messageIds.every((messageId) => typeof messageId === 'string')
  )
    return Response.json({ error: 'Invalid read receipt request' }, { status: 400 });
  const idempotencyKey = careIdempotencyKey(request);
  let result: Response | null = null;
  for (const [index, messageId] of body.messageIds.entries()) {
    result = await forwardCareAction(
      `/cases/${body.caseId}/threads/${body.threadId}/messages/read`,
      'POST',
      { messageId },
      8_000,
      `${idempotencyKey}-${index}`,
    );
    if (!result.ok) return result;
  }
  return result ?? Response.json({ data: { read: true } });
}
