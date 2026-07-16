import type { Metadata } from 'next';

import { NotificationCenter } from '@/components/notification-center';
import { getNotifications } from '@/lib/care-data';
import { formatDateTime } from '@/lib/presentation';

export const metadata: Metadata = { title: 'Thông báo' };

export default async function NotificationsPage() {
  const notifications = await getNotifications();
  const formattedDateTimes = Object.fromEntries(
    notifications.map((notification) => [
      notification.id,
      formatDateTime(notification.scheduledAt),
    ]),
  );
  return (
    <NotificationCenter formattedDateTimes={formattedDateTimes} notifications={notifications} />
  );
}
