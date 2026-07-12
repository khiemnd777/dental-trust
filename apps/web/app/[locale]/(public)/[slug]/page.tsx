import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, isLocale, locales, type EditorialKey } from '@dental-trust/i18n';
import { EditorialPage } from '@/components/editorial-page';
import { publicPageMetadata } from '@/lib/metadata';

const pages = {
  about: 'about',
  'how-it-works': 'how',
  verification: 'verification',
  services: 'services',
  pricing: 'pricing',
  faq: 'faq',
  contact: 'contact',
  privacy: 'privacy',
  terms: 'terms',
  'medical-disclaimer': 'disclaimer',
} as const satisfies Record<string, EditorialKey>;

export function generateStaticParams() {
  return locales.flatMap((locale) => Object.keys(pages).map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !(slug in pages)) return {};
  const [title, description] = getMessages(locale).editorial[pages[slug as keyof typeof pages]];
  return publicPageMetadata({
    locale,
    title,
    description,
    path: slug,
  });
}

export default async function EditorialRoute({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !(slug in pages)) notFound();
  return (
    <EditorialPage
      locale={locale}
      messages={getMessages(locale)}
      pageKey={pages[slug as keyof typeof pages]}
    />
  );
}
