'use client';

import { useEffect, useState, type FormEvent } from 'react';

import type {
  AdminAuditLogView,
  AdminNotificationJobView,
  AdminOperationsSummary,
  AdminOutboxJobView,
  AdminWebhookView,
} from '@dental-trust/contracts';
import type { Locale, Messages } from '@dental-trust/i18n';
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
import { NotificationTemplateGovernancePanel } from './admin-governance-workspace';

type OperationsRecord =
  AdminAuditLogView | AdminNotificationJobView | AdminOutboxJobView | AdminWebhookView;

const supported = new Set([
  'admin:dashboard',
  'admin:audit',
  'admin:jobs',
  'admin:notifications',
  'admin:webhooks',
  'admin:health',
]);

const copy = {
  en: {
    generated: 'Generated',
    retry: 'Retry safely',
    retryTitle: 'Retry failed delivery',
    retryHelp: 'Confirm the provider or queue issue is resolved before retrying.',
    reason: 'Operational reason',
    confirm: 'I confirm the failed delivery should be retried.',
    cancel: 'Cancel',
    success: 'The delivery was returned to the durable queue.',
    loadMore: 'Load more',
    status: 'Status',
    reference: 'Reference',
    type: 'Type',
    attempts: 'Attempts',
    occurred: 'Occurred',
    requiredReason: 'State the resolved cause and why retry is safe.',
    deliveryQueue: 'Failed delivery queue',
    metrics: [
      'Active users',
      'Open cases',
      'Pending verification',
      'Unresolved incidents',
      'Failed outbox',
      'Failed notifications',
      'Failed webhooks',
      'Privacy requests',
    ],
  },
  vi: {
    generated: 'Tạo lúc',
    retry: 'Thử lại an toàn',
    retryTitle: 'Thử lại tác vụ thất bại',
    retryHelp: 'Chỉ thử lại sau khi đã xác nhận sự cố nhà cung cấp hoặc hàng đợi được khắc phục.',
    reason: 'Lý do vận hành',
    confirm: 'Tôi xác nhận tác vụ thất bại này cần được thử lại.',
    cancel: 'Hủy',
    success: 'Tác vụ đã được đưa trở lại hàng đợi bền vững.',
    loadMore: 'Xem thêm',
    status: 'Trạng thái',
    reference: 'Mã tham chiếu',
    type: 'Loại',
    attempts: 'Số lần thử',
    occurred: 'Thời điểm',
    requiredReason: 'Nêu nguyên nhân đã khắc phục và lý do thử lại là an toàn.',
    deliveryQueue: 'Hàng đợi gửi thất bại',
    metrics: [
      'Người dùng hoạt động',
      'Hồ sơ đang mở',
      'Xác minh đang chờ',
      'Sự cố chưa xử lý',
      'Outbox thất bại',
      'Thông báo thất bại',
      'Webhook thất bại',
      'Yêu cầu quyền riêng tư',
    ],
  },
} as const;

export function isAdminOperationsWorkspace(area: string, pageKey: string) {
  return supported.has(`${area}:${pageKey}`);
}

export function AdminOperationsWorkspace({
  pageKey,
  title,
  description,
  locale,
  messages,
  development,
}: {
  readonly pageKey: string;
  readonly title: string;
  readonly description: string;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const language = locale.startsWith('vi') ? 'vi' : 'en';
  const t = copy[language];
  const [summary, setSummary] = useState<AdminOperationsSummary | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [records, setRecords] = useState<OperationsRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<OperationsRecord | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadOperations(pageKey, undefined, controller.signal)
      .then((result) => {
        if (pageKey === 'dashboard') setSummary(result.data as AdminOperationsSummary);
        else if (pageKey === 'health') setHealth(result.data as Record<string, unknown>);
        else setRecords(Array.isArray(result.data) ? (result.data as OperationsRecord[]) : []);
        setNextCursor(result.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [pageKey]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(false);
    try {
      const result = await loadOperations(pageKey, nextCursor);
      if (Array.isArray(result.data))
        setRecords((current) => [...current, ...(result.data as OperationsRecord[])]);
      setNextCursor(result.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const submitRetry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || (pageKey !== 'jobs' && pageKey !== 'notifications')) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get('reason') ?? '').trim();
    const confirmed = form.get('confirmed') === 'on';
    if (!confirmed || reason.length < 12 || !event.currentTarget.reportValidity()) return;
    setSending(true);
    setError(false);
    try {
      const response = await fetch('/api/portal/admin-operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          view: pageKey,
          entityId: selected.id,
          reason,
          confirmation: 'RETRY FAILED DELIVERY',
          ...(pageKey === 'jobs' && 'attemptCount' in selected
            ? { expectedAttemptCount: selected.attemptCount }
            : {}),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error('retry_rejected');
      setRecords((current) =>
        current.map((record) => {
          if (record.id !== selected.id) return record;
          if (pageKey === 'jobs' && 'eventType' in record) return { ...record, status: 'PENDING' };
          if (pageKey === 'notifications' && 'templateKey' in record)
            return { ...record, status: 'PENDING' };
          return record;
        }),
      );
      setSelected(null);
      setNotice(t.success);
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
            {messages.portal.sections.admin} ·{' '}
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
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {pageKey === 'notifications' ? (
        <>
          <NotificationTemplateGovernancePanel locale={locale} messages={messages} />
          <h2 style={{ marginTop: '1.5rem' }}>{t.deliveryQueue}</h2>
        </>
      ) : null}
      {loading ? (
        <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <Skeleton style={{ height: '2rem', width: '40%' }} />
          <Skeleton style={{ height: '14rem', marginTop: '1rem' }} />
        </Card>
      ) : pageKey === 'dashboard' && summary ? (
        <SummaryCards
          summary={summary}
          locale={locale}
          labels={t.metrics}
          generated={t.generated}
        />
      ) : pageKey === 'health' && health ? (
        <HealthCard health={health} messages={messages} />
      ) : records.length ? (
        <OperationsTable
          locale={locale}
          pageKey={pageKey}
          records={records}
          text={t}
          onRetry={setSelected}
        />
      ) : (
        <EmptyState title={messages.common.emptyTitle} body={messages.common.emptyBody} />
      )}
      {nextCursor ? (
        <Button
          disabled={loadingMore}
          style={{ marginTop: '1rem' }}
          variant="secondary"
          onClick={() => void loadMore()}
        >
          {t.loadMore}
        </Button>
      ) : null}
      {selected ? (
        <div aria-modal="true" role="dialog" className="modal-backdrop">
          <Card style={{ maxWidth: '34rem', padding: '1.4rem', width: '100%' }}>
            <div className="workspace-card__head" style={{ padding: 0 }}>
              <div>
                <h2>{t.retryTitle}</h2>
                <p>{t.retryHelp}</p>
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
            <form className="auth-form" onSubmit={submitRetry} style={{ marginTop: '1rem' }}>
              <TextAreaField
                hint={t.requiredReason}
                label={t.reason}
                minLength={12}
                name="reason"
                required
              />
              <Checkbox label={t.confirm} name="confirmed" required />
              <div className="data-table__action">
                <Button disabled={sending} type="submit">
                  <Icon name="activity" />
                  {t.retry}
                </Button>
                <Button type="button" variant="quiet" onClick={() => setSelected(null)}>
                  {t.cancel}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </main>
  );
}

async function loadOperations(pageKey: string, cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ view: pageKey, ...(cursor ? { cursor } : {}) });
  const response = await fetch(`/api/portal/admin-operations?${query.toString()}`, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('admin_operations_unavailable');
  const envelope = (await response.json()) as {
    data?: unknown;
    page?: { nextCursor?: string | null };
    status?: string;
  };
  const data = envelope.data ?? (pageKey === 'health' ? envelope : undefined);
  if (data === undefined) throw new Error('invalid_admin_operations_data');
  return { data, nextCursor: envelope.page?.nextCursor ?? null };
}

function SummaryCards({
  summary,
  labels,
  generated,
  locale,
}: {
  readonly summary: AdminOperationsSummary;
  readonly labels: readonly string[];
  readonly generated: string;
  readonly locale: Locale;
}) {
  const values = [
    summary.activeUsers,
    summary.openCases,
    summary.pendingVerifications,
    summary.unresolvedIncidents,
    summary.failedOutboxEvents,
    summary.failedNotifications,
    summary.failedWebhooks,
    summary.pendingPrivacyRequests,
  ];
  return (
    <>
      <div className="portal-metrics" style={{ marginTop: '1rem' }}>
        {labels.map((label, index) => (
          <Card className="portal-metric" key={label}>
            <div className="portal-metric__head">
              <span>{label}</span>
              <Icon name={index > 3 && values[index] ? 'alert' : 'activity'} />
            </div>
            <strong>{values[index]}</strong>
          </Card>
        ))}
      </div>
      <small>
        {generated}: {formatDate(summary.generatedAt, locale)}
      </small>
    </>
  );
}

function HealthCard({ health, messages }: { health: Record<string, unknown>; messages: Messages }) {
  const dependencies =
    health.dependencies && typeof health.dependencies === 'object'
      ? Object.entries(health.dependencies as Record<string, unknown>)
      : [];
  return (
    <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
      <div className="workspace-card__head" style={{ padding: 0 }}>
        <h2>{String(health.service ?? 'Dental Trust')}</h2>
        <Badge tone={health.status === 'ready' ? 'verified' : 'danger'}>
          {String(health.status ?? messages.common.errorTitle)}
        </Badge>
      </div>
      <div className="activity-list" style={{ marginTop: '1rem' }}>
        {dependencies.map(([name, status]) => (
          <div className="activity-item" key={name}>
            <span className="activity-item__dot" />
            <div>
              <strong>{name}</strong>
              <p>{String(status)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OperationsTable({
  pageKey,
  records,
  locale,
  text,
  onRetry,
}: {
  readonly pageKey: string;
  readonly records: readonly OperationsRecord[];
  readonly locale: Locale;
  readonly text: (typeof copy)['en'] | (typeof copy)['vi'];
  readonly onRetry: (record: OperationsRecord) => void;
}) {
  return (
    <Card className="workspace-card" style={{ marginTop: '1rem' }}>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{text.reference}</th>
              <th>{text.type}</th>
              <th>{text.status}</th>
              <th>{text.attempts}</th>
              <th>{text.occurred}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const status =
                'status' in record ? record.status : record.success ? 'SUCCESS' : 'FAILED';
              const retryable =
                (pageKey === 'jobs' && (status === 'FAILED' || status === 'DEAD_LETTER')) ||
                (pageKey === 'notifications' && status === 'FAILED');
              return (
                <tr key={record.id}>
                  <td className="data-table__id" data-label={text.reference}>
                    {record.id.slice(0, 8)}
                  </td>
                  <td className="data-table__primary" data-label={text.type}>
                    {recordType(record)}
                  </td>
                  <td data-label={text.status}>
                    <Badge
                      tone={status === 'FAILED' || status === 'DEAD_LETTER' ? 'danger' : 'info'}
                    >
                      {status}
                    </Badge>
                  </td>
                  <td data-label={text.attempts}>
                    {'attemptCount' in record ? record.attemptCount : '—'}
                  </td>
                  <td data-label={text.occurred}>{formatDate(recordDate(record), locale)}</td>
                  <td data-label={text.retry}>
                    {retryable ? (
                      <Button size="sm" variant="secondary" onClick={() => onRetry(record)}>
                        {text.retry}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function recordType(record: OperationsRecord) {
  if ('eventType' in record) return record.eventType;
  if ('templateKey' in record) return record.templateKey;
  if ('providerEventId' in record) return `${record.provider} · ${record.type}`;
  return `${record.action} · ${record.resourceType}`;
}

function recordDate(record: OperationsRecord) {
  if ('createdAt' in record) return record.createdAt;
  if ('scheduledAt' in record) return record.scheduledAt;
  if ('receivedAt' in record) return record.receivedAt;
  return '';
}

function formatDate(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
