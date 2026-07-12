'use client';

import { useEffect, useState } from 'react';
import { reportClientError } from '@/lib/client-errors';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [vietnamese, setVietnamese] = useState(false);
  const copy = vietnamese
    ? {
        title: 'Dịch vụ tạm thời gián đoạn',
        body: 'Thông tin của bạn vẫn an toàn. Hãy tải lại trang để thử lại.',
        retry: 'Tải lại trang',
      }
    : {
        title: 'The service is temporarily unavailable',
        body: 'Your information is safe. Reload the page to try again.',
        retry: 'Reload page',
      };

  useEffect(() => {
    setVietnamese(window.location.pathname.startsWith('/vi'));
    void reportClientError(error, window.location.pathname);
  }, [error]);

  return (
    <html lang={vietnamese ? 'vi' : 'en'}>
      <body>
        <main
          style={{
            fontFamily: 'system-ui, sans-serif',
            margin: '12vh auto',
            maxWidth: '42rem',
            padding: '2rem',
          }}
        >
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ cursor: 'pointer', font: 'inherit', padding: '.75rem 1rem' }}
            type="button"
          >
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
