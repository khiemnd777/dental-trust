import Link from 'next/link';
import type { Locale } from '@dental-trust/i18n';

export function Brand({ locale, label }: { locale: Locale; label: string }) {
  return (
    <Link className="brand" href={`/${locale}`} aria-label={label}>
      <span className="brand__mark" aria-hidden="true" />
      <span className="brand__text">{label}</span>
    </Link>
  );
}
