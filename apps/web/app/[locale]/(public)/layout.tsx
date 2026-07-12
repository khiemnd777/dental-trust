import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';

export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = getMessages(locale);
  return (
    <div className="site-shell">
      <PublicHeader locale={locale} messages={messages} />
      {children}
      <PublicFooter locale={locale} messages={messages} />
    </div>
  );
}
