export type OperationsIconName =
  | 'brand'
  | 'dashboard'
  | 'coordination'
  | 'verification'
  | 'administration'
  | 'search'
  | 'bell'
  | 'shield'
  | 'chevron'
  | 'logout'
  | 'menu'
  | 'command'
  | 'clock'
  | 'alert'
  | 'trend'
  | 'users'
  | 'organization'
  | 'jobs'
  | 'audit'
  | 'filter'
  | 'arrow'
  | 'close'
  | 'check'
  | 'more'
  | 'refresh'
  | 'document'
  | 'calendar'
  | 'sparkle'
  | 'inbox'
  | 'lock';

export function OperationsIcon({ name }: { readonly name: OperationsIconName }) {
  const common = {
    'aria-hidden': true,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  };
  if (name === 'brand')
    return (
      <svg {...common} viewBox="0 0 32 32">
        <path d="M9.5 6.5c2.2 0 3.6 1.5 6.5 1.5s4.3-1.5 6.5-1.5c2.5 0 4 2.1 3.5 5.4-.7 4.5-3.2 5.6-4.1 11.8-.3 1.8-1.2 2.8-2.4 2.8-2.2 0-1.7-5.8-3.5-5.8s-1.3 5.8-3.5 5.8c-1.2 0-2.1-1-2.4-2.8C9.2 17.5 6.7 16.4 6 11.9c-.5-3.3 1-5.4 3.5-5.4Z" />
        <path d="m19.5 13.5 2 2 4-4" />
      </svg>
    );
  if (name === 'dashboard')
    return (
      <svg {...common}>
        <rect height="7" rx="1.5" width="7" x="3" y="3" />
        <rect height="7" rx="1.5" width="7" x="14" y="3" />
        <rect height="7" rx="1.5" width="7" x="3" y="14" />
        <rect height="7" rx="1.5" width="7" x="14" y="14" />
      </svg>
    );
  if (name === 'coordination')
    return (
      <svg {...common}>
        <path d="M5 5h14M5 12h9M5 19h7" />
        <circle cx="18" cy="12" r="3" />
        <path d="m16.7 12 1 1 1.8-2" />
      </svg>
    );
  if (name === 'verification')
    return (
      <svg {...common}>
        <path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6Z" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    );
  if (name === 'administration')
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M17 8h4M19 6v4M16 15h5M18.5 12.5v5" />
      </svg>
    );
  if (name === 'search')
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
      </svg>
    );
  if (name === 'bell')
    return (
      <svg {...common}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
      </svg>
    );
  if (name === 'shield')
    return (
      <svg {...common}>
        <path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  if (name === 'chevron')
    return (
      <svg {...common}>
        <path d="m9 6 6 6-6 6" />
      </svg>
    );
  if (name === 'logout')
    return (
      <svg {...common}>
        <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
      </svg>
    );
  if (name === 'menu')
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  if (name === 'command')
    return (
      <svg {...common}>
        <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z" />
      </svg>
    );
  if (name === 'clock')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  if (name === 'alert')
    return (
      <svg {...common}>
        <path d="M12 4 21 20H3Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  if (name === 'trend')
    return (
      <svg {...common}>
        <path d="m4 17 5-5 4 3 7-8" />
        <path d="M15 7h5v5" />
      </svg>
    );
  if (name === 'users')
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4.5" />
      </svg>
    );
  if (name === 'organization')
    return (
      <svg {...common}>
        <path d="M4 21V8l8-4 8 4v13M8 12h2M14 12h2M8 16h2M14 16h2M10 21v-3h4v3" />
      </svg>
    );
  if (name === 'jobs')
    return (
      <svg {...common}>
        <rect height="15" rx="2" width="17" x="3.5" y="5" />
        <path d="M8 5V3M16 5V3M8 10h8M8 14h5" />
      </svg>
    );
  if (name === 'audit')
    return (
      <svg {...common}>
        <path d="M7 3h10v4H7zM5 5H3v16h18V5h-2M8 12h8M8 16h5" />
      </svg>
    );
  if (name === 'filter')
    return (
      <svg {...common}>
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
    );
  if (name === 'arrow')
    return (
      <svg {...common}>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </svg>
    );
  if (name === 'close')
    return (
      <svg {...common}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  if (name === 'check')
    return (
      <svg {...common}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  if (name === 'more')
    return (
      <svg {...common}>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === 'refresh')
    return (
      <svg {...common}>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 8a7 7 0 0 1 11.6-1.9L20 12M4 12l2.3 5.9A7 7 0 0 0 18 16" />
      </svg>
    );
  if (name === 'document')
    return (
      <svg {...common}>
        <path d="M6 3h8l4 4v14H6Z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </svg>
    );
  if (name === 'calendar')
    return (
      <svg {...common}>
        <rect height="17" rx="2" width="18" x="3" y="4" />
        <path d="M8 2v4M16 2v4M3 9h18M8 13h2M14 13h2" />
      </svg>
    );
  if (name === 'sparkle')
    return (
      <svg {...common}>
        <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z" />
      </svg>
    );
  if (name === 'inbox')
    return (
      <svg {...common}>
        <path d="M4 4h16v16H4Z" />
        <path d="m4 14 4-4h8l4 4M8 14h8" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect height="15" rx="2" width="16" x="4" y="6" />
      <path d="M8 6V4a4 4 0 0 1 8 0v2M12 12v3" />
    </svg>
  );
}
