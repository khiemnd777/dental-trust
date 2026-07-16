'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { careMutation } from '@/lib/client-mutation';

export function ThreadReadMarker({
  caseId,
  messageIds,
  threadId,
}: {
  readonly caseId: string;
  readonly messageIds: readonly string[];
  readonly threadId: string;
}) {
  const router = useRouter();
  const messageKey = messageIds.join(',');
  useEffect(() => {
    if (!messageIds.length) return;
    let active = true;
    void careMutation<Record<string, unknown>>('/api/care/messages', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseId, threadId, messageIds }),
    }).then((result) => {
      if (!active) return;
      if (result.ok) router.refresh();
      else console.error('Unable to mark Care thread as read', result.error.code);
    });
    return () => {
      active = false;
    };
  }, [caseId, messageIds, messageKey, router, threadId]);
  return null;
}
