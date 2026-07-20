import { CoordinationWorkspace } from '@/components/coordination-workspace';
import { getCoordinationData } from '@/lib/operations-data';
import { requireOperationsSession } from '@/lib/require-session';
import { redirect } from 'next/navigation';

export default async function Coordination({
  searchParams,
}: {
  readonly searchParams: Promise<{ selected?: string; cursor?: string }>;
}) {
  const [query, session] = await Promise.all([searchParams, requireOperationsSession()]);
  if (
    !session.roles.some((role) =>
      ['CONCIERGE_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(role),
    )
  )
    redirect('/');
  const cursor = validCursor(query.cursor) ? query.cursor : undefined;
  const data = await getCoordinationData(cursor);
  return (
    <CoordinationWorkspace
      cursorActive={Boolean(cursor)}
      currentUserId={session.userId}
      data={data}
      initialSelectedId={query.selected ?? null}
    />
  );
}

function validCursor(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value),
  );
}
