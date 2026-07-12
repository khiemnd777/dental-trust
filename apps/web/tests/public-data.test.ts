import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadPublicClinic,
  loadPublicClinics,
  loadPublicDentist,
  loadPublicDentists,
  normalizeClinic,
  normalizeDentist,
} from '../lib/public-data';

const validClinic = {
  slug: 'verified-clinic',
  name: ' Verified Clinic ',
  verification: {
    status: 'VERIFIED',
    expiresAt: '2999-01-01T00:00:00.000Z',
    verifiedAt: '2026-07-12T00:00:00.000Z',
    evidence: ['LICENSE', null, 'SAFETY'],
  },
  locationLabel: 'District 1',
  services: ['Implants', null],
  languages: ['English'],
  rating: '4.9',
  reviewCount: '12',
  estimatedPriceLabel: 'USD 1000–2000',
  nextConsultationLabel: 'Tomorrow',
  licenseIdentifier: 'LICENSE-123',
  address: '1 Safe Street',
  openingHoursLabel: '08:00–18:00',
  description: 'Evidence checked.',
};

const validDentist = {
  slug: 'verified-dentist',
  name: 'Verified Dentist',
  verification: { status: 'VERIFIED', expiresAt: '2999-01-01T00:00:00.000Z' },
  specialty: 'Implant dentistry',
  introduction: 'Provider-authored profile.',
  licenseIdentifier: 'DENTIST-123',
  scopeOfPractice: 'Restorative dentistry',
  clinicName: 'Verified Clinic',
  nextConsultationLabel: 'Tomorrow',
  education: ['University'],
  procedures: ['Implants'],
  affiliations: ['Verified Clinic'],
  updatedAt: '2026-07-12T00:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('public verification read models', () => {
  it('accepts only a clinic with active, unexpired verification', () => {
    expect(
      normalizeClinic({
        slug: 'verified-clinic',
        name: 'Verified Clinic',
        verification: { status: 'ACTIVE', expiresAt: '2999-01-01T00:00:00.000Z' },
        services: ['Implants', null],
      }),
    ).toMatchObject({ slug: 'verified-clinic', fixture: false, services: ['Implants'] });
    expect(
      normalizeClinic({
        slug: 'expired-clinic',
        name: 'Expired Clinic',
        verification: { status: 'ACTIVE', expiresAt: '2000-01-01T00:00:00.000Z' },
      }),
    ).toBeNull();
  });

  it('normalizes every public clinic field and rejects malformed identity or status', () => {
    expect(normalizeClinic(validClinic)).toEqual({
      slug: 'verified-clinic',
      name: 'Verified Clinic',
      district: 'District 1',
      services: ['Implants'],
      languages: ['English'],
      rating: '4.9',
      reviews: '12',
      price: 'USD 1000–2000',
      next: 'Tomorrow',
      updated: '2026-07-12T00:00:00.000Z',
      evidence: ['LICENSE', 'SAFETY'],
      license: 'LICENSE-123',
      address: '1 Safe Street',
      hours: '08:00–18:00',
      description: 'Evidence checked.',
      verificationExpiresAt: '2999-01-01T00:00:00.000Z',
      fixture: false,
    });
    expect(normalizeClinic(null)).toBeNull();
    expect(normalizeClinic('clinic')).toBeNull();
    expect(normalizeClinic({ ...validClinic, verification: null })).toBeNull();
    expect(normalizeClinic({ ...validClinic, slug: '' })).toBeNull();
    expect(normalizeClinic({ ...validClinic, name: null })).toBeNull();
  });

  it('rejects a dentist with a malformed or inactive verification expiry', () => {
    expect(
      normalizeDentist({
        slug: 'malformed-expiry',
        name: 'Dentist',
        verificationStatus: 'VERIFIED',
        verificationExpiresAt: 'not-a-date',
      }),
    ).toBeNull();
    expect(
      normalizeDentist({
        slug: 'suspended-dentist',
        name: 'Dentist',
        verificationStatus: 'SUSPENDED',
        verificationExpiresAt: '2999-01-01T00:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('normalizes complete dentists and optional fallback fields', () => {
    expect(normalizeDentist(validDentist)).toEqual({
      slug: 'verified-dentist',
      name: 'Verified Dentist',
      specialty: 'Implant dentistry',
      introduction: 'Provider-authored profile.',
      licenseIdentifier: 'DENTIST-123',
      scope: 'Restorative dentistry',
      clinicName: 'Verified Clinic',
      nextConsultation: 'Tomorrow',
      education: ['University'],
      procedures: ['Implants'],
      affiliations: ['Verified Clinic'],
      updated: '2026-07-12T00:00:00.000Z',
      fixture: false,
    });
    expect(normalizeDentist(null)).toBeNull();
    expect(normalizeDentist('dentist')).toBeNull();
    expect(normalizeDentist({ ...validDentist, slug: '' })).toBeNull();
    expect(normalizeDentist({ ...validDentist, name: '' })).toBeNull();
    expect(normalizeDentist({ ...validDentist, updatedAt: null })).not.toHaveProperty('updated');
  });

  it('uses visibly marked fixtures only outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await expect(loadPublicClinics('en')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ fixture: true })]),
    );
    const clinics = await loadPublicClinics('en');
    await expect(loadPublicClinic('en', clinics[0]?.slug ?? '')).resolves.toMatchObject({
      fixture: true,
    });
    await expect(loadPublicClinic('en', 'missing')).resolves.toBeNull();
    await expect(loadPublicDentists('vi')).resolves.toEqual([
      expect.objectContaining({ slug: 'nguyen-minh-tam', fixture: true }),
    ]);
    await expect(loadPublicDentist('en', 'custom-slug')).resolves.toMatchObject({
      slug: 'custom-slug',
      fixture: true,
    });
  });

  it('loads and filters verified production directory lists', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [validClinic, { name: 'bad' }] }))
      .mockResolvedValueOnce(Response.json({ data: [validDentist, { name: 'bad' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadPublicClinics('en')).resolves.toEqual([
      expect.objectContaining({ slug: 'verified-clinic' }),
    ]);
    await expect(loadPublicDentists('vi')).resolves.toEqual([
      expect.objectContaining({ slug: 'verified-dentist' }),
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/public/clinics?verificationStatus=ACTIVE&locale=en',
      expect.objectContaining({ next: expect.objectContaining({ revalidate: 300 }) }),
    );
  });

  it('loads encoded production detail routes and rejects unavailable records', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: validClinic }))
      .mockResolvedValueOnce(Response.json({ data: validDentist }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadPublicClinic('en', 'clinic / one')).resolves.toMatchObject({
      slug: 'verified-clinic',
    });
    await expect(loadPublicDentist('vi', 'dentist / one')).resolves.toMatchObject({
      slug: 'verified-dentist',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('clinic%20%2F%20one');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('dentist%20%2F%20one');
    await expect(loadPublicClinic('en', 'missing')).resolves.toBeNull();
    await expect(loadPublicDentist('en', 'missing')).resolves.toBeNull();
  });

  it('fails closed for missing configuration, failed HTTP, and network errors', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    await expect(loadPublicClinics('en')).resolves.toEqual([]);
    await expect(loadPublicDentists('en')).resolves.toEqual([]);
    await expect(loadPublicClinic('en', 'clinic')).resolves.toBeNull();
    await expect(loadPublicDentist('en', 'dentist')).resolves.toBeNull();

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(loadPublicClinics('en')).resolves.toEqual([]);
    await expect(loadPublicDentists('en')).resolves.toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(loadPublicClinics('en')).resolves.toEqual([]);
    await expect(loadPublicDentists('en')).resolves.toEqual([]);
    await expect(loadPublicClinic('en', 'clinic')).resolves.toBeNull();
    await expect(loadPublicDentist('en', 'dentist')).resolves.toBeNull();
  });
});
