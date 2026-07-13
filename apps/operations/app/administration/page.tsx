import {
  AdministrationWorkspace,
  type AdministrationView,
} from '@/components/administration-workspace';
import { getAdministrationData } from '@/lib/operations-data';
import { requireOperationsSession } from '@/lib/require-session';

const views: readonly AdministrationView[] = [
  'overview',
  'users',
  'organizations',
  'reliability',
  'audit',
  'security',
];

export default async function Administration({
  searchParams,
}: {
  readonly searchParams: Promise<{ view?: string }>;
}) {
  const [data, session, query] = await Promise.all([
    getAdministrationData(),
    requireOperationsSession(),
    searchParams,
  ]);
  const view = views.includes(query.view as AdministrationView)
    ? (query.view as AdministrationView)
    : 'overview';

  return (
    <AdministrationWorkspace
      data={data}
      initialView={view}
      mfaRequired={session.mfaRequired}
      mfaVerified={session.mfaVerified}
      roles={session.roles}
    />
  );
}
