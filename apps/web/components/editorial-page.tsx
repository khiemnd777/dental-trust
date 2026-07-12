import Link from 'next/link';
import {
  getEditorialSectionCopy,
  type EditorialKey,
  type Locale,
  type Messages,
} from '@dental-trust/i18n';
import { Alert, Icon } from '@dental-trust/ui';
import { ContactForm } from './contact-form';

export function EditorialPage({
  locale,
  messages,
  pageKey,
}: {
  locale: Locale;
  messages: Messages;
  pageKey: EditorialKey;
}) {
  const [title, body, sections] = messages.editorial[pageKey];
  const sectionCopy = getEditorialSectionCopy(locale, pageKey);
  const isContact = pageKey === 'contact';
  const isServices = pageKey === 'services';
  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container page-hero__inner">
          <p className="eyebrow">{messages.common.brand}</p>
          <h1 className="display-title">{title}</h1>
          <p className="lead">{body}</p>
        </div>
      </section>
      <section className="section">
        <div className="container editorial-grid">
          <aside className="editorial-aside">
            <strong>{messages.common.viewDetails}</strong>
            {sections.map((section, index) => (
              <a href={`#section-${index + 1}`} key={section}>
                {section}
              </a>
            ))}
          </aside>
          <div>
            {isContact ? (
              <ContactForm messages={messages} topics={sections} />
            ) : (
              sections.map((section, index) => (
                <section className="editorial-section" id={`section-${index + 1}`} key={section}>
                  <h2>{section}</h2>
                  <p>{sectionCopy[index] ?? body}</p>
                  {isServices && index === 0 ? (
                    <Link className="text-link" href={`/${locale}/services/dental-implants`}>
                      {messages.common.learnMore}
                      <Icon name="arrow" />
                    </Link>
                  ) : null}
                  {index === 0 && pageKey === 'verification' ? (
                    <Alert title={messages.common.noAds}>{messages.profile.disclaimer}</Alert>
                  ) : null}
                </section>
              ))
            )}
            {!isContact ? (
              <div className="editorial-note">
                <Icon
                  name="info"
                  style={{ height: '1rem', marginRight: '.45rem', verticalAlign: 'middle' }}
                />
                {messages.footer.disclaimer}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
