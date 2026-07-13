import type { Metadata } from 'next';

import { NotificationCenter } from '@/components/notification-center';
import { getNotifications } from '@/lib/care-data';

export const metadata: Metadata = { title: 'Thông báo' };

export default async function NotificationsPage() {
  return <NotificationCenter notifications={await getNotifications()} />;
}
