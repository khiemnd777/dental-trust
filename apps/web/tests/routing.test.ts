import { describe, expect, it } from 'vitest';
import { getMessages, locales } from '@dental-trust/i18n';
import { findPortalRoute, portalRoutes } from '@/lib/routing';

describe('portal route registry', () => {
  it('has unique, resolvable paths within every portal', () => {
    for (const [area, routes] of Object.entries(portalRoutes)) {
      expect(new Set(routes.map((route) => route.path)).size, area).toBe(routes.length);
      for (const route of routes)
        expect(
          findPortalRoute(
            area as keyof typeof portalRoutes,
            route.path ? route.path.split('/') : [],
          )?.key,
        ).toBe(route.key);
    }
  });

  it('has Vietnamese and English labels for every protected route', () => {
    for (const locale of locales) {
      const pages = getMessages(locale).portal.pages;
      for (const [area, routes] of Object.entries(portalRoutes)) {
        for (const route of routes) {
          const copy = (
            pages[area as keyof typeof pages] as Record<string, readonly [string, string]>
          )[route.key];
          expect(copy?.[0], `${locale}:${area}:${route.key}`).toBeTruthy();
          expect(copy?.[1], `${locale}:${area}:${route.key}`).toBeTruthy();
        }
      }
    }
  });
});
