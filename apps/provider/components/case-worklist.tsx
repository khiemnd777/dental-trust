'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { CustomSelect } from '@dental-trust/ui';
import type {
  ClinicDentistView,
  ClinicOpportunityView,
  DentalCaseView,
} from '@dental-trust/contracts';
import { ProviderIcon } from '@/components/provider-icon';
import { formatDate, initials, labelStatus, toneForStatus } from '@/lib/presentation';

type WorklistFilter = 'all' | 'action' | 'active' | 'aftercare' | 'closed';

export function CaseWorklist({
  cases,
  opportunities,
  dentists,
}: {
  readonly cases: readonly DentalCaseView[];
  readonly opportunities: readonly ClinicOpportunityView[];
  readonly dentists: readonly ClinicDentistView[];
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WorklistFilter>('all');
  const [sort, setSort] = useState<'updated' | 'arrival' | 'status'>('updated');
  const opportunityByCase = useMemo(
    () => new Map(opportunities.map((item) => [item.caseId, item])),
    [opportunities],
  );
  const dentistById = useMemo(() => new Map(dentists.map((item) => [item.id, item])), [dentists]);
  const counts = useMemo(
    () => ({
      all: cases.length,
      action: cases.filter((item) => needsAction(item.status, opportunityByCase.get(item.id)))
        .length,
      active: cases.filter((item) => !['CLOSED', 'CANCELLED'].includes(item.status)).length,
      aftercare: cases.filter((item) =>
        ['AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE'].includes(item.status),
      ).length,
      closed: cases.filter((item) => ['CLOSED', 'CANCELLED'].includes(item.status)).length,
    }),
    [cases, opportunityByCase],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    return cases
      .filter((item) => {
        if (!normalized) return true;
        return [item.caseNumber, item.title, item.desiredProcedureCode, item.preferredLocation]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('vi-VN').includes(normalized));
      })
      .filter((item) => {
        if (filter === 'all') return true;
        if (filter === 'action') return needsAction(item.status, opportunityByCase.get(item.id));
        if (filter === 'active') return !['CLOSED', 'CANCELLED'].includes(item.status);
        if (filter === 'aftercare')
          return ['AFTERCARE_ACTIVE', 'WARRANTY_CASE_ACTIVE'].includes(item.status);
        return ['CLOSED', 'CANCELLED'].includes(item.status);
      })
      .toSorted((left, right) => {
        if (sort === 'arrival')
          return (left.expectedArrivalDate ?? '9999').localeCompare(
            right.expectedArrivalDate ?? '9999',
          );
        if (sort === 'status') return left.status.localeCompare(right.status);
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [cases, filter, opportunityByCase, query, sort]);

  return (
    <>
      <section className="provider-case-summary" aria-label="Tổng quan hồ sơ">
        <Summary value={counts.active} label="Đang hoạt động" />
        <Summary value={counts.action} label="Cần xử lý" tone="urgent" />
        <Summary
          value={opportunities.filter((item) => item.status === 'ASSIGNED').length}
          label="Chờ tiếp nhận"
          tone="attention"
        />
        <Summary value={counts.aftercare} label="Hậu mãi & bảo hành" tone="success" />
      </section>

      <section className="provider-panel provider-records-panel">
        <header className="provider-records-toolbar">
          <label>
            <ProviderIcon name="search" />
            <input
              aria-label="Tìm hồ sơ"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm mã hồ sơ, điều trị hoặc địa điểm…"
              value={query}
            />
            {query ? (
              <button aria-label="Xóa tìm kiếm" onClick={() => setQuery('')} type="button">
                ×
              </button>
            ) : null}
          </label>
          <label className="provider-filter-select">
            <ProviderIcon name="filter" />
            <span className="provider-sr-only">Sắp xếp hồ sơ</span>
            <CustomSelect
              aria-label="Sắp xếp hồ sơ"
              onChange={(event) => setSort(event.target.value as typeof sort)}
              value={sort}
              variant="compact"
            >
              <option value="updated">Mới cập nhật</option>
              <option value="arrival">Ngày đến Việt Nam</option>
              <option value="status">Trạng thái</option>
            </CustomSelect>
          </label>
        </header>

        <div aria-label="Lọc nhanh hồ sơ" className="provider-segmented" role="group">
          {(
            [
              ['all', 'Tất cả'],
              ['action', 'Cần xử lý'],
              ['active', 'Đang hoạt động'],
              ['aftercare', 'Hậu mãi'],
              ['closed', 'Đã đóng'],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={filter === value}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label} <b>{counts[value]}</b>
            </button>
          ))}
        </div>

        <div className="provider-records-head" aria-hidden="true">
          <span>Hồ sơ</span>
          <span>Điều trị</span>
          <span>Trạng thái</span>
          <span>Cập nhật</span>
          <span />
        </div>
        <div className="provider-records-list">
          {filtered.length ? (
            filtered.map((item) => {
              const opportunity = opportunityByCase.get(item.id);
              const assignedDentist = opportunity?.assignedDentistId
                ? dentistById.get(opportunity.assignedDentistId)
                : null;
              const tone = toneForStatus(opportunity?.status ?? item.status);
              return (
                <Link className="provider-record-row" href={`/cases/${item.id}`} key={item.id}>
                  <span className={`provider-avatar provider-avatar--${tone}`}>
                    {initials(item.title)}
                  </span>
                  <span className="provider-record-patient">
                    <strong>{item.title}</strong>
                    <small>
                      {item.caseNumber} · {assignedDentist?.fullName ?? 'Chưa phân công nha sĩ'}
                    </small>
                  </span>
                  <span className="provider-record-procedure">
                    {item.desiredProcedureCode.replaceAll('_', ' ')}
                    <small>{item.preferredLocation ?? 'Chưa chọn địa điểm'}</small>
                  </span>
                  <span>
                    <b className={`provider-status provider-status--${tone}`}>
                      {labelStatus(opportunity?.status ?? item.status)}
                    </b>
                  </span>
                  <time>{formatDate(item.updatedAt, { year: undefined })}</time>
                  <ProviderIcon name="chevron" />
                </Link>
              );
            })
          ) : (
            <div className="provider-empty-state">
              <span>
                <ProviderIcon name="search" />
              </span>
              <strong>Không tìm thấy hồ sơ phù hợp</strong>
              <p>Thử thay đổi từ khóa hoặc bộ lọc đang chọn.</p>
              <button
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                type="button"
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
        </div>
        <footer className="provider-table-footer">
          <span>Hiển thị {filtered.length} hồ sơ trong phạm vi tổ chức hiện tại</span>
          <span>
            <ProviderIcon name="shield" /> Dữ liệu giới hạn theo phân công
          </span>
        </footer>
      </section>
    </>
  );
}

function Summary({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <span className={tone ? `is-${tone}` : undefined}>
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}

function needsAction(status: string, opportunity?: ClinicOpportunityView): boolean {
  return (
    opportunity?.status === 'ASSIGNED' ||
    [
      'INTAKE_REVIEW',
      'ADDITIONAL_INFORMATION_REQUESTED',
      'TREATMENT_PLANS_PENDING',
      'WARRANTY_CASE_ACTIVE',
    ].includes(status)
  );
}
