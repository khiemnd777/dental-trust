import { ClinicWorkspace } from '@/components/clinic-workspace';
import { ProviderIcon } from '@/components/provider-icon';
import { resolveClinicWorkspaceTab } from '@/lib/clinic-tabs';
import { getProviderClinic } from '@/lib/provider-data';
import { requireProviderSession } from '@/lib/require-session';

export default async function Clinic({
  searchParams,
}: {
  readonly searchParams: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
  const initialTab = resolveClinicWorkspaceTab(query.tab);
  const [data, session] = await Promise.all([
    getProviderClinic().catch(() => null),
    requireProviderSession(),
  ]);

  return (
    <main className="provider-main provider-main--clinic">
      <header className="provider-page-header">
        <div>
          <span className="provider-eyebrow">Clinic operations</span>
          <h1>Vận hành phòng khám</h1>
          <p>Quản lý năng lực công bố, đội ngũ, lịch và mức sẵn sàng trên Dental Trust.</p>
        </div>
      </header>

      {data ? (
        <ClinicWorkspace
          currentUserId={session.userId}
          data={data}
          initialTab={initialTab}
          key={initialTab}
        />
      ) : (
        <section className="provider-inline-alert provider-inline-alert--error" role="alert">
          <ProviderIcon name="alert" />
          <span>
            <strong>Không tải được workspace phòng khám</strong>
            <small>Dữ liệu chưa bị thay đổi. Hãy tải lại trang hoặc thử lại sau.</small>
          </span>
        </section>
      )}
    </main>
  );
}
