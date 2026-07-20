'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { CustomSelect } from '@dental-trust/ui';
import { Icon, type IconName } from '@/components/icon';
import type { ClinicOption, SavedClinic } from '@/lib/care-data';
import { careMutation, careMutationErrorMessage } from '@/lib/client-mutation';
import { clinicTrustSignalCount, clinicTrustSignals } from '@/lib/clinic-map';
import { formatMoney } from '@/lib/presentation';

import styles from './discovery-surfaces.module.css';

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
  readonly locationLabel: string;
}

export function Discovery({ clinics, initialSaved, locationLabel }: DiscoveryProps) {
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
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterSheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const sheet = filterSheetRef.current;
    const focusable = () =>
      Array.from(
        sheet?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFilterOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      filterTriggerRef.current?.focus();
    };
  }, [filterOpen]);

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
      const result = await careMutation<{ readonly id?: string }>('/api/care/saved-clinics', {
        method: existing ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(existing ? { savedClinicId: existing.id } : { clinicId: clinic.id }),
      });
      if (!result.ok) {
        setSaved(previous);
        setFeedback(careMutationErrorMessage(result.error, 'Chưa thể cập nhật. Vui lòng thử lại.'));
        return;
      }
      if (!existing) {
        const savedId = result.data.id;
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
    <main className={`care-main ${styles.discoveryPage}`}>
      <header className={styles.discoveryIntro}>
        <div>
          <h1>Tìm nha khoa</h1>
        </div>
        <nav aria-label="Cách xem kết quả" className={styles.viewSwitch}>
          <span aria-current="page">
            <Icon name="search" /> Danh sách
          </span>
          <Link href="/discover/map">
            <Icon name="location" /> Bản đồ
          </Link>
        </nav>
      </header>

      <div className={styles.searchBar}>
        <Icon name="search" />
        <input
          aria-label="Tìm phòng khám hoặc dịch vụ"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Phòng khám, dịch vụ, khu vực…"
          type="search"
          value={query}
        />
        <button
          aria-controls="care-filter-sheet"
          aria-expanded={filterOpen}
          aria-label="Mở bộ lọc"
          className={styles.filterButton}
          onClick={() => setFilterOpen(true)}
          ref={filterTriggerRef}
          type="button"
        >
          <Icon name="filter" />
          <span>Bộ lọc</span>
          {activeFilters > 0 ? <strong>{activeFilters}</strong> : null}
        </button>
      </div>

      <section aria-labelledby="treatment-heading" className={styles.treatmentPicker}>
        <div className={styles.sectionHeading}>
          <h2 id="treatment-heading">Bạn quan tâm gì?</h2>
        </div>
        <div aria-label="Nhu cầu điều trị" className={styles.treatmentList} role="group">
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

      <section aria-labelledby="discover-results" className={styles.clinicResults}>
        <div className={styles.resultsHeading}>
          <div>
            <h2 id="discover-results">{results.length} lựa chọn</h2>
            <small>{locationLabel}</small>
          </div>
          <CustomSelect
            align="end"
            aria-label="Sắp xếp kết quả"
            className={styles.sortControl}
            menuLabel="Sắp xếp kết quả"
            onChange={(event) => setSort(event.target.value as typeof sort)}
            value={sort}
            variant="pill"
          >
            <option value="recommended">Đề xuất</option>
            <option value="rating">Đánh giá cao nhất</option>
            <option value="price">Giá thấp trước</option>
          </CustomSelect>
        </div>

        <div className={styles.clinicGrid}>
          {results.map((clinic) => (
            <ClinicCard
              clinic={clinic}
              compared={compare.includes(clinic.id)}
              key={clinic.id}
              onCompare={() => toggleCompare(clinic.id)}
              onSave={() => toggleSaved(clinic)}
              pending={isPending}
              saved={saved.some((item) => item.clinicId === clinic.id)}
            />
          ))}
        </div>

        {results.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <Icon name="search" />
            </span>
            <h3>Chưa thấy lựa chọn phù hợp</h3>
            <p>Thử bỏ bớt bộ lọc hoặc chọn “Tất cả”.</p>
            <button
              className={styles.secondaryButton}
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
        <aside className={styles.compareTray} aria-label="Danh sách so sánh">
          <span className={styles.compareStack} aria-hidden="true">
            {compare.map((id, index) => (
              <i key={id} style={{ transform: `translateX(${index * 13}px)` }} />
            ))}
          </span>
          <span className={styles.compareSummary}>
            <strong>{compare.length}/3 đã chọn</strong>
          </span>
          <Link href={`/compare?ids=${compare.join(',')}`}>
            So sánh <Icon name="arrow" />
          </Link>
        </aside>
      ) : null}

      {feedback ? (
        <div aria-live="polite" className={styles.toast} role="status">
          <Icon name="check" /> {feedback}
          <button aria-label="Đóng thông báo" onClick={() => setFeedback('')} type="button">
            <Icon name="close" />
          </button>
        </div>
      ) : null}

      {filterOpen ? (
        <div
          className={styles.sheetBackdrop}
          onMouseDown={() => setFilterOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="filter-title"
            aria-modal="true"
            className={styles.filterSheet}
            id="care-filter-sheet"
            onMouseDown={(event) => event.stopPropagation()}
            ref={filterSheetRef}
            role="dialog"
          >
            <div className={styles.sheetHandle} />
            <header>
              <div>
                <h2 id="filter-title">Bộ lọc</h2>
              </div>
              <button aria-label="Đóng bộ lọc" onClick={() => setFilterOpen(false)} type="button">
                <Icon name="close" />
              </button>
            </header>
            <div className={styles.filterOptions}>
              <FilterToggle
                checked={aftercareOnly}
                icon="support"
                label="Hỗ trợ sau điều trị"
                onChange={setAftercareOnly}
              />
              <FilterToggle
                checked={warrantyOnly}
                icon="shield"
                label="Có bảo hành"
                onChange={setWarrantyOnly}
              />
              <FilterToggle
                checked={englishOnly}
                icon="globe"
                label="Hỗ trợ English"
                onChange={setEnglishOnly}
              />
            </div>
            <div className={styles.sheetActions}>
              <button
                className={styles.textButton}
                onClick={() => {
                  setAftercareOnly(false);
                  setWarrantyOnly(false);
                  setEnglishOnly(false);
                }}
                type="button"
              >
                Đặt lại
              </button>
              <button
                className={styles.primaryButton}
                onClick={() => setFilterOpen(false)}
                type="button"
              >
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
  onSave,
  onCompare,
}: {
  readonly clinic: ClinicOption;
  readonly saved: boolean;
  readonly compared: boolean;
  readonly pending: boolean;
  readonly onSave: () => void;
  readonly onCompare: () => void;
}) {
  const minimum = clinic.estimatedPrice
    ? formatMoney(clinic.estimatedPrice.minimumMinor, clinic.estimatedPrice.currency)
    : 'Theo tư vấn';
  const trustSignals = clinicTrustSignals(clinic.evidence);
  const recordedTrustCount = trustSignals.filter(({ verified }) => verified).length;
  const verificationDate = formatVerificationDate(clinic.verificationDate);
  const statusLabel = verificationStatusLabel(clinic.verificationStatus);
  const initial = clinic.name.trim().charAt(0).toLocaleUpperCase('vi') || '+';
  return (
    <article className={styles.clinicCard}>
      <div className={styles.clinicCardHeader}>
        <span aria-hidden="true" className={styles.clinicMark}>
          {initial}
        </span>
        <div>
          <p>
            <Icon name="location" /> {clinic.locationLabel}
          </p>
          <h3>
            <Link href={`/discover/${clinic.slug}`}>{clinic.name}</Link>
          </h3>
        </div>
        <button
          aria-label={saved ? `Bỏ lưu ${clinic.name}` : `Lưu ${clinic.name}`}
          aria-pressed={saved}
          className={`${styles.saveAction}${saved ? ` ${styles.saved}` : ''}`}
          disabled={pending}
          onClick={onSave}
          type="button"
        >
          <Icon name="heart" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className={styles.trustPanel}>
        <div className={styles.trustPanelHeading}>
          <span>
            <Icon name="shield" /> {statusLabel}
          </span>
          <small>
            {recordedTrustCount}/{clinicTrustSignalCount} bằng chứng
            {verificationDate ? ` · ${verificationDate}` : ''}
          </small>
        </div>
      </div>

      <div className={styles.clinicCardBody}>
        <div className={styles.ratingRow}>
          {clinic.rating ? (
            <strong>
              <Icon name="star" fill="currentColor" /> {clinic.rating}
              <span>{clinic.reviewCount} đánh giá</span>
            </strong>
          ) : (
            <span>Chưa có đánh giá</span>
          )}
        </div>

        <div aria-label="Dịch vụ" className={styles.serviceChips}>
          {clinic.services.length ? (
            clinic.services
              .slice(0, 3)
              .map((service) => <span key={service.code}>{service.name}</span>)
          ) : (
            <span>Nha khoa tổng quát</span>
          )}
          {clinic.services.length > 3 ? <span>+{clinic.services.length - 3}</span> : null}
        </div>

        <div className={styles.careSignals}>
          {clinic.aftercareSupported ? (
            <span>
              <Icon name="support" /> Sau điều trị
            </span>
          ) : null}
          {clinic.languages.length ? (
            <span>
              <Icon name="globe" /> {formatLanguages(clinic.languages)}
            </span>
          ) : null}
        </div>

        <div className={styles.clinicCardFooter}>
          <span>
            <small>Chi phí từ</small>
            <strong>{minimum}</strong>
          </span>
          <Link aria-label={`Xem chi tiết ${clinic.name}`} href={`/discover/${clinic.slug}`}>
            Xem chi tiết <Icon name="arrow" />
          </Link>
        </div>
        <button
          aria-pressed={compared}
          className={`${styles.compareToggle}${compared ? ` ${styles.compareActive}` : ''}`}
          onClick={onCompare}
          type="button"
        >
          <span>{compared ? <Icon name="check" /> : <Icon name="plus" />}</span>
          {compared ? 'Đã chọn' : 'So sánh'}
        </button>
      </div>
    </article>
  );
}

function FilterToggle({
  checked,
  label,
  icon,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly icon: 'support' | 'shield' | 'globe';
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <label className={styles.filterOption}>
      <span className={styles.filterIcon}>
        <Icon name={icon} />
      </span>
      <span className={styles.filterCopy}>
        <strong>{label}</strong>
      </span>
      <input
        className={styles.filterCheckbox}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <i aria-hidden="true" className={styles.filterSwitch} />
    </label>
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
