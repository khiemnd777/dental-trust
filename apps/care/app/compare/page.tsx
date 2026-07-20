import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import styles from '@/components/discovery-surfaces.module.css';
import { getDiscoveryData } from '@/lib/care-data';
import { clinicTrustSignalCount, clinicTrustSignals } from '@/lib/clinic-map';
import { formatDateTime, formatMoney } from '@/lib/presentation';

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
    <main className={`care-main ${styles.comparePage}`}>
      <header className={styles.compareHeader}>
        <Link aria-label="Quay lại khám phá" href="/discover">
          <Icon name="arrow" />
        </Link>
        <div>
          <p className="eyebrow">Quyết định dễ dàng hơn</p>
          <h1>So sánh lựa chọn</h1>
          <p>Đặt tín hiệu xác minh, đánh giá và trải nghiệm chăm sóc cạnh nhau.</p>
        </div>
      </header>

      {selected.length ? (
        <>
          {selected.length > 1 ? (
            <p className={styles.compareScrollHint}>
              <Icon name="arrow" /> Vuốt ngang hoặc dùng phím mũi tên để xem đủ các cột.
            </p>
          ) : null}

          <div
            aria-label={`Bảng so sánh ${selected.length} phòng khám`}
            className={styles.compareTableRegion}
            role="region"
            tabIndex={0}
          >
            <table
              className={styles.compareTable}
              style={{ minWidth: `${9 + selected.length * 12.5}rem` }}
            >
              <thead>
                <tr>
                  <th scope="col">Tiêu chí</th>
                  {selected.map((clinic) => (
                    <th key={clinic.id} scope="col">
                      <span aria-hidden="true" className={styles.compareClinicMark}>
                        {clinic.name.trim().charAt(0).toLocaleUpperCase('vi') || '+'}
                      </span>
                      <strong>{clinic.name}</strong>
                      <small>{clinic.locationLabel}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Xác minh</th>
                  {selected.map((clinic) => (
                    <td className={styles.compareVerified} key={`${clinic.id}-verified`}>
                      <Icon name="shield" /> {verificationStatusLabel(clinic.verificationStatus)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Phạm vi bằng chứng</th>
                  {selected.map((clinic) => {
                    const recordedCount = clinicTrustSignals(clinic.evidence).filter(
                      ({ verified }) => verified,
                    ).length;
                    return (
                      <td key={`${clinic.id}-scope`}>
                        <strong>
                          {recordedCount}/{clinicTrustSignalCount} nhóm được ghi nhận
                        </strong>
                        <small>
                          {new Set(clinic.evidence.map(({ category }) => category)).size} phạm vi
                          bằng chứng ghi nhận
                        </small>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">Ngày kiểm tra</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-date`}>
                      {formatVerificationDate(clinic.verificationDate) ?? 'Chưa công bố'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Đánh giá bệnh nhân</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-rating`}>
                      {clinic.rating ? (
                        <strong className={styles.compareRating}>
                          <Icon fill="currentColor" name="star" /> {clinic.rating}
                        </strong>
                      ) : (
                        'Chưa có đánh giá'
                      )}
                      {clinic.rating ? <small>{clinic.reviewCount} đánh giá</small> : null}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Chi phí ước tính từ</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-price`}>
                      <strong>
                        {clinic.estimatedPrice
                          ? formatMoney(
                              clinic.estimatedPrice.minimumMinor,
                              clinic.estimatedPrice.currency,
                            )
                          : 'Theo tư vấn'}
                      </strong>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Dịch vụ</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-services`}>
                      {clinic.services.map((service) => service.name).join(' · ') ||
                        'Nha khoa tổng quát'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Sau điều trị</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-aftercare`}>
                      {clinic.aftercareSupported ? 'Có đội ngũ theo dõi' : 'Theo từng trường hợp'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Bảo hành</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-warranty`}>
                      {clinic.warrantyAvailable ? 'Có công bố' : 'Chưa công bố'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Ngôn ngữ</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-languages`}>
                      {clinic.languages.length ? formatLanguages(clinic.languages) : 'Chưa công bố'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Lịch tư vấn sớm nhất</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-consultation`}>
                      {clinic.earliestConsultation
                        ? `${formatDateTime(clinic.earliestConsultation, 'Asia/Ho_Chi_Minh')} · giờ Việt Nam`
                        : 'Liên hệ để kiểm tra'}
                    </td>
                  ))}
                </tr>
                <tr className={styles.compareActionRow}>
                  <th scope="row">Tiếp theo</th>
                  {selected.map((clinic) => (
                    <td key={`${clinic.id}-actions`}>
                      <Link className={styles.primaryButton} href={`/start?clinic=${clinic.slug}`}>
                        Nhờ tư vấn
                      </Link>
                      <Link className={styles.secondaryButton} href={`/discover/${clinic.slug}`}>
                        Xem chi tiết
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <section className={styles.compareGuidance}>
            <Icon name="support" />
            <div>
              <h2>Không cần tự quyết định một mình</h2>
              <p>Điều phối viên có thể giúp bạn hiểu khác biệt quan trọng giữa các lựa chọn.</p>
            </div>
            <Link href="/messages">Nhờ giải thích</Link>
          </section>
        </>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Icon name="plus" />
          </span>
          <h2>Chưa có nơi nào để so sánh</h2>
          <p>Chọn tối đa 3 phòng khám từ trang Khám phá.</p>
          <Link className={styles.primaryButton} href="/discover">
            Tìm phòng khám
          </Link>
        </div>
      )}
    </main>
  );
}

function formatVerificationDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function verificationStatusLabel(status: string): string {
  if (status === 'ACTIVE' || status === 'VERIFIED') return 'Đã xác minh';
  if (status === 'VERIFICATION_EXPIRING') return 'Xác minh sắp hết hạn';
  return 'Đang cập nhật';
}

function formatLanguages(languages: readonly string[]): string {
  const labels: Readonly<Record<string, string>> = {
    en: 'English',
    vi: 'Tiếng Việt',
    'en-US': 'English',
    'vi-VN': 'Tiếng Việt',
  };
  return languages.map((language) => labels[language] ?? language.toUpperCase()).join(' · ');
}
