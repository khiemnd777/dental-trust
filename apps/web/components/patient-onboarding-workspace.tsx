'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import type {
  IntakeConsentTextView,
  IntakeQuestionnaireView,
  IntakeVersionView,
  PatientProfileView,
} from '@dental-trust/contracts';
import type { Locale, Messages } from '@dental-trust/i18n';
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

const supported = new Set(['patient:onboarding', 'patient:intake']);

export function isPatientOnboardingWorkspace(area: PortalArea, pageKey: string): boolean {
  return supported.has(`${area}:${pageKey}`);
}

export function PatientOnboardingWorkspace({
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
  const c = copy(locale);
  const [profile, setProfile] = useState<PatientProfileView | null>(null);
  const [questionnaire, setQuestionnaire] = useState<IntakeQuestionnaireView | null>(null);
  const [consents, setConsents] = useState<readonly IntakeConsentTextView[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const idempotencyKeys = useRef(new Map<string, string>());

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
        if (!response.ok) throw new Error('patient_onboarding_unavailable');
        const envelope = (await response.json()) as { data?: unknown };
        if (!envelope.data) throw new Error('invalid_patient_onboarding_data');
        if (pageKey === 'onboarding') setProfile(envelope.data as PatientProfileView);
        else setQuestionnaire(envelope.data as IntakeQuestionnaireView);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [area, pageKey, resourceId, revision]);

  useEffect(() => {
    if (pageKey !== 'intake') return;
    const controller = new AbortController();
    void fetch(`/api/portal/intake-consents?locale=${locale}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('intake_consents_unavailable');
        const envelope = (await response.json()) as { data?: IntakeConsentTextView[] };
        setConsents(envelope.data ?? []);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      });
    return () => controller.abort();
  }, [locale, pageKey]);

  const send = async <T,>(
    commandName: string,
    payload: Record<string, unknown>,
    entityId: string,
    quiet = false,
  ): Promise<T | null> => {
    const operation = `${commandName}:${entityId}:${JSON.stringify(payload)}`;
    const idempotencyKey = idempotencyKeys.current.get(operation) ?? crypto.randomUUID();
    idempotencyKeys.current.set(operation, idempotencyKey);
    setSending(true);
    setError(false);
    try {
      const response = await fetch('/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          area,
          pageKey,
          command: commandName,
          entityId,
          payload,
          idempotencyKey,
        }),
      });
      if (!response.ok) throw new Error('patient_onboarding_command_failed');
      const envelope = (await response.json()) as { data?: T };
      idempotencyKeys.current.delete(operation);
      if (!quiet) setNotice(c.saved);
      return envelope.data ?? null;
    } catch {
      setError(true);
      return null;
    } finally {
      setSending(false);
    }
  };

  let content: ReactNode;
  if (loading) content = <Loading />;
  else if (pageKey === 'onboarding' && profile)
    content = (
      <ProfileForms
        copy={c}
        locale={locale}
        profile={profile}
        sending={sending}
        update={async (commandName, payload) => {
          const updated = await send<PatientProfileView>(commandName, payload, 'profile');
          if (updated) setProfile(updated);
        }}
      />
    );
  else if (pageKey === 'intake' && questionnaire && resourceId)
    content = (
      <IntakeWizard
        caseId={resourceId}
        consents={consents}
        copy={c}
        initial={questionnaire}
        locale={locale}
        reload={() => setRevision((value) => value + 1)}
        send={send}
        sending={sending}
      />
    );
  else
    content = (
      <Alert tone="danger" title={c.error}>
        {c.retry}
      </Alert>
    );

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">{c.private}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="verified">
          <Icon name="lock" /> {c.encrypted}
        </Badge>
      </div>
      <Alert tone="info" title={c.privacyTitle}>
        {c.privacyBody}
      </Alert>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={c.error}>
          {c.retry}
        </Alert>
      ) : null}
      <div style={{ marginTop: '1rem' }}>{content}</div>
    </main>
  );
}

function ProfileForms({
  profile,
  copy: c,
  locale,
  sending,
  update,
}: {
  profile: PatientProfileView;
  copy: Copy;
  locale: Locale;
  sending: boolean;
  update: (commandName: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const pronouns = value(form, 'pronouns');
    void update('patient_profile', {
      expectedVersion: profile.version,
      preferredLocale: value(form, 'preferredLocale'),
      preferredCurrency: value(form, 'preferredCurrency'),
      currentCountry: value(form, 'currentCountry'),
      currentCity: value(form, 'currentCity'),
      timezone: value(form, 'timezone'),
      identity: {
        fullName: value(form, 'fullName'),
        dateOfBirth: value(form, 'dateOfBirth'),
        ...(pronouns ? { pronouns } : {}),
      },
      contact: { phoneE164: value(form, 'phoneE164') },
      preferences: {
        contactChannel: value(form, 'contactChannel'),
        travelCoordination: form.get('travelCoordination') === 'on',
        appointmentReminders: form.get('appointmentReminders') === 'on',
      },
    });
  };
  const saveEmergency = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    void update('patient_emergency', {
      ...(profile.emergencyContact ? { contactId: profile.emergencyContact.id } : {}),
      expectedVersion: profile.emergencyContact?.version ?? 0,
      name: value(form, 'emergencyName'),
      phoneE164: value(form, 'emergencyPhone'),
      relationship: value(form, 'relationship'),
    });
  };
  return (
    <div className="workspace-grid">
      <Card className="workspace-card">
        <div className="workspace-card__head">
          <div>
            <h2>{c.profile}</h2>
            <p>{c.profileHint}</p>
          </div>
          <Badge tone={profile.onboardingCompletedAt ? 'verified' : 'attention'}>
            {profile.onboardingCompletedAt ? c.complete : c.incomplete}
          </Badge>
        </div>
        <form className="auth-form" onSubmit={saveProfile} style={{ padding: '1.2rem' }}>
          <ResponsiveGrid>
            <Field
              defaultValue={profile.identity?.fullName ?? ''}
              label={c.fullName}
              name="fullName"
              required
            />
            <Field
              defaultValue={profile.identity?.dateOfBirth ?? ''}
              label={c.dateOfBirth}
              name="dateOfBirth"
              required
              type="date"
            />
            <Field
              defaultValue={profile.identity?.pronouns ?? ''}
              label={c.pronouns}
              name="pronouns"
            />
            <Field
              defaultValue={profile.contact?.phoneE164 ?? ''}
              label={c.phone}
              name="phoneE164"
              pattern="^\+[1-9][0-9]{7,14}$"
              placeholder="+61412345678"
              required
              type="tel"
            />
            <Field
              defaultValue={profile.currentCountry ?? ''}
              label={c.country}
              name="currentCountry"
              required
            />
            <Field
              defaultValue={profile.currentCity ?? ''}
              label={c.city}
              name="currentCity"
              required
            />
            <Field defaultValue={profile.timezone} label={c.timezone} name="timezone" required />
            <SelectField
              defaultValue={profile.preferredLocale}
              label={c.language}
              name="preferredLocale"
              required
            >
              <option value="vi-VN">Tiếng Việt</option>
              <option value="en-US">English</option>
            </SelectField>
            <SelectField
              defaultValue={profile.preferredCurrency}
              label={c.currency}
              name="preferredCurrency"
              required
            >
              <option value="VND">VND</option>
              <option value="USD">USD</option>
            </SelectField>
            <SelectField
              defaultValue={profile.preferences?.contactChannel ?? 'MESSAGE'}
              label={c.contactChannel}
              name="contactChannel"
              required
            >
              <option value="MESSAGE">{c.message}</option>
              <option value="EMAIL">Email</option>
              <option value="PHONE">{c.phone}</option>
            </SelectField>
          </ResponsiveGrid>
          <Checkbox
            defaultChecked={profile.preferences?.travelCoordination ?? true}
            label={c.travelCoordination}
            name="travelCoordination"
          />
          <Checkbox
            defaultChecked={profile.preferences?.appointmentReminders ?? true}
            label={c.reminders}
            name="appointmentReminders"
          />
          <Button disabled={sending} type="submit">
            <Icon name="check" /> {c.saveProfile}
          </Button>
        </form>
      </Card>
      <aside className="workspace-side">
        <Card className="side-card">
          <h2>{c.emergency}</h2>
          <p>{c.emergencyHint}</p>
          <form className="auth-form" onSubmit={saveEmergency}>
            <Field
              defaultValue={profile.emergencyContact?.name ?? ''}
              label={c.fullName}
              name="emergencyName"
              required
            />
            <Field
              defaultValue={profile.emergencyContact?.phoneE164 ?? ''}
              label={c.phone}
              name="emergencyPhone"
              pattern="^\+[1-9][0-9]{7,14}$"
              required
              type="tel"
            />
            <Field
              defaultValue={profile.emergencyContact?.relationship ?? ''}
              label={c.relationship}
              name="relationship"
              required
            />
            <Button disabled={sending} type="submit" variant="secondary">
              {c.saveEmergency}
            </Button>
          </form>
        </Card>
        <Card className="side-card">
          <h2>{c.account}</h2>
          <p>{profile.email}</p>
          <small>
            {locale === 'vi' ? 'Dữ liệu nhạy cảm được mã hóa.' : 'Sensitive data is encrypted.'}
          </small>
        </Card>
      </aside>
    </div>
  );
}

function IntakeWizard({
  caseId,
  consents,
  copy: c,
  initial,
  locale,
  reload,
  send,
  sending,
}: {
  caseId: string;
  consents: readonly IntakeConsentTextView[];
  copy: Copy;
  initial: IntakeQuestionnaireView;
  locale: Locale;
  reload: () => void;
  send: <T>(
    commandName: string,
    payload: Record<string, unknown>,
    entityId: string,
    quiet?: boolean,
  ) => Promise<T | null>;
  sending: boolean;
}) {
  const [draft, setDraft] = useState<IntakeVersionView | null>(
    initial.current?.status === 'DRAFT' ? initial.current : null,
  );
  const [step, setStep] = useState(draft?.currentStep ?? initial.progress.nextStep);
  const [selectedConsents, setSelectedConsents] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef(draft);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
  );

  const save = async (
    fields: Record<string, unknown>,
    targetStep: number,
    quiet = false,
  ): Promise<IntakeVersionView | null> => {
    const current = draftRef.current;
    const result = current
      ? await send<IntakeVersionView>(
          'intake_update',
          {
            versionId: current.id,
            expectedDraftRevision: current.draftRevision,
            currentStep: targetStep,
            ...fields,
          },
          caseId,
          quiet,
        )
      : await send<IntakeVersionView>(
          'intake_create',
          { currentStep: targetStep, ...fields },
          caseId,
          quiet,
        );
    if (result?.id) {
      setDraft(result);
      draftRef.current = result;
      return result;
    }
    return current;
  };

  const scheduleAutosave = () => {
    const form = formRef.current;
    if (!form || !form.checkValidity()) return;
    const fields = intakeFields(new FormData(form), step);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void save(fields, step, true), 800);
  };

  const move = async (direction: -1 | 1) => {
    const form = formRef.current;
    if (!form || (direction > 0 && !form.reportValidity())) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const nextStep = Math.min(6, Math.max(1, step + direction));
    await save(intakeFields(new FormData(form), step), nextStep);
    setStep(nextStep);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedConsents.length !== 2) return;
    const saved = await save({}, 6, true);
    if (!saved) return;
    const result = await send<IntakeVersionView>(
      'intake_submit',
      {
        versionId: saved.id,
        expectedDraftRevision: saved.draftRevision,
        consentGranted: true,
        consentTextVersionIds: selectedConsents,
      },
      caseId,
    );
    if (result) {
      setDraft(null);
      reload();
    }
  };

  const revise = async (version: IntakeVersionView) => {
    const result = await send<IntakeVersionView>(
      'intake_revise',
      { versionId: version.id, expectedQuestionnaireVersion: version.version },
      caseId,
    );
    if (result) {
      setDraft(result);
      setStep(1);
      reload();
    }
  };

  const reference = draft ?? initial.current;
  if (!draft && initial.current?.status === 'SUBMITTED') {
    return <ReviewHistory copy={c} history={initial.history} revise={revise} sending={sending} />;
  }
  return (
    <div className="workspace-grid">
      <Card className="workspace-card">
        <div className="workspace-card__head">
          <div>
            <h2>{c.step.replace('{current}', String(step)).replace('{total}', '6')}</h2>
            <p>{c.autosave}</p>
          </div>
          <Badge tone="info">{draft ? c.draft : c.notStarted}</Badge>
        </div>
        <div style={{ padding: '1rem 1.2rem 0' }}>
          <Progress label={c.progress} value={Math.round(((step - 1) / 6) * 100)} />
        </div>
        <form
          className="auth-form"
          onBlur={scheduleAutosave}
          onSubmit={step === 6 ? submit : (event) => event.preventDefault()}
          ref={formRef}
          style={{ padding: '1.2rem' }}
        >
          <StepFields
            consents={consents}
            copy={c}
            locale={locale}
            reference={reference}
            step={step}
          />
          {step === 6 ? (
            <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="dt-field__label">{c.explicitConsent}</legend>
              {consents.map((consent) => (
                <Checkbox
                  checked={selectedConsents.includes(consent.id)}
                  key={consent.id}
                  label={consentLabel(consent.purpose, c)}
                  onChange={(event) =>
                    setSelectedConsents((current) =>
                      event.target.checked
                        ? [...new Set([...current, consent.id])]
                        : current.filter((id) => id !== consent.id),
                    )
                  }
                />
              ))}
              <Alert tone="warning" title={c.disclaimerTitle}>
                {c.disclaimer}
              </Alert>
            </fieldset>
          ) : null}
          <div className="auth-form__row">
            <Button
              disabled={sending || step === 1}
              onClick={() => void move(-1)}
              type="button"
              variant="secondary"
            >
              {c.back}
            </Button>
            {step < 6 ? (
              <Button disabled={sending} onClick={() => void move(1)} type="button">
                {c.saveContinue} <Icon name="arrow" />
              </Button>
            ) : (
              <Button disabled={sending || selectedConsents.length !== 2} type="submit">
                <Icon name="check" /> {c.submit}
              </Button>
            )}
          </div>
        </form>
      </Card>
      <aside className="workspace-side">
        <Card className="side-card">
          <h2>{c.beforeSubmit}</h2>
          <p>{c.beforeSubmitBody}</p>
          <small>{c.updateLater}</small>
        </Card>
        <Card className="side-card">
          <h2>{c.history}</h2>
          {initial.history.length ? (
            initial.history.map((version) => (
              <p key={version.id}>
                <strong>v{version.version}</strong> · {version.status} ·{' '}
                {new Intl.DateTimeFormat(locale).format(new Date(version.updatedAt))}
              </p>
            ))
          ) : (
            <p>{c.noHistory}</p>
          )}
        </Card>
      </aside>
    </div>
  );
}

function StepFields({
  step,
  reference,
  consents,
  copy: c,
}: {
  step: number;
  reference: IntakeVersionView | null;
  consents: readonly IntakeConsentTextView[];
  copy: Copy;
  locale: Locale;
}) {
  if (step === 1)
    return (
      <>
        <SelectField
          defaultValue={reference?.desiredProcedureCode ?? ''}
          label={c.procedure}
          name="desiredProcedureCode"
          required
        >
          <option disabled value="">
            {c.choose}
          </option>
          <option value="DENTAL_IMPLANT">{c.implant}</option>
          <option value="CROWN_BRIDGE">{c.crown}</option>
          <option value="ORTHODONTICS">{c.orthodontics}</option>
          <option value="COSMETIC_DENTISTRY">{c.cosmetic}</option>
          <option value="OTHER">{c.other}</option>
        </SelectField>
        <ResponsiveGrid>
          <Field
            defaultValue={reference?.dentalConcerns.join(', ') ?? ''}
            hint={c.commaHint}
            label={c.concerns}
            name="dentalConcerns"
            required
          />
          <Field
            defaultValue={reference?.treatmentGoals.join(', ') ?? ''}
            hint={c.commaHint}
            label={c.goals}
            name="treatmentGoals"
            required
          />
        </ResponsiveGrid>
        <TextAreaField
          defaultValue={reference?.existingDiagnosis ?? ''}
          hint={c.noDiagnosisHint}
          label={c.existingDiagnosis}
          name="existingDiagnosis"
        />
        <TextAreaField
          defaultValue={reference?.cosmeticExpectations ?? ''}
          label={c.expectations}
          name="cosmeticExpectations"
        />
      </>
    );
  if (step === 2)
    return (
      <ResponsiveGrid>
        <Field
          defaultValue={reference?.currentCountry ?? ''}
          label={c.country}
          name="currentCountry"
          required
        />
        <Field
          defaultValue={reference?.currentCity ?? ''}
          label={c.city}
          name="currentCity"
          required
        />
        <Field
          defaultValue={reference?.expectedArrivalDate ?? ''}
          label={c.arrival}
          name="expectedArrivalDate"
          required
          type="date"
        />
        <Field
          defaultValue={reference?.expectedDepartureDate ?? ''}
          label={c.departure}
          name="expectedDepartureDate"
          required
          type="date"
        />
        <Field
          defaultValue={reference?.preferredLocation ?? ''}
          label={c.preferredLocation}
          name="preferredLocation"
          required
        />
        <Field
          defaultValue={reference?.availableTreatmentDays ?? ''}
          label={c.treatmentDays}
          max={365}
          min={1}
          name="availableTreatmentDays"
          required
          type="number"
        />
      </ResponsiveGrid>
    );
  if (step === 3) {
    const time = reference?.preferredConsultationTimes[0];
    return (
      <>
        <ResponsiveGrid>
          <Field
            defaultValue={reference?.budget?.minimumMinor ?? ''}
            label={c.budgetMin}
            min={0}
            name="budgetMinimumMinor"
            required
            type="number"
          />
          <Field
            defaultValue={reference?.budget?.maximumMinor ?? ''}
            label={c.budgetMax}
            min={0}
            name="budgetMaximumMinor"
            required
            type="number"
          />
          <SelectField
            defaultValue={reference?.budget?.currency ?? 'USD'}
            label={c.currency}
            name="budgetCurrency"
            required
          >
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </SelectField>
          <Field
            defaultValue={reference?.preferredLanguage ?? 'en'}
            label={c.consultationLanguage}
            name="preferredLanguage"
            required
          />
          <SelectField
            defaultValue={time?.weekday ?? 1}
            label={c.weekday}
            name="consultationWeekday"
            required
          >
            {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
              <option key={weekday} value={weekday}>
                {c.weekdays[weekday]}
              </option>
            ))}
          </SelectField>
          <Field
            defaultValue={time?.start ?? '18:00'}
            label={c.start}
            name="consultationStart"
            required
            type="time"
          />
          <Field
            defaultValue={time?.end ?? '20:00'}
            label={c.end}
            name="consultationEnd"
            required
            type="time"
          />
          <Field
            defaultValue={time?.timezone ?? 'UTC'}
            label={c.timezone}
            name="consultationTimezone"
            required
          />
        </ResponsiveGrid>
      </>
    );
  }
  if (step === 4)
    return (
      <>
        <TextAreaField
          defaultValue={reference?.priorDentalWork ?? ''}
          hint={c.noneHint}
          label={c.priorWork}
          name="priorDentalWork"
          required
        />
        <ResponsiveGrid>
          <Field
            defaultValue={reference?.existingImplantSystems.join(', ') ?? ''}
            hint={c.commaHint}
            label={c.implantSystems}
            name="existingImplantSystems"
          />
          <Field
            defaultValue={reference?.medicalConditions.map(({ code }) => code).join(', ') ?? ''}
            hint={c.noneHint}
            label={c.conditions}
            name="medicalConditions"
          />
          <Field
            defaultValue={reference?.medications.map(({ name }) => name).join(', ') ?? ''}
            hint={c.noneHint}
            label={c.medications}
            name="medications"
          />
          <Field
            defaultValue={reference?.allergies.map(({ substance }) => substance).join(', ') ?? ''}
            hint={c.noneHint}
            label={c.allergies}
            name="allergies"
          />
        </ResponsiveGrid>
      </>
    );
  if (step === 5)
    return (
      <ResponsiveGrid>
        <SelectField
          defaultValue={reference?.smokingStatus ?? ''}
          label={c.smoking}
          name="smokingStatus"
          required
        >
          <option disabled value="">
            {c.choose}
          </option>
          <option value="NEVER">{c.never}</option>
          <option value="FORMER">{c.former}</option>
          <option value="CURRENT">{c.current}</option>
          <option value="PREFER_NOT_TO_SAY">{c.preferNot}</option>
        </SelectField>
        <SelectField
          defaultValue={reference?.pregnancyStatus ?? ''}
          label={c.pregnancy}
          name="pregnancyStatus"
          required
        >
          <option disabled value="">
            {c.choose}
          </option>
          <option value="NOT_APPLICABLE">{c.notApplicable}</option>
          <option value="NOT_PREGNANT">{c.notPregnant}</option>
          <option value="PREGNANT">{c.pregnant}</option>
          <option value="UNSURE">{c.unsure}</option>
          <option value="PREFER_NOT_TO_SAY">{c.preferNot}</option>
        </SelectField>
        <Field
          defaultValue={reference?.accessibilityNeeds.join(', ') ?? ''}
          hint={c.noneHint}
          label={c.accessibility}
          name="accessibilityNeeds"
        />
      </ResponsiveGrid>
    );
  return (
    <div>
      <h3>{c.reviewConsent}</h3>
      <p>{c.reviewConsentBody}</p>
      {consents.map((consent) => (
        <p key={consent.id}>
          <strong>{consentLabel(consent.purpose, c)}</strong> · v{consent.version}
        </p>
      ))}
    </div>
  );
}

function ReviewHistory({
  history,
  copy: c,
  revise,
  sending,
}: {
  history: readonly IntakeVersionView[];
  copy: Copy;
  revise: (version: IntakeVersionView) => Promise<void>;
  sending: boolean;
}) {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card">
        <div className="workspace-card__head">
          <div>
            <h2>{c.submitted}</h2>
            <p>{c.submittedBody}</p>
          </div>
          <Badge tone="verified">{c.complete}</Badge>
        </div>
        <div style={{ padding: '1.2rem' }}>
          {history.map((version) => (
            <Card key={version.id} style={{ marginBottom: '0.8rem', padding: '1rem' }}>
              <div className="auth-form__row">
                <strong>v{version.version}</strong>
                <Badge tone={version.status === 'SUBMITTED' ? 'verified' : 'info'}>
                  {version.status}
                </Badge>
              </div>
              <p>{version.desiredProcedureCode}</p>
              <p>{version.treatmentGoals.join(', ')}</p>
              {version.status === 'SUBMITTED' ? (
                <Button
                  disabled={sending}
                  onClick={() => void revise(version)}
                  size="sm"
                  variant="secondary"
                >
                  {c.updateIntake}
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      </Card>
      <aside className="workspace-side">
        <Card className="side-card">
          <h2>{c.versioning}</h2>
          <p>{c.versioningBody}</p>
        </Card>
      </aside>
    </div>
  );
}

function intakeFields(form: FormData, step: number): Record<string, unknown> {
  if (step === 1)
    return {
      desiredProcedureCode: value(form, 'desiredProcedureCode'),
      dentalConcerns: codes(form, 'dentalConcerns'),
      existingDiagnosis: value(form, 'existingDiagnosis'),
      treatmentGoals: codes(form, 'treatmentGoals'),
      cosmeticExpectations: value(form, 'cosmeticExpectations'),
    };
  if (step === 2)
    return {
      currentCountry: value(form, 'currentCountry'),
      currentCity: value(form, 'currentCity'),
      expectedArrivalDate: value(form, 'expectedArrivalDate'),
      expectedDepartureDate: value(form, 'expectedDepartureDate'),
      preferredLocation: value(form, 'preferredLocation'),
      availableTreatmentDays: Number(value(form, 'availableTreatmentDays')),
    };
  if (step === 3)
    return {
      budget: {
        minimumMinor: Number(value(form, 'budgetMinimumMinor')),
        maximumMinor: Number(value(form, 'budgetMaximumMinor')),
        currency: value(form, 'budgetCurrency'),
      },
      preferredLanguage: value(form, 'preferredLanguage'),
      preferredConsultationTimes: [
        {
          weekday: Number(value(form, 'consultationWeekday')),
          start: value(form, 'consultationStart'),
          end: value(form, 'consultationEnd'),
          timezone: value(form, 'consultationTimezone'),
        },
      ],
    };
  if (step === 4)
    return {
      priorDentalWork: value(form, 'priorDentalWork'),
      existingImplantSystems: list(form, 'existingImplantSystems'),
      medicalConditions: codes(form, 'medicalConditions').map((code) => ({ code })),
      medications: list(form, 'medications').map((name) => ({ name })),
      allergies: list(form, 'allergies').map((substance) => ({ substance })),
    };
  if (step === 5)
    return {
      smokingStatus: value(form, 'smokingStatus'),
      pregnancyStatus: value(form, 'pregnancyStatus'),
      accessibilityNeeds: codes(form, 'accessibilityNeeds'),
    };
  return {};
}

function ResponsiveGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '1rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))',
      }}
    >
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div className="workspace-grid">
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <Skeleton style={{ height: '2rem', marginBottom: '1rem' }} />
        <Skeleton style={{ height: '18rem' }} />
      </Card>
      <Skeleton style={{ height: '12rem' }} />
    </div>
  );
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

function list(form: FormData, name: string): string[] {
  return value(form, name)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function codes(form: FormData, name: string): string[] {
  return list(form, name).map((item) => item.toUpperCase().replace(/[^A-Z0-9_-]+/gu, '_'));
}

function consentLabel(purpose: IntakeConsentTextView['purpose'], c: Copy): string {
  return purpose === 'INTAKE_HEALTH_INFORMATION' ? c.healthConsent : c.medicalConsent;
}

function copy(locale: Locale) {
  return locale === 'vi'
    ? {
        private: 'Không gian bệnh nhân · Riêng tư',
        encrypted: 'Đã mã hóa',
        privacyTitle: 'Bạn kiểm soát dữ liệu của mình',
        privacyBody:
          'Thông tin nhạy cảm được mã hóa, chỉ dùng để điều phối chăm sóc trong phạm vi bạn cho phép và mọi lần truy cập đều được ghi nhận.',
        saved: 'Đã lưu an toàn',
        error: 'Không thể hoàn tất yêu cầu',
        retry: 'Kiểm tra các trường và thử lại. Nếu dữ liệu vừa thay đổi, hãy tải lại trang.',
        profile: 'Thông tin cá nhân và tùy chọn',
        profileHint: 'Thông tin này không thay thế hồ sơ lâm sàng của nha sĩ.',
        complete: 'Hoàn tất',
        incomplete: 'Cần bổ sung',
        fullName: 'Họ và tên',
        dateOfBirth: 'Ngày sinh',
        pronouns: 'Đại từ xưng hô (không bắt buộc)',
        phone: 'Số điện thoại quốc tế',
        country: 'Quốc gia hiện tại',
        city: 'Thành phố hiện tại',
        timezone: 'Múi giờ IANA',
        language: 'Ngôn ngữ',
        currency: 'Tiền tệ',
        contactChannel: 'Kênh liên lạc ưu tiên',
        message: 'Tin nhắn',
        travelCoordination: 'Cho phép hỗ trợ điều phối chuyến đi',
        reminders: 'Nhận nhắc lịch hẹn',
        saveProfile: 'Lưu hồ sơ',
        emergency: 'Người liên hệ khẩn cấp',
        emergencyHint: 'Chúng tôi chỉ sử dụng thông tin này khi cần hỗ trợ an toàn.',
        relationship: 'Mối quan hệ',
        saveEmergency: 'Lưu liên hệ',
        account: 'Tài khoản',
        step: 'Bước {current}/{total}',
        autosave: 'Bản nháp tự động lưu sau khi bạn rời khỏi một trường hợp lệ.',
        draft: 'Bản nháp',
        notStarted: 'Chưa bắt đầu',
        progress: 'Tiến độ khai báo',
        explicitConsent: 'Đồng ý rõ ràng',
        disclaimerTitle: 'Thông tin y tế quan trọng',
        disclaimer:
          'Biểu mẫu này giúp chuẩn bị tư vấn, không đưa ra chẩn đoán và không thay thế khám trực tiếp với nha sĩ có giấy phép.',
        back: 'Quay lại',
        saveContinue: 'Lưu và tiếp tục',
        submit: 'Đồng ý và gửi',
        beforeSubmit: 'Trước khi gửi',
        beforeSubmitBody: 'Kiểm tra ngày đi, thuốc, dị ứng và múi giờ tư vấn.',
        updateLater: 'Bạn có thể tạo phiên bản cập nhật sau; bản đã gửi không bị ghi đè.',
        history: 'Lịch sử phiên bản',
        noHistory: 'Chưa có phiên bản.',
        submitted: 'Thông tin đã gửi',
        submittedBody: 'Bản đã gửi được giữ nguyên để có dấu vết rõ ràng.',
        updateIntake: 'Tạo bản cập nhật',
        versioning: 'Lịch sử không thay đổi',
        versioningBody: 'Mỗi lần cập nhật tạo bản nháp mới và cần đồng ý lại trước khi gửi.',
        procedure: 'Thủ thuật quan tâm',
        choose: 'Chọn một mục',
        implant: 'Cấy ghép implant',
        crown: 'Mão và cầu răng',
        orthodontics: 'Chỉnh nha',
        cosmetic: 'Nha khoa thẩm mỹ',
        other: 'Khác',
        commaHint: 'Phân cách nhiều mục bằng dấu phẩy.',
        concerns: 'Điều bạn lo lắng',
        goals: 'Mục tiêu điều trị',
        noDiagnosisHint:
          'Chỉ nhập chẩn đoán đã được chuyên gia cung cấp; hệ thống không chẩn đoán.',
        existingDiagnosis: 'Chẩn đoán hiện có (nếu có)',
        expectations: 'Kỳ vọng thẩm mỹ',
        arrival: 'Ngày dự kiến đến',
        departure: 'Ngày dự kiến rời đi',
        preferredLocation: 'Khu vực ưu tiên tại Việt Nam',
        treatmentDays: 'Số ngày có thể điều trị',
        budgetMin: 'Ngân sách tối thiểu (đơn vị nhỏ nhất)',
        budgetMax: 'Ngân sách tối đa (đơn vị nhỏ nhất)',
        consultationLanguage: 'Ngôn ngữ tư vấn',
        weekday: 'Ngày tư vấn ưu tiên',
        weekdays: ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'],
        start: 'Bắt đầu',
        end: 'Kết thúc',
        noneHint: 'Nhập “Không có” nếu không áp dụng.',
        priorWork: 'Điều trị nha khoa trước đây',
        implantSystems: 'Hệ implant hiện có',
        conditions: 'Tình trạng sức khỏe',
        medications: 'Thuốc đang dùng',
        allergies: 'Dị ứng',
        smoking: 'Tình trạng hút thuốc',
        never: 'Chưa từng',
        former: 'Đã từng',
        current: 'Hiện tại',
        preferNot: 'Không muốn trả lời',
        pregnancy: 'Tình trạng thai kỳ',
        notApplicable: 'Không áp dụng',
        notPregnant: 'Không mang thai',
        pregnant: 'Đang mang thai',
        unsure: 'Không chắc',
        accessibility: 'Nhu cầu hỗ trợ tiếp cận',
        reviewConsent: 'Kiểm tra và đồng ý',
        reviewConsentBody: 'Hai xác nhận dưới đây đều bắt buộc cho phiên bản hiện tại.',
        healthConsent: 'Tôi đồng ý chia sẻ thông tin sức khỏe để chuẩn bị tư vấn.',
        medicalConsent: 'Tôi hiểu đây không phải chẩn đoán hay tư vấn y tế khẩn cấp.',
      }
    : {
        private: 'Patient workspace · Private',
        encrypted: 'Encrypted',
        privacyTitle: 'You control your information',
        privacyBody:
          'Sensitive fields are encrypted, used only for care coordination within your permissions, and access is audited.',
        saved: 'Saved securely',
        error: 'We could not complete that request',
        retry: 'Check the fields and try again. If the record changed, refresh the page.',
        profile: 'Identity and preferences',
        profileHint: 'This information does not replace a dentist-authored clinical record.',
        complete: 'Complete',
        incomplete: 'Needs attention',
        fullName: 'Full name',
        dateOfBirth: 'Date of birth',
        pronouns: 'Pronouns (optional)',
        phone: 'International phone number',
        country: 'Current country',
        city: 'Current city',
        timezone: 'IANA timezone',
        language: 'Language',
        currency: 'Currency',
        contactChannel: 'Preferred contact channel',
        message: 'Message',
        travelCoordination: 'Allow travel-coordination support',
        reminders: 'Receive appointment reminders',
        saveProfile: 'Save profile',
        emergency: 'Emergency contact',
        emergencyHint: 'We use this only when needed to support your safety.',
        relationship: 'Relationship',
        saveEmergency: 'Save contact',
        account: 'Account',
        step: 'Step {current}/{total}',
        autosave: 'Your draft autosaves after you leave a valid field.',
        draft: 'Draft',
        notStarted: 'Not started',
        progress: 'Intake progress',
        explicitConsent: 'Explicit consent',
        disclaimerTitle: 'Important medical information',
        disclaimer:
          'This form prepares a consultation. It does not diagnose and does not replace an in-person assessment by a licensed dentist.',
        back: 'Back',
        saveContinue: 'Save and continue',
        submit: 'Consent and submit',
        beforeSubmit: 'Before submitting',
        beforeSubmitBody: 'Review travel dates, medicines, allergies, and consultation timezone.',
        updateLater: 'You can create a later revision; a submitted version is never overwritten.',
        history: 'Version history',
        noHistory: 'No versions yet.',
        submitted: 'Submitted intake',
        submittedBody: 'Submitted snapshots are retained unchanged for a clear history.',
        updateIntake: 'Create an update',
        versioning: 'Immutable history',
        versioningBody:
          'Every update creates a new draft and requires fresh consent before submission.',
        procedure: 'Procedure of interest',
        choose: 'Choose one',
        implant: 'Dental implant',
        crown: 'Crown and bridge',
        orthodontics: 'Orthodontics',
        cosmetic: 'Cosmetic dentistry',
        other: 'Other',
        commaHint: 'Separate multiple items with commas.',
        concerns: 'Dental concerns',
        goals: 'Treatment goals',
        noDiagnosisHint:
          'Only enter a diagnosis already provided by a professional; the platform does not diagnose.',
        existingDiagnosis: 'Existing diagnosis (if any)',
        expectations: 'Cosmetic expectations',
        arrival: 'Expected arrival',
        departure: 'Expected departure',
        preferredLocation: 'Preferred location in Vietnam',
        treatmentDays: 'Available treatment days',
        budgetMin: 'Minimum budget (minor units)',
        budgetMax: 'Maximum budget (minor units)',
        consultationLanguage: 'Consultation language',
        weekday: 'Preferred consultation day',
        weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        start: 'Starts',
        end: 'Ends',
        noneHint: 'Enter “None” when not applicable.',
        priorWork: 'Prior dental work',
        implantSystems: 'Existing implant systems',
        conditions: 'Medical conditions',
        medications: 'Current medications',
        allergies: 'Allergies',
        smoking: 'Smoking status',
        never: 'Never',
        former: 'Former',
        current: 'Current',
        preferNot: 'Prefer not to say',
        pregnancy: 'Pregnancy status',
        notApplicable: 'Not applicable',
        notPregnant: 'Not pregnant',
        pregnant: 'Pregnant',
        unsure: 'Unsure',
        accessibility: 'Accessibility needs',
        reviewConsent: 'Review and consent',
        reviewConsentBody: 'Both acknowledgements below are required for this version.',
        healthConsent: 'I consent to share health information to prepare my consultation.',
        medicalConsent: 'I understand this is not a diagnosis or emergency medical advice.',
      };
}

type Copy = ReturnType<typeof copy>;
