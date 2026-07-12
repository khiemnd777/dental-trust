'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import {
  consentLedgerRecordViewSchema,
  type ConsentLedgerRecordView,
} from '@dental-trust/contracts';
import {
  formatDate,
  getConsentSettingsMessages,
  type Locale,
  type Messages,
} from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Icon,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';

export function isPatientSettingsWorkspace(area: string, pageKey: string) {
  return area === 'patient' && pageKey === 'settings';
}

export function PatientSettingsWorkspace({
  title,
  description,
  locale,
  messages,
  development,
}: {
  readonly title: string;
  readonly description: string;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const text = getConsentSettingsMessages(locale);
  const [records, setRecords] = useState<ConsentLedgerRecordView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConsentLedgerRecordView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadConsents(undefined, controller.signal)
      .then((page) => {
        setRecords(page.records);
        setNextCursor(page.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const loadMore = async () => {
    if (!nextCursor) return;
    setSending(true);
    setError(false);
    try {
      const page = await loadConsents(nextCursor);
      setRecords((current) => [...current, ...page.records]);
      setNextCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  const withdraw = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    if (form.get('confirmed') !== 'on') return;
    setSending(true);
    setError(false);
    setNotice(null);
    try {
      const response = await fetch('/api/portal/consents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          consentRecordId: selected.id,
          idempotencyKey: crypto.randomUUID(),
          input: {
            expectedGrantedAt: selected.grantedAt,
            reason: String(form.get('reason')).trim(),
            confirmation: 'WITHDRAW CONSENT',
          },
        }),
      });
      if (!response.ok) throw new Error('withdrawal_failed');
      const body = (await response.json()) as { data?: unknown };
      const parsed = consentLedgerRecordViewSchema.safeParse(body.data);
      if (!parsed.success) throw new Error('invalid_response');
      setRecords((current) =>
        current.map((record) => (record.id === parsed.data.id ? parsed.data : record)),
      );
      setSelected(null);
      setNotice(text.success);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections.patient} ·{' '}
            {development ? messages.portal.demo : messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="info">
          <Icon name="shield" />
          {messages.portal.secure}
        </Badge>
      </div>
      <Alert tone="info" title={text.ledgerTitle}>
        {text.intro}
      </Alert>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}

      <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
        <h2>{text.securityTitle}</h2>
        <p>{text.securityBody}</p>
        <div className="portal-heading__actions">
          <Link
            className="dt-button dt-button--secondary dt-button--md"
            href={`/${locale}/auth/mfa`}
          >
            <Icon name="shield" /> {text.manageMfa}
          </Link>
          <Link
            className="dt-button dt-button--secondary dt-button--md"
            href={`/${locale}/auth/sessions`}
          >
            <Icon name="lock" /> {text.manageSessions}
          </Link>
        </div>
      </Card>

      <section aria-labelledby="consent-ledger-title" style={{ marginTop: '1rem' }}>
        <h2 id="consent-ledger-title">{text.ledgerTitle}</h2>
        {loading ? (
          <Card style={{ padding: '1.2rem' }}>
            <Skeleton style={{ height: '12rem' }} />
          </Card>
        ) : records.length === 0 ? (
          <EmptyState body={messages.common.emptyBody} title={messages.common.emptyTitle} />
        ) : (
          <div className="portal-grid">
            {records.map((record) => (
              <Card key={record.id} style={{ padding: '1.2rem' }}>
                <div className="portal-heading__actions">
                  <Badge tone={record.withdrawnAt ? 'neutral' : 'verified'}>
                    {record.withdrawnAt ? text.withdrawn : text.active}
                  </Badge>
                  <Badge tone="info">{record.locale}</Badge>
                </div>
                <h3>
                  {text.purposes[record.purpose as keyof typeof text.purposes] ?? record.purpose}
                </h3>
                <dl>
                  <dt>{text.version}</dt>
                  <dd>{record.textVersion}</dd>
                  <dt>{text.granted}</dt>
                  <dd>{formatDate(locale, record.grantedAt)}</dd>
                  {record.withdrawnAt ? (
                    <>
                      <dt>{text.withdrawn}</dt>
                      <dd>{formatDate(locale, record.withdrawnAt)}</dd>
                    </>
                  ) : null}
                </dl>
                {record.withdrawable && !record.withdrawnAt ? (
                  <Button onClick={() => setSelected(record)} variant="danger">
                    {text.withdraw}
                  </Button>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
      {nextCursor ? (
        <Button disabled={sending} onClick={() => void loadMore()} variant="secondary">
          {text.loadMore}
        </Button>
      ) : null}

      {selected ? (
        <Card
          aria-labelledby="withdraw-consent-title"
          aria-modal="true"
          role="dialog"
          style={{ marginTop: '1rem', padding: '1.2rem' }}
        >
          <form className="auth-form" onSubmit={withdraw}>
            <h2 id="withdraw-consent-title">{text.withdrawTitle}</h2>
            <p>{text.withdrawBody}</p>
            <TextAreaField label={text.reason} minLength={10} name="reason" required />
            <Checkbox label={text.confirmation} name="confirmed" required />
            <div className="portal-heading__actions">
              <Button disabled={sending} type="submit" variant="danger">
                {text.confirmAction}
              </Button>
              <Button onClick={() => setSelected(null)} type="button" variant="secondary">
                {text.cancel}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </main>
  );
}

async function loadConsents(cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ ...(cursor ? { cursor } : {}) });
  const response = await fetch(`/api/portal/consents?${query}`, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('load_failed');
  const body = (await response.json()) as { data?: unknown; page?: { nextCursor?: string | null } };
  const parsed = consentLedgerRecordViewSchema.array().safeParse(body.data);
  if (!parsed.success) throw new Error('invalid_response');
  return { records: parsed.data, nextCursor: body.page?.nextCursor ?? null };
}
