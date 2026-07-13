'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, type FormEvent } from 'react';
import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Progress,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';
import type { PortalArea } from '@/lib/routing';
import { selectPortalWorkspace } from './portal-workspace-selection';

const PatientOnboardingWorkspace = dynamic(
  () =>
    import('./patient-onboarding-workspace').then((module) => module.PatientOnboardingWorkspace),
  { loading: PortalFeatureLoading },
);
const TodayWorkspace = dynamic(
  () => import('./today-workspace').then((module) => module.TodayWorkspace),
  { loading: PortalFeatureLoading },
);
const CaseHubWorkspace = dynamic(
  () => import('./today-workspace').then((module) => module.CaseHubWorkspace),
  { loading: PortalFeatureLoading },
);
const VerificationWorkspace = dynamic(
  () => import('./verification-workspace').then((module) => module.VerificationWorkspace),
  { loading: PortalFeatureLoading },
);
const BookingBillingWorkspace = dynamic(
  () => import('./booking-billing-workspace').then((module) => module.BookingBillingWorkspace),
  { loading: PortalFeatureLoading },
);
const ClinicOperationsWorkspace = dynamic(
  () => import('./clinic-operations-workspace').then((module) => module.ClinicOperationsWorkspace),
  { loading: PortalFeatureLoading },
);
const CaseListWorkspace = dynamic(
  () => import('./case-list-workspace').then((module) => module.CaseListWorkspace),
  { loading: PortalFeatureLoading },
);
const NotificationCenterWorkspace = dynamic(
  () =>
    import('./notification-center-workspace').then((module) => module.NotificationCenterWorkspace),
  { loading: PortalFeatureLoading },
);
const AdminGovernanceWorkspace = dynamic(
  () => import('./admin-governance-workspace').then((module) => module.AdminGovernanceWorkspace),
  { loading: PortalFeatureLoading },
);
const PrivacyRequestsWorkspace = dynamic(
  () => import('./privacy-requests-workspace').then((module) => module.PrivacyRequestsWorkspace),
  { loading: PortalFeatureLoading },
);
const TrustSafetyWorkspace = dynamic(
  () => import('./trust-safety-workspace').then((module) => module.TrustSafetyWorkspace),
  { loading: PortalFeatureLoading },
);
const AdminOperationsWorkspace = dynamic(
  () => import('./admin-operations-workspace').then((module) => module.AdminOperationsWorkspace),
  { loading: PortalFeatureLoading },
);
const AdminDirectoryWorkspace = dynamic(
  () => import('./admin-directory-workspace').then((module) => module.AdminDirectoryWorkspace),
  { loading: PortalFeatureLoading },
);
const CollaborationWorkspace = dynamic(
  () => import('./collaboration-workspace').then((module) => module.CollaborationWorkspace),
  { loading: PortalFeatureLoading },
);
const JourneyPassportWorkspace = dynamic(
  () => import('./journey-passport-workspace').then((module) => module.JourneyPassportWorkspace),
  { loading: PortalFeatureLoading },
);
const MatchingConciergeWorkspace = dynamic(
  () =>
    import('./matching-concierge-workspace').then((module) => module.MatchingConciergeWorkspace),
  { loading: PortalFeatureLoading },
);
const SpecializedWorkspace = dynamic(
  () => import('./specialized-workspace').then((module) => module.SpecializedWorkspace),
  { loading: PortalFeatureLoading },
);

function PortalFeatureLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading secure workspace"
      aria-live="polite"
      className="portal-content"
      id="main-content"
    >
      <span className="dt-sr-only">Loading secure workspace…</span>
      <div className="portal-heading">
        <Skeleton style={{ height: '4.5rem', maxWidth: '34rem' }} />
      </div>
      <div className="workspace-grid">
        <Skeleton style={{ height: '24rem' }} />
        <Skeleton style={{ height: '12rem' }} />
      </div>
    </main>
  );
}

function featureKind(key: string) {
  if (
    [
      'newCase',
      'onboarding',
      'profile',
      'planBuilder',
      'pricing',
      'settings',
      'privacy',
      'content',
      'taxonomy',
      'flags',
    ].includes(key)
  )
    return 'form';
  if (['journey', 'aftercare', 'progress', 'passport', 'audit', 'corrective'].includes(key))
    return 'timeline';
  if (key === 'messages') return 'messages';
  if (key === 'records') return 'upload';
  return 'table';
}

async function sendCommand(area: PortalArea, pageKey: string, command: string, entityId: string) {
  const idempotencyKey = crypto.randomUUID();
  const response = await fetch('/api/portal/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ area, pageKey, command, entityId, idempotencyKey }),
  });
  if (!response.ok) throw new Error('command_failed');
}

export function PortalWorkspace({
  area,
  pageKey,
  title,
  description,
  messages,
  development,
  locale,
  resourceId,
}: {
  area: PortalArea;
  pageKey: string;
  title: string;
  description: string;
  messages: Messages;
  development: boolean;
  locale: Locale;
  resourceId?: string | undefined;
}) {
  const [filter, setFilter] = useState('all');
  const [completed, setCompleted] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [messagesList, setMessagesList] = useState<string[]>(
    messages.portal.activityItems.slice(0, 2),
  );
  const rows = useMemo(
    () =>
      messages.portal.rows.filter(
        (row) =>
          filter === 'all' ||
          (filter === 'attention' && /attention|xử lý/i.test(row[2])) ||
          (filter === 'progress' && /waiting|chờ/i.test(row[2])),
      ),
    [filter, messages.portal.rows],
  );
  const run = async (command: string, id: string, after?: () => void) => {
    setError(false);
    try {
      await sendCommand(area, pageKey, command, id);
      after?.();
      setNotice(messages.auth.success);
    } catch {
      setError(true);
    }
  };
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { area, pageKey, exportedAt: new Date().toISOString(), rows: messages.portal.rows },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `dental-trust-${pageKey}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setNotice(messages.auth.success);
  };
  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) void run('save', pageKey);
  };
  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = String(data.get('message') ?? '').trim();
    if (value)
      void run('message', pageKey, () => {
        setMessagesList((current) => [...current, value]);
        event.currentTarget.reset();
      });
  };
  const kind = featureKind(pageKey);
  const workspace = selectPortalWorkspace(area, pageKey);
  if (workspace === 'today' && (area === 'patient' || area === 'clinic'))
    return (
      <TodayWorkspace
        area={area}
        description={description}
        locale={locale}
        messages={messages}
        title={title}
      />
    );
  if (workspace === 'case-hub' && (area === 'patient' || area === 'clinic'))
    return (
      <CaseHubWorkspace
        area={area}
        description={description}
        locale={locale}
        messages={messages}
        resourceId={resourceId}
        title={title}
      />
    );
  if (workspace === 'patient-onboarding')
    return (
      <PatientOnboardingWorkspace
        area={area}
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        resourceId={resourceId}
        title={title}
      />
    );
  if (workspace === 'verification')
    return (
      <VerificationWorkspace
        description={description}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        resourceId={resourceId}
        title={title}
      />
    );
  if (workspace === 'booking-billing')
    return (
      <BookingBillingWorkspace
        area={area}
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'clinic-operations')
    return (
      <ClinicOperationsWorkspace
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'case-list')
    return (
      <CaseListWorkspace
        area={area}
        description={description}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'notification-center')
    return (
      <NotificationCenterWorkspace
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'admin-governance')
    return (
      <AdminGovernanceWorkspace
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'privacy-requests' && (area === 'patient' || area === 'admin'))
    return (
      <PrivacyRequestsWorkspace
        area={area}
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'trust-safety')
    return (
      <TrustSafetyWorkspace
        area={area}
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'admin-operations')
    return (
      <AdminOperationsWorkspace
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'admin-directory')
    return (
      <AdminDirectoryWorkspace
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  if (workspace === 'collaboration')
    return (
      <CollaborationWorkspace
        area={area}
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        resourceId={resourceId}
        title={title}
      />
    );
  if (workspace === 'journey-passport')
    return (
      <JourneyPassportWorkspace
        area={area}
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        resourceId={resourceId}
        title={title}
      />
    );
  if (workspace === 'matching-concierge')
    return (
      <MatchingConciergeWorkspace
        area={area}
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        resourceId={resourceId}
        title={title}
      />
    );
  if (workspace === 'specialized')
    return (
      <SpecializedWorkspace
        area={area}
        description={description}
        development={development}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        resourceId={resourceId}
        title={title}
      />
    );
  if (!development)
    return (
      <main className="portal-content" id="main-content">
        <div className="portal-heading">
          <div>
            <p className="eyebrow">
              {messages.portal.sections[area]} · {messages.portal.secure}
            </p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
        <Alert tone="danger" title={messages.auth.productionUnavailable}>
          {messages.common.errorBody}
        </Alert>
      </main>
    );
  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections[area]} ·{' '}
            {development ? messages.portal.demo : messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="portal-heading__actions">
          <Button variant="secondary" onClick={exportData}>
            <Icon name="download" />
            {messages.portal.export}
          </Button>
          <Button
            onClick={() => {
              setNotice(messages.auth.success);
              setSelected(pageKey);
            }}
          >
            <Icon name="plus" />
            {messages.portal.add}
          </Button>
        </div>
      </div>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      <div className="portal-metrics" style={{ marginTop: notice || error ? '1rem' : undefined }}>
        {messages.portal.metricLabels.map((label, index) => (
          <Card className="portal-metric" key={label}>
            <div className="portal-metric__head">
              <span>{label}</span>
              <span>
                <Icon name={index === 0 ? 'alert' : index === 1 ? 'activity' : 'check'} />
              </span>
            </div>
            <strong>{[3, 12, '96%', 28][index]}</strong>
            <small>+{index + 2}%</small>
          </Card>
        ))}
      </div>
      <div className="workspace-grid">
        <Card className="workspace-card">
          {kind === 'form' ? (
            <form className="auth-form" onSubmit={submitForm} style={{ padding: '1.2rem' }}>
              <div className="workspace-card__head" style={{ padding: '0 0 1rem' }}>
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
                <Badge tone="info">{messages.portal.secure}</Badge>
              </div>
              <Field
                label={messages.forms.contactName}
                name="title"
                defaultValue={title}
                required
              />
              <SelectField label={messages.common.status} name="status">
                <option>{messages.portal.filterProgress}</option>
                <option>{messages.portal.filterAttention}</option>
              </SelectField>
              <TextAreaField
                label={messages.forms.message}
                name="notes"
                defaultValue={description}
                required
              />
              <Button type="submit">
                <Icon name="check" />
                {messages.common.save}
              </Button>
            </form>
          ) : kind === 'timeline' ? (
            <div style={{ padding: '1.2rem' }}>
              <div className="workspace-card__head" style={{ padding: '0 0 1rem' }}>
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
                <Badge tone="verified">{messages.portal.filterProgress}</Badge>
              </div>
              <Progress label={messages.portal.metricLabels[2]} value={68} />
              <div className="activity-list" style={{ marginTop: '1.5rem' }}>
                {messages.portal.rows.map((row, index) => (
                  <div className="activity-item" key={row[0]}>
                    <span className="activity-item__dot" />
                    <div>
                      <strong>{row[1]}</strong>
                      <p>
                        {row[2]} · {row[3]}
                      </p>
                      {index < 2 ? (
                        <Button
                          size="sm"
                          variant="quiet"
                          onClick={() => void run('advance', row[0])}
                        >
                          {messages.common.continue}
                          <Icon name="arrow" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : kind === 'upload' ? (
            <div style={{ padding: '1.2rem' }}>
              <div className="workspace-card__head" style={{ padding: '0 0 1rem' }}>
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
              </div>
              <label
                className="dt-empty"
                style={{
                  border: '1px dashed var(--dt-border-strong)',
                  borderRadius: 'var(--dt-radius-lg)',
                  cursor: 'pointer',
                }}
              >
                <span className="dt-empty__icon">
                  <Icon name="upload" />
                </span>
                <strong>{messages.forms.upload}</strong>
                <span>{messages.forms.uploadHint}</span>
                <input
                  className="dt-sr-only"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.dcm"
                  onChange={(event) =>
                    setFiles(Array.from(event.target.files ?? []).map((file) => file.name))
                  }
                />
              </label>
              {files.map((file) => (
                <Alert key={file} tone="success" title={`${messages.forms.selected}: ${file}`} />
              ))}
            </div>
          ) : kind === 'messages' ? (
            <div style={{ padding: '1.2rem' }}>
              <div className="activity-list">
                {messagesList.map((message, index) => (
                  <div className="activity-item" key={`${message}-${index}`}>
                    <span className="activity-item__dot" />
                    <div>
                      <strong>{index % 2 ? 'Dental Trust' : title}</strong>
                      <p>{message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form className="auth-form" onSubmit={submitMessage} style={{ marginTop: '1rem' }}>
                <TextAreaField label={messages.forms.message} name="message" required />
                <Button type="submit">
                  <Icon name="message" />
                  {messages.forms.send}
                </Button>
              </form>
            </div>
          ) : (
            <>
              <div className="workspace-card__head">
                <div>
                  <h2>{messages.portal.tableTitle}</h2>
                  <p>{messages.portal.tableDescription}</p>
                </div>
                <Badge tone="info">
                  <Icon name="lock" />
                  {messages.portal.secure}
                </Badge>
              </div>
              <div className="workspace-filters" role="group" aria-label={messages.common.filters}>
                {(
                  [
                    ['all', messages.portal.filterAll],
                    ['attention', messages.portal.filterAttention],
                    ['progress', messages.portal.filterProgress],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    className="workspace-filter"
                    data-active={filter === value}
                    key={value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {rows.length ? (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>{messages.common.actions}</th>
                        <th>{messages.common.status}</th>
                        <th>{messages.common.due}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row[0]}>
                          <td className="data-table__id" data-label="Ref">
                            {row[0]}
                          </td>
                          <td className="data-table__primary" data-label={messages.common.actions}>
                            {row[1]}
                          </td>
                          <td data-label={messages.common.status}>
                            <Badge
                              tone={
                                completed.includes(row[0])
                                  ? 'verified'
                                  : /attention|xử lý/i.test(row[2])
                                    ? 'attention'
                                    : 'info'
                              }
                            >
                              {completed.includes(row[0]) ? messages.portal.done : row[2]}
                            </Badge>
                          </td>
                          <td data-label={messages.common.due}>{row[3]}</td>
                          <td data-label={messages.common.actions}>
                            <div className="data-table__action">
                              <Button size="sm" variant="quiet" onClick={() => setSelected(row[0])}>
                                {messages.portal.open}
                              </Button>
                              <Button
                                disabled={completed.includes(row[0])}
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  void run('complete', row[0], () =>
                                    setCompleted((current) => [...current, row[0]]),
                                  )
                                }
                              >
                                {messages.portal.complete}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title={messages.common.emptyTitle} body={messages.portal.noResults} />
              )}
            </>
          )}
        </Card>
        <aside className="workspace-side">
          <Card className="side-card">
            <h2>{messages.portal.quickActions}</h2>
            <div className="quick-actions">
              <Button variant="secondary" onClick={() => setSelected(pageKey)}>
                <Icon name="plus" />
                {messages.portal.add}
              </Button>
              <Button variant="secondary" onClick={exportData}>
                <Icon name="download" />
                {messages.portal.export}
              </Button>
              <Button variant="secondary" onClick={() => setFilter('attention')}>
                <Icon name="activity" />
                {messages.portal.review}
              </Button>
            </div>
          </Card>
          <Card className="side-card">
            <h2>{messages.portal.activity}</h2>
            <div className="activity-list">
              {messages.portal.activityItems.map((item, index) => (
                <div className="activity-item" key={item}>
                  <span className="activity-item__dot" />
                  <div>
                    <p>{item}</p>
                    <time>{index + 1}h</time>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
      {selected ? (
        <div aria-modal="true" className="modal-backdrop" role="dialog">
          <Card style={{ maxWidth: '32rem', padding: '1.4rem', width: '100%' }}>
            <div className="workspace-card__head" style={{ padding: '0 0 1rem' }}>
              <div>
                <h2>{title}</h2>
                <p>{selected}</p>
              </div>
              <Button
                aria-label={messages.common.close}
                size="icon"
                variant="quiet"
                onClick={() => setSelected(null)}
              >
                <Icon name="close" />
              </Button>
            </div>
            <p>{description}</p>
            <Alert title={messages.portal.sessionNotice} />
            <Button style={{ marginTop: '1rem', width: '100%' }} onClick={() => setSelected(null)}>
              {messages.common.continue}
            </Button>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
