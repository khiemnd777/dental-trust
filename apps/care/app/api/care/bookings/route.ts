import { careIdempotencyKey, forwardCareAction } from '@/lib/care-actions';

export async function POST(request: Request) {
  const body = await request.json();
  return forwardCareAction('/bookings/checkout', 'POST', body, 8_000, careIdempotencyKey(request));
}
