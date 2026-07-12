'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { alternateLocale, type Locale } from '@dental-trust/i18n';
import { Icon } from '@dental-trust/ui';

export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const nextLocale = alternateLocale(locale);
  const href = pathname.replace(/^\/(vi|en)(?=\/|$)/, `/${nextLocale}`);
  return (
    <Link
      className="locale-switch"
      href={href || `/${nextLocale}`}
      hrefLang={nextLocale === 'vi' ? 'vi-VN' : 'en-US'}
      aria-label={label}
    >
      <Icon name="globe" />
      {nextLocale.toUpperCase()}
    </Link>
  );
}
