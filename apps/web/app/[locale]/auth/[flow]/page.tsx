import { notFound } from 'next/navigation';
import { getMessages, isLocale } from '@dental-trust/i18n';
import { Alert, Button, Card, Field, Icon } from '@dental-trust/ui';
import { AuthShell } from '@/components/auth-shell';
import { SimpleAuthForm } from '@/components/simple-auth-form';
import { authContinuationFromQuery } from '@/lib/auth-continuation';
import { verifyEmailAction } from '../actions';

const flows = ['verify-email', 'password-reset', 'mfa', 'sessions'] as const;

export default async function AuthFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; flow: string }>;
  searchParams: Promise<{
    error?: string;
    token?: string;
    returnTo?: string;
    product?: string;
    intent?: string;
    clinic?: string;
    dentist?: string;
  }>;
}) {
  const { locale, flow } = await params;
  const query = await searchParams;
  if (!isLocale(locale) || !flows.includes(flow as (typeof flows)[number])) notFound();
  const messages = getMessages(locale);
  const continuation = authContinuationFromQuery(locale, query);
  const config =
    flow === 'verify-email'
      ? [messages.auth.verifyTitle, messages.auth.verifyBody]
      : flow === 'password-reset'
        ? [messages.auth.resetTitle, messages.auth.resetBody]
        : flow === 'mfa'
          ? [messages.auth.mfaTitle, messages.auth.mfaBody]
          : [messages.auth.sessionsTitle, messages.auth.sessionsBody];
  const simpleKind: 'reset' | 'mfa' | 'sessions' =
    flow === 'password-reset' ? 'reset' : flow === 'mfa' ? 'mfa' : 'sessions';
  return (
    <AuthShell locale={locale} messages={messages}>
      <Card className="auth-card">
        <p className="eyebrow">{messages.auth.eyebrow}</p>
        <h1>{config[0]}</h1>
        <p className="auth-card__intro">{config[1]}</p>
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
        {flow === 'verify-email' ? (
          <form action={verifyEmailAction.bind(null, locale)} className="auth-form">
            <input name="returnTo" type="hidden" value={continuation.returnTo ?? ''} />
            <input name="product" type="hidden" value={continuation.product ?? ''} />
            <input name="intent" type="hidden" value={continuation.intent ?? ''} />
            <input name="clinic" type="hidden" value={continuation.clinic ?? ''} />
            <input name="dentist" type="hidden" value={continuation.dentist ?? ''} />
            <Field
              label={messages.auth.codeLabel}
              name="token"
              defaultValue={query.token ?? ''}
              autoComplete="one-time-code"
              required
            />
            <Button type="submit">
              <Icon name="check" />
              {messages.auth.verify}
            </Button>
            {process.env.NODE_ENV !== 'production' ? (
              <Alert title={messages.auth.developmentCode}>246810</Alert>
            ) : null}
          </form>
        ) : (
          <SimpleAuthForm
            kind={simpleKind}
            messages={messages}
            {...(flow === 'password-reset' && query.token ? { token: query.token } : {})}
            {...(flow === 'mfa' && query.returnTo ? { returnTo: query.returnTo } : {})}
          />
        )}
      </Card>
    </AuthShell>
  );
}
