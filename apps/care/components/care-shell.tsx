'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Icon } from '@/components/icon';
import { careNavigation } from '@/lib/navigation';

export function CareShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="care-app">
      <header className="care-topbar">
        <Link className="care-brand" href="/" aria-label="Dental Trust Care">
          <span className="care-brand__mark">
            <Icon name="sparkle" />
          </span>
          <span className="care-brand__copy">
            <strong>Dental Trust</strong>
            <small>Care</small>
          </span>
        </Link>
        <div className="care-topbar__actions">
          <Link aria-label="Mở AI Hướng dẫn" className="care-icon-button" href="/assistant">
            <Icon name="sparkle" />
          </Link>
          <Link aria-label="Thông báo mới" className="care-icon-button" href="/notifications">
            <Icon name="bell" />
            <span className="care-notification-dot" />
          </Link>
        </div>
      </header>
      {children}
      <nav aria-label="Điều hướng chính" className="care-bottom-nav">
        {careNavigation.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link aria-current={active ? 'page' : undefined} href={item.href} key={item.href}>
              <Icon name={item.icon} variant={active ? 'filled' : 'outline'} />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
