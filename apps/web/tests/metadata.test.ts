import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicPageMetadata } from '@/lib/metadata';

afterEach(() => vi.unstubAllEnvs());

describe('public metadata', () => {
  it('builds localized canonical, social, and language-alternate metadata', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const metadata = publicPageMetadata({
      locale: 'en',
      title: 'Verified clinic',
      description: 'Evidence checked clinic profile',
      path: '/clinics/minh-an/',
    });

    expect(metadata.alternates).toEqual({
      canonical: '/en/clinics/minh-an',
      languages: {
        'vi-VN': '/vi/clinics/minh-an',
        'en-US': '/en/clinics/minh-an',
        'x-default': '/vi/clinics/minh-an',
      },
    });
    expect(metadata.openGraph).toMatchObject({
      locale: 'en_US',
      alternateLocale: ['vi_VN'],
      url: '/en/clinics/minh-an',
    });
    expect(metadata.robots).toBeUndefined();
  });

  it('prevents indexing fixtures, previews, and every non-production build', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      publicPageMetadata({ locale: 'vi', title: 'Trang', description: 'Mô tả' }).robots,
    ).toMatchObject({ index: false, follow: false, noarchive: true });
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      publicPageMetadata({
        locale: 'vi',
        title: 'Fixture',
        description: 'Fixture',
        indexable: false,
      }).robots,
    ).toMatchObject({ index: false, follow: false, noarchive: true });
  });
});
