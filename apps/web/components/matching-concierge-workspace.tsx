'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Icon,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';

import type { PortalArea } from '@/lib/routing';

interface MatchView {
  id: string;
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  organicRank: number;
  fitScore: number;
  reasons: string[];
  limitations: string[];
  evidenceIds: string[];
  algorithmVersion?: string;
}

interface ShortlistView extends MatchView {
  displayedRank: number;
  overrideReason: string | null;
  status: string;
  patientInterestedAt: string | null;
  introductionRequest?: { id: string; status: string } | null;
}

interface QueueView {
  id: string;
  caseId: string;
  priority: string;
  status: string;
  slaDueAt: string;
  version: number;
  missingDocumentCategories: string[];
  case: { caseNumber: string; title: string; status: string };
}

interface ConciergeDetail {
  id: string;
  caseId: string;
  priority: string;
  status: string;
  version: number;
  slaDueAt: string;
  patientSummary: string | null;
  missingDocumentCategories: string[];
  patient: { currentCountry?: string; currentCity?: string; timezone?: string };
  case: {
    caseNumber: string;
    title: string;
    status: string;
    desiredProcedureCode: string;
    preferredLocation: string | null;
    expectedArrivalDate: string | null;
    expectedDepartureDate: string | null;
  };
  documents: { category: string; createdAt: string }[];
  matchingCriteria: { id: string; version: number; procedureCode: string }[];
  matchingResults: MatchView[];
  shortlist: ShortlistView[];
  appointments: Record<string, unknown>[];
  aftercarePlans: Record<string, unknown>[];
  incidents: Record<string, unknown>[];
  internalNotes: { id: string; body: string; createdAt: string }[];
  travelNotes: { id: string; body: string; createdAt: string }[];
  communications: {
    id: string;
    channel: string;
    direction: string;
    summary: string;
    occurredAt: string;
  }[];
  tasks: {
    id: string;
    kind: string;
    title: string;
    details: string | null;
    status: string;
    dueAt: string;
    version: number;
  }[];
  handoffs: { id: string; reason: string; status: string; toUserId: string }[];
  supervisorReviews: { id: string; decision: string; note: string }[];
}

interface DashboardView {
  total: number;
  overdue: number;
  unassigned: number;
  urgent: number;
  workload: { userId: string; count: number }[];
}

interface ConsentView {
  id: string;
  version: string;
  contentHash: string;
}

type WorkspaceData = ShortlistView[] | QueueView[] | ConciergeDetail | DashboardView;

const supported = new Set([
  'patient:shortlist',
  'concierge:dashboard',
  'concierge:queue',
  'concierge:cases',
  'concierge:matching',
  'concierge:scheduling',
  'concierge:aftercare',
  'concierge:incidents',
  'concierge:tasks',
]);

export function isMatchingConciergeWorkspace(area: PortalArea, pageKey: string): boolean {
  return supported.has(`${area}:${pageKey}`);
}

export function MatchingConciergeWorkspace({
  area,
  pageKey,
  locale,
  title,
  description,
  resourceId,
}: {
  area: PortalArea;
  pageKey: string;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
  resourceId?: string | undefined;
  development: boolean;
}) {
  const copy = text(locale);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [consent, setConsent] = useState<ConsentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ area, pageKey });
    if (resourceId) query.set('resourceId', resourceId);
    setLoading(true);
    setError(false);
    void fetch(`/api/portal/data?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const envelope = (await response.json()) as { data?: WorkspaceData };
        if (envelope.data === undefined) throw new Error('invalid');
        setData(envelope.data);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [area, pageKey, resourceId, revision]);

  useEffect(() => {
    if (area !== 'patient' || pageKey !== 'shortlist') return;
    const controller = new AbortController();
    void fetch(`/api/portal/matching-consent?locale=${locale}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('consent_unavailable');
        const envelope = (await response.json()) as { data?: ConsentView };
        setConsent(envelope.data ?? null);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      });
    return () => controller.abort();
  }, [area, locale, pageKey]);

  const run = async (command: string, payload: Record<string, unknown>) => {
    if (!resourceId) {
      setError(true);
      return false;
    }
    const operation = `${command}:${JSON.stringify(payload)}`;
    const idempotencyKey = keys.current.get(operation) ?? crypto.randomUUID();
    keys.current.set(operation, idempotencyKey);
    setSending(true);
    setError(false);
    try {
      const response = await fetch('/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          area,
          pageKey,
          command,
          entityId: resourceId,
          payload,
          idempotencyKey,
        }),
      });
      if (!response.ok) throw new Error('command_failed');
      keys.current.delete(operation);
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

  let content: ReactNode;
  if (loading) content = <Loading />;
  else if (error && data === null)
    content = (
      <Alert tone="danger" title={copy.error}>
        {copy.retry}
      </Alert>
    );
  else if (area === 'patient')
    content = (
      <PatientShortlist
        consent={consent}
        copy={copy}
        entries={Array.isArray(data) ? (data as ShortlistView[]) : []}
        locale={locale}
        run={run}
        sending={sending}
      />
    );
  else if (pageKey === 'dashboard')
    content = <Dashboard copy={copy} data={data as DashboardView | null} locale={locale} />;
  else if (pageKey === 'queue')
    content = (
      <Queue
        copy={copy}
        entries={Array.isArray(data) ? (data as QueueView[]) : []}
        locale={locale}
      />
    );
  else
    content = (
      <CaseWorkspace
        copy={copy}
        detail={data as ConciergeDetail | null}
        pageKey={pageKey}
        run={run}
        sending={sending}
      />
    );

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">{copy.secure}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="verified">{copy.audited}</Badge>
      </div>
      <Alert tone="info" title={copy.nonAdvertising}>
        {copy.nonAdvertisingBody}
      </Alert>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error && data !== null ? (
        <Alert tone="danger" title={copy.error}>
          {copy.retry}
        </Alert>
      ) : null}
      <div style={{ marginTop: '1rem' }}>{content}</div>
    </main>
  );
}

function PatientShortlist({
  entries,
  consent,
  copy,
  locale,
  sending,
  run,
}: {
  entries: ShortlistView[];
  consent: ConsentView | null;
  copy: Copy;
  locale: Locale;
  sending: boolean;
  run: (command: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  if (entries.length === 0)
    return <EmptyState icon="clinic" title={copy.emptyShortlist} body={copy.emptyShortlistBody} />;
  return (
    <div className="workspace-grid">
      {entries.map((entry) => (
        <Card className="workspace-card" key={entry.id}>
          <div style={{ padding: '1.2rem' }}>
            <div className="workspace-card__head" style={{ padding: 0 }}>
              <div>
                <p className="eyebrow">#{entry.displayedRank}</p>
                <h2>{entry.clinicName}</h2>
              </div>
              <Badge tone="verified">
                {entry.fitScore}% {copy.fit}
              </Badge>
            </div>
            <p>
              <strong>{copy.why}:</strong>{' '}
              {entry.reasons.map((reason) => reasonLabel(reason, locale)).join(' · ')}
            </p>
            {entry.limitations.length ? (
              <Alert tone="warning" title={copy.limitations}>
                {entry.limitations.map((reason) => reasonLabel(reason, locale)).join(' · ')}
              </Alert>
            ) : null}
            {entry.overrideReason ? (
              <Alert tone="info" title={copy.orderChanged}>
                {entry.overrideReason}
              </Alert>
            ) : null}
            <p>
              <small>
                {copy.evidence}: {entry.evidenceIds.length}
              </small>
            </p>
            <div className="portal-heading__actions">
              <Button
                disabled={sending || ['INTRO_REQUESTED', 'INTRODUCED'].includes(entry.status)}
                onClick={() =>
                  void run('shortlist_interest', { entryId: entry.id, interested: true })
                }
              >
                <Icon name="check" /> {copy.interested}
              </Button>
              <Button
                disabled={sending || ['INTRO_REQUESTED', 'INTRODUCED'].includes(entry.status)}
                variant="secondary"
                onClick={() =>
                  void run('shortlist_interest', { entryId: entry.id, interested: false })
                }
              >
                {copy.notNow}
              </Button>
            </div>
            {entry.status === 'INTERESTED' ? (
              <form
                className="auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!event.currentTarget.reportValidity() || !consent) return;
                  const form = new FormData(event.currentTarget);
                  void run('request_introduction', {
                    entryId: entry.id,
                    consentTextVersionId: consent.id,
                    consentGranted: form.get('consentGranted') === 'on',
                    patientNote: String(form.get('patientNote') ?? ''),
                  });
                }}
              >
                <TextAreaField label={copy.noteForClinic} name="patientNote" />
                <Checkbox
                  label={`${copy.consent} (${copy.version} ${consent?.version ?? '—'})`}
                  name="consentGranted"
                  required
                />
                <p>
                  <small>
                    {copy.consentBody} · {copy.hash}: {consent?.contentHash.slice(0, 12) ?? '—'}…
                  </small>
                </p>
                <Button disabled={sending || !consent} type="submit">
                  {copy.requestIntro}
                </Button>
              </form>
            ) : null}
            {entry.introductionRequest ? (
              <Badge tone="info">{entry.introductionRequest.status}</Badge>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Dashboard({
  data,
  copy,
  locale,
}: {
  data: DashboardView | null;
  copy: Copy;
  locale: Locale;
}) {
  if (!data) return <EmptyState icon="activity" title={copy.empty} body={copy.retry} />;
  const metrics = [
    [copy.total, data.total],
    [copy.overdue, data.overdue],
    [copy.unassigned, data.unassigned],
    [copy.urgent, data.urgent],
  ] as const;
  return (
    <>
      <div className="portal-metrics">
        {metrics.map(([label, value]) => (
          <Card className="portal-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </Card>
        ))}
      </div>
      <Card className="workspace-card">
        <div style={{ padding: '1.2rem' }}>
          <h2>{copy.workload}</h2>
          {data.workload.length ? (
            data.workload.map((item) => (
              <p key={item.userId}>
                <code>{item.userId.slice(0, 8)}</code> · {item.count}
              </p>
            ))
          ) : (
            <p>{copy.empty}</p>
          )}
          <a href={`/${locale}/concierge/queue`}>{copy.openQueue} →</a>
        </div>
      </Card>
    </>
  );
}

function Queue({ entries, copy, locale }: { entries: QueueView[]; copy: Copy; locale: Locale }) {
  if (!entries.length)
    return <EmptyState icon="check" title={copy.queueClear} body={copy.queueClearBody} />;
  return (
    <div className="workspace-grid">
      {entries.map((entry) => (
        <Card className="workspace-card" key={entry.id}>
          <div style={{ padding: '1.2rem' }}>
            <div className="workspace-card__head" style={{ padding: 0 }}>
              <div>
                <p className="eyebrow">{entry.case.caseNumber}</p>
                <h2>{entry.case.title}</h2>
              </div>
              <Badge tone={entry.priority === 'URGENT' ? 'danger' : 'attention'}>
                {entry.priority}
              </Badge>
            </div>
            <p>
              {entry.status} · SLA {new Date(entry.slaDueAt).toLocaleString(locale)}
            </p>
            {entry.missingDocumentCategories.length ? (
              <p>
                {copy.missing}: {entry.missingDocumentCategories.join(', ')}
              </p>
            ) : null}
            <a href={`/${locale}/concierge/cases/${entry.caseId}`}>{copy.openCase} →</a>
          </div>
        </Card>
      ))}
    </div>
  );
}

function CaseWorkspace({
  detail,
  pageKey,
  copy,
  sending,
  run,
}: {
  detail: ConciergeDetail | null;
  pageKey: string;
  copy: Copy;
  sending: boolean;
  run: (command: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  if (!detail) return <EmptyState icon="document" title={copy.empty} body={copy.retry} />;
  if (pageKey === 'matching')
    return <MatchingEditor copy={copy} detail={detail} run={run} sending={sending} />;
  if (pageKey === 'scheduling')
    return <Scheduling copy={copy} detail={detail} run={run} sending={sending} />;
  if (pageKey === 'aftercare')
    return <RecordList copy={copy} records={detail.aftercarePlans} title={copy.aftercare} />;
  if (pageKey === 'incidents')
    return <RecordList copy={copy} records={detail.incidents} title={copy.incidents} />;
  if (pageKey === 'tasks') return <Tasks copy={copy} detail={detail} run={run} sending={sending} />;
  return <CaseOverview copy={copy} detail={detail} run={run} sending={sending} />;
}

function CaseOverview({ detail, copy, run, sending }: CaseChildProps) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card">
        <div style={{ padding: '1.2rem' }}>
          <p className="eyebrow">{detail.case.caseNumber}</p>
          <h2>{detail.case.title}</h2>
          <p>
            {detail.case.status} · {detail.priority} · SLA{' '}
            {new Date(detail.slaDueAt).toLocaleString()}
          </p>
          <p>
            {detail.patient.currentCity}, {detail.patient.currentCountry} ·{' '}
            {detail.patient.timezone}
          </p>
          <p>
            {copy.missing}: {detail.missingDocumentCategories.join(', ') || copy.none}
          </p>
        </div>
      </Card>
      <Card className="workspace-card">
        <form
          className="auth-form"
          style={{ padding: '1.2rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!event.currentTarget.reportValidity()) return;
            const form = new FormData(event.currentTarget);
            const priority = String(form.get('priority'));
            void run('concierge_workspace', {
              expectedVersion: detail.version,
              priority,
              ...(priority !== detail.priority
                ? { priorityChangeReason: form.get('priorityChangeReason') }
                : {}),
              status: form.get('status'),
              patientSummary: form.get('summary'),
              missingDocumentCategories: String(form.get('missing') ?? '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            });
          }}
        >
          <h2>{copy.summary}</h2>
          <SelectField label={copy.priority} name="priority" defaultValue={detail.priority}>
            <option>LOW</option>
            <option>NORMAL</option>
            <option>HIGH</option>
            <option>URGENT</option>
          </SelectField>
          <SelectField label={copy.priorityReason} name="priorityChangeReason">
            <option value="CLINICAL_RISK">CLINICAL_RISK</option>
            <option value="TRAVEL_DEADLINE">TRAVEL_DEADLINE</option>
            <option value="MISSING_DOCUMENT">MISSING_DOCUMENT</option>
            <option value="PATIENT_REQUEST">PATIENT_REQUEST</option>
            <option value="CLINIC_DEPENDENCY">CLINIC_DEPENDENCY</option>
            <option value="SUPERVISOR_DECISION">SUPERVISOR_DECISION</option>
          </SelectField>
          <SelectField label={copy.status} name="status" defaultValue={detail.status}>
            <option>ASSIGNED</option>
            <option>IN_PROGRESS</option>
            <option>WAITING_PATIENT</option>
            <option>WAITING_CLINIC</option>
            <option>SUPERVISOR_REVIEW</option>
            <option>RESOLVED</option>
          </SelectField>
          <TextAreaField
            label={copy.summary}
            name="summary"
            defaultValue={detail.patientSummary ?? ''}
            required
          />
          <Field
            label={copy.missing}
            name="missing"
            defaultValue={detail.missingDocumentCategories.join(', ')}
          />
          <Button disabled={sending} type="submit">
            {copy.save}
          </Button>
        </form>
      </Card>
      <AppendTextCard
        title={copy.internalNotes}
        label={copy.privateNote}
        command="concierge_note"
        field="body"
        records={detail.internalNotes}
        run={run}
        sending={sending}
      />
      <Card className="workspace-card">
        <form
          className="auth-form"
          style={{ padding: '1.2rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const supervisorUserId = String(form.get('supervisorUserId') ?? '').trim();
            void run('concierge_assign', {
              assignedAgentUserId: form.get('assignedAgentUserId'),
              ...(supervisorUserId ? { supervisorUserId } : {}),
              priority: form.get('assignmentPriority'),
              expectedVersion: detail.version,
            });
          }}
        >
          <h2>{copy.assignment}</h2>
          <Field label={copy.agentId} name="assignedAgentUserId" required />
          <Field label={copy.supervisorId} name="supervisorUserId" />
          <SelectField
            label={copy.priority}
            name="assignmentPriority"
            defaultValue={detail.priority}
          >
            <option>LOW</option>
            <option>NORMAL</option>
            <option>HIGH</option>
            <option>URGENT</option>
          </SelectField>
          <Button disabled={sending} type="submit">
            {copy.assign}
          </Button>
        </form>
      </Card>
      <Card className="workspace-card">
        <form
          className="auth-form"
          style={{ padding: '1.2rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run('concierge_handoff', {
              toAgentUserId: form.get('toAgentUserId'),
              reason: form.get('reason'),
              expectedVersion: detail.version,
            });
          }}
        >
          <h2>{copy.handoff}</h2>
          <Field label={copy.agentId} name="toAgentUserId" required />
          <TextAreaField label={copy.reason} name="reason" required />
          <Button disabled={sending} type="submit">
            {copy.handoff}
          </Button>
        </form>
        {detail.handoffs.map((handoff) => (
          <p key={handoff.id} style={{ padding: '0 1.2rem' }}>
            {handoff.status} · {handoff.toUserId.slice(0, 8)} · {handoff.reason}
          </p>
        ))}
      </Card>
      <Card className="workspace-card">
        <form
          className="auth-form"
          style={{ padding: '1.2rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run('concierge_supervisor_review', {
              decision: form.get('decision'),
              note: form.get('reviewNote'),
              expectedVersion: detail.version,
            });
          }}
        >
          <h2>{copy.supervisorReview}</h2>
          <SelectField label={copy.decision} name="decision">
            <option>APPROVED</option>
            <option>CHANGES_REQUESTED</option>
          </SelectField>
          <TextAreaField label={copy.reviewNote} name="reviewNote" required />
          <Button disabled={sending} type="submit">
            {copy.recordReview}
          </Button>
        </form>
        {detail.supervisorReviews.map((review) => (
          <p key={review.id} style={{ padding: '0 1.2rem' }}>
            <strong>{review.decision}</strong> · {review.note}
          </p>
        ))}
      </Card>
    </div>
  );
}

function MatchingEditor({ detail, copy, run, sending }: CaseChildProps) {
  const latest = detail.matchingCriteria[0];
  return (
    <div className="workspace-grid">
      <Card className="workspace-card">
        <form
          className="auth-form"
          style={{ padding: '1.2rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run('matching_create_criteria', {
              procedureCode: form.get('procedureCode'),
              preferredCity: form.get('preferredCity'),
              preferredLanguages: String(form.get('languages') ?? '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
              complexityCategory: form.get('complexityCategory'),
              requiresAftercare: form.get('requiresAftercare') === 'on',
              requiresWarranty: false,
              accessibilityNeeds: [],
              preferredEquipment: [],
              preferences: {},
            });
          }}
        >
          <h2>{copy.criteria}</h2>
          <Field
            label={copy.procedure}
            name="procedureCode"
            defaultValue={detail.case.desiredProcedureCode}
            required
          />
          <Field
            label={copy.city}
            name="preferredCity"
            defaultValue={detail.case.preferredLocation ?? ''}
          />
          <Field label={copy.languages} name="languages" defaultValue="en, vi" />
          <SelectField label={copy.complexity} name="complexityCategory">
            <option>UNKNOWN</option>
            <option>STANDARD</option>
            <option>COMPLEX</option>
          </SelectField>
          <Checkbox label={copy.aftercareRequired} name="requiresAftercare" />
          <Button disabled={sending} type="submit">
            {copy.saveCriteria}
          </Button>
          {latest ? (
            <Button
              disabled={sending}
              variant="secondary"
              onClick={() => void run('matching_calculate', { criteriaVersionId: latest.id })}
            >
              {copy.calculate}
            </Button>
          ) : null}
        </form>
      </Card>
      <Card className="workspace-card">
        <form
          className="auth-form"
          style={{ padding: '1.2rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const recommendations = detail.matchingResults.slice(0, 10).map((match) => ({
              matchingResultId: match.id,
              displayedRank: Number(form.get(`rank-${match.id}`)),
              ...(String(form.get(`reason-${match.id}`) ?? '').trim()
                ? { overrideReason: String(form.get(`reason-${match.id}`)) }
                : {}),
            }));
            void run('matching_recommendations', {
              expectedWorkspaceVersion: detail.version,
              shareWithPatient: form.get('share') === 'on',
              recommendations,
            });
          }}
        >
          <h2>{copy.recommendations}</h2>
          {detail.matchingResults.length ? (
            detail.matchingResults.map((match) => (
              <div key={match.id}>
                <p>
                  <strong>
                    #{match.organicRank} {match.clinicName}
                  </strong>{' '}
                  · {match.fitScore}%
                </p>
                <Field
                  label={`${copy.displayRank} — ${match.clinicName}`}
                  name={`rank-${match.id}`}
                  type="number"
                  defaultValue={String(match.organicRank)}
                  min={1}
                  max={25}
                  required
                />
                <Field
                  label={`${copy.overrideReason} — ${match.clinicName}`}
                  name={`reason-${match.id}`}
                />
                <p>
                  <small>{match.reasons.join(' · ')}</small>
                </p>
              </div>
            ))
          ) : (
            <p>{copy.noMatches}</p>
          )}
          <Checkbox label={copy.sharePatient} name="share" />
          <Button disabled={sending || !detail.matchingResults.length} type="submit">
            {copy.publish}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Scheduling({ detail, copy, run, sending }: CaseChildProps) {
  return (
    <div className="workspace-grid">
      <RecordList copy={copy} records={detail.appointments} title={copy.appointments} />
      <AppendTextCard
        title={copy.travel}
        label={copy.travelNote}
        command="concierge_travel_note"
        field="body"
        records={detail.travelNotes}
        run={run}
        sending={sending}
      />
      <Card className="workspace-card">
        <form
          className="auth-form"
          style={{ padding: '1.2rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run('concierge_communication', {
              channel: form.get('channel'),
              direction: form.get('direction'),
              occurredAt: new Date().toISOString(),
              summary: form.get('summary'),
            });
          }}
        >
          <h2>{copy.communication}</h2>
          <SelectField label={copy.channel} name="channel">
            <option>PHONE</option>
            <option>EMAIL</option>
            <option>MESSAGE</option>
            <option>VIDEO</option>
          </SelectField>
          <SelectField label={copy.direction} name="direction">
            <option>OUTBOUND</option>
            <option>INBOUND</option>
            <option>INTERNAL</option>
          </SelectField>
          <TextAreaField label={copy.summary} name="summary" required />
          <Button disabled={sending} type="submit">
            {copy.add}
          </Button>
        </form>
        {detail.communications.map((item) => (
          <p key={item.id}>
            <strong>{item.channel}</strong> · {item.summary}
          </p>
        ))}
      </Card>
    </div>
  );
}

function Tasks({ detail, copy, run, sending }: CaseChildProps) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card">
        <form
          className="auth-form"
          style={{ padding: '1.2rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run('concierge_task', {
              kind: form.get('kind'),
              title: form.get('title'),
              details: form.get('details'),
              dueAt: new Date(String(form.get('dueAt'))).toISOString(),
            });
          }}
        >
          <h2>{copy.newTask}</h2>
          <SelectField label={copy.kind} name="kind">
            <option>MISSING_DOCUMENT</option>
            <option>MATCHING</option>
            <option>APPOINTMENT</option>
            <option>TRAVEL</option>
            <option>AFTERCARE</option>
            <option>INCIDENT</option>
            <option>FOLLOW_UP</option>
            <option>OTHER</option>
          </SelectField>
          <Field label={copy.taskTitle} name="title" required />
          <TextAreaField label={copy.details} name="details" />
          <Field label={copy.due} name="dueAt" type="datetime-local" required />
          <Button disabled={sending} type="submit">
            {copy.add}
          </Button>
        </form>
      </Card>
      {detail.tasks.length ? (
        detail.tasks.map((task) => (
          <Card className="workspace-card" key={task.id}>
            <div style={{ padding: '1.2rem' }}>
              <Badge tone="info">{task.status}</Badge>
              <h2>{task.title}</h2>
              <p>{task.details}</p>
              <p>{new Date(task.dueAt).toLocaleString()}</p>
              {task.status !== 'DONE' ? (
                <Button
                  disabled={sending}
                  onClick={() =>
                    void run('concierge_task_transition', {
                      taskId: task.id,
                      status: 'DONE',
                      expectedVersion: task.version,
                    })
                  }
                >
                  {copy.complete}
                </Button>
              ) : null}
            </div>
          </Card>
        ))
      ) : (
        <EmptyState icon="check" title={copy.noTasks} body={copy.noTasksBody} />
      )}
    </div>
  );
}

function AppendTextCard({
  title,
  label,
  command,
  field,
  records,
  run,
  sending,
}: {
  title: string;
  label: string;
  command: string;
  field: string;
  records: { id: string; body: string }[];
  run: CaseChildProps['run'];
  sending: boolean;
}) {
  return (
    <Card className="workspace-card">
      <form
        className="auth-form"
        style={{ padding: '1.2rem' }}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run(command, { [field]: form.get(field) });
        }}
      >
        <h2>{title}</h2>
        <TextAreaField label={label} name={field} required />
        <Button disabled={sending} type="submit">
          {title}
        </Button>
      </form>
      {records.map((record) => (
        <p key={record.id} style={{ padding: '0 1.2rem' }}>
          {record.body}
        </p>
      ))}
    </Card>
  );
}

function RecordList({
  records,
  title,
  copy,
}: {
  records: Record<string, unknown>[];
  title: string;
  copy: Copy;
}) {
  return (
    <Card className="workspace-card">
      <div style={{ padding: '1.2rem' }}>
        <h2>{title}</h2>
        {records.length ? (
          records.map((record, index) => (
            <pre key={String(record.id ?? index)} style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(record, null, 2)}
            </pre>
          ))
        ) : (
          <p>{copy.none}</p>
        )}
      </div>
    </Card>
  );
}

function Loading() {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card">
        <div style={{ padding: '1.2rem' }}>
          <Skeleton style={{ height: '2rem' }} />
          <Skeleton style={{ height: '7rem' }} />
        </div>
      </Card>
      <Card className="workspace-card">
        <div style={{ padding: '1.2rem' }}>
          <Skeleton style={{ height: '2rem' }} />
          <Skeleton style={{ height: '7rem' }} />
        </div>
      </Card>
    </div>
  );
}

interface CaseChildProps {
  detail: ConciergeDetail;
  copy: Copy;
  sending: boolean;
  run: (command: string, payload: Record<string, unknown>) => Promise<boolean>;
}
type Copy = ReturnType<typeof text>;

function reasonLabel(code: string, locale: Locale): string {
  const labels: Record<string, readonly [string, string]> = {
    VERIFIED_PROCEDURE_CAPABILITY: [
      'Năng lực thủ thuật đã xác minh',
      'Verified procedure capability',
    ],
    PREFERRED_CITY: ['Đúng thành phố mong muốn', 'Preferred city'],
    PREFERRED_LANGUAGE: ['Có ngôn ngữ mong muốn', 'Preferred language'],
    AFTERCARE_SUPPORTED: ['Có hỗ trợ hậu mãi', 'Aftercare supported'],
    AVAILABILITY_DATA_UNAVAILABLE: ['Chưa có dữ liệu lịch trống', 'Availability data unavailable'],
    ESTIMATED_PRICE_OUTSIDE_BUDGET: [
      'Giá ước tính ngoài ngân sách',
      'Estimated price outside budget',
    ],
  };
  const pair = labels[code];
  return pair ? pair[locale === 'vi' ? 0 : 1] : code.replaceAll('_', ' ').toLowerCase();
}

function text(locale: Locale) {
  const vi = locale === 'vi';
  return {
    secure: vi ? 'Không gian điều phối bảo mật' : 'Secure coordination workspace',
    audited: vi ? 'Có nhật ký kiểm toán' : 'Audited',
    nonAdvertising: vi ? 'Xếp hạng không quảng cáo' : 'Non-advertising ranking',
    nonAdvertisingBody: vi
      ? 'Thứ tự dựa trên mức độ phù hợp, bằng chứng xác minh và nhu cầu ca. Khoản thanh toán thương mại không ảnh hưởng kết quả.'
      : 'Order is based on fit, verified evidence and case needs. Commercial payment does not influence results.',
    saved: vi ? 'Đã lưu thay đổi.' : 'Changes saved.',
    error: vi ? 'Không thể hoàn tất' : 'Unable to complete',
    retry: vi
      ? 'Vui lòng thử lại. Nếu dữ liệu đã thay đổi, hãy tải lại trước khi tiếp tục.'
      : 'Try again. If data changed, refresh before continuing.',
    empty: vi ? 'Chưa có dữ liệu' : 'No data yet',
    emptyShortlist: vi ? 'Chưa có phòng khám trong danh sách' : 'No clinics in your shortlist',
    emptyShortlistBody: vi
      ? 'Điều phối viên sẽ chia sẻ lựa chọn sau khi rà soát hồ sơ và tiêu chí.'
      : 'Your concierge will share options after reviewing your records and criteria.',
    fit: vi ? 'phù hợp' : 'fit',
    why: vi ? 'Lý do phù hợp' : 'Why it fits',
    limitations: vi ? 'Điểm cần lưu ý' : 'Limitations',
    orderChanged: vi ? 'Lý do điều chỉnh thứ tự' : 'Why the order changed',
    evidence: vi ? 'Bằng chứng tham chiếu' : 'Evidence references',
    interested: vi ? 'Tôi quan tâm' : 'I’m interested',
    notNow: vi ? 'Không phù hợp lúc này' : 'Not for me now',
    noteForClinic: vi ? 'Ghi chú muốn chia sẻ với phòng khám' : 'Note to share with the clinic',
    consent: vi
      ? 'Tôi đồng ý Dental Trust giới thiệu ca này cho phòng khám đã chọn'
      : 'I consent to Dental Trust introducing this case to the selected clinic',
    consentBody: vi
      ? 'Bạn có thể rút lại đồng ý; việc giới thiệu chỉ dùng cho phòng khám đã chọn.'
      : 'You may withdraw consent; this introduction is limited to the selected clinic.',
    version: vi ? 'phiên bản' : 'version',
    hash: vi ? 'mã nội dung' : 'content hash',
    requestIntro: vi ? 'Yêu cầu giới thiệu' : 'Request introduction',
    total: vi ? 'Tổng ca' : 'Total cases',
    overdue: vi ? 'Quá SLA' : 'Overdue',
    unassigned: vi ? 'Chưa phân công' : 'Unassigned',
    urgent: vi ? 'Khẩn cấp' : 'Urgent',
    workload: vi ? 'Khối lượng công việc' : 'Workload',
    openQueue: vi ? 'Mở hàng đợi' : 'Open queue',
    queueClear: vi ? 'Hàng đợi đã xử lý' : 'Queue is clear',
    queueClearBody: vi
      ? 'Không có ca nào trong bộ lọc hiện tại.'
      : 'No cases match the current filter.',
    missing: vi ? 'Tài liệu còn thiếu' : 'Missing documents',
    openCase: vi ? 'Mở ca' : 'Open case',
    none: vi ? 'Không có' : 'None',
    summary: vi ? 'Tóm tắt bệnh nhân' : 'Patient summary',
    priority: vi ? 'Mức ưu tiên' : 'Priority',
    priorityReason: vi ? 'Lý do đổi ưu tiên / SLA' : 'Priority / SLA change reason',
    status: vi ? 'Trạng thái' : 'Status',
    save: vi ? 'Lưu có kiểm soát phiên bản' : 'Save with version check',
    internalNotes: vi ? 'Ghi chú nội bộ' : 'Internal notes',
    privateNote: vi
      ? 'Ghi chú riêng — bệnh nhân không nhìn thấy'
      : 'Private note — never patient-visible',
    handoff: vi ? 'Bàn giao ca' : 'Case handoff',
    assignment: vi ? 'Phân công và giám sát' : 'Assignment and supervision',
    assign: vi ? 'Cập nhật phân công' : 'Update assignment',
    agentId: vi ? 'ID điều phối viên nhận' : 'Receiving agent ID',
    supervisorId: vi ? 'ID người giám sát (không bắt buộc)' : 'Supervisor ID (optional)',
    reason: vi ? 'Lý do' : 'Reason',
    supervisorReview: vi ? 'Rà soát của giám sát' : 'Supervisor review',
    decision: vi ? 'Quyết định' : 'Decision',
    reviewNote: vi ? 'Ghi chú rà soát' : 'Review note',
    recordReview: vi ? 'Ghi nhận rà soát' : 'Record review',
    criteria: vi ? 'Tiêu chí ghép nối' : 'Matching criteria',
    procedure: vi ? 'Mã thủ thuật' : 'Procedure code',
    city: vi ? 'Thành phố ưu tiên' : 'Preferred city',
    languages: vi ? 'Ngôn ngữ, phân cách bằng dấu phẩy' : 'Languages, comma-separated',
    complexity: vi ? 'Độ phức tạp' : 'Complexity',
    aftercareRequired: vi ? 'Cần hỗ trợ hậu mãi' : 'Aftercare required',
    saveCriteria: vi ? 'Lưu phiên bản tiêu chí mới' : 'Save new criteria version',
    calculate: vi ? 'Tính xếp hạng hữu cơ' : 'Calculate organic ranking',
    recommendations: vi ? 'Biên tập đề xuất' : 'Recommendation editor',
    displayRank: vi ? 'Thứ tự hiển thị' : 'Displayed rank',
    overrideReason: vi
      ? 'Lý do thay đổi (bắt buộc nếu khác thứ tự hữu cơ)'
      : 'Override reason (required if organic order changes)',
    noMatches: vi ? 'Hãy tính kết quả trước.' : 'Calculate matches first.',
    sharePatient: vi
      ? 'Chia sẻ danh sách này với bệnh nhân'
      : 'Share this shortlist with the patient',
    publish: vi ? 'Lưu đề xuất' : 'Save recommendations',
    appointments: vi ? 'Lịch hẹn' : 'Appointments',
    travel: vi ? 'Ghi chú hành trình' : 'Travel notes',
    travelNote: vi ? 'Thông tin hành trình' : 'Travel coordination note',
    communication: vi ? 'Dòng thời gian liên lạc' : 'Communication timeline',
    channel: vi ? 'Kênh' : 'Channel',
    direction: vi ? 'Hướng' : 'Direction',
    add: vi ? 'Thêm' : 'Add',
    aftercare: vi ? 'Theo dõi hậu mãi' : 'Aftercare monitoring',
    incidents: vi ? 'Sự cố và SLA' : 'Incidents and SLA',
    newTask: vi ? 'Nhiệm vụ mới' : 'New task',
    kind: vi ? 'Loại' : 'Kind',
    taskTitle: vi ? 'Tên nhiệm vụ' : 'Task title',
    details: vi ? 'Chi tiết' : 'Details',
    due: vi ? 'Hạn xử lý' : 'Due at',
    complete: vi ? 'Hoàn tất' : 'Complete',
    noTasks: vi ? 'Không có nhiệm vụ mở' : 'No open tasks',
    noTasksBody: vi ? 'Tạo nhiệm vụ khi cần theo dõi.' : 'Create a task when follow-up is needed.',
  };
}
