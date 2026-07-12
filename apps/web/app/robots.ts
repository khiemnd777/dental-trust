import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/vi/app/',
          '/en/app/',
          '/vi/clinic/',
          '/en/clinic/',
          '/vi/concierge/',
          '/en/concierge/',
          '/vi/verification-admin/',
          '/en/verification-admin/',
          '/vi/admin/',
          '/en/admin/',
          '/vi/auth/',
          '/en/auth/',
          '/api/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
