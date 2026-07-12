import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { EditorialPage } from '@/components/editorial-page';
import { publicPageMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug !== 'dental-implants') return {};
  const [title, description] = getMessages(locale).editorial.serviceDetail;
  return publicPageMetadata({
    locale,
    title,
    description,
    path: `services/${slug}`,
  });
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug !== 'dental-implants') notFound();
  return <EditorialPage locale={locale} messages={getMessages(locale)} pageKey="serviceDetail" />;
}
