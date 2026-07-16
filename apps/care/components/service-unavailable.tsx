'use client';

import { Icon } from '@/components/icon';

export function ServiceUnavailable() {
  return (
    <main className="care-main">
      <div className="empty-state empty-state--large" role="alert">
        <span className="empty-state__icon">
          <Icon name="support" />
        </span>
        <h1>Tạm thời chưa thể kết nối</h1>
        <p>Dịch vụ Care đang gián đoạn. Phiên đăng nhập của bạn vẫn được giữ an toàn.</p>
        <button className="primary-button" onClick={() => window.location.reload()} type="button">
          Thử lại
        </button>
      </div>
    </main>
  );
}
