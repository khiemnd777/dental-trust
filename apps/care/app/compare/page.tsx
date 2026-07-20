import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '@/components/icon';
import styles from '@/components/discovery-surfaces.module.css';
import { getDiscoveryData, type ClinicOption } from '@/lib/care-data';
import { clinicTrustSignalCount, clinicTrustSignals } from '@/lib/clinic-map';
import { formatDateTime, formatMoney } from '@/lib/presentation';

export const metadata: Metadata = { title: 'So sánh lựa chọn' };

interface ComparisonCriterion {
  readonly id: string;
  readonly label: string;
  readonly render: (clinic: ClinicOption) => ReactNode;
  readonly tone?: 'verified';
}

interface ComparisonSection {
  readonly criteria: readonly ComparisonCriterion[];
  readonly id: string;
  readonly label: string;
}

const comparisonSections: readonly ComparisonSection[] = [
  {
    id: 'trust',
    label: 'Mức độ tin cậy',
    criteria: [
      {
        id: 'verification',
        label: 'Xác minh',
        tone: 'verified',
        render: (clinic) => (
          <>
            <Icon name="shield" /> {verificationStatusLabel(clinic.verificationStatus)}
          </>
        ),
      },
      {
        id: 'evidence-scope',
        label: 'Phạm vi bằng chứng',
        render: (clinic) => {
          const recordedCount = clinicTrustSignals(clinic.evidence).filter(
            ({ verified }) => verified,
          ).length;
          return (
            <>
              <strong>
                {recordedCount}/{clinicTrustSignalCount} nhóm được ghi nhận
              </strong>
              <small>
                {new Set(clinic.evidence.map(({ category }) => category)).size} phạm vi bằng chứng
                ghi nhận
              </small>
            </>
          );
        },
      },
      {
        id: 'verification-date',
        label: 'Ngày kiểm tra',
        render: (clinic) => formatVerificationDate(clinic.verificationDate) ?? 'Chưa công bố',
      },
      {
        id: 'patient-rating',
        label: 'Đánh giá bệnh nhân',
        render: (clinic) => (
          <>
            {clinic.rating ? (
              <strong className={styles.compareRating}>
                <Icon fill="currentColor" name="star" /> {clinic.rating}
              </strong>
            ) : (
              'Chưa có đánh giá'
            )}
            {clinic.rating ? <small>{clinic.reviewCount} đánh giá</small> : null}
          </>
        ),
      },
    ],
  },
  {
    id: 'care-and-cost',
    label: 'Dịch vụ & chi phí',
    criteria: [
      {
        id: 'estimated-price',
        label: 'Chi phí ước tính từ',
        render: (clinic) => (
          <strong>
            {clinic.estimatedPrice
              ? formatMoney(clinic.estimatedPrice.minimumMinor, clinic.estimatedPrice.currency)
              : 'Theo tư vấn'}
          </strong>
        ),
      },
      {
        id: 'services',
        label: 'Dịch vụ',
        render: (clinic) =>
          clinic.services.map((service) => service.name).join(' · ') || 'Nha khoa tổng quát',
      },
      {
        id: 'aftercare',
        label: 'Sau điều trị',
        render: (clinic) =>
          clinic.aftercareSupported ? 'Có đội ngũ theo dõi' : 'Theo từng trường hợp',
      },
      {
        id: 'warranty',
        label: 'Bảo hành',
        render: (clinic) => (clinic.warrantyAvailable ? 'Có công bố' : 'Chưa công bố'),
      },
      {
        id: 'languages',
        label: 'Ngôn ngữ',
        render: (clinic) =>
          clinic.languages.length ? formatLanguages(clinic.languages) : 'Chưa công bố',
      },
    ],
  },
  {
    id: 'schedule',
    label: 'Lịch & bước tiếp theo',
    criteria: [
      {
        id: 'earliest-consultation',
        label: 'Lịch tư vấn sớm nhất',
        render: (clinic) =>
          clinic.earliestConsultation
            ? `${formatDateTime(clinic.earliestConsultation, 'Asia/Ho_Chi_Minh')} · giờ Việt Nam`
            : 'Liên hệ để kiểm tra',
      },
    ],
  },
];

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
          <MobileComparison clinics={selected} />
          <DesktopComparison clinics={selected} />

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

function MobileComparison({ clinics }: { readonly clinics: readonly ClinicOption[] }) {
  return (
    <section
      aria-label={`So sánh ${clinics.length} phòng khám trên thiết bị di động`}
      className={styles.compareMobile}
    >
      <div
        aria-label="Chú thích phòng khám"
        className={styles.compareMobileLegend}
        data-clinic-count={clinics.length}
        role="list"
      >
        {clinics.map((clinic, index) => (
          <div className={styles.compareMobileLegendItem} key={clinic.id} role="listitem">
            <ClinicKey index={index} />
            <span>
              <strong>{clinic.name}</strong>
              <small>{clinic.locationLabel}</small>
            </span>
          </div>
        ))}
      </div>

      {comparisonSections.map((section) => (
        <section
          aria-labelledby={`mobile-comparison-${section.id}`}
          className={styles.compareMobileSection}
          key={section.id}
        >
          <h2 id={`mobile-comparison-${section.id}`}>{section.label}</h2>
          <div className={styles.compareMobileCriteria}>
            {section.criteria.map((criterion) => (
              <article className={styles.compareMobileCriterion} key={criterion.id}>
                <h3>{criterion.label}</h3>
                <dl>
                  {clinics.map((clinic, index) => (
                    <div key={clinic.id}>
                      <dt>
                        <ClinicKey index={index} />
                        <span className="sr-only">{clinic.name}</span>
                      </dt>
                      <dd
                        {...(criterion.tone === 'verified'
                          ? { className: styles.compareVerified }
                          : {})}
                      >
                        {criterion.render(clinic)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="mobile-comparison-actions" className={styles.compareMobileActions}>
        <h2 id="mobile-comparison-actions">Bước tiếp theo</h2>
        <div>
          {clinics.map((clinic, index) => (
            <article key={clinic.id}>
              <header>
                <ClinicKey index={index} />
                <span>
                  <strong>{clinic.name}</strong>
                  <small>{clinic.locationLabel}</small>
                </span>
              </header>
              <div>
                <Link className={styles.primaryButton} href={`/start?clinic=${clinic.slug}`}>
                  Nhờ tư vấn
                </Link>
                <Link className={styles.secondaryButton} href={`/discover/${clinic.slug}`}>
                  Xem chi tiết
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function DesktopComparison({ clinics }: { readonly clinics: readonly ClinicOption[] }) {
  return (
    <section className={styles.compareDesktop}>
      {clinics.length === 3 ? (
        <p className={styles.compareScrollHint}>
          <Icon name="arrow" /> Vuốt ngang hoặc dùng phím mũi tên để xem đủ các cột.
        </p>
      ) : null}

      <div
        aria-label={`Bảng so sánh ${clinics.length} phòng khám`}
        className={styles.compareTableRegion}
        role="region"
        tabIndex={0}
      >
        <table className={styles.compareTable} data-clinic-count={clinics.length}>
          <thead>
            <tr>
              <th scope="col">Tiêu chí</th>
              {clinics.map((clinic) => (
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
            {comparisonSections.flatMap((section) =>
              section.criteria.map((criterion) => (
                <tr key={criterion.id}>
                  <th scope="row">{criterion.label}</th>
                  {clinics.map((clinic) => (
                    <td
                      {...(criterion.tone === 'verified'
                        ? { className: styles.compareVerified }
                        : {})}
                      key={clinic.id}
                    >
                      {criterion.render(clinic)}
                    </td>
                  ))}
                </tr>
              )),
            )}
            <tr className={styles.compareActionRow}>
              <th scope="row">Tiếp theo</th>
              {clinics.map((clinic) => (
                <td key={clinic.id}>
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
    </section>
  );
}

function ClinicKey({ index }: { readonly index: number }) {
  return (
    <span aria-hidden="true" className={styles.compareMobileKey}>
      {clinicKey(index)}
    </span>
  );
}

function clinicKey(index: number): string {
  return String.fromCharCode(65 + index);
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
