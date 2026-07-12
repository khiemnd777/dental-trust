import Link from 'next/link';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Brand } from './brand';

export function PublicFooter({ locale, messages }: { locale: Locale; messages: Messages }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Brand locale={locale} label={messages.common.brand} />
            <p>{messages.footer.statement}</p>
          </div>
          <div className="footer-column">
            <h2>{messages.nav.clinics}</h2>
            <Link href={`/${locale}/clinics`}>{messages.nav.clinics}</Link>
            <Link href={`/${locale}/services`}>{messages.nav.services}</Link>
            <Link href={`/${locale}/pricing`}>{messages.nav.pricing}</Link>
          </div>
          <div className="footer-column">
            <h2>{messages.nav.about}</h2>
            <Link href={`/${locale}/about`}>{messages.nav.about}</Link>
            <Link href={`/${locale}/how-it-works`}>{messages.nav.how}</Link>
            <Link href={`/${locale}/verification`}>{messages.nav.verification}</Link>
            <Link href={`/${locale}/faq`}>{messages.nav.faq}</Link>
          </div>
          <div className="footer-column">
            <h2>{messages.nav.contact}</h2>
            <Link href={`/${locale}/contact`}>{messages.nav.contact}</Link>
            <Link href={`/${locale}/privacy`}>{messages.nav.privacy}</Link>
            <Link href={`/${locale}/terms`}>{messages.nav.terms}</Link>
            <Link href={`/${locale}/medical-disclaimer`}>{messages.nav.disclaimer}</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{messages.footer.rights}</span>
          <span>{messages.footer.disclaimer}</span>
        </div>
      </div>
    </footer>
  );
}
