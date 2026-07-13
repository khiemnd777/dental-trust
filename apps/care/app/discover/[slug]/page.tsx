import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Icon } from '@/components/icon';
import { SaveClinicButton } from '@/components/save-clinic-button';
import { getClinic, getSavedClinics } from '@/lib/care-data';
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

  return (
    <main className="clinic-detail-page">
      <div className="detail-top-actions">
        <Link aria-label="Quay lại khám phá" href="/discover">
          <Icon name="arrow" className="icon-back" />
        </Link>
        <SaveClinicButton clinicId={clinic.id} initialSavedId={savedClinic?.id ?? null} />
      </div>

      <section className="clinic-detail-hero">
        <div className="clinic-detail-hero__sky" />
        <div className="clinic-detail-hero__building" aria-hidden="true">
          <span />
          <span />
          <span />
          <i>+</i>
        </div>
        <div className="clinic-detail-hero__caption">
          <span>1 / 4</span>
        </div>
      </section>

      <div className="care-main clinic-detail-content">
        <header className="clinic-detail-heading">
          <span className="verified-badge verified-badge--inline">
            <Icon name="shield" /> Đã xác minh
          </span>
          <h1>{clinic.name}</h1>
          <p>
            <Icon name="location" /> {clinic.locationLabel} · {clinic.address}
          </p>
          {clinic.rating ? (
            <div className="rating-line">
              <strong>
                <Icon name="star" fill="currentColor" /> {clinic.rating}
              </strong>
              <span>{clinic.reviewCount} đánh giá đã xác minh</span>
            </div>
          ) : null}
        </header>

        <section className="trust-summary" aria-labelledby="trust-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dental Trust đã kiểm tra</p>
              <h2 id="trust-title">Vì sao nơi này đáng tin?</h2>
            </div>
            <Icon name="shield" />
          </div>
          <div className="trust-grid">
            <span>
              <Icon name="check" />
              <strong>Giấy phép hoạt động</strong>
              <small>Đã đối chiếu nguồn</small>
            </span>
            <span>
              <Icon name="check" />
              <strong>Quy trình vô khuẩn</strong>
              <small>Có bằng chứng hợp lệ</small>
            </span>
            <span>
              <Icon name="check" />
              <strong>Năng lực điều trị</strong>
              <small>Đúng phạm vi công bố</small>
            </span>
            <span>
              <Icon name="check" />
              <strong>Hỗ trợ quốc tế</strong>
              <small>
                {clinic.aftercareSupported ? 'Có theo dõi sau điều trị' : 'Theo từng trường hợp'}
              </small>
            </span>
          </div>
          <Link className="inline-link" href="#verification">
            Xem phạm vi xác minh <Icon name="arrow" />
          </Link>
        </section>

        <section className="detail-section" aria-labelledby="services-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dịch vụ phù hợp</p>
              <h2 id="services-title">Bạn có thể được hỗ trợ</h2>
            </div>
          </div>
          <div className="service-list">
            {clinic.services.map((service) => (
              <article key={service.code}>
                <span>
                  <Icon name="sparkle" />
                </span>
                <div>
                  <h3>{service.name}</h3>
                  <p>Đánh giá cá nhân hóa sau khi bác sĩ xem hồ sơ.</p>
                </div>
                <Icon name="chevron" />
              </article>
            ))}
          </div>
        </section>

        <section className="price-card">
          <div>
            <p className="eyebrow">Khoảng chi phí tham khảo</p>
            <h2>
              {minimum}
              {maximum ? ` – ${maximum}` : ''}
            </h2>
            <p>Giá cuối cùng chỉ được xác nhận sau khi bác sĩ đánh giá hồ sơ và phim chụp.</p>
          </div>
          <Icon name="document" />
        </section>

        <section className="detail-section" aria-labelledby="experience-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Trải nghiệm chăm sóc</p>
              <h2 id="experience-title">Điều bạn có thể mong đợi</h2>
            </div>
          </div>
          <div className="experience-list">
            <span>
              <Icon name="globe" />
              <span>
                <strong>Ngôn ngữ</strong>
                <small>
                  {clinic.languages.length ? clinic.languages.join(' · ') : 'Tiếng Việt'}
                </small>
              </span>
            </span>
            <span>
              <Icon name="support" />
              <span>
                <strong>Sau điều trị</strong>
                <small>
                  {clinic.aftercareSupported ? 'Có đội ngũ theo dõi' : 'Theo phương án điều trị'}
                </small>
              </span>
            </span>
            <span>
              <Icon name="calendar" />
              <span>
                <strong>Lịch tư vấn sớm nhất</strong>
                <small>
                  {clinic.earliestConsultation
                    ? formatDateTime(clinic.earliestConsultation)
                    : 'Liên hệ để kiểm tra'}
                </small>
              </span>
            </span>
          </div>
        </section>

        <section className="verification-scope" id="verification">
          <Icon name="shield" />
          <div>
            <h2>Minh bạch về xác minh</h2>
            <p>
              Dental Trust kiểm tra tài liệu và bằng chứng tại thời điểm công bố. Xác minh không
              thay thế tư vấn y khoa và không đảm bảo một kết quả điều trị cụ thể.
            </p>
            <strong>{clinic.evidence.length} nhóm bằng chứng đã được ghi nhận</strong>
          </div>
        </section>
      </div>

      <aside className="sticky-detail-action">
        <span>
          <small>Chi phí từ</small>
          <strong>{minimum}</strong>
        </span>
        <Link className="primary-button" href={`/start?clinic=${clinic.slug}`}>
          Nhờ tư vấn <Icon name="arrow" />
        </Link>
      </aside>
    </main>
  );
}
