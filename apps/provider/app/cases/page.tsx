import Link from 'next/link';

import { CaseWorklist } from '@/components/case-worklist';
import { ProviderIcon } from '@/components/provider-icon';
import { getProviderCaseIndex } from '@/lib/provider-data';

export default async function Cases() {
  const data = await getProviderCaseIndex();
  return (
    <main className="provider-main">
      <header className="provider-page-header">
        <div>
          <span className="provider-eyebrow">Clinical worklist</span>
          <h1>Hồ sơ điều trị</h1>
          <p>Triage cơ hội mới, tiếp tục ca đang điều trị và theo dõi SLA theo từng hồ sơ.</p>
        </div>
        <Link className="provider-secondary-button" href="/messages">
          <ProviderIcon name="message" /> Hỏi điều phối
        </Link>
      </header>
      <CaseWorklist {...data} />
    </main>
  );
}
