import type { ReactNode } from 'react';
import { getMessages, type Locale } from '@dental-trust/i18n';
import { canAccessPortalRoute, loadAuthorizedCaseIds, requireAreaSession } from '@/lib/session';
import { developmentCaseId, portalBasePaths, portalRoutes, type PortalArea } from '@/lib/routing';
import { logoutAction } from '@/app/[locale]/auth/actions';
import { PortalShell } from './portal-shell';

export async function PortalAreaLayout({
  locale,
  area,
  children,
}: {
  locale: Locale;
  area: PortalArea;
  children: ReactNode;
}) {
  const session = await requireAreaSession(area, locale);
  const messages = getMessages(locale);
  const pages = messages.portal.pages[area] as Record<string, readonly [string, string]>;
  const primaryCaseId = (await loadAuthorizedCaseIds(session))[0];
  const navItems = portalRoutes[area]
    .filter((route) => {
      const scoped = route.path.includes(developmentCaseId);
      return (
        (!scoped || Boolean(primaryCaseId)) &&
        canAccessPortalRoute(session, area, route.key, scoped ? primaryCaseId : undefined)
      );
    })
    .map((route) => ({
      key: route.key,
      icon: route.icon,
      label: pages[route.key]?.[0] ?? route.key,
      href: `/${locale}/${portalBasePaths[area]}${route.path ? `/${route.path.replace(developmentCaseId, primaryCaseId ?? developmentCaseId)}` : ''}`,
    }));
  return (
    <PortalShell
      area={area}
      locale={locale}
      logout={logoutAction.bind(null, locale)}
      messages={messages}
      navItems={navItems}
      organizationMembershipCount={session.availableMemberships?.length ?? 0}
      user={{ name: session.name, email: session.email }}
    >
      {children}
    </PortalShell>
  );
}
