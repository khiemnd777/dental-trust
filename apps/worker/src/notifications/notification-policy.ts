import { criticalNotificationCategories } from './templates.js';

export interface NotificationPreferenceFact {
  readonly category: string;
  readonly channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'MESSAGING';
  readonly enabled: boolean;
}

export function shouldDeliverNotification(
  category: string,
  channel: NotificationPreferenceFact['channel'],
  preferences: readonly NotificationPreferenceFact[],
): boolean {
  if (criticalNotificationCategories.has(category)) return true;
  const preference = preferences.find(
    (candidate) => candidate.category === category && candidate.channel === channel,
  );
  return preference?.enabled ?? true;
}

export function deliveryRecipient(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const recipient = Reflect.get(payload, 'recipient');
  return typeof recipient === 'string' && recipient.trim() ? recipient.trim() : null;
}
