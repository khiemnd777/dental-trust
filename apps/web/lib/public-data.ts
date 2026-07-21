import 'server-only';

import { getMessages, type Locale } from '@dental-trust/i18n';
import { bffClientContextHeaders } from './bff-client-context';

export interface PublicClinic {
  slug: string;
  name: string;
  district: string;
  services: readonly string[];
  languages: readonly string[];
  rating: string;
  reviews: string;
  price: string;
  next: string;
  updated: string;
  evidence: readonly string[];
  license: string;
  address: string;
  hours: string;
  description: string;
  verificationExpiresAt?: string;
  fixture: boolean;
}

export interface PublicDentist {
  slug: string;
  name: string;
  specialty: string;
  introduction: string;
  licenseIdentifier: string;
  scope: string;
  clinicName: string;
  nextConsultation: string;
  education: readonly string[];
  procedures: readonly string[];
  affiliations: readonly string[];
  updated?: string;
  fixture: boolean;
}

function developmentClinics(locale: Locale): PublicClinic[] {
  const messages = getMessages(locale);
  return messages.clinics.map((clinic) => ({
    ...clinic,
    license: messages.profile.license,
    address: messages.profile.address,
    hours: messages.profile.hours,
    description: messages.profile.profileIntro,
    fixture: true,
  }));
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function normalizeClinic(value: unknown): PublicClinic | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const verification =
    item.verification && typeof item.verification === 'object'
      ? (item.verification as Record<string, unknown>)
      : null;
  const status = asString(verification?.status ?? item.verificationStatus);
  const expiresAt = asString(verification?.expiresAt ?? item.verificationExpiresAt);
  if (!['ACTIVE', 'VERIFIED'].includes(status ?? '')) return null;
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())
    return null;
  const slug = asString(item.slug);
  const name = asString(item.name);
  if (!slug || !name) return null;
  return {
    slug,
    name,
    district: asString(item.locationLabel ?? item.district) ?? '',
    services: asStrings(item.services),
    languages: asStrings(item.languages),
    rating: asString(item.rating) ?? '',
    reviews: asString(item.reviewCount) ?? '',
    price: asString(item.estimatedPriceLabel) ?? '',
    next: asString(item.nextConsultationLabel) ?? '',
    updated: asString(verification?.verifiedAt ?? item.updatedAt) ?? '',
    evidence: asStrings(verification?.evidence ?? item.evidence),
    license: asString(item.licenseIdentifier) ?? '',
    address: asString(item.address) ?? '',
    hours: asString(item.openingHoursLabel) ?? '',
    description: asString(item.description) ?? '',
    verificationExpiresAt: expiresAt,
    fixture: false,
  };
}

export async function loadPublicClinics(locale: Locale): Promise<PublicClinic[]> {
  if (process.env.NODE_ENV !== 'production') return developmentClinics(locale);
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return [];
  try {
    const clientContext = await bffClientContextHeaders();
    const response = await fetch(
      `${api}/public/clinics?verificationStatus=ACTIVE&locale=${locale}`,
      {
        headers: clientContext,
        next: { revalidate: 300, tags: ['public-clinics', `public-clinics-${locale}`] },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return [];
    const envelope = (await response.json()) as { data?: unknown[] };
    return (envelope.data ?? [])
      .map(normalizeClinic)
      .filter((clinic): clinic is PublicClinic => clinic !== null);
  } catch {
    return [];
  }
}

export async function loadPublicClinic(locale: Locale, slug: string) {
  if (process.env.NODE_ENV !== 'production') {
    return (await loadPublicClinics(locale)).find((clinic) => clinic.slug === slug) ?? null;
  }
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return null;
  try {
    const clientContext = await bffClientContextHeaders();
    const response = await fetch(
      `${api}/public/clinics/${encodeURIComponent(slug)}?locale=${locale}`,
      {
        headers: clientContext,
        next: { revalidate: 300, tags: [`public-clinic-${slug}`] },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return null;
    const envelope = (await response.json()) as { data?: unknown };
    return normalizeClinic(envelope.data);
  } catch {
    return null;
  }
}

export function normalizeDentist(value: unknown): PublicDentist | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const verification =
    item.verification && typeof item.verification === 'object'
      ? (item.verification as Record<string, unknown>)
      : null;
  const status = asString(verification?.status ?? item.verificationStatus);
  const expiresAt = asString(verification?.expiresAt ?? item.verificationExpiresAt);
  const expiresAtTimestamp = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (
    !['ACTIVE', 'VERIFIED'].includes(status ?? '') ||
    !expiresAt ||
    Number.isNaN(expiresAtTimestamp) ||
    expiresAtTimestamp <= Date.now()
  )
    return null;
  const slug = asString(item.slug);
  const name = asString(item.name);
  if (!slug || !name) return null;
  const updated = asString(item.updatedAt);
  return {
    slug,
    name,
    specialty: asString(item.specialty) ?? '',
    introduction: asString(item.introduction) ?? '',
    licenseIdentifier: asString(item.licenseIdentifier) ?? '',
    scope: asString(item.scopeOfPractice) ?? '',
    clinicName: asString(item.clinicName) ?? '',
    nextConsultation: asString(item.nextConsultationLabel) ?? '',
    education: asStrings(item.education),
    procedures: asStrings(item.procedures),
    affiliations: asStrings(item.affiliations),
    ...(updated ? { updated } : {}),
    fixture: false,
  };
}

function developmentDentist(locale: Locale, slug: string): PublicDentist {
  const messages = getMessages(locale);
  return {
    slug,
    name: messages.dentist.title,
    specialty: messages.dentist.specialty,
    introduction: messages.dentist.intro,
    licenseIdentifier: messages.dentist.license,
    scope: messages.dentist.scope,
    clinicName: messages.clinics[0].name,
    nextConsultation: messages.clinics[0].next,
    education: [messages.dentist.education],
    procedures: messages.clinics[0].services,
    affiliations: [messages.clinics[0].name],
    fixture: true,
  };
}

export async function loadPublicDentists(locale: Locale): Promise<PublicDentist[]> {
  if (process.env.NODE_ENV !== 'production') {
    return [developmentDentist(locale, 'nguyen-minh-tam')];
  }
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return [];
  try {
    const clientContext = await bffClientContextHeaders();
    const response = await fetch(`${api}/public/dentists?locale=${locale}`, {
      headers: clientContext,
      next: { revalidate: 300, tags: ['public-dentists', `public-dentists-${locale}`] },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    const envelope = (await response.json()) as { data?: unknown[] };
    return (envelope.data ?? [])
      .map(normalizeDentist)
      .filter((dentist): dentist is PublicDentist => dentist !== null);
  } catch {
    return [];
  }
}

export async function loadPublicDentist(
  locale: Locale,
  slug: string,
): Promise<PublicDentist | null> {
  if (process.env.NODE_ENV !== 'production') return developmentDentist(locale, slug);
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return null;
  try {
    const clientContext = await bffClientContextHeaders();
    const response = await fetch(
      `${api}/public/dentists/${encodeURIComponent(slug)}?locale=${locale}`,
      {
        headers: clientContext,
        next: { revalidate: 300, tags: [`public-dentist-${slug}`] },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return null;
    const envelope = (await response.json()) as { data?: unknown };
    return normalizeDentist(envelope.data);
  } catch {
    return null;
  }
}
