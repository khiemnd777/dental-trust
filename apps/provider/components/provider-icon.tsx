import type { ReactNode, SVGProps } from 'react';

export type ProviderIconName =
  | 'brand'
  | 'home'
  | 'cases'
  | 'calendar'
  | 'message'
  | 'clinic'
  | 'bell'
  | 'chevron'
  | 'plus'
  | 'search'
  | 'filter'
  | 'clock'
  | 'alert'
  | 'video'
  | 'aftercare'
  | 'arrow'
  | 'users'
  | 'location'
  | 'services'
  | 'shield'
  | 'more'
  | 'trend'
  | 'document'
  | 'check'
  | 'building'
  | 'settings'
  | 'logout'
  | 'sparkle';

export function ProviderIcon({
  name,
  variant = 'outline',
  ...props
}: {
  readonly name: ProviderIconName;
  readonly variant?: 'outline' | 'filled';
} & SVGProps<SVGSVGElement>) {
  const filled = variant === 'filled';
  let content: ReactNode;

  if (name === 'brand') {
    content = (
      <>
        <path d="M7.4 3.25c1.8-1.05 3.35-.55 4.6.75 1.25-1.3 2.8-1.8 4.6-.75 2.25 1.35 1.75 4.15.95 6.35-.65 1.8-.5 4.35-1.85 6.95-1.05 2.05-2.45 1.35-2.65-.3L12 11.9l-1.05 4.35c-.2 1.65-1.6 2.35-2.65.3-1.35-2.6-1.2-5.15-1.85-6.95-.8-2.2-1.3-5 .95-6.35Z" />
        <path d="M17.7 14.6v6.15M14.65 17.7h6.1" strokeWidth="2" />
      </>
    );
  } else if (name === 'home') {
    content = filled ? (
      <path
        d="M3.25 10.4 12 3.1l8.75 7.3v8.1a2.25 2.25 0 0 1-2.25 2.25h-4.1V14.5H9.6v6.25H5.5a2.25 2.25 0 0 1-2.25-2.25Z"
        fill="currentColor"
        stroke="none"
      />
    ) : (
      <>
        <path d="m3.25 10.4 8.75-7.3 8.75 7.3" />
        <path d="M5 9.2V19a1.75 1.75 0 0 0 1.75 1.75h10.5A1.75 1.75 0 0 0 19 19V9.2M9.55 20.75V14.5h4.9v6.25" />
      </>
    );
  } else if (name === 'cases') {
    content = filled ? (
      <>
        <rect fill="currentColor" height="18" rx="2.3" stroke="none" width="16" x="4" y="3.5" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke="white" strokeOpacity=".82" />
      </>
    ) : (
      <>
        <rect height="18" rx="2.3" width="16" x="4" y="3.5" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    );
  } else if (name === 'calendar') {
    content = filled ? (
      <>
        <rect fill="currentColor" height="17" rx="2.4" stroke="none" width="18" x="3" y="4.5" />
        <path d="M3 9.25h18M8 2.75v4M16 2.75v4" stroke="white" strokeOpacity=".85" />
        <path
          d="M7.2 13h.01M12 13h.01M16.8 13h.01M7.2 17h.01M12 17h.01"
          stroke="white"
          strokeWidth="2.3"
        />
      </>
    ) : (
      <>
        <rect height="17" rx="2.4" width="18" x="3" y="4.5" />
        <path d="M8 2.75v4M16 2.75v4M3 9.25h18M7.2 13h.01M12 13h.01M16.8 13h.01M7.2 17h.01M12 17h.01" />
      </>
    );
  } else if (name === 'message') {
    content = filled ? (
      <path
        d="M5 3.5h14a2.5 2.5 0 0 1 2.5 2.5v9.1a2.5 2.5 0 0 1-2.5 2.5h-9l-5.9 3.65.95-3.95A2.5 2.5 0 0 1 2.5 15V6A2.5 2.5 0 0 1 5 3.5Z"
        fill="currentColor"
        stroke="none"
      />
    ) : (
      <path d="M5 3.75h14a2.25 2.25 0 0 1 2.25 2.25v8.75A2.25 2.25 0 0 1 19 17h-9l-5.75 3.5L5.1 17A2.25 2.25 0 0 1 2.75 14.75V6A2.25 2.25 0 0 1 5 3.75Z" />
    );
  } else if (name === 'clinic' || name === 'building') {
    content =
      filled && name === 'clinic' ? (
        <path
          d="M4 21V7.5L12 3l8 4.5V21h-5.25v-6.25h-5.5V21ZM9.5 8.1v2h1.5v1.5h2V10.1h1.5V8.1H13V6.6h-2v1.5Z"
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
        />
      ) : (
        <>
          <path d="M4 21V7.5L12 3l8 4.5V21M8 21v-6.25h8V21" />
          <path d="M12 6.5v5M9.5 9h5" />
        </>
      );
  } else if (name === 'bell') {
    content = (
      <>
        <path d="M5.25 17.25h13.5l-1.65-2.2v-4.2a5.1 5.1 0 0 0-10.2 0v4.2Z" />
        <path d="M9.75 20.1c.55.55 1.3.85 2.25.85s1.7-.3 2.25-.85M12 3.2v1.6" />
      </>
    );
  } else if (name === 'chevron') {
    content = <path d="m9.25 4.75 7.25 7.25-7.25 7.25" />;
  } else if (name === 'plus') {
    content = <path d="M12 4.25v15.5M4.25 12h15.5" />;
  } else if (name === 'search') {
    content = (
      <>
        <circle cx="10.35" cy="10.35" r="6.85" />
        <path d="m15.55 15.55 5.2 5.2" />
      </>
    );
  } else if (name === 'filter') {
    content = (
      <>
        <path d="M4 6.25h16M4 12h16M4 17.75h16" />
        <circle cx="8" cy="6.25" fill="currentColor" r="1.55" stroke="white" strokeWidth="1" />
        <circle cx="15.5" cy="12" fill="currentColor" r="1.55" stroke="white" strokeWidth="1" />
        <circle cx="10.5" cy="17.75" fill="currentColor" r="1.55" stroke="white" strokeWidth="1" />
      </>
    );
  } else if (name === 'clock') {
    content = (
      <>
        <circle cx="12" cy="12" r="9.25" />
        <path d="M12 6.75v5.6l3.65 2.15" />
      </>
    );
  } else if (name === 'alert') {
    content = (
      <>
        <path d="M10.1 4.25 2.9 17a2 2 0 0 0 1.75 3h14.7a2 2 0 0 0 1.75-3L13.9 4.25a2.2 2.2 0 0 0-3.8 0Z" />
        <path d="M12 8.4v5.1M12 17.1h.01" strokeWidth="2.2" />
      </>
    );
  } else if (name === 'video') {
    content = (
      <>
        <rect height="13.5" rx="2.3" width="14" x="2.75" y="5.25" />
        <path d="m16.75 9.3 4.5-2.3v10l-4.5-2.3Z" />
      </>
    );
  } else if (name === 'aftercare') {
    content = (
      <>
        <path d="M12 20.5S4 16.1 4 9.4A4.4 4.4 0 0 1 12 6.8a4.4 4.4 0 0 1 8 2.6c0 6.7-8 11.1-8 11.1Z" />
        <path d="M7.4 12h2.3l1.1-2.35 2.15 5 1.2-2.65h2.45" />
      </>
    );
  } else if (name === 'arrow') {
    content = <path d="M3.75 12h16.5M14.4 6.15 20.25 12l-5.85 5.85" />;
  } else if (name === 'users') {
    content = (
      <>
        <circle cx="9" cy="8" r="3.25" />
        <path d="M2.75 20c.45-4 2.7-6.1 6.25-6.1s5.8 2.1 6.25 6.1M15.1 5.3a3.2 3.2 0 0 1 0 5.4M16.1 14c3 .2 4.75 2.15 5.15 5.55" />
      </>
    );
  } else if (name === 'location') {
    content = (
      <>
        <path d="M20 9.75c0 5.2-8 11.5-8 11.5s-8-6.3-8-11.5a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="9.75" r="2.65" />
      </>
    );
  } else if (name === 'services') {
    content = (
      <>
        <rect height="7" rx="1.5" width="7" x="3" y="3" />
        <rect height="7" rx="1.5" width="7" x="14" y="3" />
        <rect height="7" rx="1.5" width="7" x="3" y="14" />
        <rect height="7" rx="1.5" width="7" x="14" y="14" />
      </>
    );
  } else if (name === 'shield') {
    content = (
      <>
        <path d="M12 2.75 20.25 6v5.05c0 5.25-3.5 8.7-8.25 10.3-4.75-1.6-8.25-5.05-8.25-10.3V6Z" />
        <path d="m8.2 12 2.45 2.45 5.25-5.4" />
      </>
    );
  } else if (name === 'more') {
    content = <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />;
  } else if (name === 'trend') {
    content = (
      <>
        <path d="m3.5 17 5.2-5.2 3.6 3.6 7.9-8" />
        <path d="M14.9 7.4h5.3v5.3" />
      </>
    );
  } else if (name === 'document') {
    content = (
      <>
        <path d="M5.5 2.75h9l4 4v14.5h-13Z" />
        <path d="M14.5 2.75V7h4M8.75 12h6.5M8.75 16h6.5" />
      </>
    );
  } else if (name === 'check') {
    content = <path d="m4.75 12.35 4.35 4.35 10.15-9.9" />;
  } else if (name === 'settings') {
    content = (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .35 1.9l.05.05-2.85 2.85-.05-.05a1.7 1.7 0 0 0-1.9-.35 1.7 1.7 0 0 0-1 1.55V21h-4v-.05a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.9.35l-.05.05-2.85-2.85.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.35-1.9L4.2 7.05 7.05 4.2l.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.05A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.9-.35l.05-.05 2.85 2.85-.05.05A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21v4h-.05a1.7 1.7 0 0 0-1.55 1Z" />
      </>
    );
  } else if (name === 'logout') {
    content = (
      <>
        <path d="M10 4.25H5.75A1.75 1.75 0 0 0 4 6v12a1.75 1.75 0 0 0 1.75 1.75H10" />
        <path d="M14.5 7.25 19.25 12l-4.75 4.75M8.5 12h10.25" />
      </>
    );
  } else {
    content = (
      <>
        <path d="M11.25 2.5c.75 5.25 2.2 6.7 7.45 7.45-5.25.75-6.7 2.2-7.45 7.45-.75-5.25-2.2-6.7-7.45-7.45 5.25-.75 6.7-2.2 7.45-7.45Z" />
        <path d="M19.1 16.2c.25 2.1.8 2.65 2.9 2.9-2.1.25-2.65.8-2.9 2.9-.25-2.1-.8-2.65-2.9-2.9 2.1-.25 2.65-.8 2.9-2.9Z" />
      </>
    );
  }

  return (
    <svg
      aria-hidden="true"
      data-icon={name}
      data-variant={variant}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      {...props}
    >
      {content}
    </svg>
  );
}
