import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Icon } from '@/components/icon';
import { SaveClinicButton } from '@/components/save-clinic-button';
import styles from '@/components/discovery-surfaces.module.css';
import { getClinic, getSavedClinics } from '@/lib/care-data';
import { clinicTrustSignalCount, clinicTrustSignals } from '@/lib/clinic-map';
import { formatDateTime, formatMoney } from '@/lib/presentation';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const clinic = await getClinic((await params).slug);
  return { title: clinic?.name ?? 'Phòng khám' } satisfies Metadata;
}

export default async function ClinicDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const [clinic, savedClinics] = await Promise.all([getClinic(slug), getSavedClinics()]);
  if (!clinic) notFound();

  const savedClinic = savedClinics.find((item) => item.clinicId === clinic.id);
  const minimum = clinic.estimatedPrice
    ? formatMoney(clinic.estimatedPrice.minimumMinor, clinic.estimatedPrice.currency)
    : 'Theo tư vấn';
  const maximum = clinic.estimatedPrice
    ? formatMoney(clinic.estimatedPrice.maximumMinor, clinic.estimatedPrice.currency)
    : null;
  const trustSignals = clinicTrustSignals(clinic.evidence);
  const recordedTrustCount = trustSignals.filter(({ verified }) => verified).length;
  const evidenceCategoryCount = new Set(clinic.evidence.map(({ category }) => category)).size;
  const verificationDate = formatVerificationDate(clinic.verificationDate);
  const clinicInitial = clinic.name.trim().charAt(0).toLocaleUpperCase('vi') || '+';

  return (
    <main className={`clinic-detail-page ${styles.detailPage}`}>
      <section className={styles.detailHero}>
        <div className={styles.detailTopActions}>
          <Link aria-label="Quay lại khám phá" href="/discover">
            <Icon name="arrow" />
          </Link>
          <span className={styles.detailSaveAction}>
            <SaveClinicButton clinicId={clinic.id} initialSavedId={savedClinic?.id ?? null} />
          </span>
        </div>

        <div className={styles.detailIdentity}>
          <span aria-hidden="true" className={styles.detailMark}>
            {clinicInitial}
          </span>
          <div>
            <p className="eyebrow">Hồ sơ phòng khám</p>
            <h1>{clinic.name}</h1>
            <p>
              <Icon name="location" /> {clinic.locationLabel} · {clinic.address}
            </p>
          </div>
        </div>
      </section>

      <div className={`care-main ${styles.detailContent}`}>
        <section aria-labelledby="trust-title" className={styles.detailTrustCard} id="verification">
          <header className={styles.detailSectionHeading}>
            <div>
              <p className="eyebrow">Dental Trust đã kiểm tra</p>
              <h2 id="trust-title">Phạm vi xác minh</h2>
            </div>
            <span aria-hidden="true">
              <Icon name="shield" />
            </span>
          </header>

          <div className={styles.trustOverview}>
            <div>
              <small>Trạng thái</small>
              <strong>{verificationStatusLabel(clinic.verificationStatus)}</strong>
            </div>
            <div>
              <small>Nhóm có bằng chứng</small>
              <strong>
                {recordedTrustCount}/{clinicTrustSignalCount}
              </strong>
            </div>
            <div>
              <small>Ngày kiểm tra</small>
              <strong>{verificationDate ?? 'Chưa công bố'}</strong>
            </div>
          </div>

          <div className={styles.trustSignalGrid}>
            {trustSignals.map((signal) => (
              <article className={signal.verified ? styles.trustVerified : ''} key={signal.key}>
                <Icon name={signal.verified ? 'check' : 'clock'} />
                <div>
                  <strong>{signal.label}</strong>
                  <small>
                    {signal.verified ? 'Đã ghi nhận bằng chứng' : 'Chưa có bằng chứng công bố'}
                  </small>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.verificationNote}>
            <Icon name="document" />
            <p>
              <strong>{evidenceCategoryCount} phạm vi bằng chứng được ghi nhận.</strong> Dental
              Trust kiểm tra tài liệu và bằng chứng tại thời điểm công bố. Xác minh không thay thế
              tư vấn y khoa và không đảm bảo một kết quả điều trị cụ thể.
            </p>
          </div>
        </section>

        <section aria-labelledby="services-title" className={styles.detailSection}>
          <header className={styles.detailSectionHeading}>
            <div>
              <p className="eyebrow">Dịch vụ phù hợp</p>
              <h2 id="services-title">Bạn có thể được hỗ trợ</h2>
            </div>
          </header>
          <div className={styles.detailServiceList}>
            {clinic.services.length ? (
              clinic.services.map((service) => (
                <article key={service.code}>
                  <span aria-hidden="true">
                    <Icon name="sparkle" />
                  </span>
                  <div>
                    <h3>{service.name}</h3>
                    <p>Đánh giá cá nhân hóa sau khi bác sĩ xem hồ sơ.</p>
                  </div>
                </article>
              ))
            ) : (
              <p className={styles.detailEmptyCopy}>Dịch vụ đang được cập nhật.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="price-title" className={styles.detailPriceCard}>
          <div>
            <p className="eyebrow">Khoảng chi phí tham khảo</p>
            <h2 id="price-title">
              {minimum}
              {maximum ? ` – ${maximum}` : ''}
            </h2>
            <p>Giá cuối cùng chỉ được xác nhận sau khi bác sĩ đánh giá hồ sơ và phim chụp.</p>
          </div>
          <Icon name="document" />
        </section>

        <section aria-labelledby="experience-title" className={styles.detailSection}>
          <header className={styles.detailSectionHeading}>
            <div>
              <p className="eyebrow">Trải nghiệm chăm sóc</p>
              <h2 id="experience-title">Thông tin thực tế trước khi chọn</h2>
            </div>
          </header>
          <div className={styles.experienceGrid}>
            <article>
              <Icon name="globe" />
              <span>
                <strong>Ngôn ngữ</strong>
                <small>
                  {clinic.languages.length ? formatLanguages(clinic.languages) : 'Chưa công bố'}
                </small>
              </span>
            </article>
            <article>
              <Icon name="support" />
              <span>
                <strong>Sau điều trị</strong>
                <small>
                  {clinic.aftercareSupported ? 'Có đội ngũ theo dõi' : 'Theo phương án điều trị'}
                </small>
              </span>
            </article>
            <article>
              <Icon name="calendar" />
              <span>
                <strong>Lịch tư vấn sớm nhất</strong>
                <small>
                  {clinic.earliestConsultation
                    ? `${formatDateTime(clinic.earliestConsultation, 'Asia/Ho_Chi_Minh')} · giờ Việt Nam`
                    : 'Liên hệ để kiểm tra'}
                </small>
              </span>
            </article>
          </div>
        </section>

        <section aria-labelledby="rating-title" className={styles.patientRatingCard}>
          <div>
            <p className="eyebrow">Đánh giá bệnh nhân</p>
            <h2 id="rating-title">
              {clinic.rating ? (
                <>
                  <Icon fill="currentColor" name="star" /> {clinic.rating}
                </>
              ) : (
                'Chưa có đánh giá'
              )}
            </h2>
          </div>
          <p>
            {clinic.rating
              ? `${clinic.reviewCount} đánh giá bệnh nhân được hiển thị riêng với trạng thái xác minh.`
              : 'Chưa có dữ liệu đánh giá bệnh nhân để hiển thị.'}
          </p>
        </section>
      </div>

      <aside className={styles.stickyDetailAction}>
        <span>
          <small>Chi phí ước tính từ</small>
          <strong>{minimum}</strong>
        </span>
        <Link className={styles.primaryButton} href={`/start?clinic=${clinic.slug}`}>
          Nhờ tư vấn <Icon name="arrow" />
        </Link>
      </aside>
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
  return 'Hồ sơ đang được cập nhật';
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
