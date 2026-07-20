import {
  AdministrationWorkspace,
  type AdministrationView,
} from '@/components/administration-workspace';
import { getAdministrationData, type AdministrationData } from '@/lib/operations-data';
import { getRoleOperationsData } from '@/lib/operations-role-data';
import { requireOperationsSession } from '@/lib/require-session';

const views: readonly AdministrationView[] = [
  'overview',
  'users',
  'organizations',
  'directory',
  'finance',
  'governance',
  'trust',
  'reliability',
  'audit',
  'security',
];

export default async function Administration({
  searchParams,
}: {
  readonly searchParams: Promise<{ view?: string; section?: string; cursor?: string }>;
}) {
  const [session, query] = await Promise.all([requireOperationsSession(), searchParams]);
  const administrator = session.roles.some((role) =>
    ['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(role),
  );
  const pagination = {
    ...(validSection(query.section) ? { section: query.section } : {}),
    ...(validCursor(query.cursor) ? { cursor: query.cursor } : {}),
  };
  const [data, roleData] = await Promise.all([
    administrator ? getAdministrationData(pagination) : Promise.resolve(emptyAdministrationData()),
    getRoleOperationsData(session, pagination),
  ]);
  const requested = views.includes(query.view as AdministrationView)
    ? (query.view as AdministrationView)
    : defaultView(session.roles);
  const view = canAccessView(requested, session.roles) ? requested : defaultView(session.roles);

  return (
    <AdministrationWorkspace
      data={data}
      initialView={view}
      mfaRequired={!session.mfaVerified}
      mfaVerified={session.mfaVerified}
      pageSection={pagination.section ?? null}
      cursorActive={Boolean(pagination.cursor)}
      roles={session.roles}
      roleData={roleData}
    />
  );
}

function validSection(value: string | undefined): value is string {
  return Boolean(
    value &&
    [
      'users',
      'organizations',
      'outbox',
      'notifications',
      'webhooks',
      'audit',
      'clinics',
      'dentists',
      'cases',
      'payments',
      'content',
      'taxonomy',
      'templates',
      'feature-flags',
      'configuration',
      'locations',
      'incidents',
      'reports',
      'privacy',
      'elevations',
    ].includes(value),
  );
}

function validCursor(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value),
  );
}

function emptyAdministrationData(): AdministrationData {
  return {
    summary: null,
    users: [],
    organizations: [],
    outbox: [],
    notifications: [],
    webhooks: [],
    audit: [],
    pages: {
      users: null,
      organizations: null,
      outbox: null,
      notifications: null,
      webhooks: null,
      audit: null,
    },
    availability: 'unavailable',
    issues: [],
    available: false,
  };
}

function defaultView(roles: readonly string[]): AdministrationView {
  if (roles.some((role) => ['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(role))) return 'overview';
  if (roles.includes('FINANCE_ADMIN')) return 'finance';
  if (roles.includes('CONTENT_ADMIN')) return 'governance';
  if (roles.includes('SUPPORT_AGENT')) return 'trust';
  return 'security';
}

function canAccessView(view: AdministrationView, roles: readonly string[]): boolean {
  if (view === 'security') return true;
  const administrator = roles.some((role) => ['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(role));
  if (['overview', 'users', 'organizations', 'directory', 'reliability', 'audit'].includes(view))
    return administrator;
  if (view === 'finance') return administrator || roles.includes('FINANCE_ADMIN');
  if (view === 'governance') return administrator || roles.includes('CONTENT_ADMIN');
  return administrator || roles.includes('SUPPORT_AGENT') || roles.includes('CONTENT_ADMIN');
}
