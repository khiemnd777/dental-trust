import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { Badge, Card, Icon } from '@dental-trust/ui';
import { publicPageMetadata } from '@/lib/metadata';
import { loadPublicDentist } from '@/lib/public-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const dentist = await loadPublicDentist(locale, slug);
  if (!dentist) return {};
  return publicPageMetadata({
    locale,
    title: dentist.name,
    description: dentist.introduction,
    path: `dentists/${slug}`,
    indexable: !dentist.fixture,
  });
}

export default async function DentistPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dentist = await loadPublicDentist(locale, slug);
  if (!dentist) notFound();
  const messages = getMessages(locale);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: dentist.name,
    jobTitle: dentist.specialty || 'Dentist',
    description: dentist.introduction,
    identifier: dentist.licenseIdentifier,
    affiliation: dentist.affiliations.map((name) => ({ '@type': 'Organization', name })),
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/${locale}/dentists/${slug}`,
  };
  const sections = [
    [messages.dentist.education, dentist.education],
    [messages.dentist.affiliations, dentist.affiliations],
    [messages.dentist.procedures, dentist.procedures],
    [messages.dentist.availability, dentist.nextConsultation ? [dentist.nextConsultation] : []],
  ] as const;
  return (
    <main id="main-content">
      {!dentist.fixture ? (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structured).replace(/</g, '\\u003c'),
          }}
        />
      ) : null}
      <section className="profile-hero">
        <div className="container profile-hero__grid">
          <div>
            <Badge tone={dentist.fixture ? 'attention' : 'verified'}>
              <Icon name="shield" />
              {dentist.fixture ? messages.common.developmentFixture : messages.common.verified}
            </Badge>
            <h1>{dentist.name}</h1>
            <p>
              {dentist.specialty}
              {dentist.specialty && dentist.introduction ? ' · ' : ''}
              {dentist.introduction}
            </p>
            <div className="profile-hero__meta">
              {dentist.licenseIdentifier ? (
                <span>
                  <Icon name="document" />
                  {dentist.licenseIdentifier}
                </span>
              ) : null}
              {dentist.scope ? (
                <span>
                  <Icon name="shield" />
                  {dentist.scope}
                </span>
              ) : null}
            </div>
          </div>
          <Link
            className="dt-button dt-button--primary button-link"
            href={`/${locale}/auth/register?intent=consultation&dentist=${slug}`}
          >
            {messages.profile.requestConsult}
            <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className="section">
        <div className="container profile-layout">
          <div>
            {sections
              .filter(([, values]) => values.length > 0)
              .map(([sectionTitle, values], index) => (
                <section className="profile-section" key={sectionTitle}>
                  <h2>{sectionTitle}</h2>
                  {values.map((value) => (
                    <Card className="evidence-card" key={value}>
                      <span className="evidence-card__icon">
                        <Icon name={index === 3 ? 'calendar' : 'check'} />
                      </span>
                      <div>
                        <h3>{value}</h3>
                        {dentist.specialty ? <p>{dentist.specialty}</p> : null}
                      </div>
                      <Badge tone={dentist.fixture ? 'attention' : 'verified'}>
                        {dentist.fixture
                          ? messages.common.developmentFixture
                          : messages.common.verified}
                      </Badge>
                    </Card>
                  ))}
                </section>
              ))}
          </div>
          <aside className="profile-aside">
            <Card>
              <h2>{messages.profile.evidenceTitle}</h2>
              {dentist.licenseIdentifier ? <p>{dentist.licenseIdentifier}</p> : null}
              {dentist.scope ? <p>{dentist.scope}</p> : null}
            </Card>
            <div className="profile-disclaimer">{messages.profile.disclaimer}</div>
          </aside>
        </div>
      </section>
    </main>
  );
}
