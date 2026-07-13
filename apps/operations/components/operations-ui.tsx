import type { ReactNode } from 'react';

import { OperationsIcon, type OperationsIconName } from './operations-icon';
import { humanize, statusTone } from '@/lib/presentation';

export function OpsMetric({
  icon,
  label,
  value,
  note,
  tone = 'teal',
}: {
  readonly icon: OperationsIconName;
  readonly label: string;
  readonly value: string | number;
  readonly note: string;
  readonly tone?: 'teal' | 'blue' | 'amber' | 'coral';
}) {
  return (
    <article className={`ops-metric ops-metric--${tone}`}>
      <span className="ops-metric__icon">
        <OperationsIcon name={icon} />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

export function OpsStatus({ value, label }: { readonly value: string; readonly label?: string }) {
  const tone = statusTone(value);
  const icon: OperationsIconName =
    tone === 'success'
      ? 'check'
      : tone === 'warning' || tone === 'danger'
        ? 'alert'
        : tone === 'info'
          ? 'clock'
          : 'more';
  return (
    <span className={`ops-status ops-status--${tone}`}>
      <OperationsIcon name={icon} />
      {label ?? productStatusLabel(value)}
    </span>
  );
}

function productStatusLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    HIGH: 'Ưu tiên cao',
    URGENT: 'Khẩn cấp',
    VERIFIED: 'Đã xác minh',
    APPROVED: 'Đã phê duyệt',
    ACTIVE: 'Đang hoạt động',
    PUBLISHED: 'Đã phát hành',
    RESOLVED: 'Đã giải quyết',
    FAILED: 'Thất bại',
    PENDING: 'Đang chờ',
  };
  return labels[value] ?? humanize(value);
}

export function OpsEmpty({
  icon = 'inbox',
  title,
  body,
  action,
}: {
  readonly icon?: OperationsIconName;
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="ops-empty">
      <span>
        <OperationsIcon name={icon} />
      </span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function OpsPanelHeader({
  icon,
  title,
  description,
  action,
}: {
  readonly icon?: OperationsIconName;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <header className="ops-panel-head">
      <div>
        {icon ? (
          <span>
            <OperationsIcon name={icon} />
          </span>
        ) : null}
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}

export function OpsAvatar({
  label,
  tone = 'blue',
}: {
  readonly label: string;
  readonly tone?: 'blue' | 'teal' | 'amber' | 'coral';
}) {
  return <span className={`ops-avatar ops-avatar--${tone}`}>{label}</span>;
}
