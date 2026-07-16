import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '@dental-trust/ui/styles.css';
import './styles.css';
import { CareShell } from '@/components/care-shell';
import { ServiceUnavailable } from '@/components/service-unavailable';
import { getNotifications } from '@/lib/care-data';
import { requireCareSession } from '@/lib/require-session';

export const metadata: Metadata = {
  title: { default: 'Dental Trust Care', template: '%s · Dental Trust Care' },
  description: 'Hành trình chăm sóc nha khoa dễ hiểu và đáng tin cậy.',
  applicationName: 'Dental Trust Care',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Dental Trust Care' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f8f6',
};

export default async function CareLayout({ children }: { children: ReactNode }) {
  const session = await requireCareSession();
  let hasUnreadNotifications: boolean | null = null;
  if (session) {
    try {
      hasUnreadNotifications = (await getNotifications()).some((item) => !item.readAt);
    } catch {
      hasUnreadNotifications = null;
    }
  }
  return (
    <html lang="vi">
      <body>
        {session ? (
          <CareShell hasUnreadNotifications={hasUnreadNotifications}>{children}</CareShell>
        ) : (
          <ServiceUnavailable />
        )}
      </body>
    </html>
  );
}
