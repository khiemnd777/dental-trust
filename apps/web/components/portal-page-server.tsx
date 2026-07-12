import { notFound } from 'next/navigation';
import { getMessages, type Locale } from '@dental-trust/i18n';
import { findPortalRoute, type PortalArea } from '@/lib/routing';
import { requirePortalRouteSession } from '@/lib/session';
import { PortalWorkspace } from './portal-workspace';

export async function PortalPageServer({
  locale,
  area,
  segments = [],
}: {
  locale: Locale;
  area: PortalArea;
  segments?: readonly string[];
}) {
  const route = findPortalRoute(area, segments);
  if (!route) notFound();
  const resourceId = segments.find((segment) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment),
  );
  const session = await requirePortalRouteSession(area, route.key, locale, resourceId);
  const messages = getMessages(locale);
  const page = (messages.portal.pages[area] as Record<string, readonly [string, string]>)[
    route.key
  ];
  if (!page) notFound();
  return (
    <PortalWorkspace
      area={area}
      description={page[1]}
      development={session.source === 'development'}
      locale={locale}
      messages={messages}
      pageKey={route.key}
      resourceId={resourceId}
      title={page[0]}
    />
  );
}
