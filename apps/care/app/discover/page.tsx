import type { Metadata } from 'next';

import { Discovery } from '@/components/discovery';
import { getCareProfile, getDiscoveryData } from '@/lib/care-data';

export const metadata: Metadata = { title: 'Khám phá' };

export default async function DiscoverPage() {
  const [data, profile] = await Promise.all([getDiscoveryData(), getCareProfile()]);
  return (
    <Discovery
      clinics={data.clinics}
      initialSaved={data.saved}
      locationLabel={profile.currentCity ?? 'Tất cả khu vực'}
    />
  );
}
