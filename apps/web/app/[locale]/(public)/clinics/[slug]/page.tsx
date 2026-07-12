import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { ClinicProfile } from '@/components/clinic-profile';
import { publicPageMetadata } from '@/lib/metadata';
import { loadPublicClinic } from '@/lib/public-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const clinic = await loadPublicClinic(locale, slug);
  if (!clinic) return {};
  return publicPageMetadata({
    locale,
    title: clinic.name,
    description: clinic.description || clinic.evidence.join(' · '),
    path: `clinics/${slug}`,
    indexable: !clinic.fixture,
  });
}

export default async function ClinicPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const clinic = await loadPublicClinic(locale, slug);
  if (!clinic) notFound();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <ClinicProfile
      clinic={clinic}
      locale={locale}
      messages={getMessages(locale)}
      {...(nonce ? { nonce } : {})}
    />
  );
}
