'use client';

import { useState, type FormEvent } from 'react';
import type { Messages } from '@dental-trust/i18n';
import { Alert, Button, Field, Icon } from '@dental-trust/ui';

export function SimpleAuthForm({
  messages,
  kind,
  token,
  returnTo,
}: {
  messages: Messages;
  kind: 'reset' | 'mfa' | 'sessions';
  token?: string;
  returnTo?: string;
}) {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setState('submitting');
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword') ?? '');
    if (token && newPassword !== String(form.get('confirmPassword') ?? '')) {
      setState('error');
      return;
    }
    try {
      const response = await fetch('/api/auth/flows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          email: form.get('email'),
          code: form.get('code'),
          token,
          newPassword: token ? newPassword : undefined,
        }),
      });
      if (response.ok && kind === 'mfa' && returnTo?.startsWith('/')) {
        window.location.assign(returnTo);
        return;
      }
      setState(response.ok ? 'success' : 'error');
    } catch {
      setState('error');
    }
  };
  if (state === 'success')
    return (
      <div className="form-success" aria-live="polite">
        <span className="form-success__icon">
          <Icon name="check" />
        </span>
        <p>{messages.auth.success}</p>
        <Button variant="secondary" onClick={() => setState('idle')}>
          {messages.common.back}
        </Button>
      </div>
    );
  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      {state === 'error' ? <Alert tone="danger" title={messages.forms.submitError} /> : null}
      {kind === 'reset' && token ? (
        <>
          <Field
            label={messages.auth.password}
            name="newPassword"
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
        </>
      ) : kind === 'reset' ? (
        <Field
          label={messages.auth.email}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      ) : kind === 'mfa' ? (
        <Field
          label={messages.auth.codeLabel}
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          required
        />
      ) : (
        <div className="dt-alert dt-alert--info">
          <Icon name="activity" />
          <div>
            <strong>{messages.auth.deviceLabel}</strong>
            <span>{messages.common.online}</span>
          </div>
        </div>
      )}
      <Button
        disabled={state === 'submitting'}
        type="submit"
        variant={kind === 'sessions' ? 'danger' : 'primary'}
      >
        {state === 'submitting'
          ? messages.forms.submitting
          : kind === 'reset'
            ? messages.auth.send
            : kind === 'mfa'
              ? messages.auth.verify
              : messages.common.logout}
      </Button>
    </form>
  );
}
