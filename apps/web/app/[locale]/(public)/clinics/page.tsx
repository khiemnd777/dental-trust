import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { ClinicDiscovery } from '@/components/clinic-discovery';
import { publicPageMetadata } from '@/lib/metadata';
import { loadPublicClinics } from '@/lib/public-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale);
  return publicPageMetadata({
    locale,
    title: messages.discovery.title,
    description: messages.discovery.body,
    path: 'clinics',
  });
}

export default async function ClinicsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <ClinicDiscovery
      clinics={await loadPublicClinics(locale)}
      locale={locale}
      messages={getMessages(locale)}
    />
  );
}
