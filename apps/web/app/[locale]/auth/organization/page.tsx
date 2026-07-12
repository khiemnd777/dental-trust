import { notFound, redirect } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { Alert, Badge, Button, Card, Field, Icon } from '@dental-trust/ui';
import { AuthShell } from '@/components/auth-shell';
import { getSession, type OrganizationRole } from '@/lib/session';
import { createClinicOrganizationAction, selectOrganizationAction } from '../actions';

function roleLabel(role: OrganizationRole, messages: ReturnType<typeof getMessages>) {
  return role === 'CONCIERGE_AGENT'
    ? messages.portal.sections.concierge
    : messages.portal.sections.clinic;
}

export default async function OrganizationSelectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();
  const session = await getSession();
  if (!session)
    redirect(
      `/${locale}/auth/login?returnTo=${encodeURIComponent(`/${locale}/auth/organization`)}`,
    );
  const messages = getMessages(locale);
  const memberships = session.availableMemberships ?? [];

  return (
    <AuthShell locale={locale} messages={messages}>
      <Card className="auth-card organization-card">
        <p className="eyebrow">{messages.auth.eyebrow}</p>
        <h1>{messages.auth.organizationTitle}</h1>
        <p className="auth-card__intro">{messages.auth.organizationBody}</p>
        {query.error ? <Alert tone="danger" title={messages.auth.organizationUnavailable} /> : null}
        {memberships.length ? (
          <div className="organization-list">
            {memberships.map((membership) => {
              const active = membership.organizationId === session.organizationId;
              return (
                <form
                  action={selectOrganizationAction.bind(null, locale)}
                  className="organization-option"
                  key={`${membership.organizationId}:${membership.role}`}
                >
                  <input name="organizationId" type="hidden" value={membership.organizationId} />
                  <input name="returnTo" type="hidden" value={query.returnTo ?? ''} />
                  <div>
                    <strong>{messages.auth.organizationLabel}</strong>
                    <code>{membership.organizationId}</code>
                    <span>{roleLabel(membership.role, messages)}</span>
                  </div>
                  {active ? <Badge tone="verified">{messages.portal.secure}</Badge> : null}
                  <Button type="submit" variant={active ? 'secondary' : 'primary'}>
                    <Icon name="team" />
                    {messages.auth.organizationSelect}
                  </Button>
                </form>
              );
            })}
          </div>
        ) : (
          <Alert tone="warning" title={messages.auth.organizationUnavailable} />
        )}
        {!session.organizationId && session.mfaVerified && session.source === 'api' ? (
          <form
            action={createClinicOrganizationAction.bind(null, locale)}
            className="auth-form"
            style={{ marginTop: '1.5rem' }}
          >
            <input name="idempotencyKey" type="hidden" value={crypto.randomUUID()} />
            <h2>{locale === 'vi' ? 'Tạo tổ chức phòng khám' : 'Create a clinic organization'}</h2>
            <p>
              {locale === 'vi'
                ? 'Tạo pháp nhân phòng khám và tiếp tục quy trình xác minh.'
                : 'Create the clinic legal entity and continue into governed verification.'}
            </p>
            <Field
              label={locale === 'vi' ? 'Tên phòng khám' : 'Clinic name'}
              name="name"
              required
            />
            <Field
              hint="lowercase-with-hyphens"
              label={locale === 'vi' ? 'Đường dẫn công khai' : 'Public slug'}
              name="slug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
            <Field
              label={locale === 'vi' ? 'Tên pháp nhân' : 'Legal entity name'}
              name="legalEntityName"
              required
            />
            <Field
              label={locale === 'vi' ? 'Mã đăng ký doanh nghiệp' : 'Registration number'}
              name="registrationNumber"
              required
            />
            <Field
              defaultValue="VN"
              label={locale === 'vi' ? 'Mã quốc gia' : 'Registration country'}
              maxLength={2}
              minLength={2}
              name="registrationCountry"
              required
            />
            <Button type="submit">
              <Icon name="clinic" />
              {locale === 'vi' ? 'Tạo và tiếp tục' : 'Create and continue'}
            </Button>
          </form>
        ) : null}
        {!session.organizationId && !session.mfaVerified ? (
          <Alert
            tone="warning"
            title={
              locale === 'vi'
                ? 'Cần xác minh đa yếu tố để tạo phòng khám'
                : 'MFA verification is required to create a clinic'
            }
          />
        ) : null}
      </Card>
    </AuthShell>
  );
}
