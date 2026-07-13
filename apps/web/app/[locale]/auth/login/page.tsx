import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { Alert, Button, Card, Checkbox, Field, Icon } from '@dental-trust/ui';
import { AuthShell } from '@/components/auth-shell';
import { loginAction } from '../actions';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; returnTo?: string; product?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();
  const messages = getMessages(locale);
  const action = loginAction.bind(null, locale);
  const error =
    query.error === 'permission'
      ? messages.portal.permission
      : query.error === 'unavailable'
        ? messages.auth.productionUnavailable
        : query.error
          ? messages.auth.invalid
          : null;
  const demoAreas = [
    ['patient', messages.auth.patientDemo],
    ['clinic', messages.auth.clinicDemo],
    ['concierge', messages.auth.conciergeDemo],
    ['verification', messages.auth.verificationDemo],
    ['admin', messages.auth.adminDemo],
  ] as const;
  return (
    <AuthShell locale={locale} messages={messages}>
      <Card className="auth-card">
        <p className="eyebrow">{messages.auth.eyebrow}</p>
        <h1>{messages.auth.loginTitle}</h1>
        <p className="auth-card__intro">{messages.auth.loginBody}</p>
        {error ? <Alert tone="danger" title={error} /> : null}
        <form
          action={action}
          className="auth-form"
          style={{ marginTop: error ? '1rem' : undefined }}
        >
          <input name="returnTo" type="hidden" value={query.returnTo ?? ''} />
          <input name="product" type="hidden" value={query.product ?? ''} />
          <Field
            label={messages.auth.email}
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <Field
            label={messages.auth.password}
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            required
          />
          <div className="auth-form__row">
            <Checkbox label={messages.auth.remember} name="remember" />
            <Link className="text-link" href={`/${locale}/auth/password-reset`}>
              {messages.auth.forgot}
            </Link>
          </div>
          <Button size="lg" type="submit">
            <Icon name="lock" />
            {messages.auth.submit}
          </Button>
        </form>
        <p className="auth-form__footer">
          {messages.auth.noAccount}{' '}
          <Link className="text-link" href={`/${locale}/auth/register`}>
            {messages.auth.register}
          </Link>
        </p>
        {process.env.NODE_ENV !== 'production' ? (
          <div className="demo-access">
            <h2>{messages.auth.demoTitle}</h2>
            <p>{messages.auth.demoBody}</p>
            <div className="demo-buttons">
              {demoAreas.map(([area, label]) => (
                <form action={action} key={area}>
                  <input name="product" type="hidden" value={query.product ?? ''} />
                  <input name="demoArea" type="hidden" value={area} />
                  <input name="email" type="hidden" value={`${area}@dentaltrust.local`} />
                  <input name="password" type="hidden" value="DentalTrust!2026" />
                  <Button size="sm" type="submit" variant="secondary">
                    {label}
                  </Button>
                </form>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
    </AuthShell>
  );
}
