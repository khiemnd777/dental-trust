import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getMessages, isLocale, locales } from '@dental-trust/i18n';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
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
    <>
      <a className="skip-link" href="#main-content">
        {messages.common.skip}
      </a>
      {children}
    </>
  );
}
