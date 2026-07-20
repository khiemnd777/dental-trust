import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClinicOption } from './care-data';
import { loadClinicsInMapBounds, mergeClinicsIntoMapCache } from './clinic-map-data';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clinic map viewport data', () => {
  it('retains clinics already seen when a small pan returns an adjacent bbox', () => {
    const result = mergeClinicsIntoMapCache(
      [clinic('saigon-smiles'), clinic('clinic-8')],
      [clinic('clinic-7')],
      'saigon-smiles',
    );

    expect(result.map(({ id }) => id)).toEqual(['saigon-smiles', 'clinic-7', 'clinic-8']);
  });

  it('keeps the selected clinic while enforcing the session cache limit', () => {
    const result = mergeClinicsIntoMapCache(
      [clinic('selected'), clinic('old')],
      [clinic('new')],
      'selected',
      2,
    );

    expect(result.map(({ id }) => id)).toEqual(['selected', 'new']);
  });

  it('loads every page atomically and deduplicates clinics', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [clinic('clinic-1')],
          page: { nextCursor: 'next-clinic' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [clinic('clinic-1'), clinic('clinic-2')],
          page: { nextCursor: null },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadClinicsInMapBounds(
      [106.67, 10.75, 106.73, 10.81],
      new AbortController().signal,
    );

    expect(result.map(({ id }) => id)).toEqual(['clinic-1', 'clinic-2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('west=106.67');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('cursor=next-clinic');
  });

  it('rejects an invalid page instead of replacing the current marker set', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: null })));

    await expect(
      loadClinicsInMapBounds([106.67, 10.75, 106.73, 10.81], new AbortController().signal),
    ).rejects.toThrow(/invalid/iu);
  });
});

function clinic(id: string): ClinicOption {
  return { id } as ClinicOption;
}
