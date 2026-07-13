'use client';

import { Icon } from '@/components/icon';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="care-main state-page">
      <div className="empty-state empty-state--large">
        <span className="empty-state__icon">
          <Icon name="support" />
        </span>
        <h1>Chưa tải được nội dung</h1>
        <p>Kết nối có thể đang gián đoạn. Thông tin của bạn vẫn an toàn.</p>
        <button className="primary-button" onClick={reset} type="button">
          Thử lại
        </button>
      </div>
    </main>
  );
}
