import type { Metadata } from 'next';

import { StartRequest } from '@/components/start-request';
import { getCareProfile, getClinic } from '@/lib/care-data';

export const metadata: Metadata = { title: 'Bắt đầu yêu cầu' };

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string }>;
}) {
  const clinicSlug = (await searchParams).clinic;
  const [clinic, profile] = await Promise.all([
    clinicSlug ? getClinic(clinicSlug) : Promise.resolve(null),
    getCareProfile(),
  ]);
  return (
    <StartRequest
      initialLocation={profile.currentCity ?? ''}
      preferredClinic={clinic ? { id: clinic.id, name: clinic.name, slug: clinic.slug } : null}
    />
  );
}
