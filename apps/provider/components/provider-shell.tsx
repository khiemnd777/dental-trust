'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { ProviderIcon } from '@/components/provider-icon';
import { providerNavigation } from '@/lib/navigation';

const managementNavigation = [
  { href: '/clinic?tab=team', label: 'Đội ngũ', icon: 'users' as const },
  { href: '/clinic?tab=services', label: 'Dịch vụ & giá', icon: 'services' as const },
  { href: '/clinic?tab=analytics', label: 'Hiệu suất', icon: 'trend' as const },
  { href: '/clinic?tab=billing', label: 'Thanh toán', icon: 'document' as const },
];

export function ProviderShell({
  children,
  clinicName,
  clinicDetail,
  logout,
  roleLabel,
  userInitials,
  mfaRequired,
}: {
  readonly children: ReactNode;
  readonly clinicName: string;
  readonly clinicDetail: string;
  readonly logout: () => Promise<void>;
  readonly roleLabel: string;
  readonly userInitials: string;
  readonly mfaRequired: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className="provider-app">
      <aside className="provider-sidebar">
        <Link aria-label="Dental Trust Provider" className="provider-brand" href="/">
          <span className="provider-brand__mark">
            <ProviderIcon name="brand" />
          </span>
          <span className="provider-brand__copy">
            <strong>Dental Trust</strong>
            <small>Provider</small>
          </span>
        </Link>

        <Link aria-label="Mở hồ sơ phòng khám" className="provider-clinic" href="/clinic">
          <span className="provider-clinic__mark">{initials(clinicName)}</span>
          <span>
            <strong>{clinicName}</strong>
            <small>
              <i /> {clinicDetail}
            </small>
          </span>
          <ProviderIcon name="chevron" />
        </Link>

        <div className="provider-nav-label">Workspace</div>
        <nav aria-label="Provider navigation">
          {providerNavigation.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link aria-current={active ? 'page' : undefined} href={item.href} key={item.href}>
                <span className="provider-nav-icon">
                  <ProviderIcon name={item.icon} variant={active ? 'filled' : 'outline'} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="provider-nav-label provider-nav-label--management">Quản lý</div>
        <nav aria-label="Provider management navigation" className="provider-management-nav">
          {managementNavigation.map((item) => (
            <a href={item.href} key={item.href}>
              <span className="provider-nav-icon">
                <ProviderIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="provider-security-note">
          <ProviderIcon name={mfaRequired ? 'alert' : 'shield'} />
          <span>
            <strong>{mfaRequired ? 'Cần xác minh MFA' : 'Không gian bảo mật'}</strong>
            <small>
              {mfaRequired
                ? 'Hoàn tất MFA trước tác vụ đặc quyền'
                : 'Dữ liệu được giới hạn theo ca'}
            </small>
          </span>
        </div>

        <details className="provider-account provider-account--desktop">
          <summary className="provider-user">
            <span className="provider-user__avatar">{userInitials}</span>
            <span>
              <strong>Tài khoản phòng khám</strong>
              <small>{roleLabel}</small>
            </span>
            <ProviderIcon name="chevron" />
          </summary>
          <AccountMenu logout={logout} />
        </details>
      </aside>

      <header className="provider-topbar">
        <Link aria-label="Dental Trust Provider" className="provider-mobile-brand" href="/">
          <ProviderIcon name="brand" />
          <span>
            <strong>{clinicName}</strong>
            <small>Provider workspace</small>
          </span>
        </Link>
        <div className="provider-topbar-actions">
          <Link aria-label="Thông báo" className="provider-icon-button" href="/messages">
            <ProviderIcon name="bell" />
          </Link>
          <details className="provider-account provider-account--mobile">
            <summary aria-label="Mở menu tài khoản" className="provider-mobile-account-button">
              {userInitials}
            </summary>
            <AccountMenu logout={logout} />
          </details>
        </div>
      </header>

      {children}

      <nav aria-label="Provider mobile navigation" className="provider-bottom-nav">
        {providerNavigation.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link aria-current={active ? 'page' : undefined} href={item.href} key={item.href}>
              <ProviderIcon name={item.icon} variant={active ? 'filled' : 'outline'} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function AccountMenu({ logout }: { readonly logout: () => Promise<void> }) {
  return (
    <div aria-label="Menu tài khoản" className="provider-account-menu">
      <a href="/clinic?tab=security">
        <ProviderIcon name="shield" />
        <span>
          <strong>Bảo mật tài khoản</strong>
          <small>MFA, quyền truy cập và nhật ký</small>
        </span>
      </a>
      <form action={logout}>
        <button type="submit">
          <ProviderIcon name="logout" />
          <span>
            <strong>Đăng xuất</strong>
            <small>Kết thúc phiên trên thiết bị này</small>
          </span>
        </button>
      </form>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'DT'
  );
}
