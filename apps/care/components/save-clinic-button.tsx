'use client';

import { useState, useTransition } from 'react';

import { Icon } from '@/components/icon';

export function SaveClinicButton({
  clinicId,
  initialSavedId,
}: {
  readonly clinicId: string;
  readonly initialSavedId: string | null;
}) {
  const [savedId, setSavedId] = useState(initialSavedId);
  const [feedback, setFeedback] = useState('');
  const [isPending, startTransition] = useTransition();
  const saved = Boolean(savedId);

  function toggle() {
    const previous = savedId;
    setSavedId(saved ? null : `optimistic-${clinicId}`);
    setFeedback(saved ? 'Đã bỏ lưu' : 'Đã lưu để xem sau');
    startTransition(async () => {
      const response = await fetch('/api/care/saved-clinics', {
        method: saved ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(saved ? { savedClinicId: savedId } : { clinicId }),
      });
      if (!response.ok) {
        setSavedId(previous);
        setFeedback('Chưa thể cập nhật. Vui lòng thử lại.');
        return;
      }
      if (!saved) {
        const payload = (await response.json()) as { data?: { id?: string } };
        setSavedId(payload.data?.id ?? `saved-${clinicId}`);
      }
    });
  }

  return (
    <>
      <button
        aria-label={saved ? 'Bỏ lưu phòng khám' : 'Lưu phòng khám'}
        aria-pressed={saved}
        disabled={isPending}
        onClick={toggle}
        type="button"
      >
        <Icon fill={saved ? 'currentColor' : 'none'} name="heart" />
      </button>
      <span aria-live="polite" className="sr-only">
        {feedback}
      </span>
    </>
  );
}
