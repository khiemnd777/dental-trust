import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  closeIncidentRequestSchema,
  createClinicReviewResponseRequestSchema,
  createIncidentRequestSchema,
  createVerifiedReviewRequestSchema,
  createWarrantyClaimRequestSchema,
  decideReviewAbuseReportRequestSchema,
  idempotencyKeySchema,
  incidentListQuerySchema,
  incidentPatientUpdateRequestSchema,
  moderateReviewRequestSchema,
  reopenIncidentRequestSchema,
  reportReviewAbuseRequestSchema,
  reviewAbuseReportListQuerySchema,
  reviewListQuerySchema,
  triageIncidentRequestSchema,
} from '@dental-trust/contracts';
import type { PortalArea } from '@/lib/routing';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const supportedAreas = new Set<PortalArea>(['patient', 'clinic', 'admin']);

type View = 'incidents' | 'reviews' | 'review-reports';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const area = parseArea(url.searchParams.get('area'));
  const view = parseView(url.searchParams.get('view'));
  if (!area || !view || !allowedView(area, view)) {
    return NextResponse.json({ error: 'invalid_view' }, { status: 400 });
  }
  if (
    ['cursor', 'caseId', 'clinicId'].some((key) => {
      const value = url.searchParams.get(key);
      return value !== null && !uuidPattern.test(value);
    })
  ) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const parsedQuery = parseListQuery(view, url.searchParams);
  if (!parsedQuery.success) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await authorizePortalRoute(session, area, routeKey(view)))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (session.source === 'development') {
    return NextResponse.json({ data: developmentData(view), page: { nextCursor: null } });
  }
  return proxyRequest(apiListPath(view, parsedQuery.data), session);
}

export async function POST(request: Request) {
  if (!allowedOrigin((await headers()).get('origin'))) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: CommandBody;
  try {
    body = (await request.json()) as CommandBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const area = parseArea(body.area);
  const idempotencyKey = idempotencyKeySchema.safeParse(body.idempotencyKey);
  if (!area || !idempotencyKey.success) {
    return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  }
  const command = parseCommand(area, body);
  if (!command) return NextResponse.json({ error: 'invalid_command' }, { status: 400 });
  if (!(await authorizePortalRoute(session, area, command.routeKey))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (session.source === 'development') {
    return NextResponse.json({ data: developmentMutation(command), adapter: 'development' });
  }
  return proxyRequest(command.path, session, {
    idempotencyKey: idempotencyKey.data,
    payload: command.payload,
  });
}

interface CommandBody {
  readonly area?: string;
  readonly command?: string;
  readonly entityId?: string;
  readonly caseId?: string;
  readonly input?: unknown;
  readonly idempotencyKey?: string;
}

interface ParsedCommand {
  readonly name: string;
  readonly routeKey: 'incidents' | 'reviews';
  readonly path: string;
  readonly payload: Record<string, unknown>;
  readonly entityId?: string;
}

function parseCommand(area: PortalArea, body: CommandBody): ParsedCommand | null {
  const entityId = body.entityId && uuidPattern.test(body.entityId) ? body.entityId : undefined;
  const caseId = body.caseId && uuidPattern.test(body.caseId) ? body.caseId : undefined;
  const definitions: Record<
    string,
    {
      readonly areas: readonly PortalArea[];
      readonly routeKey: 'incidents' | 'reviews';
      readonly schema: { safeParse(input: unknown): { success: boolean; data?: object } };
      readonly path: () => string | null;
    }
  > = {
    create_incident: {
      areas: ['patient'],
      routeKey: 'incidents',
      schema: createIncidentRequestSchema,
      path: () => 'trust/incidents',
    },
    create_warranty_claim: {
      areas: ['patient'],
      routeKey: 'incidents',
      schema: createWarrantyClaimRequestSchema,
      path: () => (caseId ? `trust/cases/${caseId}/warranty-claims` : null),
    },
    update_incident: {
      areas: ['patient', 'admin'],
      routeKey: 'incidents',
      schema: incidentPatientUpdateRequestSchema,
      path: () => (entityId ? `trust/incidents/${entityId}/updates` : null),
    },
    triage_incident: {
      areas: ['admin'],
      routeKey: 'incidents',
      schema: triageIncidentRequestSchema,
      path: () => (entityId ? `trust/incidents/${entityId}/triage` : null),
    },
    close_incident: {
      areas: ['admin'],
      routeKey: 'incidents',
      schema: closeIncidentRequestSchema,
      path: () => (entityId ? `trust/incidents/${entityId}/close` : null),
    },
    reopen_incident: {
      areas: ['patient', 'admin'],
      routeKey: 'incidents',
      schema: reopenIncidentRequestSchema,
      path: () => (entityId ? `trust/incidents/${entityId}/reopen` : null),
    },
    create_review: {
      areas: ['patient'],
      routeKey: 'incidents',
      schema: createVerifiedReviewRequestSchema,
      path: () => 'trust/reviews',
    },
    respond_review: {
      areas: ['clinic'],
      routeKey: 'reviews',
      schema: createClinicReviewResponseRequestSchema,
      path: () => (entityId ? `trust/reviews/${entityId}/responses` : null),
    },
    report_review: {
      areas: ['clinic', 'admin'],
      routeKey: 'reviews',
      schema: reportReviewAbuseRequestSchema,
      path: () => (entityId ? `trust/reviews/${entityId}/reports` : null),
    },
    moderate_review: {
      areas: ['admin'],
      routeKey: 'reviews',
      schema: moderateReviewRequestSchema,
      path: () => (entityId ? `trust/reviews/${entityId}/moderation` : null),
    },
    decide_review_report: {
      areas: ['admin'],
      routeKey: 'reviews',
      schema: decideReviewAbuseReportRequestSchema,
      path: () => (entityId ? `trust/review-reports/${entityId}/decision` : null),
    },
  };
  const definition = body.command ? definitions[body.command] : undefined;
  if (!definition || !definition.areas.includes(area)) return null;
  const parsed = definition.schema.safeParse(body.input);
  const path = definition.path();
  if (!parsed.success || !parsed.data || !path) return null;
  return {
    name: body.command ?? '',
    routeKey: definition.routeKey,
    path,
    payload: parsed.data as Record<string, unknown>,
    ...(entityId ? { entityId } : {}),
  };
}

function parseListQuery(view: View, parameters: URLSearchParams) {
  const values = Object.fromEntries(
    ['cursor', 'caseId', 'clinicId', 'status', 'moderationStatus']
      .map((key) => [key, parameters.get(key)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const input = { limit: parameters.get('limit') ?? '50', ...values };
  if (view === 'incidents') return incidentListQuerySchema.safeParse(input);
  if (view === 'reviews') return reviewListQuerySchema.safeParse(input);
  return reviewAbuseReportListQuerySchema.safeParse(input);
}

function apiListPath(view: View, query: Record<string, unknown>) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  const path =
    view === 'incidents'
      ? 'trust/incidents'
      : view === 'reviews'
        ? 'trust/reviews'
        : 'trust/review-reports';
  return `${path}?${parameters.toString()}`;
}

function developmentMutation(command: ParsedCommand) {
  if (command.name === 'decide_review_report') {
    return { ...developmentReports()[0], ...command.payload, id: command.entityId };
  }
  if (command.name.includes('review') && command.name !== 'create_warranty_claim') {
    return {
      ...developmentReviews()[0],
      ...command.payload,
      id: command.entityId ?? developmentReviews()[0]?.id,
      clinicResponse:
        command.name === 'respond_review'
          ? {
              id: '518f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
              content: command.payload.content,
              moderationStatus: 'PENDING',
              createdAt: new Date().toISOString(),
            }
          : developmentReviews()[0]?.clinicResponse,
    };
  }
  const current = developmentIncidents()[0];
  const status =
    command.name === 'close_incident'
      ? 'CLOSED'
      : command.name === 'reopen_incident'
        ? 'REOPENED'
        : (command.payload.toStatus ?? current?.status);
  return {
    ...current,
    ...command.payload,
    id: command.entityId ?? current?.id,
    status,
    version: Number(current?.version ?? 1) + (command.entityId ? 1 : 0),
  };
}

function developmentData(view: View) {
  if (view === 'incidents') return developmentIncidents();
  if (view === 'reviews') return developmentReviews();
  return developmentReports();
}

function developmentIncidents() {
  const createdAt = '2026-07-12T08:00:00.000Z';
  return [
    {
      id: '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      caseId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      clinicId: '418f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      type: 'TREATMENT_CONCERN',
      severity: 'HIGH',
      status: 'IN_PROGRESS',
      summary: 'Persistent discomfort after treatment',
      details: 'The patient reported discomfort and requested a licensed clinical review.',
      ownerAssigned: true,
      slaDueAt: '2026-07-12T12:00:00.000Z',
      version: 2,
      closedAt: null,
      createdAt,
      updatedAt: createdAt,
      updates: [
        {
          id: '318f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
          eventType: 'PATIENT_VISIBLE_UPDATE',
          message: 'A coordinator has assigned this report for review.',
          createdAt,
        },
      ],
      warrantyClaim: null,
    },
  ];
}

function developmentReviews() {
  return [
    {
      id: '518f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      caseId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      clinicId: '418f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      overallRating: 5,
      dimensionRatings: {
        clinicalOutcome: 5,
        communication: 5,
        facilities: 4,
        value: 4,
        aftercare: 5,
      },
      content: 'The care team communicated clearly and followed up after treatment.',
      treatmentDate: '2026-06-20',
      followUpDays: 22,
      verified: true,
      moderationStatus: 'PUBLISHED',
      createdAt: '2026-07-12T08:00:00.000Z',
      clinicResponse: null,
    },
  ];
}

function developmentReports() {
  const createdAt = '2026-07-12T08:00:00.000Z';
  return [
    {
      id: '618f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      reviewId: '518f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      reasonCode: 'PERSONAL_DATA',
      details: 'The response may contain personal contact information.',
      status: 'OPEN',
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function allowedView(area: PortalArea, view: View) {
  if (view === 'incidents') return area === 'patient' || area === 'clinic' || area === 'admin';
  if (view === 'reviews') return area === 'clinic' || area === 'admin';
  return area === 'admin';
}

function routeKey(view: View) {
  return view === 'incidents' ? 'incidents' : 'reviews';
}

function parseArea(value: string | null | undefined): PortalArea | null {
  return value && supportedAreas.has(value as PortalArea) ? (value as PortalArea) : null;
}

function parseView(value: string | null): View | null {
  return value === 'incidents' || value === 'reviews' || value === 'review-reports' ? value : null;
}

async function proxyRequest(
  path: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  mutation?: { readonly idempotencyKey: string; readonly payload: object },
) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  if (!api || !token) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const upstream = await fetch(`${api}/${path}`, {
      method: mutation ? 'POST' : 'GET',
      headers: {
        ...sessionApiHeaders(session, token),
        ...(mutation
          ? { 'content-type': 'application/json', 'x-idempotency-key': mutation.idempotencyKey }
          : {}),
      },
      ...(mutation ? { body: JSON.stringify(mutation.payload) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

function allowedOrigin(origin: string | null) {
  if (!origin) return false;
  try {
    return (
      new URL(origin).origin ===
      new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').origin
    );
  } catch {
    return false;
  }
}
