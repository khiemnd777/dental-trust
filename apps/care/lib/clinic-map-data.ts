import type { ClinicOption } from '@/lib/care-data';
import type { MapBoundingBox } from '@/lib/clinic-map';

interface ClinicPageEnvelope {
  readonly data?: unknown;
  readonly page?: { readonly nextCursor?: unknown };
}

const maximumViewportPages = 10;
const maximumCachedMapClinics = 2_000;

export function mergeClinicsIntoMapCache(
  currentClinics: readonly ClinicOption[],
  incomingClinics: readonly ClinicOption[],
  selectedId: string,
  maximumClinics = maximumCachedMapClinics,
): readonly ClinicOption[] {
  if (maximumClinics < 1) return [];

  const merged = new Map<string, ClinicOption>();
  const selectedClinic =
    incomingClinics.find(({ id }) => id === selectedId) ??
    currentClinics.find(({ id }) => id === selectedId);
  if (selectedClinic) merged.set(selectedClinic.id, selectedClinic);
  for (const clinic of incomingClinics) merged.set(clinic.id, clinic);
  for (const clinic of currentClinics) {
    if (!merged.has(clinic.id)) merged.set(clinic.id, clinic);
  }

  return [...merged.values()].slice(0, maximumClinics);
}

export async function loadClinicsInMapBounds(
  bounds: MapBoundingBox,
  signal: AbortSignal,
): Promise<readonly ClinicOption[]> {
  const clinics = new Map<string, ClinicOption>();
  let cursor: string | null = null;

  for (let pageNumber = 0; pageNumber < maximumViewportPages; pageNumber += 1) {
    const query = new URLSearchParams({
      west: String(bounds[0]),
      south: String(bounds[1]),
      east: String(bounds[2]),
      north: String(bounds[3]),
    });
    if (cursor) query.set('cursor', cursor);

    const response = await fetch(`/api/care/clinics?${query.toString()}`, {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw new Error(`Clinic viewport request failed with ${response.status}.`);

    const payload = (await response.json().catch(() => null)) as ClinicPageEnvelope | null;
    if (!payload || !Array.isArray(payload.data)) {
      throw new Error('Clinic viewport response was invalid.');
    }
    for (const clinic of payload.data as ClinicOption[]) {
      if (typeof clinic?.id === 'string') clinics.set(clinic.id, clinic);
    }

    const nextCursor = payload.page?.nextCursor;
    cursor = typeof nextCursor === 'string' && nextCursor.length > 0 ? nextCursor : null;
    if (!cursor) break;
  }

  return [...clinics.values()];
}
