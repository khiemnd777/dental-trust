import Link from 'next/link';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Alert, Badge, Card, EmptyState, Icon } from '@dental-trust/ui';
import type { PublicClinic } from '@/lib/public-data';

function ToothGraphic() {
  return (
    <svg className="hero-visual__tooth" viewBox="0 0 160 180" aria-hidden="true">
      <path d="M80 18c-21-15-52-12-62 9-10 20 4 39 10 55 7 17 7 72 25 80 13 6 14-36 27-36s14 42 27 36c18-8 18-63 25-80 6-16 20-35 10-55-10-21-41-24-62-9Z" />
      <path d="M53 35c15 9 39 9 54 0" />
      <path d="M48 78c21 12 43 12 64 0" />
    </svg>
  );
}

export function HomePage({
  locale,
  messages,
  clinics,
  nonce,
}: {
  locale: Locale;
  messages: Messages;
  clinics: PublicClinic[];
  nonce?: string;
}) {
  const h = messages.home;
  const clinic = clinics[0];
  const fixture = clinics.some((item) => item.fixture);
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Dental Trust',
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/${locale}`,
    description: h.body,
  };
  return (
    <main id="main-content">
      {!fixture ? (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organization).replace(/</g, '\\u003c'),
          }}
        />
      ) : null}
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">{h.eyebrow}</p>
            <h1 className="display-title">{h.title}</h1>
            <p className="lead">{h.body}</p>
            <div className="hero__actions">
              <Link
                className="dt-button dt-button--primary dt-button--lg button-link"
                href={`/${locale}/clinics`}
              >
                {h.primary}
                <Icon name="arrow" />
              </Link>
              <Link
                className="dt-button dt-button--secondary dt-button--lg button-link"
                href={`/${locale}/verification`}
              >
                {h.secondary}
              </Link>
            </div>
            <p className="hero__trust">
              <Icon name="shield" />
              {h.trustLine}
            </p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-visual__orb">
              <ToothGraphic />
            </div>
            {clinic ? (
              <div className="floating-proof floating-proof--one">
                <div className="floating-proof__top">
                  <span className="floating-proof__icon">
                    <Icon name="shield" />
                  </span>
                  <div>
                    <strong>
                      {clinic.fixture
                        ? messages.common.developmentFixture
                        : messages.common.verified}
                    </strong>
                    <span>{clinic.updated}</span>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="floating-proof floating-proof--two">
              <div className="floating-proof__top">
                <span className="floating-proof__icon">
                  <Icon name="message" />
                </span>
                <div>
                  <strong>{messages.common.support}</strong>
                  <span>VI · EN</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="stats-strip" aria-label={h.trustLine}>
        <div className="container stats-grid">
          {[h.stat1, h.stat2, h.stat3].map(([value, label]) => (
            <div className="stat" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="container">
          {fixture ? <Alert tone="warning" title={messages.common.developmentFixture} /> : null}
          <div className="section-head">
            <div className="section-head__copy">
              <p className="eyebrow">{h.journeyEyebrow}</p>
              <h2 className="section-title">{h.journeyTitle}</h2>
            </div>
            <Link className="text-link" href={`/${locale}/how-it-works`}>
              {messages.common.learnMore}
              <Icon name="arrow" />
            </Link>
          </div>
          <div className="journey-grid">
            {h.steps.map(([number, title, body]) => (
              <article className="journey-card" key={number}>
                <span className="journey-card__number">{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section section--soft">
        <div className="container evidence-panel">
          <div className="evidence-orbit">
            <div className="evidence-orbit__center">
              <Icon name="shield" />
            </div>
          </div>
          <div>
            <p className="eyebrow">{h.evidenceEyebrow}</p>
            <h2 className="section-title">{h.evidenceTitle}</h2>
            <p className="lead">{h.evidenceBody}</p>
            <div className="evidence-list">
              {h.evidenceItems.map((item) => (
                <div className="evidence-list__item" key={item}>
                  <Icon name="check" />
                  {item}
                </div>
              ))}
            </div>
            <Link
              className="text-link"
              href={`/${locale}/verification`}
              style={{ marginTop: '1.4rem' }}
            >
              {messages.common.evidence}
              <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="section-head__copy">
              <p className="eyebrow">{messages.common.verified}</p>
              <h2 className="section-title">{h.featured}</h2>
              <p>{h.featuredBody}</p>
            </div>
            <Link className="text-link" href={`/${locale}/clinics`}>
              {messages.nav.clinics}
              <Icon name="arrow" />
            </Link>
          </div>
          {clinics.length ? (
            <div className="clinic-grid">
              {clinics.map((item) => (
                <Card className="clinic-card" key={item.slug}>
                  <div className="clinic-card__visual">
                    <span className="clinic-card__mark">
                      <Icon name="clinic" />
                    </span>
                  </div>
                  <div className="clinic-card__body">
                    <Badge tone={item.fixture ? 'attention' : 'verified'}>
                      <Icon name="shield" />
                      {item.fixture ? messages.common.developmentFixture : messages.common.verified}
                    </Badge>
                    <h3>{item.name}</h3>
                    <p className="clinic-card__location">{item.district}</p>
                    <div className="clinic-card__meta">
                      {item.rating && item.reviews ? (
                        <span>
                          <Icon name="star" />
                          {item.rating} · {item.reviews}
                        </span>
                      ) : null}
                      <span>{item.services.join(' · ')}</span>
                    </div>
                    <div className="clinic-card__footer">
                      <Link className="text-link" href={`/${locale}/clinics/${item.slug}`}>
                        {messages.discovery.openProfile}
                        <Icon name="arrow" />
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon="clinic"
                title={messages.common.emptyTitle}
                body={messages.common.emptyBody}
              />
            </Card>
          )}
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="cta-panel">
            <div>
              <h2>{h.conciergeTitle}</h2>
              <p>{h.conciergeBody}</p>
            </div>
            <Link
              className="dt-button dt-button--primary dt-button--lg button-link"
              href={`/${locale}/contact`}
            >
              {h.conciergeCta}
              <Icon name="message" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
