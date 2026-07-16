import { careIdempotencyKey, forwardCareAction } from '@/lib/care-actions';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: unknown;
    desiredProcedureCode?: unknown;
    preferredLocation?: unknown;
    preferredCurrency?: unknown;
    timingPreference?: unknown;
    decisionPriority?: unknown;
    preferredClinicId?: unknown;
  };
  const idempotencyKey = careIdempotencyKey(request);
  const { preferredClinicId, ...caseBody } = body;
  if (
    preferredClinicId !== undefined &&
    (typeof preferredClinicId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        preferredClinicId,
      ))
  )
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The preferred clinic is invalid.',
          retryable: false,
          fieldErrors: { preferredClinicId: ['Invalid clinic identifier.'] },
        },
      },
      { status: 400 },
    );
  const created = await forwardCareAction(
    '/cases',
    'POST',
    caseBody,
    8_000,
    `${idempotencyKey}-case`,
  );
  if (!created.ok || preferredClinicId === undefined) return created;
  const envelope = (await created
    .clone()
    .json()
    .catch(() => null)) as {
    data?: { id?: string };
  } | null;
  const caseId = envelope?.data?.id;
  if (!caseId)
    return Response.json(
      {
        error: {
          code: 'CARE_INVALID_RESPONSE',
          message: 'The case response was invalid.',
          retryable: true,
        },
      },
      { status: 502 },
    );
  const criteria = await forwardCareAction(
    `/cases/${caseId}/matching/criteria`,
    'POST',
    {
      procedureCode: caseBody.desiredProcedureCode,
      ...(typeof caseBody.preferredLocation === 'string'
        ? { preferredCity: caseBody.preferredLocation }
        : {}),
      preferences: { preferredClinicId },
    },
    8_000,
    `${idempotencyKey}-clinic`,
  );
  return criteria.ok ? created : criteria;
}
