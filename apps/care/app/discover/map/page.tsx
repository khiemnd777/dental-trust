import type { Metadata } from 'next';

import { ClinicMap } from '@/components/clinic-map';
import { getCareProfile, getDiscoveryData } from '@/lib/care-data';

export const metadata: Metadata = { title: 'Bản đồ nha khoa' };

export default async function ClinicMapPage() {
  const [data, profile] = await Promise.all([getDiscoveryData(), getCareProfile()]);
  return (
    <ClinicMap
      clinics={data.clinics}
      currentCity={profile.currentCity ?? 'TP. Hồ Chí Minh'}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ''}
    />
  );
}
