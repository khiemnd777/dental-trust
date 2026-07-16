import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { Icon } from '@/components/icon';
import { getDiscoveryData } from '@/lib/care-data';
import { formatMoney } from '@/lib/presentation';

export const metadata: Metadata = { title: 'So sánh lựa chọn' };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const ids = new Set((await searchParams).ids?.split(',').filter(Boolean) ?? []);
  const { clinics } = await getDiscoveryData();
  const selected = clinics.filter((clinic) => ids.has(clinic.id)).slice(0, 3);

  return (
    <main className="care-main compare-page">
      <header className="subpage-header">
        <Link aria-label="Quay lại khám phá" href="/discover">
          <Icon className="icon-back" name="arrow" />
        </Link>
        <div>
          <p className="eyebrow">Quyết định dễ dàng hơn</p>
          <h1>So sánh lựa chọn</h1>
        </div>
      </header>

      {selected.length ? (
        <>
          <p className="compare-scroll-hint">
            <Icon name="arrow" /> Vuốt ngang hoặc dùng phím mũi tên để xem đủ các cột.
          </p>
          <div
            aria-label={`Bảng so sánh ${selected.length} phòng khám`}
            className="compare-columns"
            role="region"
            style={{ '--compare-count': selected.length } as CSSProperties}
            tabIndex={0}
          >
            <div className="compare-label" />
            {selected.map((clinic, index) => (
              <article className="compare-clinic" key={clinic.id}>
                <span className={`compare-clinic__art clinic-visual--${index + 1}`} />
                <strong>{clinic.name}</strong>
                <small>{clinic.locationLabel}</small>
              </article>
            ))}
            <strong className="compare-label">Xác minh</strong>
            {selected.map((clinic) => (
              <span className="compare-value is-positive" key={`${clinic.id}-verified`}>
                <Icon name="shield" /> Đã xác minh
              </span>
            ))}
            <strong className="compare-label">Chi phí từ</strong>
            {selected.map((clinic) => (
              <span className="compare-value" key={`${clinic.id}-price`}>
                {clinic.estimatedPrice
                  ? formatMoney(clinic.estimatedPrice.minimumMinor, clinic.estimatedPrice.currency)
                  : 'Theo tư vấn'}
              </span>
            ))}
            <strong className="compare-label">Sau điều trị</strong>
            {selected.map((clinic) => (
              <span className="compare-value" key={`${clinic.id}-aftercare`}>
                {clinic.aftercareSupported ? 'Có hỗ trợ' : 'Theo trường hợp'}
              </span>
            ))}
            <strong className="compare-label">Bảo hành</strong>
            {selected.map((clinic) => (
              <span className="compare-value" key={`${clinic.id}-warranty`}>
                {clinic.warrantyAvailable ? 'Có công bố' : 'Chưa công bố'}
              </span>
            ))}
            <strong className="compare-label">Ngôn ngữ</strong>
            {selected.map((clinic) => (
              <span className="compare-value" key={`${clinic.id}-languages`}>
                {clinic.languages.length ? clinic.languages.join(' · ') : 'vi'}
              </span>
            ))}
            <span className="compare-label" />
            {selected.map((clinic) => (
              <Link
                className="secondary-button"
                href={`/discover/${clinic.slug}`}
                key={`${clinic.id}-link`}
              >
                Xem chi tiết
              </Link>
            ))}
          </div>
          <section className="compare-guidance">
            <Icon name="support" />
            <div>
              <h2>Không cần tự quyết định một mình</h2>
              <p>Điều phối viên có thể giúp bạn hiểu khác biệt quan trọng giữa các lựa chọn.</p>
            </div>
            <Link href="/messages">Nhờ giải thích</Link>
          </section>
        </>
      ) : (
        <div className="empty-state">
          <span className="empty-state__icon">
            <Icon name="plus" />
          </span>
          <h2>Chưa có nơi nào để so sánh</h2>
          <p>Chọn tối đa 3 phòng khám từ trang Khám phá.</p>
          <Link className="primary-button" href="/discover">
            Tìm phòng khám
          </Link>
        </div>
      )}
    </main>
  );
}
