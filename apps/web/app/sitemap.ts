import type { MetadataRoute } from 'next';
import { locales } from '@dental-trust/i18n';
import { publicPaths } from '@/lib/routing';
import { loadPublicClinics, loadPublicDentists } from '@/lib/public-data';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const staticEntries = locales.flatMap((locale) =>
    publicPaths.map((path) => ({
      url: `${base}/${locale}${path ? `/${path}` : ''}`,
      lastModified: new Date('2026-07-12'),
      changeFrequency:
        path === '' || path === 'clinics' ? ('weekly' as const) : ('monthly' as const),
      priority: path === '' ? 1 : path.startsWith('clinics') ? 0.85 : 0.65,
      alternates: {
        languages: {
          vi: `${base}/vi${path ? `/${path}` : ''}`,
          en: `${base}/en${path ? `/${path}` : ''}`,
        },
      },
    })),
  );
  const clinicEntries = (
    await Promise.all(
      locales.map(async (locale) =>
        (await loadPublicClinics(locale))
          .filter((clinic) => !clinic.fixture)
          .map((clinic) => ({
            url: `${base}/${locale}/clinics/${clinic.slug}`,
            lastModified: clinic.updated ? new Date(clinic.updated) : new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
          })),
      ),
    )
  ).flat();
  const dentistEntries = (
    await Promise.all(
      locales.map(async (locale) =>
        (await loadPublicDentists(locale))
          .filter((dentist) => !dentist.fixture)
          .map((dentist) => ({
            url: `${base}/${locale}/dentists/${dentist.slug}`,
            lastModified: dentist.updated ? new Date(dentist.updated) : new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.75,
          })),
      ),
    )
  ).flat();
  return [...staticEntries, ...clinicEntries, ...dentistEntries];
}
