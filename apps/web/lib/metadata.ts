import type { Metadata } from 'next';
import type { Locale } from '@dental-trust/i18n';

export function publicPageMetadata({
  locale,
  title,
  description,
  path = '',
  indexable = true,
}: {
  locale: Locale;
  title: string;
  description: string;
  path?: string;
  indexable?: boolean;
}): Metadata {
  const normalizedPath = path ? `/${path.replace(/^\/+|\/+$/gu, '')}` : '';
  const canonical = `/${locale}${normalizedPath}`;
  const vietnamese = `/vi${normalizedPath}`;
  const english = `/en${normalizedPath}`;
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: { 'vi-VN': vietnamese, 'en-US': english, 'x-default': vietnamese },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Dental Trust',
      locale: locale === 'vi' ? 'vi_VN' : 'en_US',
      alternateLocale: [locale === 'vi' ? 'en_US' : 'vi_VN'],
      url: canonical,
    },
    twitter: { card: 'summary', title, description },
    robots:
      indexable && process.env.NODE_ENV === 'production'
        ? undefined
        : { index: false, follow: false, noarchive: true },
  };
}
