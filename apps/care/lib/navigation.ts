import type { IconName } from '@/components/icon';

export const careNavigation: readonly {
  href: string;
  label: string;
  shortLabel: string;
  icon: IconName;
}[] = [
  { href: '/', label: 'Hôm nay', shortLabel: 'Hôm nay', icon: 'home' },
  { href: '/discover', label: 'Khám phá', shortLabel: 'Khám phá', icon: 'search' },
  { href: '/journey', label: 'Hành trình', shortLabel: 'Hành trình', icon: 'journey' },
  { href: '/messages', label: 'Tin nhắn', shortLabel: 'Tin nhắn', icon: 'message' },
  { href: '/account', label: 'Tài khoản', shortLabel: 'Cá nhân', icon: 'user' },
] as const;

export function isCarePath(pathname: string): boolean {
  return careNavigation.some(({ href }) =>
    href === '/' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`),
  );
}
