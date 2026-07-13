'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Badge,
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Icon,
  SelectField,
} from '@dental-trust/ui';
import { developmentCaseId } from '@/lib/routing';
import type { PublicClinic } from '@/lib/public-data';

export function ClinicDiscovery({
  locale,
  messages,
  clinics,
}: {
  locale: Locale;
  messages: Messages;
  clinics: PublicClinic[];
}) {
  const [query, setQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [service, setService] = useState('');
  const [aftercare, setAftercare] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
  const filtersCloseRef = useRef<HTMLButtonElement>(null);
  const [interactive, setInteractive] = useState(false);
  const [compared, setCompared] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(window.localStorage.getItem('dt-saved-clinics') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  useEffect(() => setInteractive(true), []);
  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    const focusFrame = window.requestAnimationFrame(() => filtersCloseRef.current?.focus());
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      window.cancelAnimationFrame(focusFrame);
      filtersTriggerRef.current?.focus();
    };
  }, [filtersOpen]);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return clinics.filter((clinic) => {
      const matchesText =
        !normalized ||
        [clinic.name, clinic.district, ...clinic.services]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalized);
      const matchesService =
        !service ||
        clinic.services.some((item) =>
          item.toLocaleLowerCase().includes(service.toLocaleLowerCase().split(' ')[0] ?? service),
        );
      const matchesAftercare =
        !aftercare ||
        clinic.evidence.some((item) => /aftercare|hậu mãi|follow-up|khẩn/i.test(item));
      return matchesText && matchesService && matchesAftercare;
    });
  }, [aftercare, clinics, query, service]);
  const toggleSave = (slug: string) => {
    const next = saved.includes(slug) ? saved.filter((item) => item !== slug) : [...saved, slug];
    setSaved(next);
    window.localStorage.setItem('dt-saved-clinics', JSON.stringify(next));
  };
  const toggleCompare = (slug: string) =>
    setCompared((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : current.length < 3
          ? [...current, slug]
          : current,
    );
  const clear = () => {
    setQuery('');
    setDraftQuery('');
    setService('');
    setAftercare(false);
  };
  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container page-hero__inner">
          <p className="eyebrow">{messages.common.noAds}</p>
          <h1 className="display-title">{messages.discovery.title}</h1>
          <p className="lead">{messages.discovery.body}</p>
        </div>
      </section>
      <section className="section">
        <div className="container search-layout">
          {filtersOpen ? (
            <button
              aria-label={messages.common.close}
              className="mobile-filters-backdrop"
              onClick={() => setFiltersOpen(false)}
              type="button"
            />
          ) : null}
          <Card
            aria-labelledby="clinic-filters-title"
            aria-modal={filtersOpen || undefined}
            className="filters-panel"
            data-mobile-open={filtersOpen}
            id="clinic-filters"
            role={filtersOpen ? 'dialog' : undefined}
          >
            <div className="filters-panel__head">
              <h2 id="clinic-filters-title">{messages.common.filters}</h2>
              <div className="filters-panel__actions">
                <Button variant="quiet" size="sm" onClick={clear}>
                  {messages.common.clear}
                </Button>
                <button
                  aria-label={messages.common.close}
                  className="dt-button dt-button--quiet dt-button--icon filters-panel__mobile-close"
                  onClick={() => setFiltersOpen(false)}
                  ref={filtersCloseRef}
                  type="button"
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <div className="filters-panel__body">
              <SelectField label={messages.discovery.city} name="city">
                <option>{messages.discovery.all}</option>
                {messages.discovery.cities.map((city) => (
                  <option key={city}>{city}</option>
                ))}
              </SelectField>
              <SelectField
                label={messages.discovery.service}
                name="service"
                value={service}
                onChange={(event) => setService(event.target.value)}
              >
                <option value="">{messages.discovery.all}</option>
                {messages.discovery.services.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
              <SelectField label={messages.discovery.language} name="language">
                <option>{messages.discovery.all}</option>
                <option>Tiếng Việt</option>
                <option>English</option>
              </SelectField>
              <Checkbox
                checked={aftercare}
                label={messages.discovery.aftercare}
                onChange={(event) => setAftercare(event.target.checked)}
              />
            </div>
          </Card>
          <div>
            <button
              aria-controls="clinic-filters"
              aria-expanded={filtersOpen}
              className="dt-button dt-button--secondary mobile-filters-trigger"
              onClick={() => setFiltersOpen(true)}
              ref={filtersTriggerRef}
              type="button"
            >
              <Icon name="filter" />
              {messages.common.filters}
            </button>
            {clinics.some((clinic) => clinic.fixture) ? (
              <Alert tone="warning" title={messages.common.developmentFixture} />
            ) : null}
            <form
              className="search-bar"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(draftQuery);
              }}
            >
              <Field
                label={messages.discovery.searchLabel}
                name="clinic-search"
                placeholder={messages.discovery.searchPlaceholder}
                type="search"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
              />
              <Button disabled={!interactive} size="lg" type="submit">
                <Icon name="search" />
                {messages.common.search}
              </Button>
            </form>
            <div className="results-head">
              <p>
                <strong>{results.length}</strong> {messages.discovery.resultCount}
              </p>
              <Badge tone="info">
                <Icon name="shield" />
                {messages.common.noAds}
              </Badge>
            </div>
            {results.length ? (
              <div className="result-list">
                {results.map((clinic) => (
                  <Card className="result-card" key={clinic.slug}>
                    <div className="result-card__visual">
                      <Icon name="clinic" />
                    </div>
                    <div>
                      <div className="result-card__head">
                        <div>
                          <Badge tone={clinic.fixture ? 'attention' : 'verified'}>
                            <Icon name="shield" />
                            {clinic.fixture
                              ? messages.common.developmentFixture
                              : `${messages.common.verified} · ${clinic.updated}`}
                          </Badge>
                          <h2>
                            <Link href={`/${locale}/clinics/${clinic.slug}`}>{clinic.name}</Link>
                          </h2>
                          <p>
                            {clinic.district} · {clinic.languages.join(' · ')}
                          </p>
                        </div>
                        <Button
                          aria-label={`${saved.includes(clinic.slug) ? messages.common.saved : messages.common.save}: ${clinic.name}`}
                          aria-pressed={saved.includes(clinic.slug)}
                          size="icon"
                          variant="quiet"
                          onClick={() => toggleSave(clinic.slug)}
                        >
                          <Icon
                            name="heart"
                            style={
                              saved.includes(clinic.slug) ? { fill: 'currentColor' } : undefined
                            }
                          />
                        </Button>
                      </div>
                      <div className="result-card__evidence">
                        {clinic.evidence.map((item) => (
                          <span key={item}>
                            <Icon name="check" />
                            {item}
                          </span>
                        ))}
                      </div>
                      <div className="result-card__bottom">
                        <div className="result-card__facts">
                          <div className="result-card__fact">
                            <span>{messages.discovery.from}</span>
                            <strong>{clinic.price}</strong>
                          </div>
                          <div className="result-card__fact">
                            <span>{messages.discovery.earliest}</span>
                            <strong>{clinic.next}</strong>
                          </div>
                        </div>
                        <div className="result-card__actions">
                          <Button
                            aria-pressed={compared.includes(clinic.slug)}
                            disabled={!compared.includes(clinic.slug) && compared.length >= 3}
                            size="sm"
                            variant="secondary"
                            onClick={() => toggleCompare(clinic.slug)}
                          >
                            {messages.common.compare}
                          </Button>
                          <Link
                            className="dt-button dt-button--primary dt-button--sm button-link"
                            href={`/${locale}/clinics/${clinic.slug}`}
                          >
                            {messages.common.viewDetails}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState
                  title={messages.common.emptyTitle}
                  body={messages.common.emptyBody}
                  action={<Button onClick={clear}>{messages.common.clear}</Button>}
                />
              </Card>
            )}
            {compared.length ? (
              <div className="compare-tray" aria-live="polite">
                <p>
                  {compared.length}/3 · {messages.discovery.compareHint}
                </p>
                <Link
                  className="dt-button dt-button--primary dt-button--sm button-link"
                  href={`/${locale}/app/cases/${developmentCaseId}/shortlist`}
                >
                  {messages.discovery.compareNow}
                  <Icon name="arrow" />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
