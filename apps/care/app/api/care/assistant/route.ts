import { forwardCareAction } from '@/lib/care-actions';

export async function POST(request: Request) {
  const body = await request.json();
  return forwardCareAction('/assistant/messages', 'POST', body, 20_000);
}
