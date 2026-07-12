import { notFound } from 'next/navigation';
import { isLocale } from '@dental-trust/i18n';
import { PortalPageServer } from '@/components/portal-page-server';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PortalPageServer area="concierge" locale={locale} />;
}
