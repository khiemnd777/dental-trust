import { notFound } from 'next/navigation';
import { isLocale } from '@dental-trust/i18n';
import { PortalPageServer } from '@/components/portal-page-server';
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; segments: string[] }>;
}) {
  const { locale, segments } = await params;
  if (!isLocale(locale)) notFound();
  return <PortalPageServer area="admin" locale={locale} segments={segments} />;
}
