'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import type { VerificationCaseDetail, VerificationCaseSummary } from '@dental-trust/contracts';
import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Progress,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';

import type { PortalArea } from '@/lib/routing';

interface VerificationEnvelope {
  readonly data?: VerificationCaseDetail | readonly VerificationCaseSummary[];
}

type VerificationStatus = VerificationCaseDetail['status'];

const statusTransitions: Partial<Record<VerificationStatus, readonly VerificationStatus[]>> = {
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ADDITIONAL_INFORMATION_REQUIRED', 'SITE_AUDIT_REQUIRED', 'APPROVED', 'REJECTED'],
  ADDITIONAL_INFORMATION_REQUIRED: ['REJECTED'],
  SITE_AUDIT_REQUIRED: ['UNDER_REVIEW', 'REJECTED'],
  APPROVED: ['VERIFIED'],
  VERIFIED: ['VERIFICATION_EXPIRING', 'SUSPENDED'],
  VERIFICATION_EXPIRING: ['VERIFIED', 'EXPIRED', 'SUSPENDED'],
  EXPIRED: ['UNDER_REVIEW', 'SUSPENDED'],
  SUSPENDED: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
  REJECTED: ['DRAFT'],
};

export function isVerificationWorkspace(area: PortalArea) {
  return area === 'verification';
}

export function VerificationWorkspace({
  pageKey,
  locale,
  title,
  description,
  messages,
  resourceId,
}: {
  pageKey: string;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
  resourceId?: string | undefined;
}) {
  const copy = verificationCopy(locale);
  const [data, setData] = useState<VerificationEnvelope['data']>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const idempotencyKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ area: 'verification', pageKey });
    if (resourceId) query.set('resourceId', resourceId);
    setLoading(true);
    setError(false);
    void fetch(`/api/portal/data?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('verification_unavailable');
        const envelope = (await response.json()) as VerificationEnvelope;
        if (!envelope.data) throw new Error('verification_invalid');
        setData(envelope.data);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [pageKey, resourceId, revision]);

  const send = async (command: string, entityId: string, payload: Record<string, unknown>) => {
    const operationKey = `${command}:${entityId}:${JSON.stringify(payload)}`;
    const idempotencyKey = idempotencyKeys.current.get(operationKey) ?? crypto.randomUUID();
    idempotencyKeys.current.set(operationKey, idempotencyKey);
    setSending(true);
    setError(false);
    try {
      const response = await fetch('/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          area: 'verification',
          pageKey,
          command,
          entityId,
          payload,
          idempotencyKey,
        }),
      });
      if (!response.ok) throw new Error('verification_command_failed');
      idempotencyKeys.current.delete(operationKey);
      setNotice(copy.saved);
      setRevision((value) => value + 1);
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setSending(false);
    }
  };

  if (loading) return <VerificationLoading title={title} description={description} />;
  if (error && !data)
    return (
      <VerificationFrame title={title} description={description} messages={messages}>
        <Alert tone="danger" title={copy.errorTitle}>
          {copy.errorBody}
        </Alert>
        <Button onClick={() => setRevision((value) => value + 1)}>{copy.retry}</Button>
      </VerificationFrame>
    );
  if (isSummaryList(data)) {
    return (
      <VerificationQueue
        cases={data}
        copy={copy}
        description={description}
        locale={locale}
        messages={messages}
        pageKey={pageKey}
        title={title}
      />
    );
  }
  if (!data)
    return (
      <VerificationFrame title={title} description={description} messages={messages}>
        <EmptyState icon="shield" title={copy.emptyTitle} body={copy.emptyBody} />
      </VerificationFrame>
    );
  return (
    <VerificationDetail
      copy={copy}
      data={data}
      description={description}
      error={error}
      locale={locale}
      messages={messages}
      notice={notice}
      pageKey={pageKey}
      send={send}
      sending={sending}
      title={title}
    />
  );
}

function VerificationQueue({
  cases,
  pageKey,
  locale,
  title,
  description,
  messages,
  copy,
}: {
  cases: readonly VerificationCaseSummary[];
  pageKey: string;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
  copy: ReturnType<typeof verificationCopy>;
}) {
  const metrics = useMemo(
    () => ({
      total: cases.length,
      highRisk: cases.filter(({ riskLevel }) => riskLevel === 'HIGH').length,
      unassigned: cases.filter(({ assignedReviewerUserId }) => !assignedReviewerUserId).length,
      expiring: cases.filter(({ status }) => status === 'VERIFICATION_EXPIRING').length,
    }),
    [cases],
  );
  return (
    <VerificationFrame title={title} description={description} messages={messages}>
      <div className="portal-metrics">
        {[
          [copy.total, metrics.total],
          [copy.highRisk, metrics.highRisk],
          [copy.unassigned, metrics.unassigned],
          [copy.expiring, metrics.expiring],
        ].map(([label, value]) => (
          <Card className="portal-metric" key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
          </Card>
        ))}
      </div>
      {cases.length === 0 ? (
        <Card className="workspace-card">
          <EmptyState icon="check" title={copy.emptyTitle} body={copy.emptyBody} />
        </Card>
      ) : (
        <Card className="workspace-card" style={{ marginTop: '1rem', overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{copy.subject}</th>
                <th>{copy.type}</th>
                <th>{copy.status}</th>
                <th>{copy.risk}</th>
                <th>{copy.expiry}</th>
                <th>{copy.action}</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => (
                <tr key={item.id}>
                  <td data-label={copy.subject}>{item.subjectName}</td>
                  <td data-label={copy.type}>{item.subjectType}</td>
                  <td data-label={copy.status}>
                    <Badge tone={statusTone(item.status)}>{humanize(item.status)}</Badge>
                  </td>
                  <td data-label={copy.risk}>{humanize(item.riskLevel)}</td>
                  <td data-label={copy.expiry}>{formatDate(item.expiresAt, locale)}</td>
                  <td data-label={copy.action}>
                    <Link
                      className="dt-button dt-button--quiet dt-button--sm"
                      href={`/${locale}/verification-admin/${
                        item.subjectType === 'CLINIC' ? 'clinics' : 'dentists'
                      }/${item.id}`}
                    >
                      {copy.open}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {pageKey === 'suspension' ? (
        <Alert tone="warning" title={copy.fourEyes}>
          {copy.suspensionRule}
        </Alert>
      ) : null}
    </VerificationFrame>
  );
}

function VerificationDetail({
  data,
  pageKey,
  locale,
  title,
  description,
  messages,
  copy,
  notice,
  error,
  sending,
  send,
}: {
  data: VerificationCaseDetail;
  pageKey: string;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
  copy: ReturnType<typeof verificationCopy>;
  notice: string | null;
  error: boolean;
  sending: boolean;
  send: (command: string, entityId: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const approved = data.requirements.filter(({ status }) => status === 'APPROVED').length;
  const progress = data.requirements.length
    ? Math.round((approved / data.requirements.length) * 100)
    : 0;
  const nextStatuses = statusTransitions[data.status] ?? [];
  const submitAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send('verification_assign', data.id, {
      reviewerUserId: String(form.get('reviewerUserId')),
      expectedVersion: data.version,
    });
  };
  const submitDecision = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiresAt = String(form.get('expiresAt') ?? '');
    void send('verification_decide', data.id, {
      toStatus: String(form.get('toStatus')),
      notes: String(form.get('notes')),
      expectedVersion: data.version,
      ...(expiresAt ? { expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString() } : {}),
    });
  };
  const submitCorrective = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requirementId = String(form.get('requirementId') ?? '');
    void send('verification_create_corrective', data.id, {
      expectedCaseVersion: data.version,
      ...(requirementId ? { requirementId } : {}),
      title: String(form.get('title')),
      description: String(form.get('description')),
      dueAt: new Date(`${String(form.get('dueAt'))}T23:59:59.000Z`).toISOString(),
    });
  };
  return (
    <VerificationFrame title={title} description={description} messages={messages}>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={copy.errorTitle}>
          {copy.errorBody}
        </Alert>
      ) : null}
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <div className="workspace-card__head" style={{ padding: 0 }}>
          <div>
            <p className="eyebrow">{data.subjectType}</p>
            <h2>{data.subjectName}</h2>
          </div>
          <Badge tone={statusTone(data.status)}>{humanize(data.status)}</Badge>
        </div>
        <Progress
          value={progress}
          label={`${copy.approved}: ${approved}/${data.requirements.length}`}
        />
        <p>
          {copy.version}: {data.version} · {copy.expiry}: {formatDate(data.expiresAt, locale)}
        </p>
      </Card>
      <div className="workspace-grid" style={{ marginTop: '1rem' }}>
        <Card className="workspace-card" style={{ padding: '1.2rem' }}>
          <h2>{copy.requirements}</h2>
          {data.requirements.length === 0 ? (
            <EmptyState icon="document" title={copy.emptyTitle} body={copy.emptyBody} />
          ) : (
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {data.requirements.map((requirement) => (
                <article key={requirement.id} className="activity-item">
                  <div>
                    <strong>{humanize(requirement.category)}</strong>
                    <p>{requirement.code}</p>
                    <small>
                      {requirement.evidence.length} {copy.evidence.toLowerCase()}
                    </small>
                  </div>
                  <Badge tone={statusTone(requirement.status)}>
                    {humanize(requirement.status)}
                  </Badge>
                  {requirement.evidence.map((evidence) =>
                    evidence.approvedAt || evidence.revokedAt ? null : (
                      <div key={evidence.id} style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button
                          disabled={sending}
                          size="sm"
                          onClick={() =>
                            void send('verification_review_evidence', data.id, {
                              evidenceId: evidence.id,
                              decision: 'APPROVE',
                              notes: copy.approveEvidenceNote,
                              expectedCaseVersion: data.version,
                            })
                          }
                        >
                          {copy.approve}
                        </Button>
                        <Button
                          disabled={sending}
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            void send('verification_review_evidence', data.id, {
                              evidenceId: evidence.id,
                              decision: 'REJECT',
                              notes: copy.rejectEvidenceNote,
                              expectedCaseVersion: data.version,
                            })
                          }
                        >
                          {copy.reject}
                        </Button>
                      </div>
                    ),
                  )}
                </article>
              ))}
            </div>
          )}
        </Card>
        <Card className="workspace-card" style={{ padding: '1.2rem' }}>
          <h2>{copy.controls}</h2>
          <form className="auth-form" onSubmit={submitAssignment}>
            <Field
              label={copy.reviewerId}
              name="reviewerUserId"
              pattern="[0-9a-fA-F-]{36}"
              required
              defaultValue={data.assignedReviewerUserId ?? ''}
            />
            <Button disabled={sending} type="submit" variant="secondary">
              {copy.assign}
            </Button>
          </form>
          {nextStatuses.length > 0 ? (
            <form className="auth-form" onSubmit={submitDecision} style={{ marginTop: '1rem' }}>
              <SelectField label={copy.decision} name="toStatus" required>
                {nextStatuses.map((status) => (
                  <option key={status} value={status}>
                    {humanize(status)}
                  </option>
                ))}
              </SelectField>
              <TextAreaField label={copy.notes} name="notes" minLength={10} required />
              <Field label={copy.expiry} name="expiresAt" type="date" />
              <Button disabled={sending} type="submit">
                {copy.applyDecision}
              </Button>
            </form>
          ) : null}
          <Alert tone="info" title={copy.fourEyes}>
            {copy.fourEyesBody}
          </Alert>
        </Card>
      </div>
      <Card className="workspace-card" style={{ marginTop: '1rem', padding: '1.2rem' }}>
        <h2>{copy.reviewHistory}</h2>
        {data.reviews.length === 0 ? (
          <EmptyState icon="activity" title={copy.emptyTitle} body={copy.emptyBody} />
        ) : (
          data.reviews.map((review) => (
            <article className="activity-item" key={review.id}>
              <div>
                <strong>
                  {humanize(review.fromStatus)} → {humanize(review.toStatus)}
                </strong>
                <p>{review.notes ?? copy.internalNote}</p>
              </div>
              <Badge tone={statusTone(review.status)}>{humanize(review.status)}</Badge>
              {review.status === 'PENDING_SECOND_APPROVAL' ? (
                <Button
                  disabled={sending}
                  size="sm"
                  onClick={() =>
                    void send('verification_second_approve', review.id, {
                      approve: true,
                      notes: copy.secondApprovalNote,
                      expectedCaseVersion: data.version,
                      ...(review.toStatus === 'VERIFIED'
                        ? {
                            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString(),
                          }
                        : {}),
                    })
                  }
                >
                  {copy.secondApprove}
                </Button>
              ) : null}
            </article>
          ))
        )}
      </Card>
      {pageKey === 'audit' || data.siteAudits.length > 0 ? (
        <Card className="workspace-card" style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <h2>{copy.siteAudits}</h2>
          {data.siteAudits.map((audit) => (
            <article className="activity-item" key={audit.id}>
              <div>
                <strong>{formatDate(audit.scheduledAt, locale)}</strong>
                <p>{audit.findings ?? copy.awaitingFindings}</p>
              </div>
              <Badge tone={statusTone(audit.status)}>{humanize(audit.status)}</Badge>
              {audit.status === 'SCHEDULED' ? (
                <form
                  className="auth-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void send('verification_complete_audit', audit.id, {
                      expectedCaseVersion: data.version,
                      findings: String(form.get('findings')),
                      checklist: Object.fromEntries(
                        Object.keys(audit.checklist).map((key) => [key, true]),
                      ),
                      attachmentFileAssetIds: [],
                    });
                  }}
                >
                  <TextAreaField label={copy.findings} name="findings" minLength={20} required />
                  <Button disabled={sending} type="submit">
                    {copy.completeAudit}
                  </Button>
                </form>
              ) : null}
            </article>
          ))}
        </Card>
      ) : null}
      <div className="workspace-grid" style={{ marginTop: '1rem' }}>
        <Card className="workspace-card" style={{ padding: '1.2rem' }}>
          <h2>{copy.correctiveActions}</h2>
          {data.correctiveActions.length === 0 ? (
            <EmptyState icon="check" title={copy.emptyTitle} body={copy.emptyBody} />
          ) : (
            data.correctiveActions.map((action) => (
              <article className="activity-item" key={action.id}>
                <div>
                  <strong>{action.title}</strong>
                  <p>{action.description}</p>
                  <small>{formatDate(action.dueAt, locale)}</small>
                </div>
                <Badge tone={statusTone(action.status)}>{humanize(action.status)}</Badge>
                {action.status === 'SUBMITTED' ? (
                  <Button
                    disabled={sending}
                    size="sm"
                    onClick={() =>
                      void send('verification_decide_corrective', action.id, {
                        decision: 'ACCEPT',
                        notes: copy.correctiveAcceptedNote,
                        expectedVersion: action.version,
                        expectedCaseVersion: data.version,
                      })
                    }
                  >
                    {copy.accept}
                  </Button>
                ) : null}
              </article>
            ))
          )}
        </Card>
        <Card className="workspace-card" style={{ padding: '1.2rem' }}>
          <h2>{copy.createCorrective}</h2>
          <form className="auth-form" onSubmit={submitCorrective}>
            <SelectField label={copy.requirement} name="requirementId">
              <option value="">{copy.caseLevel}</option>
              {data.requirements.map((requirement) => (
                <option key={requirement.id} value={requirement.id}>
                  {humanize(requirement.category)}
                </option>
              ))}
            </SelectField>
            <Field label={copy.title} name="title" minLength={5} required />
            <TextAreaField label={copy.description} name="description" minLength={20} required />
            <Field label={copy.dueDate} name="dueAt" type="date" required />
            <Button disabled={sending} type="submit">
              {copy.create}
            </Button>
          </form>
        </Card>
      </div>
    </VerificationFrame>
  );
}

function VerificationFrame({
  title,
  description,
  messages,
  children,
}: {
  title: string;
  description: string;
  messages: Messages;
  children: ReactNode;
}) {
  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections.verification} · {messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </main>
  );
}

function VerificationLoading({ title, description }: { title: string; description: string }) {
  return (
    <main className="portal-content" id="main-content" aria-busy="true">
      <div className="portal-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="portal-metrics">
        {[1, 2, 3, 4].map((value) => (
          <Skeleton key={value} style={{ height: '7rem' }} />
        ))}
      </div>
      <Skeleton style={{ height: '22rem', marginTop: '1rem' }} />
    </main>
  );
}

function statusTone(status: string): 'neutral' | 'verified' | 'attention' | 'danger' | 'info' {
  if (['APPROVED', 'VERIFIED', 'COMPLETED', 'ACCEPTED', 'APPLIED'].includes(status))
    return 'verified';
  if (['REJECTED', 'EXPIRED', 'SUSPENDED', 'CANCELLED'].includes(status)) return 'danger';
  if (
    [
      'ADDITIONAL_INFORMATION_REQUIRED',
      'VERIFICATION_EXPIRING',
      'OPEN',
      'FINDINGS_ISSUED',
    ].includes(status)
  )
    return 'attention';
  return 'info';
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^\w/u, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

function verificationCopy(locale: Locale) {
  const vi = locale === 'vi';
  return vi
    ? {
        total: 'Tổng hồ sơ',
        highRisk: 'Rủi ro cao',
        unassigned: 'Chưa phân công',
        expiring: 'Sắp hết hạn',
        subject: 'Đối tượng',
        type: 'Loại',
        status: 'Trạng thái',
        risk: 'Rủi ro',
        expiry: 'Hết hạn',
        action: 'Thao tác',
        open: 'Mở hồ sơ',
        emptyTitle: 'Không có hồ sơ cần xử lý',
        emptyBody: 'Hàng đợi hiện không có mục phù hợp.',
        errorTitle: 'Không tải được dữ liệu xác minh',
        errorBody: 'Hãy thử lại. Nếu lỗi tiếp diễn, dùng mã yêu cầu để liên hệ quản trị.',
        retry: 'Thử lại',
        saved: 'Đã lưu quyết định và nhật ký kiểm toán.',
        approved: 'Đã duyệt',
        version: 'Phiên bản',
        requirements: 'Danh mục yêu cầu',
        evidence: 'Bằng chứng',
        controls: 'Kiểm soát hồ sơ',
        reviewerId: 'Mã người thẩm định',
        assign: 'Phân công',
        decision: 'Quyết định tiếp theo',
        notes: 'Ghi chú có lý do',
        applyDecision: 'Gửi quyết định',
        fourEyes: 'Nguyên tắc bốn mắt',
        fourEyesBody:
          'Xác minh, đình chỉ và khôi phục chỉ có hiệu lực sau phê duyệt độc lập thứ hai.',
        suspensionRule: 'Không một người nào có thể tự đình chỉ hoặc khôi phục huy hiệu xác minh.',
        approve: 'Duyệt',
        reject: 'Từ chối',
        approveEvidenceNote: 'Bằng chứng đã được đối chiếu với nguồn và còn hiệu lực.',
        rejectEvidenceNote: 'Bằng chứng chưa đáp ứng tiêu chí; cần bổ sung hoặc thay thế.',
        reviewHistory: 'Lịch sử thẩm định',
        internalNote: 'Ghi chú nội bộ được bảo vệ.',
        secondApprove: 'Phê duyệt độc lập',
        secondApprovalNote: 'Đã kiểm tra độc lập quyết định, bằng chứng và thời hạn hiệu lực.',
        siteAudits: 'Đánh giá tại cơ sở',
        awaitingFindings: 'Chưa có kết luận tại cơ sở.',
        findings: 'Kết luận đánh giá',
        completeAudit: 'Hoàn tất đánh giá',
        correctiveActions: 'Hành động khắc phục',
        createCorrective: 'Tạo hành động khắc phục',
        requirement: 'Yêu cầu liên quan',
        caseLevel: 'Toàn hồ sơ',
        title: 'Tiêu đề',
        description: 'Mô tả',
        dueDate: 'Hạn hoàn thành',
        create: 'Tạo',
        accept: 'Chấp nhận',
        correctiveAcceptedNote: 'Bằng chứng khắc phục đã được xem xét và chấp nhận.',
      }
    : {
        total: 'Total cases',
        highRisk: 'High risk',
        unassigned: 'Unassigned',
        expiring: 'Expiring',
        subject: 'Subject',
        type: 'Type',
        status: 'Status',
        risk: 'Risk',
        expiry: 'Expiry',
        action: 'Action',
        open: 'Open case',
        emptyTitle: 'No cases need attention',
        emptyBody: 'This queue has no matching verification work.',
        errorTitle: 'Verification data unavailable',
        errorBody:
          'Try again. If the problem continues, use the request ID when contacting an administrator.',
        retry: 'Try again',
        saved: 'Decision saved with audit history.',
        approved: 'Approved',
        version: 'Version',
        requirements: 'Requirement checklist',
        evidence: 'Evidence',
        controls: 'Case controls',
        reviewerId: 'Reviewer user ID',
        assign: 'Assign',
        decision: 'Next decision',
        notes: 'Reasoned notes',
        applyDecision: 'Submit decision',
        fourEyes: 'Four-eyes control',
        fourEyesBody:
          'Verification, suspension, and reinstatement take effect only after an independent second approval.',
        suspensionRule: 'No individual can unilaterally suspend or reinstate a verified badge.',
        approve: 'Approve',
        reject: 'Reject',
        approveEvidenceNote: 'Evidence was checked against its source and is currently valid.',
        rejectEvidenceNote:
          'Evidence does not meet the criterion and must be supplemented or replaced.',
        reviewHistory: 'Review history',
        internalNote: 'Protected internal reviewer note.',
        secondApprove: 'Independent approval',
        secondApprovalNote: 'Independently checked the decision, evidence, and validity period.',
        siteAudits: 'Site audits',
        awaitingFindings: 'Site findings are pending.',
        findings: 'Audit findings',
        completeAudit: 'Complete audit',
        correctiveActions: 'Corrective actions',
        createCorrective: 'Create corrective action',
        requirement: 'Related requirement',
        caseLevel: 'Case level',
        title: 'Title',
        description: 'Description',
        dueDate: 'Due date',
        create: 'Create',
        accept: 'Accept',
        correctiveAcceptedNote: 'Corrective evidence was reviewed and accepted.',
      };
}

function isSummaryList(
  value: VerificationEnvelope['data'],
): value is readonly VerificationCaseSummary[] {
  return Array.isArray(value);
}
