'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Icon } from '@dental-trust/ui';
import { reportClientError } from '@/lib/client-errors';

const copy = {
  vi: {
    title: 'Không thể tải trang này',
    body: 'Thông tin của bạn vẫn an toàn. Hãy thử lại yêu cầu hoặc quay về trang trước.',
    retry: 'Thử lại',
  },
  en: {
    title: 'We could not load this page',
    body: 'Your information is safe. Try the request again or return to the previous page.',
    retry: 'Try again',
  },
} as const;

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const text = copy[pathname.startsWith('/vi') ? 'vi' : 'en'];
  useEffect(() => {
    void reportClientError(error, pathname);
  }, [error, pathname]);
  return (
    <main className="section">
      <div className="container narrow">
        <div className="dt-empty">
          <span className="dt-empty__icon">
            <Icon name="alert" />
          </span>
          <h1>{text.title}</h1>
          <p>{text.body}</p>
          <Button onClick={reset}>{text.retry}</Button>
        </div>
      </div>
    </main>
  );
}
