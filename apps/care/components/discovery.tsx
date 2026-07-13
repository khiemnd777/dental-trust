'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import { Icon, type IconName } from '@/components/icon';
import type { ClinicOption, SavedClinic } from '@/lib/care-data';
import { formatMoney } from '@/lib/presentation';

const treatments = [
  { code: 'ALL', label: 'Tất cả', icon: 'sparkle' },
  { code: 'DENTAL_IMPLANT', label: 'Implant', icon: 'implant' },
  { code: 'CROWN', label: 'Răng sứ', icon: 'crown' },
  { code: 'ORTHODONTICS', label: 'Niềng răng', icon: 'braces' },
  { code: 'VENEER', label: 'Veneer', icon: 'smile' },
] as const satisfies readonly { code: string; label: string; icon: IconName }[];

interface DiscoveryProps {
  readonly clinics: readonly ClinicOption[];
  readonly initialSaved: readonly SavedClinic[];
}

export function Discovery({ clinics, initialSaved }: DiscoveryProps) {
  const [treatment, setTreatment] = useState<(typeof treatments)[number]['code']>('ALL');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(initialSaved);
  const [compare, setCompare] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [aftercareOnly, setAftercareOnly] = useState(false);
  const [warrantyOnly, setWarrantyOnly] = useState(false);
  const [englishOnly, setEnglishOnly] = useState(false);
  const [sort, setSort] = useState<'recommended' | 'rating' | 'price'>('recommended');
  const [feedback, setFeedback] = useState('');
  const [isPending, startTransition] = useTransition();

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    const filtered = clinics.filter((clinic) => {
      const treatmentMatches =
        treatment === 'ALL' || clinic.services.some((service) => service.code === treatment);
      const queryMatches =
        !normalizedQuery ||
        `${clinic.name} ${clinic.locationLabel} ${clinic.services.map((item) => item.name).join(' ')}`
          .toLocaleLowerCase('vi')
          .includes(normalizedQuery);
      return (
        treatmentMatches &&
        queryMatches &&
        (!aftercareOnly || clinic.aftercareSupported) &&
        (!warrantyOnly || clinic.warrantyAvailable) &&
        (!englishOnly || clinic.languages.includes('en'))
      );
    });
    return filtered.toSorted((left, right) => {
      if (sort === 'rating') return Number(right.rating || 0) - Number(left.rating || 0);
      if (sort === 'price')
        return (
          Number(left.estimatedPrice?.minimumMinor ?? Infinity) -
          Number(right.estimatedPrice?.minimumMinor ?? Infinity)
        );
      return Number(right.followUpDataAvailable) - Number(left.followUpDataAvailable);
    });
  }, [aftercareOnly, clinics, englishOnly, query, sort, treatment, warrantyOnly]);

  const activeFilters = [aftercareOnly, warrantyOnly, englishOnly].filter(Boolean).length;

  function toggleSaved(clinic: ClinicOption) {
    const existing = saved.find((item) => item.clinicId === clinic.id);
    const previous = saved;
    setFeedback(existing ? 'Đã bỏ khỏi danh sách lưu' : 'Đã lưu để xem sau');
    setSaved((current) =>
      existing
        ? current.filter((item) => item.clinicId !== clinic.id)
        : [
            ...current,
            {
              id: `optimistic-${clinic.id}`,
              clinicId: clinic.id,
              clinicName: clinic.name,
              clinicSlug: clinic.slug,
              verificationStatus: clinic.verificationStatus,
              createdAt: new Date().toISOString(),
            },
          ],
    );
    startTransition(async () => {
      const response = await fetch('/api/care/saved-clinics', {
        method: existing ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(existing ? { savedClinicId: existing.id } : { clinicId: clinic.id }),
      });
      if (!response.ok) {
        setSaved(previous);
        setFeedback('Chưa thể cập nhật. Vui lòng thử lại.');
        return;
      }
      if (!existing) {
        const payload = (await response.json()) as { data?: { id?: string } };
        const savedId = payload.data?.id;
        if (savedId) {
          setSaved((current) =>
            current.map((item) => (item.clinicId === clinic.id ? { ...item, id: savedId } : item)),
          );
        }
      }
    });
  }

  function toggleCompare(id: string) {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) {
        setFeedback('Bạn có thể so sánh tối đa 3 nơi.');
        return current;
      }
      return [...current, id];
    });
  }

  return (
    <main className="care-main discovery-page">
      <header className="page-intro discover-intro">
        <p className="eyebrow">Được kiểm tra bởi Dental Trust</p>
        <h1>Tìm nơi khiến bạn an tâm</h1>
        <p>Chọn điều bạn quan tâm. Chúng tôi giúp bạn hiểu phần còn lại.</p>
      </header>

      <div className="discover-searchbar">
        <Icon name="search" />
        <input
          aria-label="Tìm phòng khám hoặc dịch vụ"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Phòng khám, dịch vụ, khu vực…"
          type="search"
          value={query}
        />
        <button aria-label="Mở bộ lọc" onClick={() => setFilterOpen(true)} type="button">
          <Icon name="filter" />
          {activeFilters > 0 ? <span>{activeFilters}</span> : null}
        </button>
      </div>

      <section aria-labelledby="treatment-heading" className="treatment-picker">
        <div className="section-heading section-heading--compact">
          <h2 id="treatment-heading">Bạn đang quan tâm điều gì?</h2>
        </div>
        <div aria-label="Nhu cầu điều trị" className="treatment-scroll" role="group">
          {treatments.map((item) => (
            <button
              aria-pressed={treatment === item.code}
              key={item.code}
              onClick={() => setTreatment(item.code)}
              type="button"
            >
              <span>
                <Icon name={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className="discovery-context">
        <div>
          <Icon name="location" />
          <span>
            <small>Khu vực</small>
            <strong>TP. Hồ Chí Minh</strong>
          </span>
        </div>
        <div>
          <Icon name="calendar" />
          <span>
            <small>Thời gian</small>
            <strong>Linh hoạt</strong>
          </span>
        </div>
      </div>

      <section aria-labelledby="discover-results" className="clinic-results">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{results.length} lựa chọn</p>
            <h2 id="discover-results">Phù hợp với bạn</h2>
          </div>
          <label className="sort-control">
            <span className="sr-only">Sắp xếp</span>
            <select onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}>
              <option value="recommended">Đề xuất</option>
              <option value="rating">Đánh giá</option>
              <option value="price">Giá thấp trước</option>
            </select>
          </label>
        </div>

        <div className="clinic-grid">
          {results.map((clinic, index) => (
            <ClinicCard
              clinic={clinic}
              compared={compare.includes(clinic.id)}
              index={index}
              key={clinic.id}
              onCompare={() => toggleCompare(clinic.id)}
              onSave={() => toggleSaved(clinic)}
              pending={isPending}
              saved={saved.some((item) => item.clinicId === clinic.id)}
            />
          ))}
        </div>

        {results.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="search" />
            </span>
            <h3>Chưa thấy lựa chọn phù hợp</h3>
            <p>Thử bỏ bớt bộ lọc hoặc chọn “Tất cả”.</p>
            <button
              className="secondary-button"
              onClick={() => {
                setTreatment('ALL');
                setQuery('');
                setAftercareOnly(false);
                setWarrantyOnly(false);
                setEnglishOnly(false);
              }}
              type="button"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : null}
      </section>

      {compare.length > 0 ? (
        <aside className="compare-tray" aria-label="Danh sách so sánh">
          <span className="compare-tray__stack" aria-hidden="true">
            {compare.map((id, index) => (
              <i key={id} style={{ transform: `translateX(${index * 13}px)` }} />
            ))}
          </span>
          <span>
            <strong>{compare.length}/3 đã chọn</strong>
            <small>So sánh cạnh nhau</small>
          </span>
          <Link href={`/compare?ids=${compare.join(',')}`}>
            So sánh <Icon name="arrow" />
          </Link>
        </aside>
      ) : null}

      {feedback ? (
        <div aria-live="polite" className="care-toast" role="status">
          <Icon name="check" /> {feedback}
          <button aria-label="Đóng thông báo" onClick={() => setFeedback('')} type="button">
            <Icon name="close" />
          </button>
        </div>
      ) : null}

      {filterOpen ? (
        <div
          className="sheet-backdrop"
          onMouseDown={() => setFilterOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="filter-title"
            aria-modal="true"
            className="filter-sheet"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="sheet-handle" />
            <header>
              <div>
                <p className="eyebrow">Tinh chỉnh kết quả</p>
                <h2 id="filter-title">Điều gì quan trọng với bạn?</h2>
              </div>
              <button aria-label="Đóng bộ lọc" onClick={() => setFilterOpen(false)} type="button">
                <Icon name="close" />
              </button>
            </header>
            <div className="filter-options">
              <FilterToggle
                checked={aftercareOnly}
                description="Có đội ngũ theo dõi khi bạn đã về nhà"
                icon="support"
                label="Hỗ trợ sau điều trị"
                onChange={setAftercareOnly}
              />
              <FilterToggle
                checked={warrantyOnly}
                description="Chính sách được công bố rõ ràng"
                icon="shield"
                label="Có bảo hành"
                onChange={setWarrantyOnly}
              />
              <FilterToggle
                checked={englishOnly}
                description="Có thể trao đổi bằng tiếng Anh"
                icon="globe"
                label="Hỗ trợ English"
                onChange={setEnglishOnly}
              />
            </div>
            <div className="sheet-actions">
              <button
                className="text-button"
                onClick={() => {
                  setAftercareOnly(false);
                  setWarrantyOnly(false);
                  setEnglishOnly(false);
                }}
                type="button"
              >
                Đặt lại
              </button>
              <button className="primary-button" onClick={() => setFilterOpen(false)} type="button">
                Xem {results.length} lựa chọn
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ClinicCard({
  clinic,
  saved,
  compared,
  pending,
  index,
  onSave,
  onCompare,
}: {
  readonly clinic: ClinicOption;
  readonly saved: boolean;
  readonly compared: boolean;
  readonly pending: boolean;
  readonly index: number;
  readonly onSave: () => void;
  readonly onCompare: () => void;
}) {
  const minimum = clinic.estimatedPrice
    ? formatMoney(clinic.estimatedPrice.minimumMinor, clinic.estimatedPrice.currency)
    : 'Theo tư vấn';
  return (
    <article className="clinic-card">
      <div className={`clinic-visual clinic-visual--${(index % 4) + 1}`}>
        <div className="clinic-visual__sun" />
        <div className="clinic-visual__building" aria-hidden="true">
          <span />
          <span />
          <span />
          <i>+</i>
        </div>
        <span className="verified-badge">
          <Icon name="shield" /> Đã xác minh
        </span>
        <button
          aria-label={saved ? `Bỏ lưu ${clinic.name}` : `Lưu ${clinic.name}`}
          className={`save-action${saved ? ' is-saved' : ''}`}
          disabled={pending}
          onClick={onSave}
          type="button"
        >
          <Icon name="heart" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="clinic-card__body">
        <div className="clinic-card__meta">
          <span>
            <Icon name="location" /> {clinic.locationLabel}
          </span>
          {clinic.rating ? (
            <strong>
              <Icon name="star" fill="currentColor" /> {clinic.rating}
              <small> ({clinic.reviewCount})</small>
            </strong>
          ) : (
            <strong className="new-label">Mới</strong>
          )}
        </div>
        <h3>
          <Link href={`/discover/${clinic.slug}`}>{clinic.name}</Link>
        </h3>
        <p className="clinic-card__service">
          {clinic.services.map((service) => service.name).join(' · ') || 'Nha khoa tổng quát'}
        </p>
        <div className="clinic-card__signals">
          {clinic.aftercareSupported ? (
            <span>
              <Icon name="support" /> Theo dõi sau điều trị
            </span>
          ) : null}
          {clinic.warrantyAvailable ? (
            <span>
              <Icon name="shield" /> Có bảo hành
            </span>
          ) : null}
          {clinic.languages.includes('en') ? (
            <span>
              <Icon name="globe" /> English
            </span>
          ) : null}
        </div>
        <div className="clinic-card__footer">
          <span>
            <small>Chi phí ước tính từ</small>
            <strong>{minimum}</strong>
          </span>
          <Link aria-label={`Xem ${clinic.name}`} href={`/discover/${clinic.slug}`}>
            <Icon name="arrow" />
          </Link>
        </div>
        <button
          aria-pressed={compared}
          className={`compare-toggle${compared ? ' is-active' : ''}`}
          onClick={onCompare}
          type="button"
        >
          <span>{compared ? <Icon name="check" /> : <Icon name="plus" />}</span>
          {compared ? 'Đã thêm vào so sánh' : 'Thêm vào so sánh'}
        </button>
      </div>
    </article>
  );
}

function FilterToggle({
  checked,
  label,
  description,
  icon,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly description: string;
  readonly icon: 'support' | 'shield' | 'globe';
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <label>
      <span className="filter-options__icon">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <i aria-hidden="true" />
    </label>
  );
}
