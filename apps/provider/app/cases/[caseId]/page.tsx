import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CaseWorkspace } from '@/components/case-workspace';
import { ProviderIcon } from '@/components/provider-icon';
import { getProviderCaseWorkspace } from '@/lib/provider-data';
import { labelStatus, toneForStatus } from '@/lib/presentation';
import { requireProviderSession } from '@/lib/require-session';

const tabs = new Set(['overview', 'plan', 'records', 'appointments', 'messages', 'aftercare']);

export default async function CaseDetail({
  params,
  searchParams,
}: {
  readonly params: Promise<{ caseId: string }>;
  readonly searchParams: Promise<{ tab?: string }>;
}) {
  const { caseId } = await params;
  if (!/^[0-9a-f-]{36}$/iu.test(caseId)) notFound();
  const query = await searchParams;
  const [data, session] = await Promise.all([
    getProviderCaseWorkspace(caseId).catch(() => null),
    requireProviderSession(),
  ]);
  if (!data) notFound();
  const initialTab = query.tab && tabs.has(query.tab) ? query.tab : 'overview';
  const tone = toneForStatus(data.opportunity?.status ?? data.dentalCase.status);

  return (
    <main className="provider-main provider-case-detail">
      <nav aria-label="Breadcrumb" className="provider-breadcrumb">
        <Link href="/cases">Hồ sơ điều trị</Link>
        <ProviderIcon name="chevron" />
        <span>{data.dentalCase.caseNumber}</span>
      </nav>
      <header className="provider-case-header">
        <div>
          <span className="provider-eyebrow">{data.dentalCase.caseNumber}</span>
          <h1>{data.dentalCase.title}</h1>
          <p>
            {data.dentalCase.desiredProcedureCode.replaceAll('_', ' ')} ·{' '}
            {data.dentalCase.preferredLocation ?? 'Chưa chọn địa điểm'}
          </p>
        </div>
        <span className={`provider-status provider-status--${tone}`}>
          {labelStatus(data.opportunity?.status ?? data.dentalCase.status)}
        </span>
      </header>
      <CaseWorkspace currentUserId={session.userId} data={data} initialTab={initialTab} />
    </main>
  );
}
