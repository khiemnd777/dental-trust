'use client';

import { useEffect } from 'react';

export default function OperationsError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error('Operations route failed', error);
  }, [error]);

  return (
    <main className="ops-main">
      <header className="ops-page-header">
        <div>
          <span className="ops-eyebrow">Không thể hoàn tất yêu cầu</span>
          <h1>Dữ liệu vận hành chưa khả dụng</h1>
          <p>Yêu cầu không thể hoàn tất an toàn. Bạn có thể thử tải lại màn hình này.</p>
        </div>
        <button className="ops-button ops-button--primary" onClick={reset} type="button">
          Thử lại
        </button>
      </header>
    </main>
  );
}
