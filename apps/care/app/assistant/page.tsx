import type { Metadata } from 'next';

import { CareAssistant } from '@/components/care-assistant';
import { getCareProfile } from '@/lib/care-data';

export const metadata: Metadata = { title: 'AI Hướng dẫn' };

export default async function AssistantPage() {
  const profile = await getCareProfile();
  return <CareAssistant initialLocale={profile?.preferredLocale ?? 'vi-VN'} />;
}
