import { describe, expect, it } from 'vitest';

import {
  clinicHasMapLocation,
  clinicMapInitialCenter,
  clinicMapShortName,
  clinicMapViewportPadding,
  clinicTrustSignals,
  clinicTrustSignalCount,
  straightLineDistanceKm,
} from './clinic-map';

describe('clinic map presentation', () => {
  it('requires both a readable address and coordinates before mapping a clinic', () => {
    expect(
      clinicHasMapLocation({
        address: '22 Nguyễn Huệ, Phường Bến Nghé',
        coordinates: { latitude: 10.77392, longitude: 106.70335 },
      }),
    ).toBe(true);
    expect(
      clinicHasMapLocation({
        address: '   ',
        coordinates: { latitude: 10.77392, longitude: 106.70335 },
      }),
    ).toBe(false);
    expect(
      clinicHasMapLocation({
        address: '22 Nguyễn Huệ, Phường Bến Nghé',
        coordinates: null,
      }),
    ).toBe(false);
  });

  it('keeps review reputation separate from explainable verification groups', () => {
    const signals = clinicTrustSignals([
      { category: 'CLINIC_OPERATING_LICENSE' },
      { category: 'DENTIST_PRACTICE_LICENSE' },
      { category: 'DENTIST_CLINIC_AFFILIATION' },
      { category: 'INFECTION_CONTROL_PROCESS' },
      { category: 'EMERGENCY_PROCEDURES' },
    ]);
    expect(signals).toHaveLength(clinicTrustSignalCount);
    expect(signals.filter(({ verified }) => verified)).toHaveLength(3);
    expect(signals.find(({ key }) => key === 'international-support')?.verified).toBe(false);
  });

  it('selects a real initial center from user, clinic, then city fallback', () => {
    const clinics = [
      { id: 'north-west', coordinates: { latitude: 10.8, longitude: 106.6 } },
      { id: 'unmapped', coordinates: null },
    ];
    expect(clinicMapInitialCenter(clinics, { latitude: 10.8188, longitude: 106.6519 })).toEqual({
      latitude: 10.8188,
      longitude: 106.6519,
    });
    expect(clinicMapInitialCenter(clinics, null)).toEqual({ latitude: 10.8, longitude: 106.6 });
    expect(clinicMapInitialCenter([], null)).toEqual({ latitude: 10.7769, longitude: 106.7009 });
  });

  it('reserves viewport space for the responsive clinic details sheet', () => {
    expect(clinicMapViewportPadding(430, true)).toEqual({
      top: 112,
      right: 42,
      bottom: 430,
      left: 42,
    });
    expect(clinicMapViewportPadding(1280, false)).toEqual({
      top: 112,
      right: 72,
      bottom: 120,
      left: 72,
    });
  });

  it('creates compact marker labels without losing a fallback name', () => {
    expect(clinicMapShortName('Saigon Smiles Dental Center')).toBe('Saigon Smiles');
    expect(clinicMapShortName('Dental Clinic')).toBe('Dental Clinic');
    expect(clinicMapShortName('Verified Dental Clinic 7')).toBe('Nha khoa 7');
  });

  it('calculates distance without presenting it as road travel time', () => {
    expect(
      straightLineDistanceKm(
        { latitude: 10.77561, longitude: 106.70042 },
        { latitude: 10.78122, longitude: 106.69797 },
      ),
    ).toBeCloseTo(0.68, 1);
  });
});
