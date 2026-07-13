import Link from 'next/link';

import { Icon } from '@/components/icon';

export default function NotFoundPage() {
  return (
    <main className="care-main state-page">
      <div className="empty-state empty-state--large">
        <span className="empty-state__icon">
          <Icon name="search" />
        </span>
        <h1>Không tìm thấy nội dung này</h1>
        <p>Nội dung có thể đã thay đổi hoặc không còn khả dụng.</p>
        <Link className="primary-button" href="/">
          Về Hôm nay
        </Link>
      </div>
    </main>
  );
}
