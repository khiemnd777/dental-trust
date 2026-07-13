export const operationsNavigation = [
  { href: '/', label: 'Tổng quan', group: 'Trung tâm', icon: 'dashboard' },
  { href: '/coordination', label: 'Điều phối', group: 'Vận hành', icon: 'coordination' },
  { href: '/verification', label: 'Xác minh', group: 'Tin cậy', icon: 'verification' },
  { href: '/administration', label: 'Quản trị', group: 'Nền tảng', icon: 'administration' },
] as const;

export type OperationsArea = 'coordination' | 'verification' | 'administration';
export function areaForPath(pathname: string): OperationsArea | null {
  if (pathname.startsWith('/coordination')) return 'coordination';
  if (pathname.startsWith('/verification')) return 'verification';
  if (pathname.startsWith('/administration')) return 'administration';
  return null;
}
