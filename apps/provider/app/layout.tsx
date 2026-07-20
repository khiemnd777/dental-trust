import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@dental-trust/ui/styles.css';
import './styles.css';
import { logoutProviderAction } from '@/app/actions';
import { ProviderShell } from '@/components/provider-shell';
import { getClinicOnboarding } from '@/lib/provider-data';
import { requireProviderSession } from '@/lib/require-session';

export const metadata: Metadata = {
  title: { default: 'Dental Trust Provider', template: '%s · Dental Trust Provider' },
  description: 'Clinical and clinic workflow workspace.',
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b2639',
};
export default async function Layout({ children }: { children: ReactNode }) {
  const session = await requireProviderSession();
  const onboarding = await getClinicOnboarding().catch(() => null);
  const primaryRole = session.roles.includes('CLINIC_ADMIN')
    ? 'Quản trị phòng khám'
    : session.roles.includes('DENTIST')
      ? 'Nha sĩ'
      : 'Nhân viên phòng khám';
  const primaryLocation =
    onboarding?.locations.find((location) => location.active) ?? onboarding?.locations[0];
  const clinicDetail = primaryLocation
    ? [primaryLocation.district, primaryLocation.city].filter(Boolean).join(' · ')
    : onboarding?.verificationStatus
      ? `Xác minh: ${onboarding.verificationStatus.replaceAll('_', ' ').toLocaleLowerCase('vi-VN')}`
      : 'Chưa khai báo cơ sở';
  return (
    <html lang="vi">
      <body>
        <ProviderShell
          clinicName={onboarding?.clinicName ?? 'Provider workspace'}
          clinicDetail={clinicDetail}
          logout={logoutProviderAction}
          mfaRequired={session.mfaRequired && !session.mfaVerified}
          roleLabel={primaryRole}
          userInitials={primaryRole === 'Nha sĩ' ? 'BS' : 'DT'}
        >
          {children}
        </ProviderShell>
      </body>
    </html>
  );
}
