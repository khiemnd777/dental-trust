import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { Alert, Button, Card, Checkbox, Field, Icon } from '@dental-trust/ui';
import { AuthShell } from '@/components/auth-shell';
import { authContinuationFromQuery, authUrl } from '@/lib/auth-continuation';
import { registerAction } from '../actions';

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
    product?: string;
    intent?: string;
    clinic?: string;
    dentist?: string;
  }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();
  const messages = getMessages(locale);
  const continuation = authContinuationFromQuery(locale, query);
  const savedEmail = (await cookies()).get('dt_registration_email')?.value ?? '';
  const fieldError =
    query.error === 'email'
      ? messages.auth.emailInvalid
      : query.error === 'password'
        ? messages.auth.passwordInvalid
        : query.error === 'confirmation'
          ? messages.auth.confirmationMismatch
          : query.error === 'accept'
            ? messages.auth.acceptRequired
            : query.error === 'email-in-use'
              ? messages.auth.emailInUse
              : undefined;
  return (
    <AuthShell locale={locale} messages={messages}>
      <Card className="auth-card">
        <p className="eyebrow">{messages.auth.eyebrow}</p>
        <h1>{messages.auth.registrationTitle}</h1>
        <p className="auth-card__intro">{messages.auth.registrationBody}</p>
        {query.error && !fieldError ? (
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
          <input name="returnTo" type="hidden" value={continuation.returnTo ?? ''} />
          <input name="product" type="hidden" value={continuation.product ?? ''} />
          <input name="intent" type="hidden" value={continuation.intent ?? ''} />
          <input name="clinic" type="hidden" value={continuation.clinic ?? ''} />
          <input name="dentist" type="hidden" value={continuation.dentist ?? ''} />
          <Field
            defaultValue={savedEmail}
            {...(['email', 'email-in-use'].includes(query.error ?? '') && fieldError
              ? { error: fieldError }
              : {})}
            label={messages.auth.email}
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <Field
            {...(query.error === 'password' && fieldError ? { error: fieldError } : {})}
            hint={messages.auth.passwordRequirements}
            label={messages.auth.password}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}"
            required
          />
          <Field
            {...(query.error === 'confirmation' && fieldError ? { error: fieldError } : {})}
            label={messages.auth.confirmPassword}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
          <div>
            <Checkbox label={messages.auth.accept} name="accept" required />
            {query.error === 'accept' ? (
              <p className="dt-field__error" role="alert">
                {fieldError}
              </p>
            ) : null}
          </div>
          <Button size="lg" type="submit">
            <Icon name="shield" />
            {messages.auth.create}
          </Button>
        </form>
        <p className="auth-form__footer">
          <Link className="text-link" href={authUrl(`/${locale}/auth/login`, continuation)}>
            {messages.common.back}
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
