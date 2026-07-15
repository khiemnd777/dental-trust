import type { Metadata } from 'next';

import { CareAssistant } from '@/components/care-assistant';
import { getCareProfile } from '@/lib/care-data';

export const metadata: Metadata = { title: 'AI Hướng dẫn' };

export default async function AssistantPage() {
  const profile = await getCareProfile();
  const publicAppUrl = process.env.PUBLIC_APP_URL ?? 'http://localhost:3003';
  return (
    <CareAssistant
      initialLocale={profile?.preferredLocale ?? 'vi-VN'}
      loginHref={`${publicAppUrl}/vi/auth/login?product=care`}
    />
  );
}
