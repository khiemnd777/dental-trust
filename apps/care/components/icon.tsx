import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'search'
  | 'journey'
  | 'message'
  | 'user'
  | 'bell'
  | 'calendar'
  | 'chevron'
  | 'heart'
  | 'shield'
  | 'sparkle'
  | 'location'
  | 'clock'
  | 'filter'
  | 'star'
  | 'check'
  | 'arrow'
  | 'plus'
  | 'send'
  | 'lock'
  | 'globe'
  | 'document'
  | 'support'
  | 'close'
  | 'implant'
  | 'crown'
  | 'braces'
  | 'smile'
  | 'help';

export type IconVariant = 'outline' | 'filled';

interface IconProps extends SVGProps<SVGSVGElement> {
  readonly name: IconName;
  readonly variant?: IconVariant;
}

/** Dental Trust Care's optical 24px icon set. */
export function Icon({ name, variant = 'outline', ...props }: IconProps) {
  const filled = variant === 'filled';
  let content: ReactNode;

  if (name === 'home') {
    content = filled ? (
      <>
        <path
          d="M3.25 10.35 12 3.1l8.75 7.25v8.15a2.25 2.25 0 0 1-2.25 2.25h-4.1v-6.2H9.6v6.2H5.5a2.25 2.25 0 0 1-2.25-2.25Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M9.6 20.75v-6.2h4.8v6.2" stroke="white" strokeOpacity=".75" />
      </>
    ) : (
      <>
        <path d="m3.25 10.35 8.75-7.25 8.75 7.25" />
        <path d="M5 9.15V19a1.75 1.75 0 0 0 1.75 1.75h10.5A1.75 1.75 0 0 0 19 19V9.15M9.55 20.75v-6.2h4.9v6.2" />
      </>
    );
  } else if (name === 'search') {
    content = filled ? (
      <>
        <circle cx="10.35" cy="10.35" fill="currentColor" r="7.1" stroke="none" />
        <circle cx="10.35" cy="10.35" r="3.55" stroke="white" strokeOpacity=".78" />
        <path d="m15.7 15.7 5.05 5.05" strokeWidth="2.6" />
      </>
    ) : (
      <>
        <circle cx="10.35" cy="10.35" r="6.85" />
        <path d="m15.55 15.55 5.2 5.2" />
      </>
    );
  } else if (name === 'journey') {
    content = filled ? (
      <>
        <path d="M6.1 18.1c7.4 0 1.2-12.2 11.8-12.2" strokeWidth="2.25" />
        <circle cx="5.7" cy="18.15" fill="currentColor" r="3.25" stroke="none" />
        <circle cx="18.3" cy="5.85" fill="currentColor" r="3.25" stroke="none" />
        <circle cx="5.7" cy="18.15" fill="white" r="1.05" stroke="none" />
        <circle cx="18.3" cy="5.85" fill="white" r="1.05" stroke="none" />
      </>
    ) : (
      <>
        <circle cx="5.7" cy="18.15" r="2.55" />
        <circle cx="18.3" cy="5.85" r="2.55" />
        <path d="M8.25 18.15c7.2 0 1.05-12.3 7.5-12.3" />
      </>
    );
  } else if (name === 'message') {
    content = filled ? (
      <>
        <path
          d="M5.1 3.5h13.8a2.6 2.6 0 0 1 2.6 2.6v9.15a2.6 2.6 0 0 1-2.6 2.6H10l-5.9 3.4.95-3.7A2.6 2.6 0 0 1 2.5 15V6.1a2.6 2.6 0 0 1 2.6-2.6Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M7 9.25h10M7 13h6.4" stroke="white" strokeOpacity=".82" />
      </>
    ) : (
      <>
        <path d="M5.25 4h13.5A2.25 2.25 0 0 1 21 6.25v8.5A2.25 2.25 0 0 1 18.75 17H10l-5.8 3.35L5.05 17A2.25 2.25 0 0 1 3 14.75v-8.5A2.25 2.25 0 0 1 5.25 4Z" />
        <path d="M7.25 9h9.5M7.25 12.75h6" />
      </>
    );
  } else if (name === 'user') {
    content = filled ? (
      <>
        <circle cx="12" cy="7.4" fill="currentColor" r="4.15" stroke="none" />
        <path
          d="M3.4 20.75c.55-4.5 3.65-7.15 8.6-7.15s8.05 2.65 8.6 7.15Z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ) : (
      <>
        <circle cx="12" cy="7.35" r="3.85" />
        <path d="M4.15 20.5c.55-4.5 3.35-7 7.85-7s7.3 2.5 7.85 7" />
      </>
    );
  } else if (name === 'bell') {
    content = (
      <>
        <path d="M5.25 17.25h13.5l-1.65-2.2v-4.2a5.1 5.1 0 0 0-10.2 0v4.2Z" />
        <path d="M9.75 20.1c.55.55 1.3.85 2.25.85s1.7-.3 2.25-.85M12 3.2v1.6" />
      </>
    );
  } else if (name === 'calendar') {
    content = (
      <>
        <rect height="16.25" rx="2.35" width="18" x="3" y="4.75" />
        <path d="M7.75 2.75v4M16.25 2.75v4M3 9.4h18" />
        <path d="M7.25 13h.01M12 13h.01M16.75 13h.01M7.25 17h.01M12 17h.01" strokeWidth="2.4" />
      </>
    );
  } else if (name === 'chevron') {
    content = <path d="m9.25 4.75 7.25 7.25-7.25 7.25" />;
  } else if (name === 'heart') {
    content = (
      <path d="M20.75 8.95c0 5.05-8.75 10.35-8.75 10.35S3.25 14 3.25 8.95A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.75 2.45Z" />
    );
  } else if (name === 'shield') {
    content = (
      <>
        <path d="M12 2.75 20.25 6v5.05c0 5.25-3.5 8.7-8.25 10.3-4.75-1.6-8.25-5.05-8.25-10.3V6Z" />
        <path d="m8.2 12 2.45 2.45 5.25-5.4" />
      </>
    );
  } else if (name === 'sparkle') {
    content = (
      <>
        <path d="M11.25 2.5c.75 5.25 2.2 6.7 7.45 7.45-5.25.75-6.7 2.2-7.45 7.45-.75-5.25-2.2-6.7-7.45-7.45 5.25-.75 6.7-2.2 7.45-7.45Z" />
        <path d="M19.1 16.2c.25 2.1.8 2.65 2.9 2.9-2.1.25-2.65.8-2.9 2.9-.25-2.1-.8-2.65-2.9-2.9 2.1-.25 2.65-.8 2.9-2.9Z" />
      </>
    );
  } else if (name === 'location') {
    content = (
      <>
        <path d="M20 9.75c0 5.2-8 11.5-8 11.5s-8-6.3-8-11.5a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="9.75" r="2.65" />
      </>
    );
  } else if (name === 'clock') {
    content = (
      <>
        <circle cx="12" cy="12" r="9.25" />
        <path d="M12 6.75v5.6l3.65 2.15" />
      </>
    );
  } else if (name === 'filter') {
    content = (
      <>
        <path d="M4 6.25h16M4 12h16M4 17.75h16" />
        <circle cx="8" cy="6.25" fill="currentColor" r="1.65" stroke="white" strokeWidth="1.1" />
        <circle cx="15.5" cy="12" fill="currentColor" r="1.65" stroke="white" strokeWidth="1.1" />
        <circle
          cx="10.5"
          cy="17.75"
          fill="currentColor"
          r="1.65"
          stroke="white"
          strokeWidth="1.1"
        />
      </>
    );
  } else if (name === 'star') {
    content = (
      <path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.45 1.05 6.25-5.6-2.95-5.6 2.95 1.05-6.25L2.9 9.4l6.3-.9Z" />
    );
  } else if (name === 'check') {
    content = <path d="m4.75 12.35 4.35 4.35 10.15-9.9" />;
  } else if (name === 'arrow') {
    content = <path d="M3.75 12h16.5M14.4 6.15 20.25 12l-5.85 5.85" />;
  } else if (name === 'plus') {
    content = <path d="M12 4.25v15.5M4.25 12h15.5" />;
  } else if (name === 'send') {
    content = (
      <>
        <path d="m3 10.65 18.2-7.8-7.8 18.2-2.25-7.95Z" />
        <path d="m11.15 13.1 10.05-10.25" />
      </>
    );
  } else if (name === 'lock') {
    content = (
      <>
        <rect height="11" rx="2.25" width="16.5" x="3.75" y="10.1" />
        <path d="M7.8 10.1V7.25a4.2 4.2 0 0 1 8.4 0v2.85M12 14.5v2.4" />
      </>
    );
  } else if (name === 'globe') {
    content = (
      <>
        <circle cx="12" cy="12" r="9.25" />
        <path d="M2.75 12h18.5M12 2.75c3.1 3.1 3.1 15.4 0 18.5M12 2.75c-3.1 3.1-3.1 15.4 0 18.5" />
      </>
    );
  } else if (name === 'document') {
    content = (
      <>
        <path d="M5.5 2.75h9l4 4v14.5h-13Z" />
        <path d="M14.5 2.75V7h4M8.75 12h6.5M8.75 16h6.5" />
      </>
    );
  } else if (name === 'support') {
    content = (
      <>
        <circle cx="12" cy="12" r="9.25" />
        <path d="M7.8 14.85c1.3 1.25 2.7 1.85 4.2 1.85s2.9-.6 4.2-1.85" />
        <path d="M8.3 9.2h.01M15.7 9.2h.01" strokeWidth="2.5" />
      </>
    );
  } else if (name === 'implant') {
    content = (
      <>
        <path d="M8.35 3.25h7.3l-.75 3.5H9.1ZM9.55 6.75h4.9l1.1 2.3-1.05 10.1L12 21.25l-2.5-2.1-1.05-10.1Z" />
        <path d="M8.8 9.3h6.4M9.2 12.4h5.6M9.55 15.5h4.9M10 18.55h4" />
      </>
    );
  } else if (name === 'crown') {
    content = (
      <>
        <path d="M5.25 7.1c1.5-3.35 4.05-4.35 6.75-2.1 2.7-2.25 5.25-1.25 6.75 2.1.85 1.95-.45 4.2-1.1 6.1-.85 2.45-.7 5.2-2.3 7.05-.9 1.05-2.05.4-2.25-.7L12 15.1l-1.1 4.45c-.2 1.1-1.35 1.75-2.25.7-1.6-1.85-1.45-4.6-2.3-7.05-.65-1.9-1.95-4.15-1.1-6.1Z" />
        <path d="M7 8.85c3.25 1.25 6.75 1.25 10 0" />
      </>
    );
  } else if (name === 'braces') {
    content = (
      <>
        <path d="M3.25 11.75c2.45 5.45 15.05 5.45 17.5 0M4.15 8.7c3.1-3.25 12.6-3.25 15.7 0" />
        <rect height="4.2" rx=".7" width="3.5" x="5" y="9.35" />
        <rect height="4.2" rx=".7" width="3.5" x="10.25" y="10.15" />
        <rect height="4.2" rx=".7" width="3.5" x="15.5" y="9.35" />
        <path d="M3.9 11.45h16.2" />
      </>
    );
  } else if (name === 'smile') {
    content = (
      <>
        <path d="M3.2 10.2C5.55 6.75 8.5 5.05 12 5.05s6.45 1.7 8.8 5.15C18.45 15.45 15.55 18 12 18s-6.45-2.55-8.8-7.8Z" />
        <path d="M4.1 10.2c4.55 2.2 11.25 2.2 15.8 0M8.15 11.55l.35 3.8M12 12v4.2M15.85 11.55l-.35 3.8" />
      </>
    );
  } else if (name === 'help') {
    content = (
      <>
        <circle cx="12" cy="12" r="9.25" />
        <path
          d="M9.35 9a2.85 2.85 0 1 1 4.15 2.55c-1.05.55-1.5 1.05-1.5 2.2M12 17.55h.01"
          strokeWidth="2.05"
        />
      </>
    );
  } else {
    content = <path d="M5.25 5.25 18.75 18.75M18.75 5.25 5.25 18.75" />;
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
