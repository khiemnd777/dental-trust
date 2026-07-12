import type { ReactNode } from 'react';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Icon } from '@dental-trust/ui';
import { Brand } from './brand';

export function AuthShell({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  return (
    <main className="auth-page" id="main-content">
      <div className="auth-shell">
        <aside className="auth-story">
          <Brand locale={locale} label={messages.common.brand} />
          <div className="auth-story__copy">
            <h2>{messages.home.evidenceTitle}</h2>
            <p>{messages.home.evidenceBody}</p>
          </div>
          <p className="auth-story__proof">
            <Icon name="lock" />
            {messages.portal.sessionNotice}
          </p>
        </aside>
        <div className="auth-card-wrap">{children}</div>
      </div>
    </main>
  );
}
