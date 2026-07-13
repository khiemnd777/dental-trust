'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type {
  NotificationCategory,
  NotificationPreferenceView,
  NotificationView,
} from '@dental-trust/contracts';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Icon, Skeleton } from '@dental-trust/ui';
import { trackProductEvent } from '@/lib/product-analytics';

const supported = new Set(['patient:notifications', 'patient:settings']);

const copy = {
  en: {
    unread: 'Unread',
    read: 'Read',
    markRead: 'Mark as read',
    preferences: 'Notification preferences',
    preferenceHelp: 'Choose how Dental Trust contacts you. Critical security alerts stay enabled.',
    enabled: 'Enabled',
    disabled: 'Disabled',
    locked: 'Required for account security',
    saved: 'Your notification preference was saved.',
    marked: 'The notification was marked as read.',
    viewUpdate: 'View update',
    channels: { IN_APP: 'In app', EMAIL: 'Email', SMS: 'SMS', MESSAGING: 'Messaging app' },
  },
  vi: {
    unread: 'Chưa đọc',
    read: 'Đã đọc',
    markRead: 'Đánh dấu đã đọc',
    preferences: 'Tùy chọn thông báo',
    preferenceHelp: 'Chọn cách Dental Trust liên hệ. Cảnh báo bảo mật quan trọng luôn được bật.',
    enabled: 'Đang bật',
    disabled: 'Đang tắt',
    locked: 'Bắt buộc để bảo vệ tài khoản',
    saved: 'Đã lưu tùy chọn thông báo.',
    marked: 'Đã đánh dấu thông báo là đã đọc.',
    viewUpdate: 'Xem cập nhật',
    channels: {
      IN_APP: 'Trong ứng dụng',
      EMAIL: 'Email',
      SMS: 'SMS',
      MESSAGING: 'Ứng dụng nhắn tin',
    },
  },
} as const;

const categoryCopy: Record<NotificationCategory, readonly [string, string]> = {
  ACCOUNT_SECURITY: ['Account security', 'Bảo mật tài khoản'],
  CASE_UPDATES: ['Case updates', 'Cập nhật hồ sơ'],
  MISSING_DOCUMENTS: ['Missing documents', 'Hồ sơ cần bổ sung'],
  TREATMENT_PLANS: ['Treatment plans', 'Phương án điều trị'],
  CONSULTATIONS: ['Consultations', 'Lịch tư vấn'],
  APPOINTMENTS: ['Appointments', 'Lịch hẹn'],
  PAYMENTS: ['Payments and refunds', 'Thanh toán và hoàn tiền'],
  TRAVEL_PREPARATION: ['Travel preparation', 'Chuẩn bị hành trình'],
  TREATMENT_MILESTONES: ['Treatment milestones', 'Cột mốc điều trị'],
  AFTERCARE: ['Aftercare', 'Chăm sóc sau điều trị'],
  INCIDENTS: ['Incidents', 'Sự cố'],
  WARRANTY: ['Warranty', 'Bảo hành'],
  VERIFICATION_EXPIRY: ['Verification expiry', 'Hết hạn xác minh'],
  ADMINISTRATIVE_ALERTS: ['Administrative alerts', 'Cảnh báo quản trị'],
};

export function isNotificationCenterWorkspace(area: string, pageKey: string) {
  return supported.has(`${area}:${pageKey}`);
}

export function NotificationCenterWorkspace({
  pageKey,
  locale,
  title,
  description,
  messages,
  development,
}: {
  readonly pageKey: string;
  readonly locale: Locale;
  readonly title: string;
  readonly description: string;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const language = locale.startsWith('vi') ? 'vi' : 'en';
  const t = copy[language];
  const preferencesView = pageKey === 'settings';
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferenceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const view = preferencesView ? 'preferences' : 'notifications';
    void fetch(`/api/portal/notification-center?view=${view}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('notification_center_unavailable');
        const envelope = (await response.json()) as { data?: unknown };
        if (!Array.isArray(envelope.data)) throw new Error('invalid_notification_center_data');
        if (preferencesView) setPreferences(envelope.data as NotificationPreferenceView[]);
        else setNotifications(envelope.data as NotificationView[]);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [preferencesView]);

  const command = async (body: object, key: string, onSuccess: () => void) => {
    setSending(key);
    setError(false);
    setNotice(null);
    try {
      const response = await fetch('/api/portal/notification-center', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error('notification_command_failed');
      onSuccess();
    } catch {
      setError(true);
    } finally {
      setSending(null);
    }
  };

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections.patient} ·{' '}
            {development ? messages.portal.demo : messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{preferencesView ? t.preferenceHelp : description}</p>
        </div>
        <Badge tone="info">
          <Icon name="lock" />
          {messages.portal.secure}
        </Badge>
      </div>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {loading ? (
        <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
          <Skeleton style={{ height: '2rem', width: '45%' }} />
          <Skeleton style={{ height: '12rem', marginTop: '1rem' }} />
        </Card>
      ) : preferencesView ? (
        <PreferenceGrid
          locale={language}
          preferences={preferences}
          sending={sending}
          onChange={(preference, enabled) =>
            void command(
              {
                command: 'update_preference',
                preference: {
                  category: preference.category,
                  channel: preference.channel,
                  enabled,
                },
              },
              `${preference.category}:${preference.channel}`,
              () => {
                setPreferences((current) =>
                  current.map((candidate) =>
                    candidate.category === preference.category &&
                    candidate.channel === preference.channel
                      ? { ...candidate, enabled }
                      : candidate,
                  ),
                );
                setNotice(t.saved);
              },
            )
          }
        />
      ) : notifications.length ? (
        <div className="workspace-grid" style={{ marginTop: '1rem' }}>
          <Card className="workspace-card">
            <div className="workspace-card__head">
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
              <Badge tone="attention">
                {notifications.filter((notification) => !notification.readAt).length} {t.unread}
              </Badge>
            </div>
            <div className="activity-list" style={{ padding: '0 1.2rem 1.2rem' }}>
              {notifications.map((notification) => (
                <div className="activity-item" key={notification.id}>
                  <span className="activity-item__dot" />
                  <div style={{ width: '100%' }}>
                    <div className="workspace-card__head" style={{ padding: 0 }}>
                      <div>
                        <strong>{categoryLabel(notification.category, language)}</strong>
                        <p>{templateLabel(notification.templateKey, language)}</p>
                        <time>{formatDate(notification.scheduledAt, locale)}</time>
                      </div>
                      <Badge tone={notification.readAt ? 'neutral' : 'info'}>
                        {notification.readAt ? t.read : t.unread}
                      </Badge>
                    </div>
                    <div className="notification-actions">
                      {notification.action ? (
                        <Link
                          className="dt-button dt-button--secondary dt-button--sm button-link"
                          href={notificationHref(notification, locale)}
                          onClick={() =>
                            trackProductEvent('notification_action_opened', {
                              target: notification.action?.target ?? 'TODAY',
                            })
                          }
                        >
                          {t.viewUpdate}
                          <Icon name="arrow" />
                        </Link>
                      ) : null}
                      {!notification.readAt ? (
                        <Button
                          disabled={sending === notification.id}
                          size="sm"
                          variant="quiet"
                          onClick={() =>
                            void command(
                              { command: 'mark_read', notificationId: notification.id },
                              notification.id,
                              () => {
                                setNotifications((current) =>
                                  current.map((candidate) =>
                                    candidate.id === notification.id
                                      ? { ...candidate, readAt: new Date().toISOString() }
                                      : candidate,
                                  ),
                                );
                                setNotice(t.marked);
                              },
                            )
                          }
                        >
                          <Icon name="check" />
                          {t.markRead}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <EmptyState
          title={messages.common.emptyTitle}
          body={messages.common.emptyBody}
          icon="mail"
        />
      )}
    </main>
  );
}

function PreferenceGrid({
  locale,
  preferences,
  sending,
  onChange,
}: {
  readonly locale: 'en' | 'vi';
  readonly preferences: readonly NotificationPreferenceView[];
  readonly sending: string | null;
  readonly onChange: (preference: NotificationPreferenceView, enabled: boolean) => void;
}) {
  const t = copy[locale];
  const categories = [...new Set(preferences.map((preference) => preference.category))];
  return (
    <div className="workspace-grid" style={{ marginTop: '1rem' }}>
      <Card className="workspace-card" style={{ padding: '1.2rem' }}>
        <h2>{t.preferences}</h2>
        <div className="activity-list" style={{ marginTop: '1rem' }}>
          {categories.map((category) => (
            <section className="activity-item" key={category}>
              <span className="activity-item__dot" />
              <div style={{ width: '100%' }}>
                <strong>{categoryLabel(category, locale)}</strong>
                <div
                  style={{
                    display: 'grid',
                    gap: '.75rem',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(10rem,1fr))',
                    marginTop: '.75rem',
                  }}
                >
                  {preferences
                    .filter((preference) => preference.category === category)
                    .map((preference) => {
                      const key = `${preference.category}:${preference.channel}`;
                      return (
                        <div key={key}>
                          <Checkbox
                            checked={preference.enabled}
                            disabled={preference.locked || sending === key}
                            label={t.channels[preference.channel]}
                            onChange={(event) => onChange(preference, event.target.checked)}
                          />
                          <small>
                            {preference.locked
                              ? t.locked
                              : preference.enabled
                                ? t.enabled
                                : t.disabled}
                          </small>
                        </div>
                      );
                    })}
                </div>
              </div>
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}

function categoryLabel(category: NotificationCategory, locale: 'en' | 'vi') {
  return categoryCopy[category][locale === 'en' ? 0 : 1];
}

function templateLabel(templateKey: string, locale: 'en' | 'vi') {
  const label = templateKey.replace(/[._-]+/gu, ' ').trim();
  if (!label) return locale === 'vi' ? 'Cập nhật mới' : 'New update';
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function formatDate(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function notificationHref(notification: NotificationView, locale: Locale) {
  const action = notification.action;
  if (!action) return `/${locale}/app`;
  if (action.target === 'CASE' && action.resourceId)
    return `/${locale}/app/cases/${action.resourceId}`;
  if (action.target === 'APPOINTMENTS') return `/${locale}/app`;
  if (action.target === 'PAYMENTS') return `/${locale}/app/payments`;
  if (action.target === 'AFTERCARE') return `/${locale}/app/cases`;
  if (action.target === 'INCIDENTS') return `/${locale}/app/incidents`;
  return `/${locale}/app`;
}
