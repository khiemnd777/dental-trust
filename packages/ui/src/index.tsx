import { useId } from 'react';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  SVGProps,
  TextareaHTMLAttributes,
} from 'react';

export function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export type IconName =
  | 'activity'
  | 'alert'
  | 'arrow'
  | 'calendar'
  | 'check'
  | 'chevron'
  | 'clinic'
  | 'close'
  | 'document'
  | 'download'
  | 'external'
  | 'file'
  | 'filter'
  | 'globe'
  | 'heart'
  | 'home'
  | 'info'
  | 'lock'
  | 'mail'
  | 'menu'
  | 'message'
  | 'passport'
  | 'plus'
  | 'search'
  | 'settings'
  | 'shield'
  | 'sparkle'
  | 'star'
  | 'team'
  | 'upload'
  | 'user'
  | 'wallet';

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const paths: Record<IconName, ReactNode> = {
    activity: (
      <>
        <path d="M3 12h4l2-6 4 12 2-6h6" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.7 2.9 17a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clinic: (
      <>
        <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
        <path d="M9 21v-4h4v4M8 7h5M8 11h5M17 9h3v12H2" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    document: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
      </>
    ),
    external: (
      <>
        <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
      </>
    ),
    filter: <path d="M4 5h16l-6 7v5l-4 2v-7Z" />,
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v11h14V10M9 21v-6h6v6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    message: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    passport: (
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <circle cx="12" cy="10" r="4" />
        <path d="M8 10h8M12 6a6 6 0 0 1 0 8M12 6a6 6 0 0 0 0 8M8 17h8" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4Z" />
        <path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z" />
      </>
    ),
    star: <path d="m12 2 3 6 6.6 1-4.8 4.7 1.1 6.6-5.9-3.1-5.9 3.1 1.1-6.6L2.4 9 9 8Z" />,
    team: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22a8 8 0 0 1 16 0" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12" />
        <path d="M16 12h6v4h-6a2 2 0 0 1 0-4Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cx('dt-button', `dt-button--${variant}`, `dt-button--${size}`, className)}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'verified' | 'attention' | 'danger' | 'info';
}) {
  return (
    <span className={cx('dt-badge', `dt-badge--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('dt-card', className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const id = props.id ?? `${props.name ?? 'field'}-${generatedId}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <label className={cx('dt-field', className)} htmlFor={id}>
      <span className="dt-field__label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <input
        className={cx('dt-input', error && 'dt-input--error')}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        required={required}
        {...props}
      />
      {error ? (
        <span className="dt-field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="dt-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function TextAreaField({
  label,
  hint,
  required,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const generatedId = useId();
  const id = props.id ?? `${props.name ?? 'textarea'}-${generatedId}`;
  return (
    <label className={cx('dt-field', className)} htmlFor={id}>
      <span className="dt-field__label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <textarea
        className="dt-input dt-textarea"
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        required={required}
        {...props}
      />
      {hint ? (
        <span className="dt-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function SelectField({
  label,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  const id = props.id ?? `${props.name ?? 'select'}-${generatedId}`;
  return (
    <label className={cx('dt-field', className)} htmlFor={id}>
      <span className="dt-field__label">{label}</span>
      <span className="dt-select-wrap">
        <select className="dt-input dt-select" id={id} {...props}>
          {children}
        </select>
        <Icon className="dt-select__icon" name="chevron" />
      </span>
    </label>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cx('dt-checkbox', className)}>
      <input type="checkbox" {...props} />
      <span className="dt-checkbox__box">
        <Icon name="check" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(-2)
    .join('')
    .toUpperCase();
  return (
    <span className={cx('dt-avatar', `dt-avatar--${size}`)} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Alert({
  title,
  children,
  tone = 'info',
  className,
}: {
  title: string;
  children?: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  return (
    <div
      className={cx('dt-alert', `dt-alert--${tone}`, className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon
        name={
          tone === 'success' ? 'check' : tone === 'danger' || tone === 'warning' ? 'alert' : 'info'
        }
      />
      <div>
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cx('dt-skeleton', className)} {...props} />;
}

export function EmptyState({
  icon = 'search',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="dt-empty">
      <span className="dt-empty__icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className="dt-progress">
      <div className="dt-progress__meta">
        <span>{label}</span>
        <strong>{bounded}%</strong>
      </div>
      <div className="dt-progress__track">
        <span style={{ width: `${bounded}%` }} />
      </div>
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="dt-sr-only">{children}</span>;
}
