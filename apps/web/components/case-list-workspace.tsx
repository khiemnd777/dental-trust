'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DentalCaseView } from '@dental-trust/contracts/cases';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Alert, Badge, Card, EmptyState, Icon, Skeleton } from '@dental-trust/ui';
import type { PortalArea } from '@/lib/routing';

const connectedCaseLists = new Set([
  'patient:dashboard',
  'clinic:dashboard',
  'clinic:cases',
  'concierge:dashboard',
  'concierge:queue',
  'admin:dashboard',
  'admin:cases',
]);

export function isCaseListWorkspace(area: PortalArea, pageKey: string): boolean {
  return connectedCaseLists.has(`${area}:${pageKey}`);
}

export function CaseListWorkspace({
  area,
  pageKey,
  locale,
  title,
  description,
  messages,
}: {
  area: PortalArea;
  pageKey: string;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
}) {
  const [cases, setCases] = useState<readonly DentalCaseView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ area, pageKey });
    void fetch(`/api/portal/data?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('case_list_unavailable');
        const envelope = (await response.json()) as { data?: unknown };
        const parsed = parseDentalCaseList(envelope.data);
        if (!parsed) throw new Error('invalid_case_list');
        setCases(parsed);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error');
      });
    return () => controller.abort();
  }, [area, pageKey]);

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
      {state === 'error' ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {state === 'loading' ? (
        <Card className="workspace-card" style={{ padding: '1.2rem' }}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} style={{ marginBottom: index === 4 ? 0 : '.75rem' }} />
          ))}
        </Card>
      ) : null}
      {state === 'ready' && cases.length === 0 ? (
        <EmptyState title={messages.common.emptyTitle} body={messages.portal.noResults} />
      ) : null}
      {state === 'ready' && cases.length > 0 ? (
        <Card className="workspace-card">
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
                {cases.map((dentalCase) => {
                  const href = caseHref(area, locale, dentalCase.id);
                  return (
                    <tr key={dentalCase.id}>
                      <td className="data-table__id">{dentalCase.caseNumber}</td>
                      <td className="data-table__primary">{dentalCase.title}</td>
                      <td>
                        <Badge tone="info">{dentalCase.status.replaceAll('_', ' ')}</Badge>
                      </td>
                      <td>{new Date(dentalCase.updatedAt).toLocaleDateString(locale)}</td>
                      <td>
                        {href ? (
                          <Link className="text-link" href={href}>
                            {messages.portal.open}
                            <Icon name="arrow" />
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </main>
  );
}

function parseDentalCaseList(value: unknown): readonly DentalCaseView[] | null {
  if (!Array.isArray(value) || !value.every(isDentalCaseView)) return null;
  return value;
}

function isDentalCaseView(value: unknown): value is DentalCaseView {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.caseNumber === 'string' &&
    typeof candidate.patientUserId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.desiredProcedureCode === 'string' &&
    (candidate.preferredLocation === null || typeof candidate.preferredLocation === 'string') &&
    (candidate.expectedArrivalDate === null || typeof candidate.expectedArrivalDate === 'string') &&
    (candidate.expectedDepartureDate === null ||
      typeof candidate.expectedDepartureDate === 'string') &&
    (candidate.preferredCurrency === 'VND' || candidate.preferredCurrency === 'USD') &&
    typeof candidate.status === 'string' &&
    Number.isInteger(candidate.version) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function caseHref(area: PortalArea, locale: Locale, caseId: string): string | null {
  if (area === 'patient') return `/${locale}/app/cases/${caseId}`;
  if (area === 'clinic') return `/${locale}/clinic/cases/${caseId}`;
  if (area === 'concierge') return `/${locale}/concierge/cases/${caseId}`;
  return null;
}
