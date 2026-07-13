'use client';

import { useEffect, useState, type FormEvent } from 'react';

import type { PrivacyRequestView } from '@dental-trust/contracts';
import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Icon,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';

const supported = new Set(['patient:privacy', 'admin:privacy']);

const copy = {
  en: {
    title: 'Privacy requests',
    introPatient:
      'Request a portable data export or account deletion review. Active legal and clinical retention duties may limit deletion.',
    introAdmin:
      'Process verified privacy requests with an explicit reason, patient-facing message, and complete audit trail.',
    newRequest: 'New privacy request',
    type: 'Request type',
    export: 'Export my data',
    delete: 'Delete my account',
    requestReason: 'Why you are making this request',
    submit: 'Submit privacy request',
    reference: 'Reference',
    status: 'Status',
    due: 'Response due',
    created: 'Submitted',
    manage: 'Process',
    processTitle: 'Process privacy request',
    nextStatus: 'Next status',
    adminReason: 'Administrative reason',
    adminReasonHint:
      'Include the identity-verification result, policy basis, and ticket reference.',
    patientMessage: 'Message visible to the patient',
    confirm: 'I confirm this authorized privacy-request transition.',
    save: 'Record transition',
    cancel: 'Cancel',
    submitted: 'Your privacy request was submitted securely.',
    processed: 'The privacy request transition was recorded and audited.',
    loadMore: 'Load more',
    version: 'Version',
  },
  vi: {
    title: 'Yêu cầu quyền riêng tư',
    introPatient:
      'Yêu cầu bản sao dữ liệu hoặc xem xét xóa tài khoản. Nghĩa vụ lưu trữ pháp lý và lâm sàng có thể giới hạn việc xóa.',
    introAdmin:
      'Xử lý yêu cầu đã xác minh với lý do rõ ràng, thông báo cho bệnh nhân và lịch sử kiểm toán đầy đủ.',
    newRequest: 'Tạo yêu cầu quyền riêng tư',
    type: 'Loại yêu cầu',
    export: 'Xuất dữ liệu của tôi',
    delete: 'Xóa tài khoản của tôi',
    requestReason: 'Lý do bạn gửi yêu cầu',
    submit: 'Gửi yêu cầu quyền riêng tư',
    reference: 'Mã tham chiếu',
    status: 'Trạng thái',
    due: 'Hạn phản hồi',
    created: 'Ngày gửi',
    manage: 'Xử lý',
    processTitle: 'Xử lý yêu cầu quyền riêng tư',
    nextStatus: 'Trạng thái tiếp theo',
    adminReason: 'Lý do quản trị',
    adminReasonHint: 'Nêu kết quả xác minh danh tính, căn cứ chính sách và mã yêu cầu.',
    patientMessage: 'Thông báo hiển thị cho bệnh nhân',
    confirm: 'Tôi xác nhận chuyển trạng thái yêu cầu quyền riêng tư này.',
    save: 'Ghi nhận chuyển trạng thái',
    cancel: 'Hủy',
    submitted: 'Yêu cầu quyền riêng tư đã được gửi an toàn.',
    processed: 'Chuyển trạng thái đã được ghi nhận và kiểm toán.',
    loadMore: 'Xem thêm',
    version: 'Phiên bản',
  },
} as const;

const transitions: Record<PrivacyRequestView['status'], readonly PrivacyRequestView['status'][]> = {
  SUBMITTED: ['IDENTITY_VERIFICATION_REQUIRED', 'IN_REVIEW', 'CANCELLED'],
  IDENTITY_VERIFICATION_REQUIRED: ['IN_REVIEW', 'REJECTED', 'CANCELLED'],
  IN_REVIEW: ['IDENTITY_VERIFICATION_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function isPrivacyRequestsWorkspace(area: string, pageKey: string) {
  return supported.has(`${area}:${pageKey}`);
}

export function PrivacyRequestsWorkspace({
  area,
  title,
  description,
  locale,
  messages,
  development,
}: {
  readonly area: 'patient' | 'admin';
  readonly pageKey: string;
  readonly title: string;
  readonly description: string;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const language = locale.startsWith('vi') ? 'vi' : 'en';
  const t = copy[language];
  const view = area === 'admin' ? 'queue' : 'patient';
  const [records, setRecords] = useState<PrivacyRequestView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<PrivacyRequestView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadPrivacy(view, undefined, controller.signal)
      .then((result) => {
        setRecords(result.records);
        setNextCursor(result.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [view]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(false);
    try {
      const result = await loadPrivacy(view, nextCursor);
      setRecords((current) => [...current, ...result.records]);
      setNextCursor(result.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const createRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(false);
    setNotice(null);
    try {
      const created = await sendPrivacyCommand({
        command: 'create',
        input: {
          type: String(form.get('type')),
          reason: String(form.get('reason')).trim(),
        },
      });
      setRecords((current) => [created, ...current]);
      setNotice(t.submitted);
      event.currentTarget.reset();
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  const processRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    if (form.get('confirmed') !== 'on' || !event.currentTarget.reportValidity()) return;
    setSending(true);
    setError(false);
    setNotice(null);
    try {
      const updated = await sendPrivacyCommand({
        command: 'transition',
        privacyRequestId: selected.id,
        input: {
          toStatus: String(form.get('toStatus')),
          expectedVersion: selected.version,
          reason: String(form.get('adminReason')).trim(),
          patientMessage: String(form.get('patientMessage')).trim(),
          confirmation: 'PROCESS PRIVACY REQUEST',
        },
      });
      setRecords((current) =>
        current.map((record) => (record.id === updated.id ? updated : record)),
      );
      setSelected(null);
      setNotice(t.processed);
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
            {messages.portal.sections[area]} ·{' '}
            {development ? messages.portal.demo : messages.portal.secure}
          </p>
          <h1>{title || t.title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="info">
          <Icon name="shield" />
          {messages.portal.secure}
        </Badge>
      </div>
      <Alert tone="info" title={t.title}>
        {area === 'admin' ? t.introAdmin : t.introPatient}
      </Alert>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {area === 'patient' ? (
        <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <form className="auth-form" onSubmit={createRequest}>
            <h2>{t.newRequest}</h2>
            <SelectField label={t.type} name="type">
              <option value="EXPORT">{t.export}</option>
              <option value="DELETE">{t.delete}</option>
            </SelectField>
            <TextAreaField label={t.requestReason} minLength={10} name="reason" required />
            <Button disabled={sending} type="submit">
              {t.submit}
            </Button>
          </form>
        </Card>
      ) : null}
      {loading ? (
        <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <Skeleton style={{ height: '12rem' }} />
        </Card>
      ) : records.length ? (
        <PrivacyTable
          area={area}
          locale={locale}
          records={records}
          text={t}
          onManage={setSelected}
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
        <div aria-modal="true" className="modal-backdrop" role="dialog">
          <Card style={{ maxWidth: '38rem', padding: '1.4rem', width: '100%' }}>
            <div className="workspace-card__head" style={{ padding: 0 }}>
              <div>
                <h2>{t.processTitle}</h2>
                <p>{selected.id.slice(0, 8)}</p>
              </div>
              <Button
                aria-label={t.cancel}
                size="icon"
                variant="quiet"
                onClick={() => setSelected(null)}
              >
                <Icon name="close" />
              </Button>
            </div>
            <form className="auth-form" style={{ marginTop: '1rem' }} onSubmit={processRequest}>
              <SelectField label={t.nextStatus} name="toStatus">
                {transitions[selected.status].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </SelectField>
              <TextAreaField
                hint={t.adminReasonHint}
                label={t.adminReason}
                minLength={12}
                name="adminReason"
                required
              />
              <TextAreaField
                label={t.patientMessage}
                minLength={10}
                name="patientMessage"
                required
              />
              <Checkbox label={t.confirm} name="confirmed" required />
              <div className="button-row">
                <Button
                  disabled={sending || transitions[selected.status].length === 0}
                  type="submit"
                >
                  {t.save}
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

function PrivacyTable({
  area,
  records,
  locale,
  text,
  onManage,
}: {
  readonly area: 'patient' | 'admin';
  readonly records: readonly PrivacyRequestView[];
  readonly locale: Locale;
  readonly text: (typeof copy)['en'] | (typeof copy)['vi'];
  readonly onManage: (record: PrivacyRequestView) => void;
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
              <th>{text.version}</th>
              <th>{text.due}</th>
              <th>{text.created}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td className="data-table__id" data-label={text.reference}>
                  {record.id.slice(0, 8)}
                </td>
                <td data-label={text.type}>{record.type}</td>
                <td data-label={text.status}>
                  <Badge tone={statusTone(record.status)}>{record.status}</Badge>
                </td>
                <td data-label={text.version}>{record.version}</td>
                <td data-label={text.due}>{formatDate(record.dueAt, locale)}</td>
                <td data-label={text.created}>{formatDate(record.createdAt, locale)}</td>
                <td data-label={text.manage}>
                  {area === 'admin' && transitions[record.status].length ? (
                    <Button size="sm" variant="secondary" onClick={() => onManage(record)}>
                      {text.manage}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function loadPrivacy(view: 'patient' | 'queue', cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ view, ...(cursor ? { cursor } : {}) });
  const response = await fetch(`/api/portal/privacy-requests?${query}`, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('privacy_requests_unavailable');
  const envelope = (await response.json()) as {
    data?: unknown;
    page?: { nextCursor?: string | null };
  };
  if (!Array.isArray(envelope.data)) throw new Error('invalid_privacy_request_data');
  return {
    records: envelope.data as PrivacyRequestView[],
    nextCursor: envelope.page?.nextCursor ?? null,
  };
}

async function sendPrivacyCommand(body: Record<string, unknown>) {
  const response = await fetch('/api/portal/privacy-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
  });
  if (!response.ok) throw new Error('privacy_request_command_rejected');
  const envelope = (await response.json()) as { data?: unknown };
  if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data))
    throw new Error('invalid_privacy_request_response');
  return envelope.data as PrivacyRequestView;
}

function statusTone(status: PrivacyRequestView['status']) {
  if (status === 'COMPLETED') return 'verified' as const;
  if (status === 'REJECTED' || status === 'CANCELLED') return 'danger' as const;
  if (status === 'IDENTITY_VERIFICATION_REQUIRED') return 'attention' as const;
  return 'info' as const;
}

function formatDate(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
