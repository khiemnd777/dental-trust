'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Icon } from '@/components/icon';

export function MessageComposer({ caseId, threadId }: { caseId: string; threadId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function send() {
    if (!message.trim()) return;
    startTransition(async () => {
      const response = await fetch('/api/care/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId, threadId, messageBody: message }),
      });
      if (!response.ok) {
        setError('Chưa gửi được. Vui lòng thử lại.');
        return;
      }
      setMessage('');
      setError('');
      router.refresh();
    });
  }

  return (
    <footer className="message-composer">
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button
          aria-label="Đính kèm tài liệu (sắp hỗ trợ)"
          disabled
          title="Sắp hỗ trợ"
          type="button"
        >
          <Icon name="plus" />
        </button>
        <textarea
          aria-label="Nội dung tin nhắn"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Nhập tin nhắn…"
          rows={1}
          value={message}
        />
        <button
          aria-label="Gửi tin nhắn"
          disabled={isPending || !message.trim()}
          onClick={send}
          type="button"
        >
          <Icon name="send" />
        </button>
      </div>
    </footer>
  );
}
