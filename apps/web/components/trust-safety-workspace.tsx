'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  incidentViewSchema,
  reviewAbuseReportViewSchema,
  reviewViewSchema,
  type IncidentView,
  type ReviewAbuseReportView,
  type ReviewView,
} from '@dental-trust/contracts/trust-safety';
import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';
import type { PortalArea } from '@/lib/routing';

const supported = new Set([
  'patient:incidents',
  'clinic:incidents',
  'admin:incidents',
  'clinic:reviews',
  'admin:reviews',
]);

const defaultCaseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const defaultOwnerId = '718f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';

const copy = {
  en: {
    secure: 'Patient-visible actions are separated from internal operations and fully audited.',
    incidentIntro:
      'Track safety, treatment, billing, service, record-correction, privacy, and warranty concerns against a response SLA.',
    reviewIntro:
      'Only completed platform-linked treatment can produce a verified review. Clinics cannot edit or delete patient content.',
    newIncident: 'Report an incident',
    warranty: 'Open a warranty claim',
    verifiedReview: 'Submit a verified treatment review',
    caseId: 'Case ID',
    type: 'Concern type',
    severity: 'Reported severity',
    summary: 'Summary',
    details: 'Detailed account',
    attachments: 'Attachments',
    uploadHint: 'PDF, JPG, PNG, WebP, or DICOM; up to 10 files and 50 MB each.',
    submit: 'Submit securely',
    timeline: 'Patient-visible timeline',
    sla: 'Response due',
    owner: 'Assigned owner',
    noOwner: 'Not assigned',
    addUpdate: 'Add patient-visible update',
    reopen: 'Reopen',
    triage: 'Triage incident',
    close: 'Close incident',
    nextStatus: 'Next status',
    ownerId: 'Owner user ID',
    patientMessage: 'Message visible to the patient',
    manage: 'Manage',
    cancel: 'Cancel',
    content: 'Review',
    overall: 'Overall rating',
    outcome: 'Treatment experience',
    communication: 'Communication',
    facilities: 'Cleanliness and environment',
    value: 'Cost accuracy',
    aftercare: 'Aftercare',
    verified: 'Verified treatment',
    respond: 'Respond as clinic',
    report: 'Report possible abuse',
    moderate: 'Moderate',
    moderationTarget: 'Moderation target',
    moderationStatus: 'Moderation decision',
    moderationReason: 'Reason for decision',
    reportReason: 'Report category',
    reportDetails: 'Evidence and details',
    abuseQueue: 'Abuse-report queue',
    decide: 'Record decision',
    actioned: 'Actioned',
    dismissed: 'Dismissed',
    loadMore: 'Load more',
    submitted: 'The record was submitted securely.',
    updated: 'The audited update was recorded.',
  },
  vi: {
    secure:
      'Thao tác hiển thị cho bệnh nhân được tách khỏi vận hành nội bộ và được kiểm toán đầy đủ.',
    incidentIntro:
      'Theo dõi vấn đề an toàn, điều trị, thanh toán, dịch vụ, chỉnh sửa hồ sơ, quyền riêng tư và bảo hành theo SLA phản hồi.',
    reviewIntro:
      'Chỉ điều trị đã hoàn tất và liên kết với nền tảng mới được đánh giá xác minh. Phòng khám không thể sửa hoặc xóa nội dung của bệnh nhân.',
    newIncident: 'Báo cáo sự cố',
    warranty: 'Mở yêu cầu bảo hành',
    verifiedReview: 'Gửi đánh giá điều trị đã xác minh',
    caseId: 'Mã hồ sơ',
    type: 'Loại vấn đề',
    severity: 'Mức độ báo cáo',
    summary: 'Tóm tắt',
    details: 'Mô tả chi tiết',
    attachments: 'Tệp đính kèm',
    uploadHint: 'PDF, JPG, PNG, WebP hoặc DICOM; tối đa 10 tệp và 50 MB mỗi tệp.',
    submit: 'Gửi an toàn',
    timeline: 'Dòng thời gian hiển thị cho bệnh nhân',
    sla: 'Hạn phản hồi',
    owner: 'Người phụ trách',
    noOwner: 'Chưa phân công',
    addUpdate: 'Thêm cập nhật cho bệnh nhân',
    reopen: 'Mở lại',
    triage: 'Phân loại sự cố',
    close: 'Đóng sự cố',
    nextStatus: 'Trạng thái tiếp theo',
    ownerId: 'Mã người phụ trách',
    patientMessage: 'Thông báo hiển thị cho bệnh nhân',
    manage: 'Xử lý',
    cancel: 'Hủy',
    content: 'Đánh giá',
    overall: 'Điểm tổng thể',
    outcome: 'Trải nghiệm điều trị',
    communication: 'Giao tiếp',
    facilities: 'Vệ sinh và môi trường',
    value: 'Độ chính xác chi phí',
    aftercare: 'Chăm sóc sau điều trị',
    verified: 'Điều trị đã xác minh',
    respond: 'Phản hồi từ phòng khám',
    report: 'Báo cáo dấu hiệu lạm dụng',
    moderate: 'Kiểm duyệt',
    moderationTarget: 'Đối tượng kiểm duyệt',
    moderationStatus: 'Quyết định kiểm duyệt',
    moderationReason: 'Lý do quyết định',
    reportReason: 'Loại báo cáo',
    reportDetails: 'Bằng chứng và chi tiết',
    abuseQueue: 'Hàng đợi báo cáo lạm dụng',
    decide: 'Ghi nhận quyết định',
    actioned: 'Đã xử lý',
    dismissed: 'Bác bỏ',
    loadMore: 'Xem thêm',
    submitted: 'Thông tin đã được gửi an toàn.',
    updated: 'Cập nhật có kiểm toán đã được ghi nhận.',
  },
} as const;

export function isTrustSafetyWorkspace(area: string, pageKey: string) {
  return supported.has(`${area}:${pageKey}`);
}

export function TrustSafetyWorkspace({
  area,
  pageKey,
  title,
  description,
  locale,
  messages,
  development,
}: {
  readonly area: PortalArea;
  readonly pageKey: string;
  readonly title: string;
  readonly description: string;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const t = copy[locale.startsWith('vi') ? 'vi' : 'en'];
  const incidentsPage = pageKey === 'incidents';
  const [incidents, setIncidents] = useState<IncidentView[]>([]);
  const [reviews, setReviews] = useState<ReviewView[]>([]);
  const [reports, setReports] = useState<ReviewAbuseReportView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentView | null>(null);
  const [selectedReview, setSelectedReview] = useState<ReviewView | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReviewAbuseReportView | null>(null);
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadRecords(area, incidentsPage ? 'incidents' : 'reviews', undefined, controller.signal)
      .then((result) => {
        if (incidentsPage) setIncidents(result.records as IncidentView[]);
        else setReviews(result.records as ReviewView[]);
        setNextCursor(result.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    if (area === 'admin' && !incidentsPage) {
      void loadRecords(area, 'review-reports', undefined, controller.signal)
        .then((result) => setReports(result.records as ReviewAbuseReportView[]))
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
        });
    }
    return () => controller.abort();
  }, [area, incidentsPage]);

  const command = async (
    name: string,
    input: object,
    options?: { readonly entityId?: string; readonly caseId?: string },
  ) => {
    const operation = `${name}:${options?.entityId ?? options?.caseId ?? 'new'}:${JSON.stringify(input)}`;
    const idempotencyKey = keys.current.get(operation) ?? crypto.randomUUID();
    keys.current.set(operation, idempotencyKey);
    setSending(true);
    setError(false);
    setNotice(null);
    try {
      const response = await fetch('/api/portal/trust-safety', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ area, command: name, input, idempotencyKey, ...options }),
      });
      if (!response.ok) throw new Error('command_failed');
      const body = (await response.json()) as { data?: unknown };
      if (!body.data) throw new Error('invalid_response');
      keys.current.delete(operation);
      setNotice(name.startsWith('create_') ? t.submitted : t.updated);
      return body.data;
    } catch {
      setError(true);
      return null;
    } finally {
      setSending(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setSending(true);
    setError(false);
    try {
      const result = await loadRecords(area, incidentsPage ? 'incidents' : 'reviews', nextCursor);
      if (incidentsPage)
        setIncidents((current) => [...current, ...(result.records as IncidentView[])]);
      else setReviews((current) => [...current, ...(result.records as ReviewView[])]);
      setNextCursor(result.nextCursor);
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
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="info">
          <Icon name={incidentsPage ? 'alert' : 'star'} />
          {messages.portal.secure}
        </Badge>
      </div>
      <Alert tone="info" title={incidentsPage ? t.newIncident : t.verifiedReview}>
        {incidentsPage ? t.incidentIntro : t.reviewIntro} {t.secure}
      </Alert>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}

      {area === 'patient' && incidentsPage ? (
        <PatientIntake
          command={command}
          disabled={sending}
          onIncident={(record) => setIncidents((current) => [record, ...current])}
          onFailure={() => setError(true)}
          t={t}
        />
      ) : null}

      {loading ? (
        <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <Skeleton style={{ height: '14rem' }} />
        </Card>
      ) : incidentsPage ? (
        <IncidentList
          area={area}
          command={command}
          disabled={sending}
          incidents={incidents}
          messages={messages}
          onSelect={setSelectedIncident}
          onUpdate={(record) => {
            setIncidents((current) =>
              current.map((item) => (item.id === record.id ? record : item)),
            );
            setSelectedIncident(null);
          }}
          selected={selectedIncident}
          t={t}
        />
      ) : (
        <ReviewList
          area={area}
          command={command}
          disabled={sending}
          messages={messages}
          onSelect={setSelectedReview}
          onUpdate={(record) => {
            setReviews((current) => current.map((item) => (item.id === record.id ? record : item)));
            setSelectedReview(null);
          }}
          reviews={reviews}
          selected={selectedReview}
          t={t}
        />
      )}
      {area === 'admin' && !incidentsPage ? (
        <ReportQueue
          command={command}
          disabled={sending}
          messages={messages}
          onSelect={setSelectedReport}
          onUpdate={(record) => {
            setReports((current) => current.map((item) => (item.id === record.id ? record : item)));
            setSelectedReport(null);
          }}
          reports={reports}
          selected={selectedReport}
          t={t}
        />
      ) : null}
      {nextCursor ? (
        <Button disabled={sending} onClick={() => void loadMore()} variant="secondary">
          {t.loadMore}
        </Button>
      ) : null}
    </main>
  );
}

type LocalCopy = (typeof copy)['en'] | (typeof copy)['vi'];
type Command = (
  name: string,
  input: object,
  options?: { readonly entityId?: string; readonly caseId?: string },
) => Promise<unknown>;

function PatientIntake({
  command,
  disabled,
  onIncident,
  onFailure,
  t,
}: {
  readonly command: Command;
  readonly disabled: boolean;
  readonly onIncident: (record: IncidentView) => void;
  readonly onFailure: () => void;
  readonly t: LocalCopy;
}) {
  const submitIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const caseId = String(form.get('caseId'));
    try {
      const attachmentFileAssetIds = await uploadAttachments(
        caseId,
        form
          .getAll('attachments')
          .filter((value): value is File => value instanceof File && value.size > 0),
      );
      const value = await command('create_incident', {
        caseId,
        type: String(form.get('type')),
        reportedSeverity: String(form.get('severity')),
        summary: String(form.get('summary')).trim(),
        details: String(form.get('details')).trim(),
        attachmentFileAssetIds,
      });
      const parsed = incidentViewSchema.safeParse(value);
      if (parsed.success) {
        onIncident(parsed.data);
        formElement.reset();
      }
    } catch {
      onFailure();
    }
  };
  const submitWarranty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const caseId = String(form.get('caseId'));
    try {
      const attachmentFileAssetIds = await uploadAttachments(
        caseId,
        form
          .getAll('attachments')
          .filter((value): value is File => value instanceof File && value.size > 0),
      );
      const value = await command(
        'create_warranty_claim',
        {
          reportedSeverity: String(form.get('severity')),
          summary: String(form.get('summary')).trim(),
          details: String(form.get('details')).trim(),
          attachmentFileAssetIds,
        },
        { caseId },
      );
      const parsed = incidentViewSchema.safeParse(value);
      if (parsed.success) {
        onIncident(parsed.data);
        formElement.reset();
      }
    } catch {
      onFailure();
    }
  };
  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await command('create_review', {
      caseId: String(form.get('caseId')),
      overallRating: Number(form.get('overallRating')),
      dimensionRatings: {
        clinicalOutcome: Number(form.get('clinicalOutcome')),
        communication: Number(form.get('communication')),
        facilities: Number(form.get('facilities')),
        value: Number(form.get('value')),
        aftercare: Number(form.get('aftercare')),
      },
      content: String(form.get('content')).trim(),
    });
  };
  return (
    <div className="portal-grid" style={{ marginTop: '1rem' }}>
      <Card style={{ padding: '1.2rem' }}>
        <IncidentForm disabled={disabled} onSubmit={submitIncident} t={t} title={t.newIncident} />
      </Card>
      <Card style={{ padding: '1.2rem' }}>
        <IncidentForm
          disabled={disabled}
          onSubmit={submitWarranty}
          t={t}
          title={t.warranty}
          warranty
        />
      </Card>
      <Card style={{ padding: '1.2rem' }}>
        <form className="auth-form" onSubmit={submitReview}>
          <h2>{t.verifiedReview}</h2>
          <Field defaultValue={defaultCaseId} label={t.caseId} name="caseId" required />
          <Rating label={t.overall} name="overallRating" />
          <Rating label={t.outcome} name="clinicalOutcome" />
          <Rating label={t.communication} name="communication" />
          <Rating label={t.facilities} name="facilities" />
          <Rating label={t.value} name="value" />
          <Rating label={t.aftercare} name="aftercare" />
          <TextAreaField label={t.content} minLength={20} name="content" required />
          <Button disabled={disabled} type="submit">
            {t.submit}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function IncidentForm({
  disabled,
  onSubmit,
  t,
  title,
  warranty = false,
}: {
  readonly disabled: boolean;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly t: LocalCopy;
  readonly title: string;
  readonly warranty?: boolean;
}) {
  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <h2>{title}</h2>
      <Field defaultValue={defaultCaseId} label={t.caseId} name="caseId" required />
      {!warranty ? (
        <SelectField label={t.type} name="type">
          <option value="CLINICAL_CONCERN">{t.outcome}</option>
          <option value="SERVICE_COMPLAINT">SERVICE COMPLAINT</option>
          <option value="BILLING_DISPUTE">BILLING DISPUTE</option>
          <option value="SAFETY_CONCERN">SAFETY CONCERN</option>
          <option value="OTHER">OTHER</option>
        </SelectField>
      ) : null}
      <SelectField label={t.severity} name="severity">
        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </SelectField>
      <Field label={t.summary} minLength={10} name="summary" required />
      <TextAreaField label={t.details} minLength={20} name="details" required />
      <Field
        accept=".pdf,.jpg,.jpeg,.png,.webp,.dcm"
        label={t.attachments}
        multiple
        name="attachments"
        type="file"
      />
      <small>{t.uploadHint}</small>
      <Button disabled={disabled} type="submit">
        {t.submit}
      </Button>
    </form>
  );
}

function IncidentList({
  area,
  command,
  disabled,
  incidents,
  messages,
  onSelect,
  onUpdate,
  selected,
  t,
}: {
  readonly area: PortalArea;
  readonly command: Command;
  readonly disabled: boolean;
  readonly incidents: IncidentView[];
  readonly messages: Messages;
  readonly onSelect: (record: IncidentView | null) => void;
  readonly onUpdate: (record: IncidentView) => void;
  readonly selected: IncidentView | null;
  readonly t: LocalCopy;
}) {
  if (incidents.length === 0)
    return <EmptyState body={messages.common.emptyBody} title={messages.common.emptyTitle} />;
  const submitAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const action = String(form.get('action'));
    const input =
      action === 'triage_incident'
        ? {
            severity: String(form.get('severity')),
            ownerUserId: String(form.get('ownerUserId')),
            toStatus: String(form.get('toStatus')),
            expectedVersion: selected.version,
            patientMessage: String(form.get('patientMessage')).trim(),
          }
        : action === 'update_incident'
          ? { message: String(form.get('patientMessage')).trim() }
          : {
              expectedVersion: selected.version,
              patientMessage: String(form.get('patientMessage')).trim(),
            };
    const value = await command(action, input, { entityId: selected.id });
    const parsed = incidentViewSchema.safeParse(value);
    if (parsed.success) onUpdate(parsed.data);
  };
  return (
    <>
      <div className="portal-grid" style={{ marginTop: '1rem' }}>
        {incidents.map((incident) => (
          <Card key={incident.id} style={{ padding: '1.2rem' }}>
            <div className="portal-heading__actions">
              <Badge tone={incident.severity === 'CRITICAL' ? 'danger' : 'attention'}>
                {incident.severity}
              </Badge>
              <Badge tone={incident.status === 'CLOSED' ? 'neutral' : 'info'}>
                {incident.status}
              </Badge>
            </div>
            <h2>{incident.summary}</h2>
            <p>{incident.details}</p>
            <dl>
              <dt>{t.sla}</dt>
              <dd>{formatDate(incident.slaDueAt)}</dd>
              <dt>{t.owner}</dt>
              <dd>{incident.ownerAssigned ? t.owner : t.noOwner}</dd>
              <dt>{t.caseId}</dt>
              <dd>{incident.caseId}</dd>
            </dl>
            <h3>{t.timeline}</h3>
            {incident.updates.length ? (
              incident.updates.map((update) => (
                <p key={update.id}>
                  <strong>{formatDate(update.createdAt)}</strong> · {update.message}
                </p>
              ))
            ) : (
              <p>{messages.common.emptyTitle}</p>
            )}
            {area !== 'clinic' ? (
              <Button onClick={() => onSelect(incident)}>{t.manage}</Button>
            ) : null}
          </Card>
        ))}
      </div>
      {selected ? (
        <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <form className="auth-form" onSubmit={submitAction}>
            <h2>
              {t.manage}: {selected.summary}
            </h2>
            <SelectField label={t.nextStatus} name="action">
              <option value="update_incident">{t.addUpdate}</option>
              {area === 'admin' && selected.status !== 'CLOSED' ? (
                <option value="triage_incident">{t.triage}</option>
              ) : null}
              {area === 'admin' && selected.status !== 'CLOSED' ? (
                <option value="close_incident">{t.close}</option>
              ) : null}
              {['CLOSED', 'RESOLVED'].includes(selected.status) ? (
                <option value="reopen_incident">{t.reopen}</option>
              ) : null}
            </SelectField>
            {area === 'admin' ? (
              <>
                <SelectField label={t.severity} name="severity" defaultValue={selected.severity}>
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </SelectField>
                <SelectField label={t.nextStatus} name="toStatus">
                  {['TRIAGED', 'IN_PROGRESS', 'AWAITING_CLINIC'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </SelectField>
                <Field
                  defaultValue={defaultOwnerId}
                  label={t.ownerId}
                  name="ownerUserId"
                  required
                />
              </>
            ) : null}
            <TextAreaField label={t.patientMessage} minLength={3} name="patientMessage" required />
            <div className="portal-heading__actions">
              <Button disabled={disabled} type="submit">
                {t.submit}
              </Button>
              <Button onClick={() => onSelect(null)} type="button" variant="secondary">
                {t.cancel}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}

function ReviewList({
  area,
  command,
  disabled,
  messages,
  onSelect,
  onUpdate,
  reviews,
  selected,
  t,
}: {
  readonly area: PortalArea;
  readonly command: Command;
  readonly disabled: boolean;
  readonly messages: Messages;
  readonly onSelect: (record: ReviewView | null) => void;
  readonly onUpdate: (record: ReviewView) => void;
  readonly reviews: ReviewView[];
  readonly selected: ReviewView | null;
  readonly t: LocalCopy;
}) {
  if (reviews.length === 0)
    return <EmptyState body={messages.common.emptyBody} title={messages.common.emptyTitle} />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const action = String(form.get('action'));
    const input =
      action === 'respond_review'
        ? { content: String(form.get('content')).trim() }
        : action === 'report_review'
          ? {
              reasonCode: String(form.get('reasonCode')),
              details: String(form.get('details')).trim(),
            }
          : {
              target: String(form.get('target')),
              status: String(form.get('status')),
              reason: String(form.get('reason')).trim(),
            };
    const value = await command(action, input, { entityId: selected.id });
    if (action === 'report_review') {
      onSelect(null);
      return;
    }
    const parsed = reviewViewSchema.safeParse(value);
    if (parsed.success) onUpdate(parsed.data);
  };
  return (
    <>
      <div className="portal-grid" style={{ marginTop: '1rem' }}>
        {reviews.map((review) => (
          <Card key={review.id} style={{ padding: '1.2rem' }}>
            <div className="portal-heading__actions">
              <Badge tone={review.verified ? 'verified' : 'attention'}>
                {review.verified ? t.verified : 'UNVERIFIED'}
              </Badge>
              <Badge tone={review.moderationStatus === 'PUBLISHED' ? 'verified' : 'attention'}>
                {review.moderationStatus}
              </Badge>
            </div>
            <h2>
              {'★'.repeat(review.overallRating)}
              {'☆'.repeat(5 - review.overallRating)}
            </h2>
            <p>{review.content}</p>
            <p>
              {review.treatmentDate} · {review.followUpDays} days
            </p>
            {review.clinicResponse ? (
              <Alert tone="info" title={t.respond}>
                {review.clinicResponse.content}
              </Alert>
            ) : null}
            <Button onClick={() => onSelect(review)}>{t.manage}</Button>
          </Card>
        ))}
      </div>
      {selected ? (
        <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <form className="auth-form" onSubmit={submit}>
            <h2>{t.manage}</h2>
            <SelectField label={t.manage} name="action">
              {area === 'clinic' && !selected.clinicResponse ? (
                <option value="respond_review">{t.respond}</option>
              ) : null}
              <option value="report_review">{t.report}</option>
              {area === 'admin' ? <option value="moderate_review">{t.moderate}</option> : null}
            </SelectField>
            {area === 'clinic' ? (
              <TextAreaField label={t.content} minLength={10} name="content" />
            ) : null}
            <SelectField label={t.reportReason} name="reasonCode">
              {['PERSONAL_DATA', 'HARASSMENT', 'FALSE_INFORMATION', 'CONFLICT', 'OTHER'].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </SelectField>
            <TextAreaField label={t.reportDetails} minLength={10} name="details" />
            {area === 'admin' ? (
              <>
                <SelectField label={t.moderationTarget} name="target">
                  <option>REVIEW</option>
                  <option>CLINIC_RESPONSE</option>
                </SelectField>
                <SelectField label={t.moderationStatus} name="status">
                  <option>PUBLISHED</option>
                  <option>HIDDEN</option>
                  <option>REJECTED</option>
                </SelectField>
                <TextAreaField label={t.moderationReason} minLength={10} name="reason" />
              </>
            ) : null}
            <div className="portal-heading__actions">
              <Button disabled={disabled} type="submit">
                {t.submit}
              </Button>
              <Button onClick={() => onSelect(null)} type="button" variant="secondary">
                {t.cancel}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}

function ReportQueue({
  command,
  disabled,
  messages,
  onSelect,
  onUpdate,
  reports,
  selected,
  t,
}: {
  readonly command: Command;
  readonly disabled: boolean;
  readonly messages: Messages;
  readonly onSelect: (record: ReviewAbuseReportView | null) => void;
  readonly onUpdate: (record: ReviewAbuseReportView) => void;
  readonly reports: ReviewAbuseReportView[];
  readonly selected: ReviewAbuseReportView | null;
  readonly t: LocalCopy;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const value = await command(
      'decide_review_report',
      {
        status: String(form.get('status')),
        reason: String(form.get('reason')).trim(),
      },
      { entityId: selected.id },
    );
    const parsed = reviewAbuseReportViewSchema.safeParse(value);
    if (parsed.success) onUpdate(parsed.data);
  };
  return (
    <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
      <h2>{t.abuseQueue}</h2>
      {reports.length === 0 ? (
        <EmptyState body={messages.common.emptyBody} title={messages.common.emptyTitle} />
      ) : (
        reports.map((report) => (
          <div key={report.id} style={{ marginBottom: '1rem' }}>
            <Badge tone={report.status === 'OPEN' ? 'attention' : 'neutral'}>{report.status}</Badge>
            <p>
              <strong>{report.reasonCode}</strong> · {report.details}
            </p>
            {['OPEN', 'UNDER_REVIEW'].includes(report.status) ? (
              <Button onClick={() => onSelect(report)}>{t.decide}</Button>
            ) : null}
          </div>
        ))
      )}
      {selected ? (
        <form className="auth-form" onSubmit={submit}>
          <SelectField label={t.moderationStatus} name="status">
            <option value="ACTIONED">{t.actioned}</option>
            <option value="DISMISSED">{t.dismissed}</option>
          </SelectField>
          <TextAreaField label={t.moderationReason} minLength={10} name="reason" required />
          <div className="portal-heading__actions">
            <Button disabled={disabled} type="submit">
              {t.decide}
            </Button>
            <Button onClick={() => onSelect(null)} type="button" variant="secondary">
              {t.cancel}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

function Rating({ label, name }: { readonly label: string; readonly name: string }) {
  return (
    <SelectField label={label} name={name}>
      {[5, 4, 3, 2, 1].map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </SelectField>
  );
}

async function loadRecords(
  area: PortalArea,
  view: 'incidents' | 'reviews' | 'review-reports',
  cursor?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ area, view, ...(cursor ? { cursor } : {}) });
  const response = await fetch(`/api/portal/trust-safety?${query}`, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('load_failed');
  const body = (await response.json()) as { data?: unknown; page?: { nextCursor?: string | null } };
  const schema =
    view === 'incidents'
      ? incidentViewSchema.array()
      : view === 'reviews'
        ? reviewViewSchema.array()
        : reviewAbuseReportViewSchema.array();
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) throw new Error('invalid_response');
  return { records: parsed.data, nextCursor: body.page?.nextCursor ?? null };
}

async function uploadAttachments(caseId: string, files: readonly File[]) {
  if (files.length > 10) throw new Error('too_many_files');
  return Promise.all(
    files.map(async (file) => {
      const initiation = await fetch('/api/portal/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'initiate',
          scope: 'patient',
          resourceId: caseId,
          fileName: file.name,
          declaredMediaType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          category: 'OTHER',
        }),
      });
      if (!initiation.ok) throw new Error('upload_failed');
      const envelope = (await initiation.json()) as {
        data?: {
          fileAssetId?: string;
          uploadUrl?: string;
          requiredHeaders?: Record<string, string>;
        };
      };
      const asset = envelope.data;
      if (!asset?.fileAssetId) throw new Error('invalid_upload');
      if (asset.uploadUrl) {
        const uploaded = await fetch(asset.uploadUrl, {
          method: 'PUT',
          ...(asset.requiredHeaders ? { headers: asset.requiredHeaders } : {}),
          body: file,
        });
        if (!uploaded.ok) throw new Error('upload_failed');
      }
      const finalized = await fetch('/api/portal/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          scope: 'patient',
          resourceId: caseId,
          fileAssetId: asset.fileAssetId,
        }),
      });
      if (!finalized.ok) throw new Error('upload_failed');
      return asset.fileAssetId;
    }),
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
