'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AftercarePlanView,
  CaregiverGrantView,
  CaseDocumentView,
  CreateCaseRequest,
  TreatmentPlanAuthoringContext,
  TreatmentPlanVersionView,
} from '@dental-trust/contracts';
import { formatMoney, type Locale, type Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Icon,
  Progress,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';
import type { PortalArea } from '@/lib/routing';

interface WorkflowData {
  caseId?: string;
  caseNumber?: string;
  status?: string;
  progress?: number;
  files?: CaseDocumentView[];
  plans?: TreatmentPlanVersionView[];
  authoringContext?: TreatmentPlanAuthoringContext;
  aftercarePlans?: AftercarePlanView[];
  caregivers?: CaregiverGrantView[];
}

interface CommandEnvelope {
  data?: Partial<TreatmentPlanVersionView> & { id?: string };
  accepted?: boolean;
  commandId?: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CaseRecordUpload = dynamic(
  () => import('./case-record-upload').then((module) => module.CaseRecordUpload),
  {
    loading: () => (
      <div aria-busy="true" aria-live="polite" className="workspace-grid">
        <Skeleton style={{ height: '18rem' }} />
        <Skeleton style={{ height: '12rem' }} />
        <span className="dt-sr-only">Loading secure upload workspace…</span>
      </div>
    ),
  },
);

const specialized = new Set([
  'patient:newCase',
  'patient:case',
  'patient:records',
  'patient:plans',
  'patient:aftercare',
  'patient:caregivers',
  'clinic:planBuilder',
]);

export function isSpecializedWorkspace(area: PortalArea, pageKey: string) {
  return specialized.has(`${area}:${pageKey}`);
}

export function SpecializedWorkspace({
  area,
  pageKey,
  locale,
  title,
  description,
  messages,
  resourceId,
  development,
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
  const router = useRouter();
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(pageKey !== 'newCase');
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [sending, setSending] = useState(false);
  const [savedDraft, setSavedDraft] = useState<Pick<
    TreatmentPlanVersionView,
    'id' | 'version' | 'contentChecksum'
  > | null>(null);
  const [revokedCaregiverIds, setRevokedCaregiverIds] = useState<string[]>([]);
  const idempotencyKeys = useRef(new Map<string, string>());
  const w = messages.workflows;

  useEffect(() => {
    if (pageKey === 'newCase') return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const query = new URLSearchParams({ area, pageKey });
    if (resourceId) query.set('resourceId', resourceId);
    void fetch(`/api/portal/data?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('data_unavailable');
        const envelope = (await response.json()) as { data?: WorkflowData };
        if (!envelope.data) throw new Error('invalid_data');
        setData(envelope.data);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [area, pageKey, resourceId, revision]);

  const sendCommand = async (
    command: string,
    payload: object,
    successMessage: string,
    entityId = resourceId ?? 'new',
  ) => {
    const operationKey = `${command}:${entityId}:${JSON.stringify(payload)}`;
    const idempotencyKey = idempotencyKeys.current.get(operationKey) ?? crypto.randomUUID();
    idempotencyKeys.current.set(operationKey, idempotencyKey);
    setSending(true);
    setError(false);
    try {
      const response = await fetch('/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ area, pageKey, command, entityId, payload, idempotencyKey }),
      });
      if (!response.ok) throw new Error('command_failed');
      const envelope = (await response.json().catch(() => ({}))) as CommandEnvelope;
      idempotencyKeys.current.delete(operationKey);
      setNotice(successMessage);
      return envelope;
    } catch {
      setError(true);
      return null;
    } finally {
      setSending(false);
    }
  };

  const submitCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const request: CreateCaseRequest = {
      title: String(form.get('title')),
      desiredProcedureCode: String(form.get('procedure')),
      preferredLocation: String(form.get('location')),
      expectedArrivalDate: String(form.get('arrival')),
      expectedDepartureDate: String(form.get('departure')),
      preferredCurrency: String(form.get('currency')) as 'VND' | 'USD',
    };
    const envelope = await sendCommand('create_case', request, w.created);
    const caseId = envelope?.data?.id;
    if (!caseId || !uuidPattern.test(caseId)) {
      setNotice(null);
      setError(true);
      return;
    }
    router.push(`/${locale}/app/cases/${caseId}`);
    router.refresh();
  };

  const submitCheckIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const activePlan = data?.aftercarePlans?.find((plan) => plan.active && !plan.completedAt);
    if (!activePlan) {
      setError(true);
      return;
    }
    const symptomCodes = [
      ...(form.get('swelling') === 'yes' ? ['INCREASING_SWELLING'] : []),
      ...(form.get('fever') === 'yes' ? ['FEVER'] : []),
    ];
    void sendCommand(
      'aftercare_checkin',
      {
        aftercarePlanId: activePlan.id,
        painScale: Number(form.get('pain')),
        symptomCodes,
        patientNotes: String(form.get('notes')) || undefined,
        photoFileAssetIds: [],
      },
      messages.auth.success,
    ).then((envelope) => {
      if (envelope) setRevision((value) => value + 1);
    });
  };

  const submitCaregiver = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const permissions = form.getAll('permissions');
    if (permissions.length === 0) {
      setError(true);
      return;
    }
    void sendCommand(
      'invite_caregiver',
      { email: String(form.get('email')), permissions },
      w.invited,
    );
  };

  const submitPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const dentist =
      data?.authoringContext?.dentistOptions.find((option) => option.isCurrentUser) ??
      data?.authoringContext?.dentistOptions[0];
    if (!dentist) {
      setError(true);
      return;
    }
    const summary = String(form.get('summary'));
    const item = String(form.get('item'));
    const risks = String(form.get('risks'));
    const exclusions = String(form.get('exclusions'));
    const limitations = String(form.get('limitations'));
    const warrantyTerms = String(form.get('warranty'));
    const expiresAt = new Date();
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
    const envelope = await sendCommand(
      'save_treatment_plan',
      {
        authoringDentistId: dentist.id,
        preliminaryAssessment: summary,
        diagnosisStatement: summary,
        risks,
        limitations,
        warrantyTerms,
        exclusions,
        currency: 'VND',
        expiresAt: expiresAt.toISOString(),
        items: [
          {
            procedureCode: item,
            toothNumbers: [],
            quantity: 1,
            unitPriceMinor: Number(form.get('cost')),
          },
        ],
      },
      w.draftSaved,
    );
    if (
      envelope?.data?.id &&
      typeof envelope.data.version === 'number' &&
      typeof envelope.data.contentChecksum === 'string'
    ) {
      setSavedDraft({
        id: envelope.data.id,
        version: envelope.data.version,
        contentChecksum: envelope.data.contentChecksum,
      });
    }
  };

  const showDataState = pageKey !== 'newCase';

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
        {data?.caseNumber ? <Badge tone="info">{data.caseNumber}</Badge> : null}
      </div>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={w.unavailable}>
          <Button size="sm" variant="secondary" onClick={() => setRevision((value) => value + 1)}>
            {w.retry}
          </Button>
        </Alert>
      ) : null}
      {showDataState && loading ? (
        <Card style={{ padding: '1.2rem' }}>
          <Skeleton style={{ height: '2rem', width: '45%' }} />
          <Skeleton style={{ height: '12rem', marginTop: '1rem' }} />
          <span className="dt-sr-only">{w.loading}</span>
        </Card>
      ) : null}
      {!loading && pageKey === 'case' && data ? (
        <div className="workspace-grid">
          <Card className="workflow-card">
            <div className="workflow-summary">
              <div>
                <span>{w.caseNumber}</span>
                <strong>{data.caseNumber}</strong>
              </div>
              <div>
                <span>{w.stage}</span>
                <strong>{w.statusValues.coordinating}</strong>
              </div>
            </div>
            <Progress label={w.progress} value={data.progress ?? 0} />
            <div className="workflow-timeline">
              {messages.home.steps.map(([number, stepTitle, body], index) => (
                <div className="workflow-timeline__item" data-complete={index < 2} key={number}>
                  <span>{index < 2 ? <Icon name="check" /> : number}</span>
                  <div>
                    <strong>{stepTitle}</strong>
                    <p>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="side-card">
            <h2>{messages.portal.activity}</h2>
            <p>{description}</p>
            <Badge tone="verified">{w.statusValues.records}</Badge>
          </Card>
        </div>
      ) : null}
      {pageKey === 'newCase' ? (
        <Card className="workflow-card">
          <form className="workflow-form" onSubmit={submitCase}>
            <Field label={w.caseTitle} name="title" minLength={3} maxLength={160} required />
            <SelectField label={w.procedure} name="procedure" required>
              <option value="">—</option>
              {w.procedureOptions.map((option, index) => (
                <option
                  key={option}
                  value={['DENTAL_IMPLANT', 'DENTAL_CROWN', 'ORTHODONTICS', 'UNSURE'][index]}
                >
                  {option}
                </option>
              ))}
            </SelectField>
            <Field label={w.location} name="location" minLength={2} maxLength={120} required />
            <div className="workflow-form__two">
              <Field label={w.arrival} name="arrival" type="date" required />
              <Field label={w.departure} name="departure" type="date" required />
            </div>
            <SelectField label={messages.discovery.from} name="currency">
              <option value="USD">USD</option>
              <option value="VND">VND</option>
            </SelectField>
            <Button disabled={sending} size="lg" type="submit">
              <Icon name="arrow" />
              {sending ? messages.forms.submitting : w.createCase}
            </Button>
          </form>
        </Card>
      ) : null}
      {!loading && pageKey === 'records' && data && resourceId ? (
        <CaseRecordUpload files={data.files ?? []} messages={messages} resourceId={resourceId} />
      ) : null}
      {!loading && pageKey === 'plans' && data?.plans ? (
        <div className="plan-grid">
          {data.plans.map((plan, index) => (
            <Card className="plan-card" key={plan.id}>
              <div className="plan-card__head">
                <div>
                  <Badge tone={index === 0 ? 'verified' : 'info'}>v{plan.version}</Badge>
                  <h2>{plan.clinicName}</h2>
                </div>
                <strong>{formatMoney(locale, plan.totalMinor, plan.currency)}</strong>
              </div>
              <dl>
                <div>
                  <dt>{w.visits}</dt>
                  <dd>{plan.items.length}</dd>
                </div>
                <div>
                  <dt>{w.warranty}</dt>
                  <dd>{plan.warrantyTerms}</dd>
                </div>
                <div>
                  <dt>{w.inclusions}</dt>
                  <dd>{plan.authoringDentistName}</dd>
                </div>
                <div>
                  <dt>{w.exclusions}</dt>
                  <dd>{plan.exclusions}</dd>
                </div>
              </dl>
              <Button
                disabled={
                  sending ||
                  plan.status !== 'PUBLISHED' ||
                  Boolean(plan.acceptedAt) ||
                  !plan.acceptanceConsentTextVersionId
                }
                onClick={() =>
                  void sendCommand(
                    'accept_plan',
                    {
                      planId: plan.id,
                      consentTextVersionId: plan.acceptanceConsentTextVersionId,
                    },
                    w.selectedPlan,
                  )
                }
              >
                <Icon name="check" />
                {w.acceptPlan}
              </Button>
            </Card>
          ))}
        </div>
      ) : null}
      {!loading && pageKey === 'aftercare' && data ? (
        <div className="workspace-grid">
          <Card className="workflow-card">
            <Alert tone="warning" title={w.urgentNotice} />
            <form className="workflow-form" onSubmit={submitCheckIn}>
              <Field label={w.pain} name="pain" type="number" min={0} max={10} required />
              <SelectField label={w.swelling} name="swelling">
                <option value="no">{w.no}</option>
                <option value="yes">{w.yes}</option>
              </SelectField>
              <SelectField label={w.fever} name="fever">
                <option value="no">{w.no}</option>
                <option value="yes">{w.yes}</option>
              </SelectField>
              <TextAreaField label={w.notes} name="notes" maxLength={1000} />
              <Button disabled={sending} type="submit">
                <Icon name="heart" />
                {sending ? messages.forms.submitting : w.sendCheckIn}
              </Button>
            </form>
          </Card>
          <Card className="side-card">
            <h2>{w.checkIn}</h2>
            <p>
              {data.aftercarePlans?.[0]?.checkIns[0]?.submittedAt ??
                data.aftercarePlans?.[0]?.startsAt}
            </p>
            <Badge tone={data.aftercarePlans?.some((plan) => plan.active) ? 'verified' : 'info'}>
              {messages.portal.filterProgress}
            </Badge>
          </Card>
        </div>
      ) : null}
      {!loading && pageKey === 'caregivers' && data ? (
        <div className="workspace-grid">
          <Card className="workflow-card">
            <form className="workflow-form" onSubmit={submitCaregiver}>
              <Field label={w.caregiverEmail} name="email" type="email" required />
              <fieldset>
                <legend>{w.caregiverAccess}</legend>
                {w.accessOptions.map((option, index) => (
                  <Checkbox
                    key={option}
                    label={option}
                    name="permissions"
                    value={
                      [
                        'VIEW_CASE_SUMMARY',
                        'VIEW_DOCUMENTS',
                        'VIEW_TREATMENT_PLANS',
                        'PARTICIPATE_IN_MESSAGES',
                      ][index]
                    }
                  />
                ))}
              </fieldset>
              <Button disabled={sending} type="submit">
                <Icon name="team" />
                {sending ? messages.forms.submitting : w.inviteCaregiver}
              </Button>
            </form>
          </Card>
          <Card className="side-card">
            <h2>{w.caregiverAccess}</h2>
            {data.caregivers
              ?.filter((caregiver) => !revokedCaregiverIds.includes(caregiver.id))
              .map((caregiver) => (
                <div className="document-row" key={caregiver.id}>
                  <Icon name="user" />
                  <div>
                    <strong>{caregiver.caregiverEmail}</strong>
                    <small>
                      {caregiver.revokedAt
                        ? 'REVOKED'
                        : caregiver.expiresAt && new Date(caregiver.expiresAt) <= new Date()
                          ? 'EXPIRED'
                          : 'ACTIVE'}
                    </small>
                  </div>
                  <Button
                    disabled={sending}
                    onClick={() =>
                      void sendCommand(
                        'revoke_caregiver',
                        { caregiverGrantId: caregiver.id },
                        w.revoked,
                      ).then((envelope) => {
                        if (envelope)
                          setRevokedCaregiverIds((current) => [...current, caregiver.id]);
                      })
                    }
                    size="sm"
                    variant="secondary"
                  >
                    {w.revokeCaregiver}
                  </Button>
                </div>
              ))}
          </Card>
        </div>
      ) : null}
      {!loading && area === 'clinic' && pageKey === 'planBuilder' && data ? (
        <Card className="workflow-card">
          <Alert title={`${w.caseNumber}: ${data.caseNumber ?? ''}`} />
          <form className="workflow-form" onSubmit={submitPlan}>
            <TextAreaField label={w.clinicalSummary} name="summary" minLength={20} required />
            <div className="workflow-form__two">
              <Field label={w.treatmentItem} name="item" minLength={3} required />
              <Field label={w.costVnd} name="cost" type="number" min={0} step={1000} required />
            </div>
            <TextAreaField label={w.risks} name="risks" minLength={20} required />
            <TextAreaField
              label={`${w.clinicalSummary} · ${w.inclusions}`}
              name="limitations"
              minLength={3}
              required
            />
            <TextAreaField label={w.warranty} name="warranty" minLength={3} required />
            <TextAreaField label={w.planExclusions} name="exclusions" minLength={3} required />
            <Button disabled={sending} type="submit">
              <Icon name="document" />
              {sending ? messages.forms.submitting : w.saveDraft}
            </Button>
            {savedDraft ? (
              <Button
                disabled={sending}
                onClick={() =>
                  void sendCommand(
                    'publish_treatment_plan',
                    {
                      versionId: savedDraft.id,
                      expectedVersion: savedDraft.version,
                      contentChecksum: savedDraft.contentChecksum,
                    },
                    locale === 'vi' ? 'Đã phát hành kế hoạch.' : 'Treatment plan published.',
                  ).then((envelope) => {
                    if (envelope) {
                      setSavedDraft(null);
                      setRevision((value) => value + 1);
                    }
                  })
                }
                type="button"
                variant="secondary"
              >
                <Icon name="check" />
                {locale === 'vi' ? 'Phát hành kế hoạch' : 'Publish plan'}
              </Button>
            ) : null}
          </form>
        </Card>
      ) : null}
    </main>
  );
}
