'use client';

import { useEffect } from 'react';

import { ServiceUnavailable } from '@/components/service-unavailable';

export default function CareError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('Care page request failed', error);
  }, [error]);

  return <ServiceUnavailable />;
}
