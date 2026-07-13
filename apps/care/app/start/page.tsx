import type { Metadata } from 'next';

import { StartRequest } from '@/components/start-request';

export const metadata: Metadata = { title: 'Bắt đầu yêu cầu' };

export default function StartPage() {
  return <StartRequest />;
}
