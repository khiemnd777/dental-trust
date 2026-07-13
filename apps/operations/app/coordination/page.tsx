import { CoordinationWorkspace } from '@/components/coordination-workspace';
import { getCoordinationData } from '@/lib/operations-data';
import { requireOperationsSession } from '@/lib/require-session';

export default async function Coordination({
  searchParams,
}: {
  readonly searchParams: Promise<{ selected?: string }>;
}) {
  const [data, session, query] = await Promise.all([
    getCoordinationData(),
    requireOperationsSession(),
    searchParams,
  ]);
  return (
    <CoordinationWorkspace
      currentUserId={session.userId}
      data={data}
      initialSelectedId={query.selected ?? null}
    />
  );
}
