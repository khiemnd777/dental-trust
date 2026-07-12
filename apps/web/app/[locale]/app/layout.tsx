import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isLocale } from '@dental-trust/i18n';
import { PortalAreaLayout } from '@/components/portal-area-layout';

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <PortalAreaLayout area="patient" locale={locale}>
      {children}
    </PortalAreaLayout>
  );
}
