import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { HomePage } from '@/components/home-page';
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
    title: locale === 'vi' ? 'Nha khoa Việt Nam đã xác minh' : 'Verified dental care in Vietnam',
    description: messages.home.body,
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <HomePage
      clinics={await loadPublicClinics(locale)}
      locale={locale}
      messages={getMessages(locale)}
      {...(nonce ? { nonce } : {})}
    />
  );
}
