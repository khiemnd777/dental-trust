'use client';

import { useState, type FormEvent } from 'react';
import type { Messages } from '@dental-trust/i18n';
import { Alert, Button, Card, Field, Icon, SelectField, TextAreaField } from '@dental-trust/ui';

export function ContactForm({
  messages,
  topics,
}: {
  messages: Messages;
  topics: readonly string[];
}) {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setState('submitting');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          topic: form.get('topic'),
          message: form.get('message'),
        }),
      });
      setState(response.ok ? 'success' : 'error');
    } catch {
      setState('error');
    }
  };
  if (state === 'success')
    return (
      <Card className="form-success" aria-live="polite">
        <span className="form-success__icon">
          <Icon name="check" />
        </span>
        <h2>{messages.forms.successTitle}</h2>
        <p>{messages.forms.successBody}</p>
        <Button variant="secondary" onClick={() => setState('idle')}>
          {messages.common.back}
        </Button>
      </Card>
    );
  return (
    <Card style={{ padding: '1.35rem' }}>
      {state === 'error' ? <Alert tone="danger" title={messages.forms.submitError} /> : null}
      <form
        className="auth-form"
        onSubmit={(event) => void onSubmit(event)}
        style={{ marginTop: state === 'error' ? '1rem' : undefined }}
      >
        <Field
          label={messages.forms.contactName}
          name="name"
          autoComplete="name"
          minLength={2}
          required
        />
        <Field
          label={messages.forms.contactEmail}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <SelectField label={messages.forms.topic} name="topic" required>
          <option value="">—</option>
          {topics.map((topic) => (
            <option value={topic} key={topic}>
              {topic}
            </option>
          ))}
        </SelectField>
        <TextAreaField label={messages.forms.message} name="message" minLength={20} required />
        <Button disabled={state === 'submitting'} type="submit">
          <Icon name="mail" />
          {state === 'submitting' ? messages.forms.submitting : messages.forms.send}
        </Button>
      </form>
    </Card>
  );
}
