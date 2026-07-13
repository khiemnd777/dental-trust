import type { ProviderIconName } from '@/components/provider-icon';

export const providerNavigation = [
  { href: '/', label: 'Hôm nay', icon: 'home' },
  { href: '/cases', label: 'Hồ sơ', icon: 'cases' },
  { href: '/schedule', label: 'Lịch', icon: 'calendar' },
  { href: '/messages', label: 'Tin nhắn', icon: 'message' },
  { href: '/clinic', label: 'Phòng khám', icon: 'clinic' },
] as const satisfies readonly { href: string; label: string; icon: ProviderIconName }[];

export function isProviderPath(pathname: string) {
  return providerNavigation.some(({ href }) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`),
  );
}
