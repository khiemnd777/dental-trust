'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { OperationsIcon, type OperationsIconName } from './operations-icon';
import { operationsNavigation } from '@/lib/navigation';

interface OperationsShellProps {
  readonly children: ReactNode;
  readonly logout: () => Promise<void>;
  readonly roles: readonly string[];
  readonly userInitials: string;
  readonly userLabel: string;
  readonly mfaRequired: boolean;
}

const commands = [
  { href: '/', label: 'Mở trung tâm vận hành', hint: 'Tổng quan rủi ro và SLA' },
  { href: '/coordination', label: 'Mở hàng đợi điều phối', hint: 'Ca, phân công và handoff' },
  { href: '/verification', label: 'Mở hàng đợi xác minh', hint: 'Bằng chứng và phê duyệt kép' },
  {
    href: '/administration?view=reliability',
    label: 'Kiểm tra reliability',
    hint: 'Job và webhook lỗi',
  },
  {
    href: '/administration?view=audit',
    label: 'Tra cứu audit log',
    hint: 'Lịch sử thao tác đặc quyền',
  },
] as const;

export function OperationsShell({
  children,
  logout,
  roles,
  userInitials,
  userLabel,
  mfaRequired,
}: OperationsShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const visibleNavigation = operationsNavigation.filter((item) => canAccess(item.href, roles));
  const filteredCommands = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi-VN');
    if (!query) return commands.filter((item) => canAccess(item.href, roles));
    return commands.filter(
      (item) =>
        canAccess(item.href, roles) &&
        `${item.label} ${item.hint}`.toLocaleLowerCase('vi-VN').includes(query),
    );
  }, [roles, search]);

  return (
    <div className="ops-app">
      <a className="ops-skip-link" href="#ops-content">
        Đi đến nội dung chính
      </a>
      <aside className={`ops-sidebar${mobileOpen ? ' is-open' : ''}`}>
        <div className="ops-sidebar__head">
          <Link aria-label="Dental Trust Operations" className="ops-brand" href="/">
            <span>
              <OperationsIcon name="brand" />
            </span>
            <div>
              <strong>Dental Trust</strong>
              <small>Operations</small>
            </div>
          </Link>
          <button aria-label="Đóng điều hướng" onClick={() => setMobileOpen(false)} type="button">
            <OperationsIcon name="close" />
          </button>
        </div>
        <div className="ops-environment">
          <i /> Production controls <b>Local</b>
        </div>
        <nav aria-label="Operations navigation">
          {visibleNavigation.map((item, index) => (
            <div className="ops-nav-item" key={item.href}>
              {index === 0 || visibleNavigation[index - 1]?.group !== item.group ? (
                <p>{item.group}</p>
              ) : null}
              <Link
                aria-current={
                  (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                    ? 'page'
                    : undefined
                }
                href={item.href}
                onClick={() => setMobileOpen(false)}
              >
                <span className="ops-nav-icon">
                  <OperationsIcon name={item.icon as OperationsIconName} />
                </span>
                <span>{item.label}</span>
                {item.href === '/coordination' ? (
                  <b>•</b>
                ) : item.href === '/verification' ? (
                  <b>•</b>
                ) : null}
              </Link>
            </div>
          ))}
        </nav>
        <div className={`ops-security-note${mfaRequired ? ' is-warning' : ''}`}>
          <OperationsIcon name={mfaRequired ? 'alert' : 'shield'} />
          <span>
            <strong>{mfaRequired ? 'Cần xác minh MFA' : 'Phiên đặc quyền được bảo vệ'}</strong>
            <small>
              {mfaRequired
                ? 'Hoàn tất MFA trước thao tác nhạy cảm'
                : 'Mọi thay đổi đều được ghi audit log'}
            </small>
          </span>
        </div>
        <details className="ops-account ops-account--desktop">
          <summary>
            <span className="ops-avatar">{userInitials}</span>
            <span>
              <strong>{userLabel}</strong>
              <small>{roleLabel(roles)}</small>
            </span>
            <OperationsIcon name="chevron" />
          </summary>
          <AccountMenu logout={logout} />
        </details>
      </aside>
      {mobileOpen ? (
        <button
          aria-label="Đóng điều hướng"
          className="ops-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <header className="ops-topbar">
        <button aria-label="Mở điều hướng" onClick={() => setMobileOpen(true)} type="button">
          <OperationsIcon name="menu" />
        </button>
        <div className="ops-search-wrap">
          <label>
            <OperationsIcon name="search" />
            <input
              aria-label="Tìm trong vận hành"
              onChange={(event) => setSearch(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Tìm ca, xác minh hoặc mở nhanh…"
              value={search}
            />
            <kbd>⌘ K</kbd>
          </label>
          {searchOpen ? (
            <div className="ops-command-menu">
              <header>
                <span>Đi đến</span>
                <button
                  aria-label="Đóng tìm kiếm"
                  onClick={() => setSearchOpen(false)}
                  type="button"
                >
                  <OperationsIcon name="close" />
                </button>
              </header>
              {filteredCommands.length ? (
                filteredCommands.map((item) => (
                  <Link
                    href={item.href}
                    key={item.href}
                    onClick={() => {
                      setSearchOpen(false);
                      setSearch('');
                    }}
                  >
                    <OperationsIcon name="command" />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                    <OperationsIcon name="arrow" />
                  </Link>
                ))
              ) : (
                <p>Không có lối tắt phù hợp.</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="ops-topbar__actions">
          <Link aria-label="Cảnh báo vận hành" className="ops-icon-button" href="/?focus=alerts">
            <OperationsIcon name="bell" />
            <i />
          </Link>
          <details className="ops-account ops-account--mobile">
            <summary aria-label="Mở menu tài khoản">
              <span className="ops-avatar">{userInitials}</span>
            </summary>
            <AccountMenu logout={logout} />
          </details>
        </div>
      </header>

      <div id="ops-content">{children}</div>

      <nav aria-label="Operations mobile navigation" className="ops-mobile-nav">
        {visibleNavigation.map((item) => (
          <Link
            aria-current={
              (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                ? 'page'
                : undefined
            }
            href={item.href}
            key={item.href}
          >
            <OperationsIcon name={item.icon as OperationsIconName} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function AccountMenu({ logout }: { readonly logout: () => Promise<void> }) {
  return (
    <div aria-label="Menu tài khoản" className="ops-account-menu">
      <Link href="/administration?view=security">
        <OperationsIcon name="lock" />
        <span>
          <strong>Bảo mật tài khoản</strong>
          <small>MFA và phiên hoạt động</small>
        </span>
      </Link>
      <form action={logout}>
        <button type="submit">
          <OperationsIcon name="logout" />
          <span>
            <strong>Đăng xuất</strong>
            <small>Kết thúc phiên trên thiết bị này</small>
          </span>
        </button>
      </form>
    </div>
  );
}

function canAccess(href: string, roles: readonly string[]): boolean {
  if (href === '/') return true;
  if (roles.includes('SUPER_ADMIN')) return true;
  if (href.startsWith('/coordination'))
    return roles.some((role) => ['CONCIERGE_AGENT', 'PLATFORM_ADMIN'].includes(role));
  if (href.startsWith('/verification'))
    return roles.some((role) => ['VERIFICATION_OFFICER', 'PLATFORM_ADMIN'].includes(role));
  return roles.some((role) => ['FINANCE_ADMIN', 'CONTENT_ADMIN', 'PLATFORM_ADMIN'].includes(role));
}

function roleLabel(roles: readonly string[]): string {
  if (roles.includes('SUPER_ADMIN')) return 'Super administrator';
  if (roles.includes('PLATFORM_ADMIN')) return 'Platform administrator';
  if (roles.includes('VERIFICATION_OFFICER')) return 'Verification officer';
  if (roles.includes('CONCIERGE_AGENT')) return 'Điều phối viên';
  if (roles.includes('FINANCE_ADMIN')) return 'Finance administrator';
  return 'Operations member';
}
