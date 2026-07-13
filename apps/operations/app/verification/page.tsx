import { VerificationWorkspace } from '@/components/verification-workspace';
import { getVerificationData } from '@/lib/operations-data';
import { requireOperationsSession } from '@/lib/require-session';

export default async function Verification({
  searchParams,
}: {
  readonly searchParams: Promise<{ selected?: string }>;
}) {
  const [data, session, query] = await Promise.all([
    getVerificationData(),
    requireOperationsSession(),
    searchParams,
  ]);
  return (
    <VerificationWorkspace
      currentUserId={session.userId}
      data={data}
      initialSelectedId={query.selected ?? null}
    />
  );
}
