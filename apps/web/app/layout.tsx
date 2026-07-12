import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: 'Dental Trust',
  title: { default: 'Dental Trust', template: '%s · Dental Trust' },
  description:
    'Verified dental care in Vietnam with transparent plans, clear costs, and cross-border aftercare.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Dental Trust' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.svg' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#071a2d' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await headers()).get('x-dental-trust-locale') === 'en' ? 'en' : 'vi';
  return (
    <html
      data-scroll-behavior="smooth"
      lang={locale === 'en' ? 'en-US' : 'vi-VN'}
      suppressHydrationWarning
    >
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
