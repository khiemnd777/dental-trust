'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Avatar, Button, Icon, type IconName } from '@dental-trust/ui';
import type { PortalArea } from '@/lib/routing';
import { trackProductEvent } from '@/lib/product-analytics';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
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
  const notificationItem = navItems.find((item) => item.key === 'notifications');
  const mobileKeys =
    area === 'patient'
      ? ['dashboard', 'case', 'messages', 'settings']
      : area === 'clinic'
        ? ['dashboard', 'cases', 'availability', 'messages']
        : navItems.slice(0, 4).map(({ key }) => key);
  const mobileItems = mobileKeys
    .map((key) => navItems.find((item) => item.key === key))
    .filter((item): item is NavItem => Boolean(item));
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    const focusFrame = window.requestAnimationFrame(() => mobileMenuCloseRef.current?.focus());
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      window.cancelAnimationFrame(focusFrame);
      mobileMenuTriggerRef.current?.focus();
    };
  }, [mobileMenuOpen]);
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
        <button
          aria-controls="portal-mobile-menu"
          aria-expanded={mobileMenuOpen}
          onClick={() => {
            trackProductEvent('mobile_more_opened', { area });
            setMobileMenuOpen(true);
          }}
          ref={mobileMenuTriggerRef}
          type="button"
        >
          <Icon name="menu" />
          <span>{messages.common.more}</span>
        </button>
      </nav>
      {mobileMenuOpen ? (
        <div className="portal-mobile-menu-backdrop">
          <button
            aria-label={messages.common.close}
            className="portal-mobile-menu-backdrop__dismiss"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
          <section
            aria-label={messages.common.mobileNavigation}
            aria-modal="true"
            className="portal-mobile-menu"
            id="portal-mobile-menu"
            role="dialog"
          >
            <header className="portal-mobile-menu__head">
              <div className="portal-user">
                <Avatar name={user.name} size="sm" />
                <div>
                  <strong>{user.name}</strong>
                  <span>{messages.portal.sections[area]}</span>
                </div>
              </div>
              <button
                aria-label={messages.common.close}
                className="dt-button dt-button--quiet dt-button--icon"
                onClick={() => setMobileMenuOpen(false)}
                ref={mobileMenuCloseRef}
                type="button"
              >
                <Icon name="close" />
              </button>
            </header>
            <nav className="portal-mobile-menu__nav" aria-label={messages.common.primaryNavigation}>
              {navItems.map((item) => (
                <Link
                  data-active={active(item.href)}
                  href={item.href}
                  key={item.key}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  <Icon className="portal-mobile-menu__chevron" name="chevron" />
                </Link>
              ))}
            </nav>
            <footer className="portal-mobile-menu__footer">
              <LocaleSwitch locale={locale} label={messages.common.language} />
              {organizationMembershipCount ? (
                <Link
                  className="dt-button dt-button--secondary button-link"
                  href={`/${locale}/auth/organization?returnTo=${encodeURIComponent(pathname)}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon name="team" />
                  <span>{messages.auth.organizationSwitch}</span>
                </Link>
              ) : null}
              {notificationItem ? (
                <Link
                  className="dt-button dt-button--secondary button-link"
                  href={notificationItem.href}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon name="mail" />
                  <span>{messages.portal.notifications}</span>
                </Link>
              ) : null}
              <form action={logout}>
                <Button type="submit" variant="quiet">
                  <Icon name="lock" />
                  <span>{messages.common.logout}</span>
                </Button>
              </form>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
