import Link from 'next/link';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Badge, Card, Icon } from '@dental-trust/ui';
import type { PublicClinic } from '@/lib/public-data';
import { SaveClinicButton } from './save-clinic-button';

export function ClinicProfile({
  locale,
  messages,
  clinic,
  nonce,
}: {
  locale: Locale;
  messages: Messages;
  clinic: PublicClinic;
  nonce?: string;
}) {
  const p = messages.profile;
  const evidence = [
    [p.legal, clinic.license],
    [p.safety, clinic.evidence[1] ?? ''],
    [p.capability, clinic.services.join(' · ')],
    [p.transparency, clinic.price],
  ].filter((item) => item[1]);
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name: clinic.name,
    address: { '@type': 'PostalAddress', streetAddress: clinic.address, addressCountry: 'VN' },
    availableLanguage: clinic.languages,
  };
  return (
    <main id="main-content">
      {!clinic.fixture ? (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
        />
      ) : null}
      <section className="profile-hero">
        <div className="container">
          <div className="profile-breadcrumb">
            <Link href={`/${locale}/clinics`}>{p.breadcrumb}</Link> / {clinic.name}
          </div>
          <div className="profile-hero__grid">
            <div>
              <Badge tone={clinic.fixture ? 'attention' : 'verified'}>
                <Icon name="shield" />
                {clinic.fixture ? messages.common.developmentFixture : messages.common.verified}
              </Badge>
              <h1>{clinic.name}</h1>
              {clinic.description ? <p>{clinic.description}</p> : null}
              <div className="profile-hero__meta">
                {clinic.district ? (
                  <span>
                    <Icon name="clinic" />
                    {clinic.district}
                  </span>
                ) : null}
                {clinic.updated ? (
                  <span>
                    <Icon name="calendar" />
                    {p.verifiedOn}: {clinic.updated}
                  </span>
                ) : null}
                {clinic.rating && clinic.reviews ? (
                  <span>
                    <Icon name="star" />
                    {clinic.rating} · {clinic.reviews}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="profile-hero__actions">
              <SaveClinicButton
                slug={clinic.slug}
                save={p.saveClinic}
                saved={messages.common.saved}
              />
              <Link
                className="dt-button dt-button--primary button-link"
                href={`/${locale}/auth/register?intent=consultation&clinic=${clinic.slug}`}
              >
                {p.requestConsult}
                <Icon name="arrow" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container profile-layout">
          <div>
            {clinic.address || clinic.hours ? (
              <section className="profile-section">
                <h2>{p.overview}</h2>
                <p>
                  {clinic.address}
                  {clinic.address && clinic.hours ? <br /> : null}
                  {clinic.hours}
                </p>
              </section>
            ) : null}
            <section className="profile-section">
              <h2>{p.evidenceTitle}</h2>
              <p>{p.evidenceBody}</p>
              <div className="evidence-cards">
                {evidence.map(([evidenceTitle, body]) => (
                  <Card className="evidence-card" key={evidenceTitle}>
                    <span className="evidence-card__icon">
                      <Icon name="check" />
                    </span>
                    <div>
                      <h3>{evidenceTitle}</h3>
                      <p>
                        {body} · {p.checked}
                      </p>
                    </div>
                    <Badge tone={clinic.fixture ? 'attention' : 'verified'}>
                      {clinic.fixture ? messages.common.developmentFixture : p.valid}
                    </Badge>
                  </Card>
                ))}
              </div>
            </section>
            {clinic.services.length ? (
              <section className="profile-section">
                <h2>{p.services}</h2>
                <div className="evidence-cards">
                  {clinic.services.map((service, index) => (
                    <Card className="evidence-card" key={service}>
                      <span className="evidence-card__icon">
                        <Icon name="sparkle" />
                      </span>
                      <div>
                        <h3>{service}</h3>
                        <p>{messages.editorial.services[1]}</p>
                      </div>
                      {index === 0 && clinic.price ? <strong>{clinic.price}</strong> : null}
                    </Card>
                  ))}
                </div>
              </section>
            ) : null}
            {clinic.fixture ? (
              <section className="profile-section">
                <h2>{p.team}</h2>
                <Card className="evidence-card">
                  <span className="dt-avatar dt-avatar--lg">NT</span>
                  <div>
                    <h3>{messages.dentist.title}</h3>
                    <p>{messages.dentist.specialty}</p>
                  </div>
                  <Link className="text-link" href={`/${locale}/dentists/nguyen-minh-tam`}>
                    {messages.common.viewDetails}
                  </Link>
                </Card>
              </section>
            ) : null}
          </div>
          <aside className="profile-aside">
            <Card>
              <h2>{p.disclosures}</h2>
              {clinic.license ? <p>{clinic.license}</p> : null}
              {clinic.updated ? (
                <p>
                  {p.updatedOn}: {clinic.updated}
                </p>
              ) : null}
            </Card>
            <div className="profile-disclaimer">{p.disclaimer}</div>
          </aside>
        </div>
      </section>
    </main>
  );
}
