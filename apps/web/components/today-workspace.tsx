'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { journeySummaryViewSchema, type JourneySummaryView } from '@dental-trust/contracts/journey';
import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Icon,
  Progress,
  Skeleton,
  type IconName,
} from '@dental-trust/ui';

import type { PortalArea } from '@/lib/routing';
import { trackProductEvent } from '@/lib/product-analytics';

type CareArea = Extract<PortalArea, 'patient' | 'clinic'>;

const copy = {
  vi: {
    next: 'Việc tiếp theo',
    open: 'Mở và thực hiện',
    progress: 'Tiến độ hành trình',
    due: 'Dự kiến',
    appointment: 'Lịch hẹn tiếp theo',
    owner: 'Đang phụ trách',
    noOwner: 'Chưa phân công',
    coordinator: 'Điều phối viên Dental Trust',
    coordinatorBody: 'Cần trợ giúp? Nhắn cho điều phối viên ngay trong hồ sơ của bạn.',
    allCases: 'Các hành trình của bạn',
    clinicQueue: 'Danh sách ưu tiên hôm nay',
    needsAction: 'Cần phòng khám xử lý',
    waitingPatient: 'Đang chờ bệnh nhân',
    upcoming: 'Sắp tới / đang theo dõi',
    caseHub: 'Trung tâm hồ sơ',
    caseHubBody: 'Mọi thông tin và hành động của ca điều trị ở một nơi.',
    journey: 'Hành trình',
    records: 'Hồ sơ & phim chụp',
    plans: 'Kế hoạch điều trị',
    schedule: 'Tư vấn & lịch hẹn',
    payment: 'Đặt lịch & thanh toán',
    messages: 'Tin nhắn',
    aftercare: 'Chăm sóc sau điều trị',
    passport: 'Hộ chiếu nha khoa',
    empty: 'Hiện chưa có hành trình điều trị nào.',
    urgent: 'Khẩn cấp',
    attention: 'Cần chú ý',
    routine: 'Đúng tiến độ',
    blocker: 'Đang chờ',
  },
  en: {
    next: 'Next action',
    open: 'Open and continue',
    progress: 'Journey progress',
    due: 'Expected',
    appointment: 'Next appointment',
    owner: 'Current owner',
    noOwner: 'Unassigned',
    coordinator: 'Dental Trust coordinator',
    coordinatorBody: 'Need help? Message your coordinator from your case.',
    allCases: 'Your care journeys',
    clinicQueue: "Today's priority queue",
    needsAction: 'Clinic action needed',
    waitingPatient: 'Waiting on patient',
    upcoming: 'Upcoming / monitoring',
    caseHub: 'Case hub',
    caseHubBody: 'Every detail and action for this care case in one place.',
    journey: 'Journey',
    records: 'Records & imaging',
    plans: 'Treatment plans',
    schedule: 'Consultations & schedule',
    payment: 'Booking & payment',
    messages: 'Messages',
    aftercare: 'Aftercare',
    passport: 'Dental passport',
    empty: 'There are no care journeys yet.',
    urgent: 'Urgent',
    attention: 'Needs attention',
    routine: 'On track',
    blocker: 'Waiting on',
  },
} as const;

const actionLabels: Record<string, { vi: string; en: string }> = {
  COMPLETE_INTAKE: { vi: 'Hoàn tất thông tin ban đầu', en: 'Complete your intake' },
  UPLOAD_RECORDS: { vi: 'Tải hồ sơ nha khoa lên', en: 'Upload dental records' },
  ADD_INFORMATION: { vi: 'Bổ sung thông tin', en: 'Add requested information' },
  REVIEW_CASE: { vi: 'Xem hồ sơ', en: 'Review case' },
  VIEW_MATCHES: { vi: 'Xem phòng khám phù hợp', en: 'View clinic matches' },
  COMPARE_CLINICS: { vi: 'So sánh phòng khám', en: 'Compare clinics' },
  REVIEW_INTAKE: { vi: 'Duyệt thông tin bệnh nhân', en: 'Review patient intake' },
  PREPARE_PLAN: { vi: 'Soạn kế hoạch điều trị', en: 'Prepare treatment plan' },
  REVIEW_PLANS: { vi: 'Xem kế hoạch điều trị', en: 'Review treatment plans' },
  VIEW_APPOINTMENT: { vi: 'Xem lịch tư vấn', en: 'View consultation' },
  VIEW_SCHEDULE: { vi: 'Xem lịch hẹn', en: 'View schedule' },
  CONFIRM_BOOKING: { vi: 'Xác nhận đặt lịch', en: 'Confirm booking' },
  REVIEW_BOOKING: { vi: 'Kiểm tra đặt lịch', en: 'Review booking' },
  VIEW_JOURNEY: { vi: 'Theo dõi điều trị', en: 'View treatment journey' },
  UPDATE_TREATMENT: { vi: 'Cập nhật điều trị', en: 'Update treatment progress' },
  COMPLETE_CHECK_IN: { vi: 'Hoàn tất check-in', en: 'Complete aftercare check-in' },
  REVIEW_AFTERCARE: { vi: 'Kiểm tra chăm sóc sau điều trị', en: 'Review aftercare' },
  VIEW_INCIDENT: { vi: 'Xem sự cố', en: 'View incident' },
  REVIEW_INCIDENT: { vi: 'Xử lý sự cố', en: 'Review incident' },
  VIEW_CASE: { vi: 'Xem hồ sơ', en: 'View case' },
};

const stageLabels: Record<string, { vi: string; en: string }> = {
  INTAKE: { vi: 'Thông tin ban đầu', en: 'Intake' },
  MATCHING: { vi: 'Ghép phòng khám', en: 'Clinic matching' },
  PLAN_REVIEW: { vi: 'Kế hoạch điều trị', en: 'Plan review' },
  CONSULTATION: { vi: 'Tư vấn', en: 'Consultation' },
  BOOKING: { vi: 'Đặt lịch', en: 'Booking' },
  TREATMENT: { vi: 'Điều trị', en: 'Treatment' },
  AFTERCARE: { vi: 'Chăm sóc sau điều trị', en: 'Aftercare' },
  WARRANTY: { vi: 'Bảo hành', en: 'Warranty' },
  CLOSED: { vi: 'Hoàn tất', en: 'Completed' },
};

function localizedLabel(labels: { vi: string; en: string } | undefined, locale: Locale) {
  return labels?.[locale] ?? labels?.en ?? '';
}

function caseBase(area: CareArea, locale: Locale, caseId: string) {
  return `/${locale}/${area === 'patient' ? 'app' : 'clinic'}/cases/${caseId}`;
}

function actionHref(summary: JourneySummaryView, area: CareArea, locale: Locale) {
  const base = caseBase(area, locale, summary.caseId);
  const patient: Record<string, string> = {
    COMPLETE_INTAKE: `${base}/intake`,
    UPLOAD_RECORDS: `${base}/records`,
    ADD_INFORMATION: `${base}/intake`,
    VIEW_MATCHES: `${base}/shortlist`,
    COMPARE_CLINICS: `${base}/shortlist`,
    REVIEW_PLANS: `${base}/plans`,
    VIEW_APPOINTMENT: `${base}/consultations`,
    CONFIRM_BOOKING: `/${locale}/app/bookings/checkout`,
    VIEW_JOURNEY: `${base}/journey`,
    COMPLETE_CHECK_IN: `${base}/aftercare`,
    VIEW_INCIDENT: `/${locale}/app/incidents`,
  };
  const clinic: Record<string, string> = {
    PREPARE_PLAN: `${base}/treatment-plans/new`,
    VIEW_SCHEDULE: `${base}/scheduling`,
    REVIEW_BOOKING: `${base}/scheduling`,
    UPDATE_TREATMENT: `${base}/treatment-progress`,
    REVIEW_AFTERCARE: `/${locale}/clinic/aftercare`,
    REVIEW_INCIDENT: `/${locale}/clinic/incidents`,
  };
  return (area === 'patient' ? patient : clinic)[summary.primaryAction.code] ?? base;
}

function urgencyBadge(summary: JourneySummaryView, locale: Locale) {
  const language = copy[locale];
  if (summary.urgency === 'URGENT') return <Badge tone="danger">{language.urgent}</Badge>;
  if (summary.urgency === 'ATTENTION') return <Badge tone="attention">{language.attention}</Badge>;
  return <Badge tone="verified">{language.routine}</Badge>;
}

function JourneyFocus({
  summary,
  area,
  locale,
  compact = false,
}: {
  summary: JourneySummaryView;
  area: CareArea;
  locale: Locale;
  compact?: boolean;
}) {
  const language = copy[locale];
  const action = localizedLabel(actionLabels[summary.primaryAction.code], locale);
  return (
    <Card className={`journey-focus${compact ? ' journey-focus--compact' : ''}`}>
      <div className="journey-focus__head">
        <div>
          <p className="eyebrow">{summary.caseNumber}</p>
          <h2>{summary.title}</h2>
        </div>
        {urgencyBadge(summary, locale)}
      </div>
      <div className="journey-focus__stage">
        <span>{localizedLabel(stageLabels[summary.stage], locale)}</span>
        <strong>{summary.progress}%</strong>
      </div>
      <Progress label={language.progress} value={summary.progress} />
      {!compact ? (
        <div className="journey-facts">
          <div>
            <Icon name="user" />
            <span>{language.owner}</span>
            <strong>{summary.owner?.displayName ?? language.noOwner}</strong>
          </div>
          <div>
            <Icon name="calendar" />
            <span>{summary.nextAppointment ? language.appointment : language.due}</span>
            <strong>
              {summary.nextAppointment
                ? new Date(summary.nextAppointment.startsAt).toLocaleString(locale)
                : summary.expectedAt
                  ? new Date(summary.expectedAt).toLocaleString(locale)
                  : '—'}
            </strong>
          </div>
        </div>
      ) : null}
      {summary.blockers.length ? (
        <p className="journey-blocker">
          <Icon name="alert" /> {language.blocker}: {summary.blockers[0]?.code.replaceAll('_', ' ')}
        </p>
      ) : null}
      <div className="journey-primary-action">
        <div>
          <span>{language.next}</span>
          <strong>{action}</strong>
        </div>
        <Link
          className="dt-button dt-button--primary button-link"
          href={actionHref(summary, area, locale)}
          onClick={() =>
            trackProductEvent('journey_action_opened', {
              area,
              stage: summary.stage,
              action: summary.primaryAction.code,
              urgency: summary.urgency,
            })
          }
        >
          {compact ? language.open : action}
          <Icon name="arrow" />
        </Link>
      </div>
    </Card>
  );
}

function useJourneyData(area: CareArea, pageKey: string, resourceId?: string) {
  const [data, setData] = useState<JourneySummaryView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ area, pageKey });
    if (resourceId) query.set('resourceId', resourceId);
    setState('loading');
    void fetch(`/api/portal/data?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('journey_unavailable');
        const envelope = (await response.json()) as { data?: unknown };
        const candidate = Array.isArray(envelope.data) ? envelope.data : [envelope.data];
        const parsed = journeySummaryViewSchema.array().safeParse(candidate);
        if (!parsed.success) throw new Error('invalid_journey');
        setData(parsed.data);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error');
      });
    return () => controller.abort();
  }, [area, pageKey, resourceId]);
  return { data, state };
}

function LoadingState() {
  return (
    <Card className="workspace-card journey-loading">
      <Skeleton style={{ height: '2.5rem' }} />
      <Skeleton style={{ height: '8rem' }} />
      <Skeleton style={{ height: '3.5rem' }} />
    </Card>
  );
}

function WorkspaceHeading({
  area,
  title,
  description,
  messages,
}: {
  area: CareArea;
  title: string;
  description: string;
  messages: Messages;
}) {
  return (
    <div className="portal-heading">
      <div>
        <p className="eyebrow">
          {messages.portal.sections[area]} · {messages.portal.secure}
        </p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function TodayWorkspace({
  area,
  locale,
  title,
  description,
  messages,
}: {
  area: CareArea;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
}) {
  const language = copy[locale];
  const { data, state } = useJourneyData(area, 'dashboard');
  const clinicGroups = useMemo(() => {
    if (area !== 'clinic') return null;
    return {
      action: data.filter(({ owner, urgency }) => owner?.type === 'CLINIC' || urgency === 'URGENT'),
      patient: data.filter(
        ({ owner, urgency }) => owner?.type === 'PATIENT' && urgency !== 'URGENT',
      ),
      upcoming: data.filter(
        ({ owner, urgency }) =>
          owner?.type !== 'CLINIC' && owner?.type !== 'PATIENT' && urgency !== 'URGENT',
      ),
    };
  }, [area, data]);
  useEffect(() => {
    if (state === 'ready') trackProductEvent('today_viewed', { area });
  }, [area, state]);

  return (
    <main className="portal-content journey-workspace" id="main-content">
      <WorkspaceHeading area={area} description={description} messages={messages} title={title} />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {state === 'ready' && data.length === 0 ? (
        <EmptyState body={language.empty} title={messages.common.emptyTitle} />
      ) : null}
      {state === 'ready' && area === 'patient' && data[0] ? (
        <div className="journey-today-grid">
          <section aria-labelledby="journey-primary-title">
            <h2 className="dt-sr-only" id="journey-primary-title">
              {language.next}
            </h2>
            <JourneyFocus area={area} locale={locale} summary={data[0]} />
          </section>
          <Card className="journey-support">
            <Icon name="message" />
            <div>
              <h2>{language.coordinator}</h2>
              <p>{language.coordinatorBody}</p>
            </div>
            <Link className="text-link" href={`/${locale}/app/cases/${data[0].caseId}/messages`}>
              {language.messages}
              <Icon name="arrow" />
            </Link>
          </Card>
          {data.length > 1 ? (
            <section className="journey-case-list">
              <h2>{language.allCases}</h2>
              {data.slice(1).map((summary) => (
                <JourneyFocus
                  area={area}
                  compact
                  key={summary.caseId}
                  locale={locale}
                  summary={summary}
                />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
      {state === 'ready' && area === 'clinic' && clinicGroups ? (
        <div className="clinic-today">
          <h2>{language.clinicQueue}</h2>
          {(
            [
              ['action', language.needsAction],
              ['patient', language.waitingPatient],
              ['upcoming', language.upcoming],
            ] as const
          ).map(([key, label]) => (
            <section className="clinic-queue-group" key={key}>
              <header>
                <h3>{label}</h3>
                <Badge tone={key === 'action' ? 'attention' : 'neutral'}>
                  {clinicGroups[key].length}
                </Badge>
              </header>
              {clinicGroups[key].map((summary) => (
                <JourneyFocus
                  area={area}
                  compact
                  key={summary.caseId}
                  locale={locale}
                  summary={summary}
                />
              ))}
              {clinicGroups[key].length === 0 ? (
                <p className="clinic-queue-empty">{messages.portal.noResults}</p>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </main>
  );
}

export function CaseHubWorkspace({
  area,
  locale,
  title,
  description,
  messages,
  resourceId,
}: {
  area: CareArea;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
  resourceId?: string | undefined;
}) {
  const language = copy[locale];
  const { data, state } = useJourneyData(
    area,
    area === 'patient' ? 'case' : 'caseDetail',
    resourceId,
  );
  const summary = data[0];
  const base = summary ? caseBase(area, locale, summary.caseId) : '';
  const sections: [string, string, IconName][] = summary
    ? area === 'patient'
      ? [
          [language.records, `${base}/records`, 'file'],
          [language.plans, `${base}/plans`, 'activity'],
          [language.schedule, `${base}/consultations`, 'calendar'],
          [language.payment, `/${locale}/app/payments`, 'wallet'],
          [language.messages, `${base}/messages`, 'message'],
          [language.journey, `${base}/journey`, 'activity'],
          [language.aftercare, `${base}/aftercare`, 'heart'],
          [language.passport, `${base}/passport`, 'passport'],
        ]
      : [
          [language.plans, `${base}/treatment-plans/new`, 'activity'],
          [language.schedule, `${base}/scheduling`, 'calendar'],
          [language.messages, `${base}/messages`, 'message'],
          [language.journey, `${base}/treatment-progress`, 'activity'],
          [language.aftercare, `/${locale}/clinic/aftercare`, 'heart'],
          [language.passport, `${base}/passport`, 'passport'],
        ]
    : [];
  useEffect(() => {
    if (state === 'ready' && summary)
      trackProductEvent('case_hub_viewed', { area, stage: summary.stage });
  }, [area, state, summary]);

  return (
    <main className="portal-content journey-workspace case-hub" id="main-content">
      <WorkspaceHeading area={area} description={description} messages={messages} title={title} />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' || !resourceId ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {state === 'ready' && summary ? (
        <>
          <JourneyFocus area={area} locale={locale} summary={summary} />
          <section aria-labelledby="case-hub-title" className="case-hub-sections">
            <div className="case-hub-sections__head">
              <h2 id="case-hub-title">{language.caseHub}</h2>
              <p>{language.caseHubBody}</p>
            </div>
            <div className="case-hub-links">
              {sections.map(([label, href, icon]) => (
                <Link href={href} key={href}>
                  <span>
                    <Icon name={icon} />
                    {label}
                  </span>
                  <Icon name="chevron" />
                </Link>
              ))}
            </div>
          </section>
          <div className="case-hub-sticky-action">
            <Link
              className="dt-button dt-button--primary button-link"
              href={actionHref(summary, area, locale)}
              onClick={() =>
                trackProductEvent('journey_action_opened', {
                  area,
                  stage: summary.stage,
                  action: summary.primaryAction.code,
                  urgency: summary.urgency,
                })
              }
            >
              {localizedLabel(actionLabels[summary.primaryAction.code], locale)}
              <Icon name="arrow" />
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
