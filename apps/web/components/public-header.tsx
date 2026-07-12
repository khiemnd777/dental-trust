'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Button, Icon } from '@dental-trust/ui';
import { Brand } from './brand';
import { InstallApp } from './install-app';
import { LocaleSwitch } from './locale-switch';

export function PublicHeader({ locale, messages }: { locale: Locale; messages: Messages }) {
  const [open, setOpen] = useState(false);
  const links = [
    ['how-it-works', messages.nav.how],
    ['verification', messages.nav.verification],
    ['clinics', messages.nav.clinics],
    ['services', messages.nav.services],
    ['pricing', messages.nav.pricing],
  ] as const;
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Brand locale={locale} label={messages.common.brand} />
        <nav className="site-nav" aria-label={messages.common.primaryNavigation}>
          {links.map(([href, label]) => (
            <Link href={`/${locale}/${href}`} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="site-actions">
          <InstallApp label={messages.common.install} ready={messages.common.installReady} />
          <LocaleSwitch locale={locale} label={messages.common.language} />
          <Link
            className="dt-button dt-button--quiet dt-button--sm button-link"
            href={`/${locale}/auth/login`}
          >
            {messages.common.login}
          </Link>
          <Link
            className="dt-button dt-button--primary dt-button--sm button-link"
            href={`/${locale}/auth/register`}
          >
            {messages.common.register}
          </Link>
          <Button
            className="mobile-trigger"
            size="icon"
            variant="quiet"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={messages.common.menu}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? 'close' : 'menu'} />
          </Button>
        </div>
      </div>
      <nav
        className="mobile-nav"
        data-open={open}
        id="mobile-menu"
        aria-label={messages.common.mobileNavigation}
      >
        {links.map(([href, label]) => (
          <Link href={`/${locale}/${href}`} key={href} onClick={() => setOpen(false)}>
            {label}
          </Link>
        ))}
        <LocaleSwitch locale={locale} label={messages.common.language} />
        <Link href={`/${locale}/auth/login`} onClick={() => setOpen(false)}>
          {messages.common.login}
        </Link>
      </nav>
    </header>
  );
}
