import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { Alert, Button, Card, Checkbox, Field, Icon } from '@dental-trust/ui';
import { AuthShell } from '@/components/auth-shell';
import { registerAction } from '../actions';

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();
  const messages = getMessages(locale);
  return (
    <AuthShell locale={locale} messages={messages}>
      <Card className="auth-card">
        <p className="eyebrow">{messages.auth.eyebrow}</p>
        <h1>{messages.auth.registrationTitle}</h1>
        <p className="auth-card__intro">{messages.auth.registrationBody}</p>
        {query.error ? (
          <Alert
            tone="danger"
            title={
              query.error === 'unavailable'
                ? messages.auth.productionUnavailable
                : messages.auth.invalid
            }
          />
        ) : null}
        <form
          action={registerAction.bind(null, locale)}
          className="auth-form"
          style={{ marginTop: query.error ? '1rem' : undefined }}
        >
          <Field
            label={messages.auth.email}
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <Field
            hint="12+ characters"
            label={messages.auth.password}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
          <Field
            label={messages.auth.confirmPassword}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
          <Checkbox label={messages.auth.accept} name="accept" required />
          <Button size="lg" type="submit">
            <Icon name="shield" />
            {messages.auth.create}
          </Button>
        </form>
        <p className="auth-form__footer">
          <Link className="text-link" href={`/${locale}/auth/login`}>
            {messages.common.back}
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
