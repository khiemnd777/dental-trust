import { ScheduleWorkspace } from '@/components/schedule-workspace';
import { getProviderSchedule } from '@/lib/provider-data';

export default async function Schedule() {
  const data = await getProviderSchedule();
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
