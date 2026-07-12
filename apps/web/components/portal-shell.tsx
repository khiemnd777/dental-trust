'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Avatar, Button, Icon, type IconName } from '@dental-trust/ui';
import type { PortalArea } from '@/lib/routing';
import { Brand } from './brand';
import { LocaleSwitch } from './locale-switch';

interface NavItem {
  key: string;
  href: string;
  icon: IconName;
  label: string;
}

export function PortalShell({
  locale,
  messages,
  area,
  user,
  navItems,
  organizationMembershipCount,
  logout,
  children,
}: {
  locale: Locale;
  messages: Messages;
  area: PortalArea;
  user: { name: string; email: string };
  navItems: NavItem[];
  organizationMembershipCount: number;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const matchingItems = useMemo(
    () =>
      navItems.filter((item) =>
        item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
    [navItems, query],
  );
  const active = (href: string) =>
    href ===
    `/${locale}/${area === 'patient' ? 'app' : area === 'verification' ? 'verification-admin' : area}`
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const match = matchingItems[0];
    if (match) router.push(match.href);
  };
  const lastItem = navItems.at(-1);
  const notificationItem = navItems.find((item) => item.key === 'notifications');
  const mobileItems =
    navItems.length > 4 && lastItem ? [...navItems.slice(0, 3), lastItem] : navItems;
  return (
    <div className="portal-root">
      <aside className="portal-sidebar">
        <Brand locale={locale} label={messages.common.brand} />
        <p className="portal-sidebar__section">{messages.portal.sections[area]}</p>
        <nav className="portal-nav" aria-label={messages.common.primaryNavigation}>
          {navItems.map((item) => (
            <Link data-active={active(item.href)} href={item.href} key={item.key}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="portal-sidebar__bottom">
          <div className="portal-user">
            <Avatar name={user.name} size="sm" />
            <div>
              <strong>{user.name}</strong>
              <span>{messages.portal.secure}</span>
            </div>
          </div>
          <form action={logout}>
            <Button
              style={{ color: '#b8c8d2', width: '100%' }}
              type="submit"
              variant="quiet"
              size="sm"
            >
              <Icon name="lock" />
              <span>{messages.common.logout}</span>
            </Button>
          </form>
        </div>
      </aside>
      <div className="portal-main">
        <header className="portal-topbar">
          <form className="portal-search" role="search" onSubmit={search}>
            <Icon name="search" />
            <input
              aria-label={messages.portal.search}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={messages.portal.command}
              value={query}
            />
          </form>
          <div className="portal-topbar__actions">
            <LocaleSwitch locale={locale} label={messages.common.language} />
            {organizationMembershipCount ? (
              <Link
                className="dt-button dt-button--quiet button-link organization-switch"
                href={`/${locale}/auth/organization?returnTo=${encodeURIComponent(pathname)}`}
              >
                <Icon name="team" />
                <span>{messages.auth.organizationSwitch}</span>
              </Link>
            ) : null}
            {notificationItem ? (
              <Link
                className="dt-button dt-button--quiet dt-button--icon button-link"
                href={notificationItem.href}
                aria-label={messages.portal.notifications}
              >
                <Icon name="mail" />
              </Link>
            ) : null}
            <Avatar name={user.name} />
          </div>
        </header>
        {children}
      </div>
      <nav className="portal-mobile-nav" aria-label={messages.common.mobileNavigation}>
        {mobileItems.map((item) => (
          <Link data-active={active(item.href)} href={item.href} key={item.key}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
