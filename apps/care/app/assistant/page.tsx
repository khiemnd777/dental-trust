import type { Metadata } from 'next';

import { CareAssistant } from '@/components/care-assistant';

export const metadata: Metadata = { title: 'AI Hướng dẫn' };

export default function AssistantPage() {
  return <CareAssistant />;
}
