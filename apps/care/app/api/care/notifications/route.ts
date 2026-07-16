import { careIdempotencyKey, forwardCareAction } from '@/lib/care-actions';

export async function POST(request: Request) {
  const body = (await request.json()) as { notificationId?: string };
  if (!body.notificationId)
    return Response.json({ error: 'notificationId is required' }, { status: 400 });
  return forwardCareAction(
    `/notifications/${body.notificationId}/read`,
    'POST',
    undefined,
    8_000,
    careIdempotencyKey(request),
  );
}
