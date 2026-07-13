'use client';

import { ProviderIcon } from '@/components/provider-icon';

export default function ProviderError({ reset }: { readonly reset: () => void }) {
  return (
    <main className="provider-main">
      <section className="provider-panel provider-route-error" role="alert">
        <span>
          <ProviderIcon name="alert" />
        </span>
        <div>
          <strong>Không thể tải không gian làm việc</strong>
          <p>
            Dữ liệu chưa bị thay đổi. Hãy thử tải lại; nếu lỗi tiếp tục, kiểm tra trạng thái API
            hoặc liên hệ điều phối.
          </p>
          <div>
            <button onClick={reset} type="button">
              Thử lại
            </button>
            <a href="/messages">Liên hệ điều phối</a>
          </div>
        </div>
      </section>
    </main>
  );
}
