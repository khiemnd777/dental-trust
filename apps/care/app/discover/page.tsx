import type { Metadata } from 'next';

import { Discovery } from '@/components/discovery';
import { getDiscoveryData } from '@/lib/care-data';

export const metadata: Metadata = { title: 'Khám phá' };

export default async function DiscoverPage() {
  const data = await getDiscoveryData();
  return <Discovery clinics={data.clinics} initialSaved={data.saved} />;
}
