import { forwardCareAction } from '@/lib/care-actions';

export async function POST(request: Request) {
  return forwardCareAction('/assistant/speech', 'POST', await request.json(), 35_000);
}
