import { careIdempotencyKey, forwardCareAction } from '@/lib/care-actions';

export async function POST(request: Request) {
  const body = (await request.json()) as { clinicId?: string };
  if (!body.clinicId) return Response.json({ error: 'clinicId is required' }, { status: 400 });
  return forwardCareAction(
    '/saved-clinics',
    'POST',
    { clinicId: body.clinicId },
    8_000,
    careIdempotencyKey(request),
  );
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { savedClinicId?: string };
  if (!body.savedClinicId)
    return Response.json({ error: 'savedClinicId is required' }, { status: 400 });
  return forwardCareAction(
    `/saved-clinics/${body.savedClinicId}`,
    'DELETE',
    undefined,
    8_000,
    careIdempotencyKey(request),
  );
}
