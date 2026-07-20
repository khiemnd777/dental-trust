import { forwardPublicCareRead } from '@/lib/care-actions';

const coordinateNames = ['west', 'south', 'east', 'north'] as const;

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const coordinates = Object.fromEntries(
    coordinateNames.map((name) => [name, Number(incoming.get(name))]),
  ) as Record<(typeof coordinateNames)[number], number>;

  if (
    coordinateNames.some((name) => !incoming.has(name)) ||
    coordinateNames.some((name) => !Number.isFinite(coordinates[name])) ||
    coordinates.west < -180 ||
    coordinates.east > 180 ||
    coordinates.south < -90 ||
    coordinates.north > 90 ||
    coordinates.east <= coordinates.west ||
    coordinates.north <= coordinates.south
  ) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Map bounds are invalid.',
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({ locale: 'vi-VN', limit: '100' });
  for (const name of coordinateNames) query.set(name, String(coordinates[name]));
  const cursor = incoming.get('cursor');
  if (cursor) query.set('cursor', cursor);

  return forwardPublicCareRead(`/public/clinics?${query.toString()}`);
}
