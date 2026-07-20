import { ScheduleWorkspace } from '@/components/schedule-workspace';
import { ProviderIcon } from '@/components/provider-icon';
import { ProviderApiError } from '@/lib/provider-api';
import { getProviderSchedule } from '@/lib/provider-data';

export default async function Schedule() {
  let data;
  try {
    data = await getProviderSchedule();
  } catch (error) {
    if (!(error instanceof ProviderApiError)) throw error;
    return <ScheduleUnavailable forbidden={error.status === 403} />;
  }
  return (
    <main className="provider-main">
      <header className="provider-page-header">
        <div>
          <span className="provider-eyebrow">Lịch phòng khám</span>
          <h1>Lịch làm việc</h1>
          <p>Quản lý lịch hẹn, capacity, thời gian khóa và đồng bộ lịch theo cơ sở.</p>
        </div>
      </header>
      <ScheduleWorkspace data={data} />
    </main>
  );
}

function ScheduleUnavailable({ forbidden }: { readonly forbidden: boolean }) {
  return (
    <main className="provider-main">
      <header className="provider-page-header">
        <div>
          <span className="provider-eyebrow">Lịch phòng khám</span>
          <h1>Lịch làm việc</h1>
          <p>Quản lý lịch hẹn, capacity, thời gian khóa và đồng bộ lịch theo cơ sở.</p>
        </div>
      </header>
      <section
        className="provider-panel provider-route-error"
        role={forbidden ? 'status' : 'alert'}
      >
        <span>
          <ProviderIcon name={forbidden ? 'shield' : 'alert'} />
        </span>
        <div>
          <strong>
            {forbidden ? 'Bạn chưa được cấp quyền quản lý lịch' : 'Không thể tải lịch phòng khám'}
          </strong>
          <p>
            {forbidden
              ? 'Quản trị viên phòng khám cần cấp quyền SCHEDULING trước khi bạn có thể xem hoặc thay đổi lịch.'
              : 'Dịch vụ lịch đang tạm thời không khả dụng. Vui lòng thử lại sau.'}
          </p>
        </div>
      </section>
    </main>
  );
}
